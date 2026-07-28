import * as THREE from "three";
import type { Collider, DamageIndicator, GameHudState } from "@/game/types";
import { createWeapon, type WeaponController } from "./weapon";

const LOOK_SENS = 0.002;
const PI_2 = Math.PI / 2;

const WALK_SPEED = 5.2;
const SPRINT_MULT = 1.6;
const CROUCH_MULT = 0.45;
const JUMP_VELOCITY = 7.2;
const GRAVITY = 22;
const GROUND_Y = 0;

const STAND_HEIGHT = 1.7;
const CROUCH_HEIGHT = 1.15;
const PLAYER_RADIUS = 0.35;
const STAND_CAPSULE_H = 1.7;
const CROUCH_CAPSULE_H = 1.2;

const FOV_HIP = 75;
const FOV_ADS = 52;

const MAX_HEALTH = 100;
const MAX_ARMOR = 50;
const REGEN_DELAY = 5;
const REGEN_RATE = 12; // hp/s

const BOB_WALK_FREQ = 8.5;
const BOB_SPRINT_FREQ = 11.5;
const BOB_WALK_AMP = 0.012;
const BOB_SPRINT_AMP = 0.022;

const EMPTY_CLICK_COOLDOWN = 0.28;
const DAMAGE_IND_TTL = 1.15;
const MAX_DAMAGE_INDS = 6;

export function createPlayer(opts: {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  canvas: HTMLCanvasElement;
  colliders: Collider[];
  onHud: (p: Partial<GameHudState>) => void;
  onShoot: (origin: THREE.Vector3, direction: THREE.Vector3, ads: boolean) => void;
  onReloadStart?: () => void;
  onFootstep?: () => void;
  /** Empty magazine click when trigger pulled dry. */
  onEmpty?: () => void;
}): {
  update: (dt: number) => void;
  isLocked: () => boolean;
  requestLock: () => void;
  getPosition: () => THREE.Vector3;
  takeDamage: (amount: number, fromWorld?: THREE.Vector3) => void;
  heal: (amount: number) => void;
  dispose: () => void;
  weapon: WeaponController;
} {
  const { camera, canvas, colliders, onHud, onShoot, onReloadStart, onFootstep, onEmpty } =
    opts;

  // Ensure camera is in the scene graph (for viewmodel lights, etc.)
  if (!camera.parent) {
    opts.scene.add(camera);
  }

  const weapon = createWeapon(camera);

  const position = new THREE.Vector3(0, GROUND_Y, 0);
  const velocity = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  euler.setFromQuaternion(camera.quaternion);

  let locked = document.pointerLockElement === canvas;
  let health = MAX_HEALTH;
  let armor = MAX_ARMOR;
  let outOfCombatT = REGEN_DELAY;

  let crouching = false;
  let grounded = true;
  let verticalVel = 0;
  let cameraHeight = STAND_HEIGHT;
  let targetCamHeight = STAND_HEIGHT;

  let bobPhase = 0;
  let bobOffset = 0;
  let landOffset = 0;
  let landVel = 0;
  let wasGrounded = true;
  let footstepDist = 0;

  let mouseDx = 0;
  let mouseDy = 0;
  let time = 0;
  let emptyClickCd = 0;
  let damageIndId = 1;
  const damageIndicators: DamageIndicator[] = [];
  let fovPunch = 0;

  const keys: Record<string, boolean> = {};
  let fireHeld = false;
  let adsHeld = false;

  // Previous HUD snapshot to avoid spam
  let lastHud: Partial<GameHudState> = {};

  const shootOrigin = new THREE.Vector3();
  const shootDir = new THREE.Vector3();
  const wishDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const nextPos = new THREE.Vector3();
  const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");
  // Reused AABB temps for collision (avoid per-frame alloc)
  const boxMin = new THREE.Vector3();
  const boxMax = new THREE.Vector3();

  function pushHud(partial: Partial<GameHudState>): void {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof GameHudState)[]) {
      if (key === "damageIndicators") {
        changed = true;
        break;
      }
      if (lastHud[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    lastHud = { ...lastHud, ...partial };
    onHud(partial);
  }

  function syncWeaponHud(): void {
    pushHud({
      ammo: weapon.getAmmo(),
      reserve: weapon.getReserve(),
      reloading: weapon.isReloading(),
      health,
      armor,
      ads: adsHeld && locked && !keys["ShiftLeft"] && !keys["ShiftRight"],
      sprinting:
        locked &&
        (keys["ShiftLeft"] || keys["ShiftRight"]) &&
        !crouching &&
        !(adsHeld && locked),
    });
  }

  function pushDamageIndicators(): void {
    pushHud({ damageIndicators: damageIndicators.map((d) => ({ ...d })) });
  }

  // --- Input handlers ---
  const onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) return;
    mouseDx += e.movementX;
    mouseDy += e.movementY;
    euler.y -= e.movementX * LOOK_SENS;
    euler.x -= e.movementY * LOOK_SENS;
    euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));
  };

  const onPointerLockChange = (): void => {
    locked = document.pointerLockElement === canvas;
    pushHud({ locked });
    if (!locked) {
      fireHeld = false;
      adsHeld = false;
    }
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) {
      if (e.button === 0) canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) fireHeld = true;
    if (e.button === 2) adsHeld = true;
  };

  const onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) fireHeld = false;
    if (e.button === 2) adsHeld = false;
  };

  const onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    keys[e.code] = true;
    if (e.code === "KeyR" && locked) {
      if (weapon.reload()) {
        onReloadStart?.();
        syncWeaponHud();
      }
    }
    if (e.code === "Escape") {
      document.exitPointerLock?.();
    }
    // prevent page scroll on space/ctrl when locked
    if (
      locked &&
      (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight")
    ) {
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    keys[e.code] = false;
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // Initial HUD
  pushHud({
    health,
    maxHealth: MAX_HEALTH,
    armor,
    maxArmor: MAX_ARMOR,
    ammo: weapon.getAmmo(),
    reserve: weapon.getReserve(),
    reloading: false,
    ads: false,
    sprinting: false,
    locked,
    weaponName: "M4A1 · TACTICAL",
    damageIndicators: [],
  });

  // --- Collision helpers ---
  function setPlayerAabb(pos: THREE.Vector3, height: number): void {
    const r = PLAYER_RADIUS;
    boxMin.set(pos.x - r, pos.y, pos.z - r);
    boxMax.set(pos.x + r, pos.y + height, pos.z + r);
  }

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

  function resolveCollisions(pos: THREE.Vector3, height: number): void {
    const r = PLAYER_RADIUS;
    for (let iter = 0; iter < 3; iter++) {
      setPlayerAabb(pos, height);
      for (const c of colliders) {
        if (!aabbOverlap(boxMin, boxMax, c.min, c.max)) continue;

        const penX1 = boxMax.x - c.min.x;
        const penX2 = c.max.x - boxMin.x;
        const penZ1 = boxMax.z - c.min.z;
        const penZ2 = c.max.z - boxMin.z;
        const penY1 = boxMax.y - c.min.y;
        const penY2 = c.max.y - boxMin.y;

        const penX = penX1 < penX2 ? -penX1 : penX2;
        const penZ = penZ1 < penZ2 ? -penZ1 : penZ2;
        const penY = penY1 < penY2 ? -penY1 : penY2;

        const absX = Math.abs(penX);
        const absY = Math.abs(penY);
        const absZ = Math.abs(penZ);

        // Prefer horizontal slide; only resolve Y if clearly smallest (ceilings / ledges)
        if (absY < absX && absY < absZ && absY < 0.35) {
          pos.y += penY;
          if (penY > 0) verticalVel = Math.max(0, verticalVel);
          else verticalVel = Math.min(0, verticalVel);
        } else if (absX < absZ) {
          pos.x += penX;
        } else {
          pos.z += penZ;
        }

        boxMin.set(pos.x - r, pos.y, pos.z - r);
        boxMax.set(pos.x + r, pos.y + height, pos.z + r);
      }
    }
  }

  function update(dt: number): void {
    // Clamp huge frames (tab switch)
    const t = Math.min(dt, 0.05);
    time += t;
    emptyClickCd = Math.max(0, emptyClickCd - t);

    locked = document.pointerLockElement === canvas;

    // --- Look: apply camera euler + weapon recoil kick on pitch/yaw ---
    lookEuler.set(euler.x + weapon.getRecoilPitch(), euler.y + weapon.getRecoilYaw(), 0);
    camera.quaternion.setFromEuler(lookEuler);

    // --- Stance ---
    const wantsCrouch = !!(keys["ControlLeft"] || keys["ControlRight"]);
    crouching = wantsCrouch;
    const capsuleH = crouching ? CROUCH_CAPSULE_H : STAND_CAPSULE_H;
    targetCamHeight = crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    cameraHeight = THREE.MathUtils.damp(cameraHeight, targetCamHeight, 12, t);

    // --- Movement wish ---
    const sprinting =
      locked &&
      (keys["ShiftLeft"] || keys["ShiftRight"]) &&
      !crouching &&
      !adsHeld;
    const ads = locked && adsHeld && !sprinting;

    wishDir.set(0, 0, 0);
    if (locked) {
      forward.set(-Math.sin(euler.y), 0, -Math.cos(euler.y));
      right.set(Math.cos(euler.y), 0, -Math.sin(euler.y));
      if (keys["KeyW"]) wishDir.add(forward);
      if (keys["KeyS"]) wishDir.sub(forward);
      if (keys["KeyD"]) wishDir.add(right);
      if (keys["KeyA"]) wishDir.sub(right);
    }
    const moving = wishDir.lengthSq() > 0.0001;
    if (moving) wishDir.normalize();

    let speed = WALK_SPEED;
    if (sprinting && moving) speed *= SPRINT_MULT;
    if (crouching) speed *= CROUCH_MULT;
    if (ads) speed *= 0.68;

    // Horizontal velocity (direct control — arcade COD feel)
    velocity.x = wishDir.x * speed;
    velocity.z = wishDir.z * speed;

    // Jump
    if (locked && keys["Space"] && grounded) {
      verticalVel = JUMP_VELOCITY;
      grounded = false;
    }

    // Gravity
    verticalVel -= GRAVITY * t;
    velocity.y = verticalVel;

    // Integrate with axis-separated collision for wall slide
    nextPos.copy(position);

    // X
    nextPos.x += velocity.x * t;
    resolveCollisions(nextPos, capsuleH);
    // Z
    nextPos.z += velocity.z * t;
    resolveCollisions(nextPos, capsuleH);
    // Y
    nextPos.y += velocity.y * t;
    if (nextPos.y <= GROUND_Y) {
      nextPos.y = GROUND_Y;
      if (!wasGrounded && verticalVel < -2) {
        // Soft landing impact
        const impact = THREE.MathUtils.clamp(-verticalVel / 18, 0, 1);
        landVel = -impact * 0.08;
      }
      verticalVel = 0;
      grounded = true;
    } else {
      grounded = false;
    }
    resolveCollisions(nextPos, capsuleH);
    // Re-clamp ground after collision push
    if (nextPos.y < GROUND_Y) {
      nextPos.y = GROUND_Y;
      verticalVel = 0;
      grounded = true;
    }

    wasGrounded = grounded;
    position.copy(nextPos);

    // Landing spring
    landVel += -landOffset * 40 * t;
    landVel *= Math.pow(0.85, t * 60);
    landOffset += landVel;

    // Head bob
    if (grounded && moving && locked) {
      const freq = sprinting ? BOB_SPRINT_FREQ : BOB_WALK_FREQ;
      const amp = sprinting ? BOB_SPRINT_AMP : BOB_WALK_AMP;
      bobPhase += t * freq * Math.PI * 2;
      bobOffset = Math.sin(bobPhase) * amp;
      // Footsteps on bob peaks
      footstepDist += speed * t;
      const stepLen = sprinting ? 1.6 : 1.15;
      if (footstepDist >= stepLen) {
        footstepDist = 0;
        onFootstep?.();
      }
    } else {
      bobPhase = 0;
      bobOffset = THREE.MathUtils.damp(bobOffset, 0, 10, t);
      footstepDist = 0;
    }

    // Apply camera position
    camera.position.set(
      position.x,
      position.y + cameraHeight + bobOffset + landOffset,
      position.z,
    );

    // FOV lerp — snappy ADS + micro fire punch
    fovPunch = THREE.MathUtils.damp(fovPunch, 0, 14, t);
    const targetFov = (ads ? FOV_ADS : FOV_HIP) + fovPunch;
    camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 14, t);
    camera.updateProjectionMatrix();

    // Weapon
    weapon.setAds(ads);
    weapon.update(t, {
      ads,
      moving,
      sprinting,
      mouseDx,
      mouseDy,
      time,
    });
    mouseDx = 0;
    mouseDy = 0;

    // Fire (full-auto hold) — weapon rate-limits internally via fireCooldown
    if (locked && fireHeld && !sprinting) {
      const fired = weapon.tryFire();
      if (fired) {
        camera.getWorldPosition(shootOrigin);
        camera.getWorldDirection(shootDir);
        onShoot(shootOrigin.clone(), shootDir.clone(), ads);
        fovPunch = ads ? 0.6 : 1.1;
        outOfCombatT = 0;
        syncWeaponHud();
      } else if (weapon.isDry()) {
        // Empty click + auto-reload (COD-style dry fire feedback)
        if (emptyClickCd <= 0) {
          emptyClickCd = EMPTY_CLICK_COOLDOWN;
          onEmpty?.();
        }
        if (weapon.getReserve() > 0 && weapon.reload()) {
          onReloadStart?.();
          syncWeaponHud();
        }
      }
    }

    // Decay damage indicators
    if (damageIndicators.length > 0) {
      let dirty = false;
      for (let i = damageIndicators.length - 1; i >= 0; i--) {
        const d = damageIndicators[i]!;
        d.t -= t / DAMAGE_IND_TTL;
        if (d.t <= 0) {
          damageIndicators.splice(i, 1);
          dirty = true;
        } else {
          dirty = true;
        }
      }
      if (dirty) pushDamageIndicators();
    }

    // Health regen
    outOfCombatT += t;
    if (outOfCombatT >= REGEN_DELAY && health < MAX_HEALTH && health > 0) {
      health = Math.min(MAX_HEALTH, health + REGEN_RATE * t);
      pushHud({ health });
    }

    // Periodic weapon/state HUD (cheap)
    pushHud({
      ammo: weapon.getAmmo(),
      reserve: weapon.getReserve(),
      reloading: weapon.isReloading(),
      ads,
      sprinting: sprinting && moving,
      health,
      armor,
      locked,
    });
  }

  function takeDamage(amount: number, fromWorld?: THREE.Vector3): void {
    if (amount <= 0 || health <= 0) return;
    outOfCombatT = 0;
    // Armor absorbs 50% of incoming damage until depleted; remainder hits health.
    const armorShare = amount * 0.5;
    const armorTake = Math.min(armor, armorShare);
    armor = Math.max(0, armor - armorTake);
    const healthDmg = amount - armorTake;
    health = Math.max(0, health - healthDmg);

    // Damage direction indicator (relative to look yaw)
    if (fromWorld) {
      const dx = fromWorld.x - position.x;
      const dz = fromWorld.z - position.z;
      // View-space angle: 0 = front, +PI/2 = right, PI = behind
      const fx = -Math.sin(euler.y);
      const fz = -Math.cos(euler.y);
      const rx = Math.cos(euler.y);
      const rz = -Math.sin(euler.y);
      const len = Math.hypot(dx, dz) || 1;
      const ndx = dx / len;
      const ndz = dz / len;
      const localX = ndx * rx + ndz * rz;
      const localZ = ndx * fx + ndz * fz;
      const angle = Math.atan2(localX, localZ);

      damageIndicators.push({
        id: damageIndId++,
        angle,
        t: 1,
      });
      while (damageIndicators.length > MAX_DAMAGE_INDS) {
        damageIndicators.shift();
      }
    }

    pushHud({
      health,
      armor,
      damageFlash: 1,
      damageIndicators: damageIndicators.map((d) => ({ ...d })),
    });
  }

  function heal(amount: number): void {
    if (amount <= 0) return;
    health = Math.min(MAX_HEALTH, health + amount);
    pushHud({ health });
  }

  function dispose(): void {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    weapon.dispose();
  }

  return {
    update,
    isLocked: () => locked,
    requestLock: () => {
      canvas.requestPointerLock();
    },
    getPosition: () => position.clone(),
    takeDamage,
    heal,
    dispose,
    weapon,
  };
}
