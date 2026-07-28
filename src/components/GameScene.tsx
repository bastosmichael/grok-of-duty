import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createRenderer, createLighting } from "@/game/engine";
import { createWorld } from "@/game/world";
import { createPlayer } from "@/game/player";
import { createCombat } from "@/game/combat";
import { createAudio } from "@/game/audio";
import { GameHUD, LoadingScreen } from "@/game/ui";
import { DEFAULT_HUD, type GameHudState, type KillFeedEntry } from "@/game/types";

interface Props {
  onExit: () => void;
}

export default function GameScene({ onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<GameHudState>({ ...DEFAULT_HUD });
  const hudRef = useRef(hud);
  const playerRef = useRef<ReturnType<typeof createPlayer> | null>(null);
  const audioRef = useRef<ReturnType<typeof createAudio> | null>(null);
  const gfxRef = useRef<ReturnType<typeof createRenderer> | null>(null);

  const mergeHud = useCallback((partial: Partial<GameHudState>) => {
    setHud((prev) => {
      const next: GameHudState = { ...prev, ...partial };
      // Kill feed: replace if provided, prune stale
      if (partial.killFeed) {
        next.killFeed = partial.killFeed;
      }
      // Decay fields are driven by RAF; just store peaks
      hudRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let raf = 0;
    const disposers: Array<() => void> = [];

    const boot = async () => {
      // ---- Stage loading for AAA asset feel ----
      const setLoad = (progress: number, loadLabel: string) => {
        if (disposed) return;
        mergeHud({ loading: true, loadProgress: progress, loadLabel, ready: false });
      };

      setLoad(0.05, "Booting combat kernel…");
      await yieldFrame();
      if (disposed) return;

      const gfx = createRenderer(mount);
      gfxRef.current = gfx;
      // Full post stack (ACES present + bloom + grade)
      gfx.setUsePost(true);
      disposers.push(() => gfx.dispose());
      setLoad(0.18, "Allocating GPU buffers…");
      await yieldFrame();
      if (disposed) return;

      const lights = createLighting(gfx.scene, gfx.renderer);
      disposers.push(() => lights.dispose());
      setLoad(0.32, "Compiling night-ops lighting…");
      await yieldFrame();
      if (disposed) return;

      const world = createWorld(gfx.scene);
      disposers.push(() => world.dispose());
      setLoad(0.48, "Streaming tactical compound…");
      await yieldFrame();
      if (disposed) return;

      const audio = createAudio();
      audioRef.current = audio;
      disposers.push(() => audio.dispose());
      setLoad(0.58, "Calibrating audio bus…");
      await yieldFrame();
      if (disposed) return;

      let killFeed: KillFeedEntry[] = [];
      let hitMarkerT = 0;
      let damageFlashT = 0;

      const onHud = (partial: Partial<GameHudState>) => {
        if (partial.killFeed) killFeed = partial.killFeed;
        if (partial.hitMarker !== undefined && partial.hitMarker > 0) {
          hitMarkerT = Math.max(hitMarkerT, partial.hitMarker);
        }
        if (partial.damageFlash !== undefined && partial.damageFlash > 0) {
          damageFlashT = Math.max(damageFlashT, partial.damageFlash);
          gfx.flashDamage(partial.damageFlash);
        }
        mergeHud(partial);
      };

      const combat = createCombat({
        scene: gfx.scene,
        camera: gfx.camera,
        colliders: world.colliders,
        onHud,
        onPlayerDamage: (amount, fromWorld) => {
          playerRef.current?.takeDamage(amount, fromWorld);
          audio.playHurt();
        },
        playHitSound: () => audio.playHit(),
        playKillSound: () => audio.playKill(),
      });
      disposers.push(() => combat.dispose());
      setLoad(0.72, "Spawning hostiles…");
      await yieldFrame();
      if (disposed) return;

      const player = createPlayer({
        camera: gfx.camera,
        scene: gfx.scene,
        canvas: gfx.renderer.domElement,
        colliders: world.colliders,
        onHud,
        onShoot: (origin, direction, ads) => {
          combat.handleShot(origin, direction, ads);
          audio.playGunshot(ads);
        },
        onReloadStart: () => audio.playReload(),
        onFootstep: () => audio.playFootstep(),
        onEmpty: () => audio.playEmpty(),
      });
      playerRef.current = player;
      disposers.push(() => player.dispose());

      // Spawn player slightly inside the compound
      // createPlayer owns position; nudge via camera after first update
      setLoad(0.88, "Linking weapon systems…");
      await yieldFrame();
      if (disposed) return;

      // Raise texture anisotropy to GPU max (capped) once renderer exists
      const maxAniso = Math.min(8, gfx.renderer.capabilities.getMaxAnisotropy());
      gfx.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (!std.isMaterial) continue;
          for (const key of [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "aoMap",
          ] as const) {
            const tex = std[key as keyof THREE.MeshStandardMaterial] as
              THREE.Texture | null | undefined;
            if (tex && "anisotropy" in tex) {
              tex.anisotropy = maxAniso;
              tex.needsUpdate = true;
            }
          }
        }
      });

      // Warm one render so shaders compile before "ready"
      lights.update(0.016, 0);
      world.update(0.016, 0);
      gfx.render();
      setLoad(0.97, "Authorizing deployment…");
      await yieldFrame();
      if (disposed) return;

      mergeHud({
        loading: false,
        loadProgress: 1,
        loadLabel: "Ready",
        ready: true,
        locked: false,
        health: 100,
        maxHealth: 100,
        armor: 50,
        maxArmor: 50,
        ammo: 30,
        reserve: 120,
        score: 0,
        kills: 0,
        streak: 0,
        weaponName: "M4A1 · TACTICAL",
        hitMarkerKill: false,
        hitMarkerHeadshot: false,
        damageIndicators: [],
      });

      const onResize = () => gfx.resize();
      window.addEventListener("resize", onResize);
      disposers.push(() => window.removeEventListener("resize", onResize));

      // Sim clock — single owner of getDelta(); renderer uses wall-clock for cinematic
      const clock = gfx.clock;
      if (!clock.running) clock.start();

      const tick = () => {
        if (disposed) return;
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;

        lights.update(dt, elapsed);
        world.update(dt, elapsed);
        player.update(dt);
        combat.update(dt, player.getPosition());

        // Decay HUD flash timers (kill/HS flags stick until marker fades out)
        if (hitMarkerT > 0) {
          hitMarkerT = Math.max(0, hitMarkerT - dt * 3.2);
          if (hitMarkerT <= 0) {
            mergeHud({
              hitMarker: 0,
              hitMarkerKill: false,
              hitMarkerHeadshot: false,
            });
          } else {
            mergeHud({ hitMarker: hitMarkerT });
          }
        }
        if (damageFlashT > 0) {
          damageFlashT = Math.max(0, damageFlashT - dt * 2.5);
          mergeHud({ damageFlash: damageFlashT });
        }

        // Prune kill feed
        const now = performance.now();
        if (killFeed.length > 0) {
          const pruned = killFeed.filter((e) => now - e.at < 4500);
          if (pruned.length !== killFeed.length) {
            killFeed = pruned;
            mergeHud({ killFeed: pruned });
          }
        }

        gfx.render();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.exitPointerLock?.();
      // reverse dispose
      for (let i = disposers.length - 1; i >= 0; i--) {
        try {
          disposers[i]();
        } catch {
          /* ignore teardown races */
        }
      }
      playerRef.current = null;
      audioRef.current = null;
      gfxRef.current = null;
    };
  }, [mergeHud]);

  const handleEngage = useCallback(async () => {
    const audio = audioRef.current;
    if (audio) {
      await audio.resume();
      audio.setAmbient(true);
    }
    playerRef.current?.requestLock();
  }, []);

  const handleExit = useCallback(() => {
    document.exitPointerLock?.();
    audioRef.current?.setAmbient(false);
    onExit();
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {hud.loading ? (
        <LoadingScreen progress={hud.loadProgress} label={hud.loadLabel} />
      ) : (
        <GameHUD state={hud} onExit={handleExit} onEngage={handleEngage} />
      )}
    </div>
  );
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
