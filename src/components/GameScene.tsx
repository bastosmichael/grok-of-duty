import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface Props {
  onExit: () => void;
}

export default function GameScene({ onExit }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [ammo, setAmmo] = useState(30);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f14);
    scene.fog = new THREE.Fog(0x0a0f14, 20, 90);

    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      500,
    );
    camera.position.set(0, 1.7, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Lights
    const hemi = new THREE.HemisphereLight(0xff8a3d, 0x0a0f14, 0.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb27a, 1.1);
    sun.position.set(20, 30, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200, 40, 40),
      new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.9, wireframe: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid overlay
    const grid = new THREE.GridHelper(200, 80, 0xff6a1a, 0x2a1a10);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Crates / obstacles
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
    const crates: THREE.Mesh[] = [];
    for (let i = 0; i < 25; i++) {
      const size = 1 + Math.random() * 2;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
      crate.position.set((Math.random() - 0.5) * 80, size / 2, (Math.random() - 0.5) * 80);
      crate.castShadow = true;
      crate.receiveShadow = true;
      scene.add(crate);
      crates.push(crate);
    }

    // Enemy targets
    const enemyMat = new THREE.MeshStandardMaterial({
      color: 0xff4422,
      emissive: 0x661100,
      emissiveIntensity: 0.6,
    });
    const enemies: THREE.Mesh[] = [];
    const spawnEnemy = () => {
      const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), enemyMat.clone());
      e.position.set((Math.random() - 0.5) * 60, 1, (Math.random() - 0.5) * 60);
      e.castShadow = true;
      scene.add(e);
      enemies.push(e);
    };
    for (let i = 0; i < 8; i++) spawnEnemy();

    // Weapon viewmodel (attached to camera)
    const weapon = new THREE.Group();
    const gunBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.7 }),
    );
    const gunBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.3 }),
    );
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.z = -0.6;
    const gunGrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.25, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2a1a0a }),
    );
    gunGrip.position.set(0, -0.18, 0.15);
    weapon.add(gunBody, gunBarrel, gunGrip);
    weapon.position.set(0.35, -0.3, -0.6);
    camera.add(weapon);
    scene.add(camera);

    // Muzzle flash
    const flash = new THREE.PointLight(0xffaa44, 0, 6);
    weapon.add(flash);

    // Controls: pointer lock
    const canvas = renderer.domElement;
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const PI_2 = Math.PI / 2;

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= e.movementX * 0.002;
      euler.x -= e.movementY * 0.002;
      euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    const onLockChange = () => setLocked(document.pointerLockElement === canvas);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);

    // Movement
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "Escape") {
        document.exitPointerLock?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Shooting
    const raycaster = new THREE.Raycaster();
    let flashTimer = 0;
    const shoot = () => {
      if (document.pointerLockElement !== canvas) return;
      setAmmo((a) => {
        if (a <= 0) return a;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects(enemies, false);
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh;
          scene.remove(hit);
          const idx = enemies.indexOf(hit);
          if (idx >= 0) enemies.splice(idx, 1);
          setScore((s) => s + 100);
          setTimeout(spawnEnemy, 1500);
        }
        flash.intensity = 3;
        flashTimer = 0.08;
        return a - 1;
      });
    };
    const onClick = () => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      } else {
        shoot();
      }
    };
    const onKeyR = (e: KeyboardEvent) => {
      if (e.code === "KeyR") setAmmo(30);
    };
    canvas.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyR);

    // Resize
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Loop
    const velocity = new THREE.Vector3();
    const clock = new THREE.Clock();
    let raf = 0;
    setReady(true);

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const speed = 8;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

      velocity.set(0, 0, 0);
      if (keys["KeyW"]) velocity.add(forward);
      if (keys["KeyS"]) velocity.sub(forward);
      if (keys["KeyD"]) velocity.add(right);
      if (keys["KeyA"]) velocity.sub(right);
      if (velocity.lengthSq() > 0) {
        velocity.normalize().multiplyScalar(speed * dt);
        camera.position.add(velocity);
      }
      camera.position.y = 1.7;

      // Bob
      const t = clock.elapsedTime;
      weapon.position.y = -0.3 + Math.sin(t * 8) * 0.01 * (velocity.lengthSq() > 0 ? 1 : 0.2);

      // Enemies drift toward player
      enemies.forEach((e) => {
        const dir = new THREE.Vector3().subVectors(camera.position, e.position);
        dir.y = 0;
        const d = dir.length();
        if (d > 3) {
          dir.normalize().multiplyScalar(1.2 * dt);
          e.position.add(dir);
        }
        e.lookAt(camera.position.x, e.position.y, camera.position.z);
      });

      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) flash.intensity = 0;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("keydown", onKeyR);
      canvas.removeEventListener("click", onClick);
      document.exitPointerLock?.();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm.dispose());
        }
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div ref={mountRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Crosshair */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-6 w-6">
            <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-primary" />
            <div className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-primary" />
            <div className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-primary" />
            <div className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-primary" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/80" />
          </div>
        </div>

        {/* Top HUD */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 font-mono text-xs uppercase tracking-widest text-primary">
          <div className="border-l-2 border-primary pl-2">
            <div>// OPERATION · TRAINING RANGE</div>
            <div className="text-muted-foreground">SECTOR 07 · NIGHT OPS</div>
          </div>
          <div className="border-r-2 border-primary pr-2 text-right">
            <div>SCORE {score.toString().padStart(5, "0")}</div>
            <div className="text-muted-foreground">HOSTILES · LIVE</div>
          </div>
        </div>

        {/* Bottom HUD */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-4 font-mono text-xs uppercase tracking-widest">
          <div className="border-l-2 border-primary pl-2 text-primary">
            <div className="text-3xl font-black font-[Orbitron]">100</div>
            <div className="text-[10px] text-muted-foreground">HP</div>
          </div>
          <div className="border-r-2 border-primary pr-2 text-right text-primary">
            <div className="text-3xl font-black font-[Orbitron]">
              {ammo}
              <span className="text-muted-foreground text-lg">/30</span>
            </div>
            <div className="text-[10px] text-muted-foreground">[R] RELOAD</div>
          </div>
        </div>

        {/* Exit */}
        <button
          onClick={onExit}
          className="pointer-events-auto absolute right-4 top-16 border border-primary/60 bg-background/70 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary backdrop-blur hover:bg-primary hover:text-primary-foreground"
        >
          ✕ Quit
        </button>
      </div>

      {/* Pointer lock prompt */}
      {ready && !locked && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="pointer-events-auto max-w-md border border-primary/60 bg-card p-8 text-center">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary">
              // BRIEFING
            </div>
            <h3 className="mt-3 font-[Orbitron] text-3xl font-black uppercase">Ready Up</h3>
            <div className="mt-6 grid grid-cols-2 gap-3 text-xs font-mono uppercase text-left text-muted-foreground">
              <div>
                <span className="text-primary">WASD</span> Move
              </div>
              <div>
                <span className="text-primary">MOUSE</span> Aim
              </div>
              <div>
                <span className="text-primary">CLICK</span> Fire
              </div>
              <div>
                <span className="text-primary">R</span> Reload
              </div>
              <div>
                <span className="text-primary">ESC</span> Release
              </div>
              <div>
                <span className="text-primary">EXFIL</span> Quit
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => mountRef.current?.querySelector("canvas")?.requestPointerLock()}
                className="btn-tactical w-full"
              >
                ▶ Engage
              </button>
              <button onClick={onExit} className="btn-tactical-destructive w-full">
                ✕ Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
