import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Uniforms driven by the cinematic night-ops post pass.
 * `damageFlash` is a 0–1 pulse used for red hit vignette.
 */
export type CinematicUniforms = {
  tDiffuse: { value: THREE.Texture | null };
  uTime: { value: number };
  uResolution: { value: THREE.Vector2 };
  uDamageFlash: { value: number };
  uGrainIntensity: { value: number };
  uVignetteStrength: { value: number };
  uChromaticAberration: { value: number };
  uContrast: { value: number };
  uSaturation: { value: number };
  uShadowTeal: { value: number };
  uHighlightWarm: { value: number };
};

export type CinematicPassHandle = {
  pass: ShaderPass;
  uniforms: CinematicUniforms;
  setSize: (width: number, height: number) => void;
  setDamageFlash: (amount: number) => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
};

/**
 * COD MW night multiplayer grade targets (browser practical ceiling):
 * - Grain: barely-there sensor noise (not Instagram film)
 * - Vignette: soft edge falloff, center stays full exposure
 * - CA: micro radial split at far edges only
 * - Split-tone: cool shadows / warm sodium highlights (subtle)
 * - Mild contrast without crushing midtones into mud
 */
export const CinematicShader = {
  name: "CinematicNightOpsShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDamageFlash: { value: 0 },
    // Was 0.045 — read as video-game film overlay; COD is ~1–2%
    uGrainIntensity: { value: 0.018 },
    // Soft edge; keep center full exposure so lit windows/gun still read
    uVignetteStrength: { value: 0.24 },
    // Micro radial only
    uChromaticAberration: { value: 0.0008 },
    // Mild lift in mids so concrete/containers don't go mud after ACES
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.07 },
    uShadowTeal: { value: 0.028 },
    uHighlightWarm: { value: 0.04 },
  } satisfies CinematicUniforms,
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDamageFlash;
    uniform float uGrainIntensity;
    uniform float uVignetteStrength;
    uniform float uChromaticAberration;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uShadowTeal;
    uniform float uHighlightWarm;

    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float filmGrain(vec2 uv, float t) {
      // Temporal reseed so grain doesn't freeze frame-to-frame
      float n = hash(uv * uResolution * 0.55 + fract(t * 12.9898) * 78.233);
      float n2 = hash(uv * uResolution * 0.22 - fract(t * 7.13) * 43.17);
      return (n * 0.65 + n2 * 0.35) * 2.0 - 1.0;
    }

    vec3 applySaturation(vec3 c, float sat) {
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), c, sat);
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float dist = length(center);
      // Normalized radius so vignette is resolution-stable (use long axis)
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 centerN = vec2(center.x * aspect, center.y);
      float distN = length(centerN);

      // Micro radial CA — stronger only at far edges
      float ca = uChromaticAberration * (0.2 + dist * dist * 2.4);
      vec2 dir = dist > 1e-5 ? normalize(center) : vec2(0.0);

      float r = texture2D(tDiffuse, uv + dir * ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * ca).b;
      vec3 color = vec3(r, g, b);

      // Mild contrast pivot around mid-grey (keeps blacks deep, mids readable)
      color = (color - 0.5) * uContrast + 0.5;
      color = max(color, vec3(0.0));

      // COD night split-tone: cool teal lift in shadows, warm sodium in highlights
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = 1.0 - smoothstep(0.05, 0.42, luma);
      float hiMask = smoothstep(0.45, 0.92, luma);
      color += vec3(-0.01, 0.015, 0.03) * uShadowTeal * 12.0 * shadowMask;
      color += vec3(0.04, 0.015, -0.01) * uHighlightWarm * 12.0 * hiMask;

      color = applySaturation(color, uSaturation);

      // Multiplicative grain — doesn't lift blacks like additive does
      float grain = filmGrain(uv, uTime);
      color *= 1.0 + grain * uGrainIntensity;

      // Soft cinematic vignette (center ~1.0, edges gently darkened)
      // smoothstep range keeps FOV center clean for ADS readability
      float vig = smoothstep(1.15, 0.35, distN * (0.85 + uVignetteStrength));
      float vigMul = mix(1.0 - uVignetteStrength * 0.72, 1.0, vig);
      color *= vigMul;

      // Damage red flash — edge-biased, not full-screen wash
      float damageEdge = smoothstep(0.2, 0.95, dist);
      float flash = clamp(uDamageFlash, 0.0, 1.0);
      color = mix(
        color,
        color * vec3(1.28, 0.14, 0.1) + vec3(0.18, 0.0, 0.0),
        flash * damageEdge * 0.88
      );
      color += vec3(0.12, 0.015, 0.01) * flash * damageEdge;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
} as const;

/**
 * Build a ShaderPass wired for the night-ops cinematic grade.
 * Call `update` each frame so grain animates and damage flash decays.
 */
export function createCinematicPass(width = 1, height = 1): CinematicPassHandle {
  const uniforms: CinematicUniforms = {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uDamageFlash: { value: 0 },
    uGrainIntensity: { value: 0.018 },
    uVignetteStrength: { value: 0.24 },
    uChromaticAberration: { value: 0.0008 },
    uContrast: { value: 1.04 },
    uSaturation: { value: 1.07 },
    uShadowTeal: { value: 0.028 },
    uHighlightWarm: { value: 0.04 },
  };

  const material = new THREE.ShaderMaterial({
    name: CinematicShader.name,
    uniforms: uniforms as unknown as { [uniform: string]: THREE.IUniform },
    vertexShader: CinematicShader.vertexShader,
    fragmentShader: CinematicShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });

  const pass = new ShaderPass(material);

  let damageFlash = 0;
  /** Seconds for full damage vignette decay */
  const DAMAGE_DECAY = 2.6;

  const setSize = (w: number, h: number): void => {
    uniforms.uResolution.value.set(Math.max(1, w), Math.max(1, h));
  };

  const setDamageFlash = (amount: number): void => {
    damageFlash = Math.min(1, Math.max(damageFlash, amount));
    uniforms.uDamageFlash.value = damageFlash;
  };

  const update = (delta: number, elapsed: number): void => {
    uniforms.uTime.value = elapsed;
    if (damageFlash > 0) {
      damageFlash = Math.max(0, damageFlash - delta * DAMAGE_DECAY);
      uniforms.uDamageFlash.value = damageFlash;
    }
  };

  const dispose = (): void => {
    material.dispose();
  };

  return { pass, uniforms, setSize, setDamageFlash, update, dispose };
}
