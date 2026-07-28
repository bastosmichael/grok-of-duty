import * as THREE from "three";

const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

type PoolItem = {
  active: boolean;
  life: number;
  maxLife: number;
};

type Tracer = PoolItem & {
  mesh: THREE.Mesh;
  start: THREE.Vector3;
  end: THREE.Vector3;
};

type SparkParticle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
};

type SparkBurst = PoolItem & {
  particles: SparkParticle[];
  points: THREE.Points;
  kind: "concrete" | "flesh" | "smoke" | "dust";
};

type DebrisChunk = PoolItem & {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
};

export type EffectsSystem = {
  spawnTracer: (origin: THREE.Vector3, end: THREE.Vector3) => void;
  spawnImpact: (position: THREE.Vector3, normal: THREE.Vector3) => void;
  spawnFleshHit: (position: THREE.Vector3, normal?: THREE.Vector3) => void;
  spawnDeath: (position: THREE.Vector3) => void;
  spawnMuzzleSmoke: (position: THREE.Vector3, direction: THREE.Vector3) => void;
  spawnGroundDust: (position: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

function makeTracerMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makePointsMaterial(color: number, size: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}

function randomOnHemisphere(normal: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  if (out.dot(normal) < 0) out.negate();
  return out.normalize();
}

/**
 * Pooled world-space VFX: tracers, impact sparks, flesh puffs,
 * muzzle smoke, ground dust, and death debris. No per-shot allocations
 * on the hot path beyond Vector3 copies into pooled slots.
 */
export function createEffects(scene: THREE.Scene): EffectsSystem {
  const root = new THREE.Group();
  root.name = "combat_effects";
  scene.add(root);

  // --- Shared geometries ---
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const debrisGeo = new THREE.BoxGeometry(0.08, 0.05, 0.1);

  // --- Tracer pool ---
  const TRACER_POOL = 48;
  const tracers: Tracer[] = [];
  const tracerMat = makeTracerMaterial();

  for (let i = 0; i < TRACER_POOL; i++) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    tracers.push({
      active: false,
      life: 0,
      maxLife: 0.08,
      mesh,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
    });
  }

  // --- Spark / puff bursts (Points) ---
  const BURST_POOL = 36;
  const PARTICLES_PER = 14;
  const bursts: SparkBurst[] = [];

  const concreteMat = makePointsMaterial(0xffc878, 0.09);
  const fleshMat = makePointsMaterial(0x6a1010, 0.11);
  const smokeMat = makePointsMaterial(0x888888, 0.14);
  smokeMat.blending = THREE.NormalBlending;
  const dustMat = makePointsMaterial(0x6a5a48, 0.12);
  dustMat.blending = THREE.NormalBlending;

  for (let i = 0; i < BURST_POOL; i++) {
    const positions = new Float32Array(PARTICLES_PER * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, concreteMat);
    points.visible = false;
    points.frustumCulled = false;
    root.add(points);

    const particles: SparkParticle[] = [];
    for (let p = 0; p < PARTICLES_PER; p++) {
      particles.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.35,
        size: 1,
      });
    }

    bursts.push({
      active: false,
      life: 0,
      maxLife: 0.4,
      particles,
      points,
      kind: "concrete",
    });
  }

  // --- Death debris chunks ---
  const DEBRIS_POOL = 40;
  const debris: DebrisChunk[] = [];
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x3a3e44,
    metalness: 0.75,
    roughness: 0.4,
    emissive: 0x221100,
    emissiveIntensity: 0.35,
  });

  for (let i = 0; i < DEBRIS_POOL; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat.clone());
    mesh.visible = false;
    mesh.castShadow = false;
    root.add(mesh);
    debris.push({
      active: false,
      life: 0,
      maxLife: 0.9,
      mesh,
      vel: new THREE.Vector3(),
      angVel: new THREE.Vector3(),
    });
  }

  function acquireTracer(): Tracer | null {
    for (const t of tracers) {
      if (!t.active) return t;
    }
    // Steal oldest
    let oldest = tracers[0];
    for (const t of tracers) {
      if (t.life < oldest.life) oldest = t;
    }
    return oldest;
  }

  function acquireBurst(): SparkBurst | null {
    for (const b of bursts) {
      if (!b.active) return b;
    }
    let oldest = bursts[0];
    for (const b of bursts) {
      if (b.life < oldest.life) oldest = b;
    }
    return oldest;
  }

  function acquireDebris(): DebrisChunk | null {
    for (const d of debris) {
      if (!d.active) return d;
    }
    let oldest = debris[0];
    for (const d of debris) {
      if (d.life < oldest.life) oldest = d;
    }
    return oldest;
  }

  function activateBurst(
    kind: SparkBurst["kind"],
    position: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    speed: number,
    life: number,
  ): void {
    const burst = acquireBurst();
    if (!burst) return;

    burst.active = true;
    burst.life = life;
    burst.maxLife = life;
    burst.kind = kind;

    const mat =
      kind === "flesh"
        ? fleshMat
        : kind === "smoke"
          ? smokeMat
          : kind === "dust"
            ? dustMat
            : concreteMat;
    burst.points.material = mat;
    burst.points.visible = true;

    const n = Math.min(count, PARTICLES_PER);
    for (let i = 0; i < PARTICLES_PER; i++) {
      const p = burst.particles[i];
      if (i < n) {
        p.life = life * (0.65 + Math.random() * 0.35);
        p.maxLife = p.life;
        p.pos.copy(position);
        randomOnHemisphere(normal, p.vel);
        const s = speed * (0.4 + Math.random() * 0.8);
        p.vel.multiplyScalar(s);
        if (kind === "smoke" || kind === "dust") {
          p.vel.y += 0.6 + Math.random() * 0.8;
        } else if (kind === "flesh") {
          p.vel.y += 0.3;
        } else {
          p.vel.y += 0.5 + Math.random() * 1.2;
        }
        p.size = 0.7 + Math.random() * 0.6;
      } else {
        p.life = 0;
        p.pos.copy(position);
        p.vel.set(0, 0, 0);
      }
    }
    writeBurstPositions(burst);
  }

  function writeBurstPositions(burst: SparkBurst): void {
    const attr = burst.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < PARTICLES_PER; i++) {
      const p = burst.particles[i];
      const o = i * 3;
      if (p.life > 0) {
        arr[o] = p.pos.x;
        arr[o + 1] = p.pos.y;
        arr[o + 2] = p.pos.z;
      } else {
        // Park dead particles at origin of burst so they don't linger
        arr[o] = p.pos.x;
        arr[o + 1] = p.pos.y - 999;
        arr[o + 2] = p.pos.z;
      }
    }
    attr.needsUpdate = true;
  }

  const spawnTracer = (origin: THREE.Vector3, end: THREE.Vector3): void => {
    const t = acquireTracer();
    if (!t) return;

    t.active = true;
    t.life = 0.07 + Math.random() * 0.03;
    t.maxLife = t.life;
    t.start.copy(origin);
    t.end.copy(end);

    _tmp.copy(end).sub(origin);
    const len = Math.max(_tmp.length(), 0.05);
    _tmp2.copy(origin).add(end).multiplyScalar(0.5);

    t.mesh.position.copy(_tmp2);
    // lookAt aligns local -Z toward end; box length is on Z
    t.mesh.lookAt(end);
    t.mesh.scale.set(1, 1, len);

    const mat = t.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.95;
    t.mesh.visible = true;
  };

  const spawnImpact = (position: THREE.Vector3, normal: THREE.Vector3): void => {
    activateBurst("concrete", position, normal, 12, 6.5, 0.32);
  };

  const spawnFleshHit = (position: THREE.Vector3, normal?: THREE.Vector3): void => {
    const n = normal ?? _up;
    activateBurst("flesh", position, n, 10, 3.8, 0.38);
  };

  const spawnDeath = (position: THREE.Vector3): void => {
    // Center burst slightly above ground feet
    _tmp.copy(position);
    _tmp.y += 1.0;
    activateBurst("concrete", _tmp, _up, 14, 5.5, 0.45);
    activateBurst("smoke", _tmp, _up, 8, 1.8, 0.7);

    // Metal debris chunks
    for (let i = 0; i < 8; i++) {
      const d = acquireDebris();
      if (!d) break;
      d.active = true;
      d.life = 0.7 + Math.random() * 0.35;
      d.maxLife = d.life;
      d.mesh.position.copy(position);
      d.mesh.position.y += 0.6 + Math.random() * 0.9;
      d.mesh.scale.set(
        0.6 + Math.random() * 1.2,
        0.5 + Math.random() * 1.0,
        0.6 + Math.random() * 1.2,
      );
      d.vel.set((Math.random() - 0.5) * 7, 2.5 + Math.random() * 4, (Math.random() - 0.5) * 7);
      d.angVel.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      const mat = d.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1;
      mat.transparent = true;
      mat.emissiveIntensity = 0.5;
      d.mesh.visible = true;
    }
  };

  const spawnMuzzleSmoke = (position: THREE.Vector3, direction: THREE.Vector3): void => {
    _tmp.copy(direction).normalize();
    activateBurst("smoke", position, _tmp, 6, 1.2, 0.28);
  };

  const spawnGroundDust = (position: THREE.Vector3): void => {
    activateBurst("dust", position, _up, 8, 1.5, 0.4);
  };

  const update = (dt: number): void => {
    const safeDt = Math.min(dt, 0.05);

    // Tracers
    for (const t of tracers) {
      if (!t.active) continue;
      t.life -= safeDt;
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      const k = Math.max(0, t.life / t.maxLife);
      mat.opacity = k * 0.95;
      // Shrink slightly as it fades
      t.mesh.scale.x = 0.6 + k * 0.4;
      t.mesh.scale.y = 0.6 + k * 0.4;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
      }
    }

    // Particle bursts
    for (const b of bursts) {
      if (!b.active) continue;
      b.life -= safeDt;
      let anyAlive = false;
      const gravity =
        b.kind === "smoke" || b.kind === "dust" ? -0.4 : b.kind === "flesh" ? -6 : -12;
      const drag = b.kind === "smoke" || b.kind === "dust" ? 0.92 : 0.98;

      for (const p of b.particles) {
        if (p.life <= 0) continue;
        p.life -= safeDt;
        if (p.life <= 0) continue;
        anyAlive = true;
        p.vel.y += gravity * safeDt;
        p.vel.multiplyScalar(drag);
        p.pos.addScaledVector(p.vel, safeDt);
      }

      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, b.life / b.maxLife);

      writeBurstPositions(b);

      if (!anyAlive || b.life <= 0) {
        b.active = false;
        b.points.visible = false;
      }
    }

    // Debris
    for (const d of debris) {
      if (!d.active) continue;
      d.life -= safeDt;
      d.vel.y -= 14 * safeDt;
      d.mesh.position.addScaledVector(d.vel, safeDt);
      d.mesh.rotation.x += d.angVel.x * safeDt;
      d.mesh.rotation.y += d.angVel.y * safeDt;
      d.mesh.rotation.z += d.angVel.z * safeDt;

      // Ground bounce-ish clamp
      if (d.mesh.position.y < 0.04) {
        d.mesh.position.y = 0.04;
        d.vel.y *= -0.25;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
      }

      const mat = d.mesh.material as THREE.MeshStandardMaterial;
      const k = Math.max(0, d.life / d.maxLife);
      mat.opacity = k;
      mat.emissiveIntensity = k * 0.5;

      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(root);

    for (const t of tracers) {
      (t.mesh.material as THREE.Material).dispose();
    }
    for (const b of bursts) {
      b.points.geometry.dispose();
    }
    for (const d of debris) {
      (d.mesh.material as THREE.Material).dispose();
    }

    tracerGeo.dispose();
    debrisGeo.dispose();
    tracerMat.dispose();
    concreteMat.dispose();
    fleshMat.dispose();
    smokeMat.dispose();
    dustMat.dispose();
    debrisMat.dispose();

    while (root.children.length > 0) {
      root.remove(root.children[0]);
    }
  };

  return {
    spawnTracer,
    spawnImpact,
    spawnFleshHit,
    spawnDeath,
    spawnMuzzleSmoke,
    spawnGroundDust,
    update,
    dispose,
  };
}
