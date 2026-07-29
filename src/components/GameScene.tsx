import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createRenderer, createLighting } from "@/game/engine";
import { createWorld } from "@/game/world";
import { createPlayer } from "@/game/player";
import { createCombat } from "@/game/combat";
import { createAudio } from "@/game/audio";
import { GameHUD, LoadingScreen, TouchControls } from "@/game/ui";
import { DEFAULT_HUD, type GameHudState, type KillFeedEntry } from "@/game/types";
import { trackGoogleEvent } from "@/lib/google-services";

interface Props {
  onExit: () => void;
}

export default function GameScene({ onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<GameHudState>({ ...DEFAULT_HUD });
  const playerRef = useRef<ReturnType<typeof createPlayer> | null>(null);
  const audioRef = useRef<ReturnType<typeof createAudio> | null>(null);
  const gfxRef = useRef<ReturnType<typeof createRenderer> | null>(null);

  // Touch devices can't use pointer lock, so the player controller switches to
  // on-screen stick + buttons instead.
  const [touchMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia?.("(pointer: coarse)").matches === true ||
      (navigator.maxTouchPoints ?? 0) > 0
    );
  });
  const touchModeRef = useRef(touchMode);
  touchModeRef.current = touchMode;

  const mergeHud = useCallback((partial: Partial<GameHudState>) => {
    setHud((prev) => {
      const next: GameHudState = { ...prev, ...partial };
      // Kill feed: replace if provided, prune stale
      if (partial.killFeed) {
        next.killFeed = partial.killFeed;
      }
      // Decay fields are driven by RAF; just store peaks
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
      setLoad(0.32, "Compiling day/night lighting…");
      await yieldFrame();
      if (disposed) return;

      const world = createWorld(gfx.scene);
      disposers.push(() => world.dispose());
      setLoad(0.48, "Streaming city districts…");
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
        onLevelStart: (level) => {
          // A small between-level recovery keeps early progression welcoming
          // without erasing the pressure of later, denser encounters.
          playerRef.current?.heal(Math.min(30, 16 + level * 2));
          trackGoogleEvent("level_start", {
            level,
            fighter_count: level,
          });
        },
        onLevelComplete: (level) => trackGoogleEvent("level_complete", { level }),
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
      player.setTouchMode(touchModeRef.current);
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

      // Sim timer — one update per frame, safe across page visibility changes.
      const clock = gfx.clock;
      clock.reset();
      let lastLockState: boolean | null = null;
      let pausedRenderTime = 0;

      const tick = (timestamp?: number) => {
        if (disposed) return;
        clock.update(timestamp);
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.getElapsed();
        const isPlaying = player.isLocked();

        if (isPlaying !== lastLockState) {
          gfx.setUsePost(isPlaying);
          audio.setAmbient(isPlaying);
          lastLockState = isPlaying;
        }

        // Pointer-lock loss is a full simulation pause. The world continues at
        // a cinematic 20 fps behind the briefing while player state, reloading,
        // regeneration, enemy AI, and damage remain frozen.
        const playerPos = player.getPosition();
        if (isPlaying) {
          pausedRenderTime = 0;
          world.update(dt, elapsed, playerPos);
          lights.update(dt, elapsed, playerPos);
          player.update(dt);
          combat.update(dt, playerPos);
        } else {
          player.update(0);
          pausedRenderTime += dt;
          if (pausedRenderTime < 0.05) {
            raf = requestAnimationFrame(tick);
            return;
          }
          const presentationDt = Math.min(pausedRenderTime, 0.1);
          pausedRenderTime = 0;
          world.update(presentationDt, elapsed, playerPos);
          lights.update(presentationDt, elapsed, playerPos);
        }

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

    void boot().catch((error: unknown) => {
      if (disposed) return;
      console.error("Game deployment failed", error);
      mergeHud({
        loading: true,
        loadProgress: 0,
        loadLabel: "Deployment failed · reload to retry",
        ready: false,
      });
    });

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

  const handleEngage = useCallback(() => {
    // Pointer lock must be requested synchronously inside the trusted click.
    playerRef.current?.requestLock();
    const audio = audioRef.current;
    if (audio) {
      void audio.resume().catch(() => {
        // The simulation remains playable without Web Audio; another click can retry.
      });
    }
    trackGoogleEvent("game_engage", {
      level: hud.level,
      resumed: hud.level > 1 || hud.score > 0,
    });
  }, [hud.level, hud.score]);

  const handleExit = useCallback(() => {
    trackGoogleEvent("game_exit", {
      level: hud.level,
      score: hud.score,
      kills: hud.kills,
    });
    document.exitPointerLock?.();
    playerRef.current?.releaseTouch();
    audioRef.current?.setAmbient(false);
    onExit();
  }, [hud.kills, hud.level, hud.score, onExit]);

  const handlePause = useCallback(() => {
    playerRef.current?.releaseTouch();
  }, []);

  const touchMove = useCallback((x: number, y: number) => {
    playerRef.current?.touch.move(x, y);
  }, []);
  const touchLook = useCallback((dx: number, dy: number) => {
    playerRef.current?.touch.look(dx, dy);
  }, []);
  const touchFire = useCallback((down: boolean) => {
    playerRef.current?.touch.setFire(down);
  }, []);
  const touchAds = useCallback((down: boolean) => {
    playerRef.current?.touch.setAds(down);
  }, []);
  const touchSprint = useCallback((down: boolean) => {
    playerRef.current?.touch.setSprint(down);
  }, []);
  const touchJump = useCallback(() => {
    playerRef.current?.touch.jump();
  }, []);
  const touchReload = useCallback(() => {
    playerRef.current?.touch.reload();
  }, []);
  const touchCrouch = useCallback(() => {
    playerRef.current?.touch.toggleCrouch();
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black" style={{ touchAction: "none" }}>
      <div ref={mountRef} className="absolute inset-0" />

      {hud.loading ? (
        <LoadingScreen progress={hud.loadProgress} label={hud.loadLabel} />
      ) : (
        <>
          <GameHUD state={hud} onExit={handleExit} onEngage={handleEngage} touch={touchMode} />
          {touchMode && hud.ready && hud.locked && (
            <TouchControls
              onMove={touchMove}
              onLook={touchLook}
              onFire={touchFire}
              onAds={touchAds}
              onSprint={touchSprint}
              onJump={touchJump}
              onReload={touchReload}
              onCrouch={touchCrouch}
              onPause={handlePause}
            />
          )}
        </>
      )}
    </div>
  );
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    // Background tabs may throttle requestAnimationFrame to one callback per
    // second (or suspend it entirely), which used to strand deployment midway.
    // A task yield still lets React publish each loading stage without making
    // game startup depend on the tab's visibility.
    setTimeout(resolve, 0);
  });
}
