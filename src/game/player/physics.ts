import * as THREE from "three";
import type { Collider } from "@/game/types";

/** Shared FPS capsule / AABB physics used by the player controller. */

export const PHYSICS = {
  walkSpeed: 5.4,
  sprintMult: 1.55,
  crouchMult: 0.48,
  adsMult: 0.7,
  accelGround: 48,
  accelAir: 14,
  frictionGround: 18,
  frictionAir: 1.2,
  jumpVelocity: 7.4,
  gravity: 24,
  groundY: 0,
  radius: 0.35,
  standHeight: 1.7,
  crouchHeight: 1.2,
  /** Max ledge height the player can auto-step onto while moving. */
  stepHeight: 0.42,
  /** Snap-down distance when walking off a tiny lip. */
  stepDown: 0.35,
  skin: 0.02,
} as const;

export type PhysicsBody = {
  position: THREE.Vector3;
  /** Horizontal + vertical velocity (y is vertical). */
  velocity: THREE.Vector3;
  grounded: boolean;
  crouching: boolean;
};

function aabbOverlap(
  aMin: THREE.Vector3,
  aMax: THREE.Vector3,
  bMin: THREE.Vector3,
  bMax: THREE.Vector3,
): boolean {
  return (
    aMin.x < bMax.x &&
    aMax.x > bMin.x &&
    aMin.y < bMax.y &&
    aMax.y > bMin.y &&
    aMin.z < bMax.z &&
    aMax.z > bMin.z
  );
}

function setAabb(
  pos: THREE.Vector3,
  height: number,
  radius: number,
  outMin: THREE.Vector3,
  outMax: THREE.Vector3,
): void {
  const s = PHYSICS.skin;
  outMin.set(pos.x - radius + s, pos.y + s, pos.z - radius + s);
  outMax.set(pos.x + radius - s, pos.y + height - s, pos.z + radius - s);
}

/**
 * Resolve capsule AABB against world colliders.
 * Prefer wall slides; allow standing on tops; support step-up.
 */
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _stepped = new THREE.Vector3();

export function resolveBody(
  body: PhysicsBody,
  colliders: Collider[],
  dt: number,
  wishDir: THREE.Vector3,
  speed: number,
  wantsJump: boolean,
): void {
  const { position, velocity } = body;
  const height = body.crouching ? PHYSICS.crouchHeight : PHYSICS.standHeight;
  const r = PHYSICS.radius;
  const boxMin = _boxMin;
  const boxMax = _boxMax;

  // --- Horizontal accel / friction ---
  const onGround = body.grounded;
  const accel = onGround ? PHYSICS.accelGround : PHYSICS.accelAir;
  const friction = onGround ? PHYSICS.frictionGround : PHYSICS.frictionAir;

  const targetX = wishDir.x * speed;
  const targetZ = wishDir.z * speed;

  // Friction when no wish or opposite
  if (onGround) {
    const hvx = velocity.x;
    const hvz = velocity.z;
    const hSpeed = Math.hypot(hvx, hvz);
    if (hSpeed > 0.01) {
      const drop = Math.min(hSpeed, friction * dt);
      const scale = (hSpeed - drop) / hSpeed;
      velocity.x *= scale;
      velocity.z *= scale;
    } else {
      velocity.x = 0;
      velocity.z = 0;
    }
  } else {
    velocity.x *= Math.max(0, 1 - friction * dt * 0.15);
    velocity.z *= Math.max(0, 1 - friction * dt * 0.15);
  }

  // Accelerate toward wish
  const ax = targetX - velocity.x;
  const az = targetZ - velocity.z;
  const aLen = Math.hypot(ax, az);
  if (aLen > 0.0001) {
    const maxDelta = accel * dt;
    const scale = Math.min(1, maxDelta / aLen);
    velocity.x += ax * scale;
    velocity.z += az * scale;
  }

  // Jump
  if (wantsJump && body.grounded) {
    velocity.y = PHYSICS.jumpVelocity;
    body.grounded = false;
  }

  // Gravity
  velocity.y -= PHYSICS.gravity * dt;

  // --- Integrate axis-separated with step-up ---
  // X
  position.x += velocity.x * dt;
  resolveAxis(position, velocity, colliders, height, r, boxMin, boxMax, "x");

  // Z
  position.z += velocity.z * dt;
  resolveAxis(position, velocity, colliders, height, r, boxMin, boxMax, "z");

  // Attempt step-up if horizontal blocked and grounded
  if (body.grounded && (wishDir.x !== 0 || wishDir.z !== 0)) {
    tryStepUp(position, velocity, colliders, height, r, boxMin, boxMax, wishDir, speed, dt);
  }

  // Y
  position.y += velocity.y * dt;

  // Ground plane
  let grounded = false;
  if (position.y <= PHYSICS.groundY) {
    position.y = PHYSICS.groundY;
    if (velocity.y < 0) velocity.y = 0;
    grounded = true;
  }

  // Collider floors / ceilings
  const yHit = resolveY(position, velocity, colliders, height, r, boxMin, boxMax);
  if (yHit === "floor") grounded = true;

  // Snap down to platforms when walking off micro-lips
  if (grounded || velocity.y <= 0) {
    const snapped = snapToFloor(position, colliders, height, r, boxMin, boxMax);
    if (snapped) {
      grounded = true;
      if (velocity.y < 0) velocity.y = 0;
    }
  }

  body.grounded = grounded;
}

function resolveAxis(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: Collider[],
  height: number,
  radius: number,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
  axis: "x" | "z",
): void {
  for (let iter = 0; iter < 4; iter++) {
    setAabb(pos, height, radius, boxMin, boxMax);
    let hit = false;
    for (const c of colliders) {
      if (!aabbOverlap(boxMin, boxMax, c.min, c.max)) continue;
      // Skip pure floor overlaps (standing on top) — Y resolver owns those
      const feet = pos.y + PHYSICS.skin;
      if (feet >= c.max.y - 0.05 && vel.y <= 0.1) continue;

      if (axis === "x") {
        const penL = boxMax.x - c.min.x;
        const penR = c.max.x - boxMin.x;
        if (penL < penR) {
          pos.x -= penL + PHYSICS.skin;
          if (vel.x > 0) vel.x = 0;
        } else {
          pos.x += penR + PHYSICS.skin;
          if (vel.x < 0) vel.x = 0;
        }
      } else {
        const penN = boxMax.z - c.min.z;
        const penS = c.max.z - boxMin.z;
        if (penN < penS) {
          pos.z -= penN + PHYSICS.skin;
          if (vel.z > 0) vel.z = 0;
        } else {
          pos.z += penS + PHYSICS.skin;
          if (vel.z < 0) vel.z = 0;
        }
      }
      hit = true;
    }
    if (!hit) break;
  }
}

function resolveY(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: Collider[],
  height: number,
  radius: number,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
): "floor" | "ceil" | null {
  let result: "floor" | "ceil" | null = null;
  for (let iter = 0; iter < 4; iter++) {
    setAabb(pos, height, radius, boxMin, boxMax);
    let hit = false;
    for (const c of colliders) {
      if (!aabbOverlap(boxMin, boxMax, c.min, c.max)) continue;

      const penDown = boxMax.y - c.min.y; // into ceiling from below
      const penUp = c.max.y - boxMin.y; // into floor from above

      if (penUp < penDown) {
        // Push up onto floor
        pos.y += penUp + PHYSICS.skin * 0.5;
        if (vel.y < 0) vel.y = 0;
        result = "floor";
      } else {
        // Push down from ceiling
        pos.y -= penDown + PHYSICS.skin * 0.5;
        if (vel.y > 0) vel.y = 0;
        result = "ceil";
      }
      hit = true;
    }
    if (!hit) break;
  }
  return result;
}

function tryStepUp(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  colliders: Collider[],
  height: number,
  radius: number,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
  wishDir: THREE.Vector3,
  speed: number,
  dt: number,
): void {
  // Probe slightly forward
  _probe.set(pos.x + wishDir.x * (radius + 0.08), pos.y, pos.z + wishDir.z * (radius + 0.08));
  setAabb(_probe, height, radius, boxMin, boxMax);

  let bestTop = -Infinity;
  for (const c of colliders) {
    if (!aabbOverlap(boxMin, boxMax, c.min, c.max)) continue;
    // Only step onto tops within step height
    const rise = c.max.y - pos.y;
    if (rise > 0.02 && rise <= PHYSICS.stepHeight) {
      bestTop = Math.max(bestTop, c.max.y);
    }
  }
  if (bestTop === -Infinity) return;

  // Test standing on stepped height
  _stepped.copy(pos);
  _stepped.y = bestTop + PHYSICS.skin;
  _stepped.x += wishDir.x * speed * dt;
  _stepped.z += wishDir.z * speed * dt;
  setAabb(_stepped, height, radius, boxMin, boxMax);
  for (const c of colliders) {
    // Ignore the floor we stepped onto
    if (Math.abs(c.max.y - bestTop) < 0.05) continue;
    if (aabbOverlap(boxMin, boxMax, c.min, c.max)) return; // blocked
  }

  pos.copy(_stepped);
  vel.y = 0;
}

function snapToFloor(
  pos: THREE.Vector3,
  colliders: Collider[],
  height: number,
  radius: number,
  boxMin: THREE.Vector3,
  boxMax: THREE.Vector3,
): boolean {
  // Cast a short downward probe under feet
  const feetY = pos.y;
  const probeBottom = feetY - PHYSICS.stepDown;
  let best = feetY;
  let found = false;

  for (const c of colliders) {
    // Horizontal overlap with capsule footprint
    if (
      pos.x + radius <= c.min.x ||
      pos.x - radius >= c.max.x ||
      pos.z + radius <= c.min.z ||
      pos.z - radius >= c.max.z
    ) {
      continue;
    }
    const top = c.max.y;
    if (top <= feetY + 0.05 && top >= probeBottom) {
      if (!found || top > best) {
        best = top;
        found = true;
      }
    }
  }

  if (found && best > PHYSICS.groundY - 0.01) {
    pos.y = best + PHYSICS.skin * 0.25;
    return true;
  }
  return feetY <= PHYSICS.groundY + 0.02;
}

/**
 * Ray vs AABB (slab method). Returns distance t along ray, or null.
 */
export function raycastColliders(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  colliders: Collider[],
  maxDist: number,
): { t: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
  let bestT = maxDist;
  let hit = false;
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const hitPoint = new THREE.Vector3();
  const hitNormal = new THREE.Vector3();

  const invDirX = dir.x !== 0 ? 1 / dir.x : 1e12;
  const invDirY = dir.y !== 0 ? 1 / dir.y : 1e12;
  const invDirZ = dir.z !== 0 ? 1 / dir.z : 1e12;

  for (const c of colliders) {
    let tmin = 0;
    let tmax = maxDist;
    let nx = 0;
    let ny = 0;
    let nz = 0;

    // X slab
    {
      const t1 = (c.min.x - origin.x) * invDirX;
      const t2 = (c.max.x - origin.x) * invDirX;
      const tEnter = Math.min(t1, t2);
      const tExit = Math.max(t1, t2);
      const enterN = t1 < t2 ? -1 : 1;
      if (tEnter > tmin) {
        tmin = tEnter;
        nx = enterN;
        ny = 0;
        nz = 0;
      }
      tmax = Math.min(tmax, tExit);
      if (tmax < tmin) continue;
    }
    // Y slab
    {
      const t1 = (c.min.y - origin.y) * invDirY;
      const t2 = (c.max.y - origin.y) * invDirY;
      const tEnter = Math.min(t1, t2);
      const tExit = Math.max(t1, t2);
      const enterN = t1 < t2 ? -1 : 1;
      if (tEnter > tmin) {
        tmin = tEnter;
        nx = 0;
        ny = enterN;
        nz = 0;
      }
      tmax = Math.min(tmax, tExit);
      if (tmax < tmin) continue;
    }
    // Z slab
    {
      const t1 = (c.min.z - origin.z) * invDirZ;
      const t2 = (c.max.z - origin.z) * invDirZ;
      const tEnter = Math.min(t1, t2);
      const tExit = Math.max(t1, t2);
      const enterN = t1 < t2 ? -1 : 1;
      if (tEnter > tmin) {
        tmin = tEnter;
        nx = 0;
        ny = 0;
        nz = enterN;
      }
      tmax = Math.min(tmax, tExit);
      if (tmax < tmin) continue;
    }

    if (tmin >= 0 && tmin < bestT) {
      bestT = tmin;
      hit = true;
      hitPoint.copy(origin).addScaledVector(dir, tmin);
      hitNormal.set(nx, ny, nz);
    }
  }

  if (!hit) return null;
  point.copy(hitPoint);
  normal.copy(hitNormal);
  return { t: bestT, point, normal };
}
