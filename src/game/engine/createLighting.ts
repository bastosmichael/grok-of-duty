import * as THREE from "three";
import { DAY_NIGHT_PERIOD_SEC, sampleDayNight, type DayNightSample } from "@/game/world/dayNight";
import { setCityLampFactor } from "@/game/world/cityStream";

export type LightingSystem = {
  hemi: THREE.HemisphereLight;
  /** Primary key light (sun by day, moon by night). */
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  /** @deprecated alias of sun */
  moon: THREE.DirectionalLight;
  floodlights: THREE.PointLight[];
  searchlight: THREE.SpotLight | null;
  /** Last sampled day/night state. */
  getSample: () => DayNightSample;
  /**
   * Advance day/night cycle, move key light, tint sky/fog, drive city lamps.
   * Pass player position so shadows follow the streamed district.
   */
  update: (dt: number, elapsed: number, playerPos?: THREE.Vector3) => void;
  dispose: () => void;
};

function createDayEnv(renderer: THREE.WebGLRenderer): {
  texture: THREE.Texture;
  dispose: () => void;
} {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.add(new THREE.HemisphereLight(0xa0c8f0, 0x6a5a48, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
  sun.position.set(2, 4, 1);
  envScene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshStandardMaterial({ color: 0x6a6050, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  envScene.add(ground);
  const envRT = pmrem.fromScene(envScene, 0.04);
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  return {
    texture: envRT.texture,
    dispose: () => {
      envRT.dispose();
      pmrem.dispose();
    },
  };
}

/**
 * Outdoor lighting with a slow day ↔ night cycle (~12 min full period).
 * City street lamps are driven via setCityLampFactor.
 */
export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): LightingSystem {
  const disposables: Array<{ dispose: () => void }> = [];

  const hemi = new THREE.HemisphereLight(0xa8c8f0, 0x8a7a60, 0.85);
  hemi.name = "SkyHemi";
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xc0d0e0, 0.45);
  ambient.name = "FillAmbient";
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d0, 2.8);
  sun.name = "SunKey";
  sun.position.set(40, 60, -20);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.intensity = 0.4;
  // 1024 is a large browser win vs 2048; still readable on street scale
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 100;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 1;
  scene.add(sun);
  scene.add(sun.target);

  // Soft fill opposite the sun (no shadow — free fill)
  const bounce = new THREE.DirectionalLight(0x88aacc, 0.35);
  bounce.name = "SkyBounce";
  bounce.position.set(-20, 25, 30);
  bounce.castShadow = false;
  scene.add(bounce);

  const dayEnv = createDayEnv(renderer);
  scene.environment = dayEnv.texture;
  scene.environmentIntensity = 0.55;
  disposables.push(dayEnv);

  let lastSample = sampleDayNight(0);
  const tmpColor = new THREE.Color();
  const playerFollow = new THREE.Vector3();
  let lastLampFactor = -1;
  let lastSkyOpacity = -1;
  let sampleAccum = 0;

  // Start daytime so first load is bright streets
  const dayOffset = DAY_NIGHT_PERIOD_SEC * 0.22; // near noon

  const applySample = (s: DayNightSample, playerPos?: THREE.Vector3, force = false): void => {
    lastSample = s;
    hemi.color.setHex(s.hemiSky);
    hemi.groundColor.setHex(s.hemiGround);
    hemi.intensity = s.hemiIntensity;
    ambient.color.setHex(s.ambientColor);
    ambient.intensity = s.ambientIntensity;
    sun.color.setHex(s.sunColor);
    sun.intensity = Math.max(0.15, s.sunIntensity);
    bounce.intensity = 0.15 + s.dayFactor * 0.4;
    scene.environmentIntensity = s.envIntensity;
    renderer.toneMappingExposure = s.exposure;

    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(s.fogColor);
      // Slightly denser than authored sample for cheaper far-field draws
      scene.fog.density = Math.max(s.fogDensity, 0.0035);
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.setHex(s.skyColor);
    } else {
      scene.background = tmpColor.setHex(s.skyColor).clone();
    }

    // Sun orbit relative to player so shadows stay useful while streaming
    const focus = playerPos ?? playerFollow;
    const dist = 55;
    const elev = Math.max(0.08, 0.15 + s.dayFactor * 1.1);
    const y = Math.sin(elev) * dist;
    const r = Math.cos(elev) * dist;
    sun.position.set(focus.x + Math.cos(s.sunAzimuth) * r, y, focus.z + Math.sin(s.sunAzimuth) * r);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();

    if (force || Math.abs(s.lampFactor - lastLampFactor) > 0.02) {
      lastLampFactor = s.lampFactor;
      setCityLampFactor(scene, s.lampFactor);
    }

    // Stars/moon only when opacity band changes
    if (force || Math.abs(s.starOpacity - lastSkyOpacity) > 0.05) {
      lastSkyOpacity = s.starOpacity;
      const sky = scene.getObjectByName("SkyDome");
      if (sky) {
        sky.traverse((obj) => {
          const pts = obj as THREE.Points;
          if (pts.isPoints && pts.material) {
            const mat = pts.material as THREE.PointsMaterial;
            mat.opacity = s.starOpacity;
            mat.transparent = true;
            mat.visible = s.starOpacity > 0.02;
          }
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.name === "MoonDisc") {
            mesh.visible = s.starOpacity > 0.15;
          }
        });
      }
    }
  };

  applySample(sampleDayNight(dayOffset), undefined, true);

  const update = (dt: number, elapsed: number, playerPos?: THREE.Vector3): void => {
    if (playerPos) playerFollow.copy(playerPos);
    // Throttle full day/night re-tint; still move sun target every frame lightly
    sampleAccum += dt;
    if (sampleAccum >= 0.2) {
      sampleAccum = 0;
      applySample(sampleDayNight(elapsed + dayOffset), playerFollow);
    } else if (playerPos) {
      // Cheap shadow follow without full color recompute
      sun.target.position.set(playerFollow.x, 0, playerFollow.z);
      sun.target.updateMatrixWorld();
    }
  };

  const dispose = (): void => {
    scene.remove(hemi);
    scene.remove(ambient);
    scene.remove(sun);
    scene.remove(sun.target);
    scene.remove(bounce);
    sun.shadow.map?.dispose();
    if (scene.environment === dayEnv.texture) scene.environment = null;
    for (const d of disposables) d.dispose();
    disposables.length = 0;
  };

  return {
    hemi,
    sun,
    moon: sun,
    ambient,
    floodlights: [],
    searchlight: null,
    getSample: () => lastSample,
    update,
    dispose,
  };
}
