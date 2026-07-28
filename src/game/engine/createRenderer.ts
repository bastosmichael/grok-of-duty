import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createCinematicPass, type CinematicPassHandle } from "./postprocessing";

export type GameRenderer = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  clock: THREE.Clock;
  setExposure: (v: number) => void;
  setBloomStrength: (v: number) => void;
  flashDamage: (amount: number) => void;
  resize: () => void;
  render: () => void;
  /** When true, skips EffectComposer (debug / fallback). */
  setUsePost: (enabled: boolean) => void;
  dispose: () => void;
};

/**
 * Night-ops exposure: slightly under 1 so ACES keeps moon-lit midtones
 * readable without lifting crushed shadow pockets into grey mud.
 */
/** Night ops — readable midtones under ACES (COD night is dark but not crushed) */
const DEFAULT_EXPOSURE = 1.1;

/**
 * COD-style bloom: practicals (lamps / windows / visors) glow; midtones stay clean.
 * Threshold just under window/lamp HDR so interiors bloom without washing asphalt.
 */
const DEFAULT_BLOOM_STRENGTH = 0.38;
const DEFAULT_BLOOM_RADIUS = 0.4;
// High threshold — only windows/lamps/tracers bloom, never asphalt
const DEFAULT_BLOOM_THRESHOLD = 0.92;

/** Cool night void — matches moon key, not pure black crush */
const NIGHT_FOG_COLOR = 0x0c1420;

/**
 * Very light fog — combat readability first; sky/stars still frame the horizon.
 */
const NIGHT_FOG_DENSITY = 0.0022;

/** Cap DPR — full 2× + bloom + SMAA tanks laptop GPUs with little visual gain */
const MAX_PIXEL_RATIO = 1.75;

/**
 * AAA night-ops WebGL stack: ACES filmic tonemap, soft shadows,
 * EffectComposer with selective bloom / SMAA / cinematic grade + damage flash.
 */
export function createRenderer(mount: HTMLElement): GameRenderer {
  const width = Math.max(1, mount.clientWidth || window.innerWidth);
  const height = Math.max(1, mount.clientHeight || window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  // --- Scene (cool night void + light atmospheric fog) ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT_FOG_COLOR);
  scene.fog = new THREE.FogExp2(NIGHT_FOG_COLOR, NIGHT_FOG_DENSITY);

  // --- Camera (FOV 75 — player systems may narrow for ADS) ---
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.08, 400);
  camera.position.set(0, 1.7, 0);
  camera.rotation.order = "YXZ";

  // --- WebGLRenderer ---
  // antialias:false — EffectComposer renders to non-MSAA RTs; MSAA samples are wasted
  // and cost fill-rate. SMAA provides edge AA in the post stack.
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    stencil: false,
    depth: true,
    // Allows canvas pixel reads / screenshots without a blank backbuffer
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // CRITICAL: do NOT tonemap in the renderer when using EffectComposer + OutputPass.
  // RenderPass would ACES-encode into the RT, then OutputPass would ACES again → crushed black frame
  // with only emissive bloom surviving. Scene stays linear/HDR; OutputPass presents.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Composer owns present; avoid double-clear fighting the final blit
  renderer.autoClear = true;

  // Prefer CSS-sized canvas filling the mount
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;
  mount.appendChild(canvas);

  // --- Post stack (HalfFloat RTs by default in r152+ → HDR headroom for bloom) ---
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    DEFAULT_BLOOM_STRENGTH,
    DEFAULT_BLOOM_RADIUS,
    DEFAULT_BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  // Cinematic grade (grain / vignette / CA / damage) before AA + output
  const cinematic: CinematicPassHandle = createCinematicPass(width, height);
  composer.addPass(cinematic.pass);

  // SMAA in linear working space — must run before OutputPass (three r152+)
  const smaaPass = new SMAAPass();
  composer.addPass(smaaPass);

  // OutputPass reads renderer.toneMapping each frame. Keep scene rendering on
  // NoToneMapping (linear HDR into the composer RT), then force ACES only while
  // the OutputPass runs so we get a single filmic present without double-tonemap crush.
  const outputPass = new OutputPass();
  const outputPassRender = outputPass.render.bind(outputPass);
  outputPass.render = (rendererArg, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const prev = rendererArg.toneMapping;
    rendererArg.toneMapping = THREE.ACESFilmicToneMapping;
    outputPassRender(rendererArg, writeBuffer, readBuffer, deltaTime, maskActive);
    rendererArg.toneMapping = prev;
  };
  composer.addPass(outputPass);

  // Autostart false — GameScene owns the sim clock lifecycle
  const clock = new THREE.Clock(false);

  /** Independent wall-clock for cinematic decay so GameScene.getDelta() cannot starve it */
  let lastPresentMs = performance.now();

  const setExposure = (v: number): void => {
    renderer.toneMappingExposure = Math.max(0, v);
  };

  const setBloomStrength = (v: number): void => {
    bloomPass.strength = Math.max(0, v);
  };

  const flashDamage = (amount: number): void => {
    cinematic.setDamageFlash(THREE.MathUtils.clamp(amount, 0, 1));
  };

  const resize = (): void => {
    const w = Math.max(1, mount.clientWidth || window.innerWidth);
    const h = Math.max(1, mount.clientHeight || window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);

    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    bloomPass.resolution.set(w, h);
    cinematic.setSize(w, h);
  };

  let usePost = true;

  const render = (): void => {
    const now = performance.now();
    const delta = Math.min((now - lastPresentMs) / 1000, 0.05);
    lastPresentMs = now;
    const elapsed = clock.running ? clock.elapsedTime : now * 0.001;
    cinematic.update(delta, elapsed);

    if (!usePost) {
      // Direct path: single ACES present (proves lighting/materials without composer)
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.render(scene, camera);
      renderer.toneMapping = THREE.NoToneMapping;
      return;
    }
    composer.render();
  };

  const setUsePost = (enabled: boolean): void => {
    usePost = enabled;
  };

  const dispose = (): void => {
    clock.stop();
    cinematic.dispose();
    bloomPass.dispose();
    smaaPass.dispose();
    outputPass.dispose();

    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();

    if (canvas.parentElement === mount) {
      mount.removeChild(canvas);
    }

    scene.background = null;
    scene.fog = null;
    scene.environment = null;
  };

  // Ensure correct sizing if mount was 0×0 at construction (layout not ready)
  if (mount.clientWidth > 0 && mount.clientHeight > 0) {
    resize();
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    clock,
    setExposure,
    setBloomStrength,
    flashDamage,
    resize,
    render,
    setUsePost,
    dispose,
  };
}
