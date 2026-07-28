import * as THREE from "three";
import type { Collider } from "@/game/types";

/**
 * The operator mesh is authored feet-first: its local origin is the point
 * where both boots meet the floor. Physics therefore keeps the root at a
 * constant ground height and never uses root pitch/roll for animation.
 */
export const ENEMY_BODY = {
  radius: 0.43,
  height: 1.92,
  skin: 0.025,
  groundY: 0,
  mapHalf: 55,
  minimumSpacing: 0.94,
} as const;

export const ENEMY_SUPPORT_EPSILON = 0.01;
const MAX_MOVE_SUBSTEP = ENEMY_BODY.radius * 0.45;
const SPAWN_ATTEMPTS = 96;
const SPAWN_GRID_STEP = 2.75;
const _axisCandidate = new THREE.Vector3();
const _separationDelta = new THREE.Vector3();

export type GroundedBody = {
  id: number;
  position: THREE.Vector3;
};

function isFiniteVector(position: THREE.Vector3): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function overlapsCollider(position: THREE.Vector3, collider: Collider): boolean {
  const { radius, height, skin, groundY } = ENEMY_BODY;

  // Decorative floor slabs are not walls. Conversely, a low sandbag or crate
  // must still block an operator even though it does not reach head height.
  if (collider.max.y <= groundY + skin || collider.min.y >= groundY + height - skin) {
    return false;
  }

  return (
    position.x + radius - skin > collider.min.x &&
    position.x - radius + skin < collider.max.x &&
    position.z + radius - skin > collider.min.z &&
    position.z - radius + skin < collider.max.z
  );
}

/** True when an upright, feet-anchored enemy capsule can occupy this point. */
export function canEnemyOccupy(position: THREE.Vector3, colliders: readonly Collider[]): boolean {
  if (!isFiniteVector(position)) return false;
  const movementLimit = ENEMY_BODY.mapHalf - ENEMY_BODY.radius - ENEMY_BODY.skin;
  if (
    Math.abs(position.y - ENEMY_BODY.groundY) > ENEMY_SUPPORT_EPSILON ||
    position.x < -movementLimit ||
    position.x > movementLimit ||
    position.z < -movementLimit ||
    position.z > movementLimit
  ) {
    return false;
  }

  for (const collider of colliders) {
    if (overlapsCollider(position, collider)) return false;
  }
  return true;
}

function attemptAxisMove(
  position: THREE.Vector3,
  amount: number,
  axis: "x" | "z",
  colliders: readonly Collider[],
): void {
  if (Math.abs(amount) < 1e-8) return;
  _axisCandidate.copy(position);
  _axisCandidate[axis] += amount;
  const movementLimit = ENEMY_BODY.mapHalf - ENEMY_BODY.radius - ENEMY_BODY.skin;
  _axisCandidate[axis] = THREE.MathUtils.clamp(_axisCandidate[axis], -movementLimit, movementLimit);
  _axisCandidate.y = ENEMY_BODY.groundY;
  if (canEnemyOccupy(_axisCandidate, colliders)) {
    position[axis] = _axisCandidate[axis];
  }
}

/**
 * Move on the ground with small swept substeps and axis separation. Axis
 * separation gives natural wall sliding, while substeps prevent high hit
 * impulses from tunnelling through thin props.
 */
export function moveEnemyGrounded(
  position: THREE.Vector3,
  delta: THREE.Vector3,
  colliders: readonly Collider[],
): void {
  if (!isFiniteVector(position)) position.set(0, ENEMY_BODY.groundY, 0);
  if (!isFiniteVector(delta)) {
    position.y = ENEMY_BODY.groundY;
    return;
  }

  const distance = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(distance / MAX_MOVE_SUBSTEP));
  const dx = delta.x / steps;
  const dz = delta.z / steps;

  for (let step = 0; step < steps; step++) {
    // Move the dominant axis first so glancing approaches retain their
    // tangential component instead of sticking to walls.
    if (Math.abs(dx) >= Math.abs(dz)) {
      attemptAxisMove(position, dx, "x", colliders);
      attemptAxisMove(position, dz, "z", colliders);
    } else {
      attemptAxisMove(position, dz, "z", colliders);
      attemptAxisMove(position, dx, "x", colliders);
    }
  }

  position.y = ENEMY_BODY.groundY;
}

function clearOfBodies(
  position: THREE.Vector3,
  occupied: readonly THREE.Vector3[],
  minimumSpacing: number,
): boolean {
  const minimumSq = minimumSpacing * minimumSpacing;
  for (const other of occupied) {
    const dx = position.x - other.x;
    const dz = position.z - other.z;
    if (dx * dx + dz * dz < minimumSq) return false;
  }
  return true;
}

/**
 * Find a validated spawn. Random sampling keeps matches varied; the bounded
 * grid fallback guarantees that a rejected sample can never leave an enemy
 * inside a wall or under the map.
 */
export function findEnemySpawn(
  playerSpawn: THREE.Vector3,
  out: THREE.Vector3,
  colliders: readonly Collider[],
  occupied: readonly THREE.Vector3[],
  playerClearRadius: number,
  random: () => number = Math.random,
): THREE.Vector3 {
  const playerClearSq = playerClearRadius * playerClearRadius;
  const spawnLimit = ENEMY_BODY.mapHalf - ENEMY_BODY.radius - ENEMY_BODY.skin;

  const valid = (x: number, z: number): boolean => {
    out.set(x, ENEMY_BODY.groundY, z);
    const dx = x - playerSpawn.x;
    const dz = z - playerSpawn.z;
    return (
      dx * dx + dz * dz >= playerClearSq &&
      canEnemyOccupy(out, colliders) &&
      clearOfBodies(out, occupied, ENEMY_BODY.minimumSpacing * 1.35)
    );
  };

  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const x = THREE.MathUtils.lerp(-spawnLimit, spawnLimit, random());
    const z = THREE.MathUtils.lerp(-spawnLimit, spawnLimit, random());
    if (valid(x, z)) return out;
  }

  // Scan from the perimeter inward. Spawn points far from the player are
  // preferred and the id-independent order remains deterministic in tests.
  for (let ring = spawnLimit; ring >= playerClearRadius; ring -= SPAWN_GRID_STEP) {
    for (let x = -ring; x <= ring; x += SPAWN_GRID_STEP) {
      if (valid(x, -ring)) return out;
      if (valid(x, ring)) return out;
    }
    for (let z = -ring + SPAWN_GRID_STEP; z < ring; z += SPAWN_GRID_STEP) {
      if (valid(-ring, z)) return out;
      if (valid(ring, z)) return out;
    }
  }

  // Exhaustive validated fallback. This is deliberately slower than the
  // perimeter scan, but runs only when random samples failed and guarantees
  // that a fallback can never silently materialize inside geometry.
  const exhaustiveStep = ENEMY_BODY.minimumSpacing;
  for (let z = -spawnLimit; z <= spawnLimit; z += exhaustiveStep) {
    for (let x = -spawnLimit; x <= spawnLimit; x += exhaustiveStep) {
      if (valid(x, z)) return out;
    }
  }

  throw new Error("Enemy spawn invariant failed: the playable map has no valid grounded point");
}

/**
 * Enforce non-overlap after locomotion. Corrections use the same world solver,
 * so resolving a crowd can never push an operator through adjacent cover.
 */
export function separateEnemyBodies(
  bodies: readonly GroundedBody[],
  colliders: readonly Collider[],
): void {
  const minimum = ENEMY_BODY.minimumSpacing;
  const minimumSq = minimum * minimum;

  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        let dx = a.position.x - b.position.x;
        let dz = a.position.z - b.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq >= minimumSq) continue;

        let distance = Math.sqrt(distanceSq);
        if (distanceSq < 1e-8) {
          // Stable id-based direction prevents NaN and eliminates random
          // jitter when two respawns happen to share an exact coordinate.
          const angle = ((a.id * 37 + b.id * 17) % 360) * THREE.MathUtils.DEG2RAD;
          dx = Math.cos(angle);
          dz = Math.sin(angle);
          distance = 0;
        }

        const correction = Math.min((minimum - distance) * 0.52, 0.18);
        const directionLength = Math.hypot(dx, dz);
        const nx = dx / directionLength;
        const nz = dz / directionLength;

        _separationDelta.set(nx * correction, 0, nz * correction);
        moveEnemyGrounded(a.position, _separationDelta, colliders);
        _separationDelta.multiplyScalar(-1);
        moveEnemyGrounded(b.position, _separationDelta, colliders);
      }
    }
  }

  for (const body of bodies) body.position.y = ENEMY_BODY.groundY;
}

/** Shortest-path, frame-rate independent yaw steering. */
export function dampEnemyYaw(current: number, target: number, lambda: number, dt: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/** Clamp an accumulated planar impulse without introducing vertical motion. */
export function clampEnemyImpulse(velocity: THREE.Vector3, maximum: number): void {
  velocity.y = 0;
  const speedSq = velocity.x * velocity.x + velocity.z * velocity.z;
  if (!Number.isFinite(speedSq)) {
    velocity.set(0, 0, 0);
    return;
  }
  if (speedSq > maximum * maximum) {
    const scale = maximum / Math.sqrt(speedSq);
    velocity.x *= scale;
    velocity.z *= scale;
  }
}
