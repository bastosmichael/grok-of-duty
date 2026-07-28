import * as THREE from "three";

export type LightingSystem = {
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  floodlights: THREE.PointLight[];
  searchlight: THREE.SpotLight | null;
  /** Advance searchlight sweep and any animated light state */
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
};

/** ~80-unit arena half-extent used for shadow frustum / flood placement */
const ARENA_HALF = 40;

/**
 * Dark outdoor night IBL — NOT RoomEnvironment (studio white walls).
 * Room IBL makes metal containers look like a product-shot showroom.
 * Cool zenith + warm ground bounce matches moon key / sodium floods.
 */
function createNightOpsEnvironment(renderer: THREE.WebGLRenderer): {
  texture: THREE.Texture;
  dispose: () => void;
} {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();

  // Cool upper hemisphere (moonlit sky), warm-brown ground bounce (earth / sodium)
  const hemi = new THREE.HemisphereLight(0x6a849e, 0x1c1610, 0.55);
  envScene.add(hemi);

  // Soft moon key into the probe (direction matches gameplay moon)
  const moonProbe = new THREE.DirectionalLight(0xc4d4f0, 0.7);
  moonProbe.position.set(2.2, 4.0, -1.4);
  envScene.add(moonProbe);

  // Warm sodium bounce from below-side — keeps metal from going pure steel-blue
  const sodiumBounce = new THREE.DirectionalLight(0xffa060, 0.18);
  sodiumBounce.position.set(-1.5, 0.35, 1.2);
  envScene.add(sodiumBounce);

  // Dark ground receiver so PMREM samples contact-ish bounce, not empty black
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshStandardMaterial({
      color: 0x141210,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.2;
  envScene.add(ground);

  // Dim backdrop box faces (very dark cool walls) for stable specular lobes
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(12, 8, 12),
    new THREE.MeshBasicMaterial({
      color: 0x0a1018,
      side: THREE.BackSide,
    }),
  );
  box.position.y = 1.5;
  envScene.add(box);

  // sigma slightly higher → softer, less mirror-sharp studio reflections
  const envRT = pmrem.fromScene(envScene, 0.06);

  // Tear down probe scene geometry/materials
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  box.geometry.dispose();
  (box.material as THREE.Material).dispose();

  return {
    texture: envRT.texture,
    dispose: () => {
      envRT.dispose();
      pmrem.dispose();
    },
  };
}

/**
 * Night-ops military lighting: cool moonlight, warm sodium floodlights,
 * deep shadow pockets, sweeping searchlight, outdoor night IBL.
 */
export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): LightingSystem {
  const disposables: Array<{ dispose: () => void }> = [];

  // --- Cool lunar hemisphere + warm ground bounce ---
  const hemi = new THREE.HemisphereLight(0x7a98b8, 0x221c14, 0.85);
  hemi.name = "NightHemi";
  scene.add(hemi);

  // --- Ambient fill — COD night still shows structure, not pure silhouette ---
  const ambient = new THREE.AmbientLight(0x1e2a38, 0.35);
  ambient.name = "NightAmbient";
  scene.add(ambient);

  // --- Moon directional (key light) ---
  const moon = new THREE.DirectionalLight(0xc8d8f0, 1.8);
  moon.name = "Moon";
  moon.position.set(36, 55, -28);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  // Soft shadows — never fully crush contact faces
  moon.shadow.intensity = 0.35;

  const shadow = moon.shadow;
  // 2048 is the browser sweet spot; 4096 doubles cost for marginal gain
  shadow.mapSize.set(2048, 2048);
  shadow.camera.near = 2;
  shadow.camera.far = 130;
  // Slightly tighter than arena so texels concentrate on playable space
  const shadowHalf = ARENA_HALF * 0.95;
  shadow.camera.left = -shadowHalf;
  shadow.camera.right = shadowHalf;
  shadow.camera.top = shadowHalf;
  shadow.camera.bottom = -shadowHalf;
  shadow.camera.updateProjectionMatrix();
  // Bias: prefer normalBias over large constant bias (less peter-panning)
  // previous normalBias 0.035 floated shadows off crates — COD wants tight contact
  shadow.bias = -0.00018;
  shadow.normalBias = 0.018;
  // Soft but not mushy (radius 2.5 looked airbrushed)
  shadow.radius = 1.6;

  scene.add(moon);
  scene.add(moon.target);

  // --- Sodium / tactical floodlights around map edges + plaza fill ---
  const floodConfigs: Array<{
    x: number;
    y: number;
    z: number;
    intensity: number;
    distance: number;
  }> = [
    { x: -ARENA_HALF + 4, y: 7.5, z: -ARENA_HALF + 6, intensity: 2.4, distance: 42 },
    { x: ARENA_HALF - 4, y: 7.5, z: -ARENA_HALF + 6, intensity: 2.2, distance: 40 },
    { x: -ARENA_HALF + 4, y: 7.5, z: ARENA_HALF - 6, intensity: 2.3, distance: 40 },
    { x: ARENA_HALF - 4, y: 7.5, z: ARENA_HALF - 6, intensity: 2.5, distance: 42 },
    { x: 0, y: 9, z: -ARENA_HALF + 2, intensity: 2.0, distance: 48 },
    { x: 0, y: 6.5, z: ARENA_HALF - 2, intensity: 1.9, distance: 38 },
    // Spawn plaza fills — visible cover without bleaching asphalt
    { x: 0, y: 9, z: 0, intensity: 2.2, distance: 26 },
    { x: -14, y: 8, z: 10, intensity: 1.8, distance: 28 },
    { x: 14, y: 8, z: 10, intensity: 1.8, distance: 28 },
    { x: 0, y: 8, z: 20, intensity: 1.9, distance: 30 },
  ];

  const floodlights: THREE.PointLight[] = [];
  for (let i = 0; i < floodConfigs.length; i++) {
    const cfg = floodConfigs[i]!;
    // decay 2 ≈ physical inverse-square falloff
    const light = new THREE.PointLight(0xff9a4a, cfg.intensity, cfg.distance, 2);
    light.name = `FloodSodium_${i}`;
    light.position.set(cfg.x, cfg.y, cfg.z);
    // Shadows off for all floods (perf); moon owns contact shadows
    light.castShadow = false;
    scene.add(light);
    floodlights.push(light);
  }

  // --- Sweeping searchlight (tower / helo vibe) ---
  // Cool white, tight cone, high intensity so it reads through fog
  const searchlight = new THREE.SpotLight(
    0xe8f0ff,
    7.5,
    110,
    THREE.MathUtils.degToRad(18),
    0.42,
    1.2,
  );
  searchlight.name = "Searchlight";
  searchlight.position.set(0, 24, 0);
  searchlight.target.position.set(12, 0, 8);
  // Shadow off — one 2048 cascade is already budget; cone still sells the read
  searchlight.castShadow = false;
  scene.add(searchlight);
  scene.add(searchlight.target);

  // --- Outdoor night IBL (subtle specular / ambient GI cue) ---
  const nightEnv = createNightOpsEnvironment(renderer);
  scene.environment = nightEnv.texture;
  // Keep IBL low so sodium/moon remain the lighting read (metals get just enough reflection)
  scene.environmentIntensity = 0.35;
  disposables.push(nightEnv);

  const update = (dt: number, elapsed: number): void => {
    // Slow figure-eight / orbit sweep across the arena floor
    const radius = ARENA_HALF * 0.55;
    const speed = 0.16;
    const x = Math.cos(elapsed * speed) * radius;
    const z = Math.sin(elapsed * speed * 0.73) * radius * 0.85;
    searchlight.target.position.set(x, 0.05, z);
    searchlight.target.updateMatrixWorld();

    // Tiny sodium flicker for tactical authenticity (subtle — not horror strobe)
    for (let i = 0; i < floodlights.length; i++) {
      const base = floodConfigs[i]!.intensity;
      const flicker =
        1 + Math.sin(elapsed * 9.1 + i * 1.7) * 0.028 + Math.sin(elapsed * 23.0 + i * 0.9) * 0.012;
      floodlights[i]!.intensity = base * flicker;
    }

    void dt;
  };

  const dispose = (): void => {
    scene.remove(hemi);
    scene.remove(ambient);
    scene.remove(moon);
    scene.remove(moon.target);
    moon.shadow.map?.dispose();

    for (const light of floodlights) {
      scene.remove(light);
    }
    floodlights.length = 0;

    scene.remove(searchlight);
    scene.remove(searchlight.target);

    if (scene.environment === nightEnv.texture) {
      scene.environment = null;
    }

    for (const d of disposables) {
      d.dispose();
    }
    disposables.length = 0;
  };

  return {
    hemi,
    moon,
    ambient,
    floodlights,
    searchlight,
    update,
    dispose,
  };
}
