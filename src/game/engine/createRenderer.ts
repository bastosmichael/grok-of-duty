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
  clock: THREE.Timer;
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
const DEFAULT_EXPOSURE = 1.2;

/**
 * COD-style bloom: practicals (lamps / windows / visors) glow; midtones stay clean.
 * Threshold just under window/lamp HDR so interiors bloom without washing asphalt.
 */
const DEFAULT_BLOOM_STRENGTH = 0.28;
const DEFAULT_BLOOM_RADIUS = 0.32;
// Windows/lamps/visors bloom; asphalt stays below threshold
const DEFAULT_BLOOM_THRESHOLD = 0.85;

/** Default daytime sky — day/night cycle re-tints fog + background each frame. */
const DEFAULT_SKY_COLOR = 0x87b8e8;
/** Slightly denser fog culls far street fill cheaper. */
const DEFAULT_FOG_DENSITY = 0.0045;

/** Cap DPR hard — fill-rate is the #1 browser cost with post + shadows. */
const MAX_PIXEL_RATIO = 1.25;
const MIN_RENDER_SCALE = 0.5;
const QUALITY_SAMPLE_FRAMES = 45;
const SLOW_FRAME_MS = 18.5;
const FAST_FRAME_MS = 13.5;

/**
 * AAA night-ops WebGL stack: ACES filmic tonemap, soft shadows,
 * EffectComposer with selective bloom / SMAA / cinematic grade + damage flash.
 */
export function createRenderer(mount: HTMLElement): GameRenderer {
  const width = Math.max(1, mount.clientWidth || window.innerWidth);
  const height = Math.max(1, mount.clientHeight || window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);

  // --- Scene (daytime default; createLighting drives day/night tint) ---
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DEFAULT_SKY_COLOR);
  scene.fog = new THREE.FogExp2(DEFAULT_SKY_COLOR, DEFAULT_FOG_DENSITY);

  // --- Camera (FOV 75 — player systems may narrow for ADS) ---
  // Far plane shortened: streamed streets don't need 400m draws.
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 140);
  camera.position.set(0, 1.7, 0);
  camera.rotation.order = "YXZ";

  // --- WebGLRenderer ---
  // antialias:false — EffectComposer renders to non-MSAA RTs; MSAA samples are wasted.
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // CRITICAL: do NOT tonemap in the renderer when using EffectComposer + OutputPass.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap; // cheapest filtered shadow
  renderer.shadowMap.autoUpdate = true;
  renderer.autoClear = true;
  // Skip sorting translucent objects every frame when possible
  renderer.sortObjects = true;

  // Prefer CSS-sized canvas filling the mount
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  canvas.tabIndex = 0;
  mount.appendChild(canvas);

  // --- Post stack: UnsignedByte is much cheaper than HalfFloat on integrated GPUs ---
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
    }),
  );
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom at half resolution internally via smaller resolution vector
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.floor(width * 0.5), Math.floor(height * 0.5)),
    DEFAULT_BLOOM_STRENGTH,
    DEFAULT_BLOOM_RADIUS,
    DEFAULT_BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  // Cinematic grade (grain / vignette / CA / damage) before AA + output
  const cinematic: CinematicPassHandle = createCinematicPass(width, height);
  composer.addPass(cinematic.pass);

  // SMAA is expensive; enable only at high quality scales
  const smaaPass = new SMAAPass();
  smaaPass.enabled = false;
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

  // Timer avoids Clock's deprecated, read-mutates-time semantics and handles
  // background-tab visibility without producing a giant resume delta.
  const clock = new THREE.Timer();
  clock.connect(document);

  /** Independent wall-clock for cinematic decay so GameScene.getDelta() cannot starve it */
  let lastPresentMs = performance.now();
  let frameTimeAverage = 16.67;
  let qualityFrames = 0;
  let renderScale = 1;
  let lastQualityChangeMs = lastPresentMs;

  const activePixelRatio = (): number =>
    Math.max(0.65, Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * renderScale);

  const resizeTargets = (): void => {
    const w = Math.max(1, mount.clientWidth || window.innerWidth);
    const h = Math.max(1, mount.clientHeight || window.innerHeight);
    const pr = activePixelRatio();

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);

    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    cinematic.setSize(w * pr, h * pr);
  };

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
    resizeTargets();
  };

  // Default off during play for max FPS; GameScene can re-enable.
  let usePost = false;

  const render = (): void => {
    const now = performance.now();
    const delta = Math.min((now - lastPresentMs) / 1000, 0.05);
    lastPresentMs = now;
    const elapsed = clock.getElapsed();
    cinematic.update(delta, elapsed);

    // Aggressive dynamic resolution: react within ~0.75s of sustained load.
    if (delta > 0 && document.visibilityState === "visible") {
      const frameMs = delta * 1000;
      frameTimeAverage = THREE.MathUtils.lerp(frameTimeAverage, frameMs, 0.08);
      qualityFrames += 1;
      if (qualityFrames >= QUALITY_SAMPLE_FRAMES && now - lastQualityChangeMs > 1200) {
        const previousScale = renderScale;
        if (frameTimeAverage > SLOW_FRAME_MS && renderScale > MIN_RENDER_SCALE) {
          renderScale = Math.max(MIN_RENDER_SCALE, renderScale - 0.12);
        } else if (frameTimeAverage < FAST_FRAME_MS && renderScale < 1) {
          renderScale = Math.min(1, renderScale + 0.06);
        }
        // SMAA only when we have headroom
        smaaPass.enabled = usePost && renderScale >= 0.95 && frameTimeAverage < 15;
        bloomPass.enabled = usePost && renderScale >= 0.65;
        if (renderScale !== previousScale) {
          lastQualityChangeMs = now;
          resizeTargets();
        }
        qualityFrames = 0;
      }
    }

    if (!usePost) {
      // Fast path: single ACES present — biggest browser FPS win
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.render(scene, camera);
      renderer.toneMapping = THREE.NoToneMapping;
      return;
    }
    composer.render();
  };

  const setUsePost = (enabled: boolean): void => {
    usePost = enabled;
    smaaPass.enabled = enabled && renderScale >= 0.95;
    bloomPass.enabled = enabled && renderScale >= 0.65;
  };

  const dispose = (): void => {
    clock.dispose();
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
