import * as THREE from "three";
import type { Collider, DamageIndicator, GameHudState } from "@/game/types";
import { createWeapon, type WeaponController } from "./weapon";
import { canOccupyHeight, PHYSICS, resolveBody, type PhysicsBody } from "./physics";

const LOOK_SENS = 0.002;
const TOUCH_LOOK_SENS = 0.0038;
const PI_2 = Math.PI / 2;

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
const JUMP_BUFFER = 0.13;
const COYOTE_TIME = 0.105;

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
  /** Switches the controller to on-screen touch input (no pointer lock). */
  setTouchMode: (enabled: boolean) => void;
  /** Releases touch play session (returns to briefing). */
  releaseTouch: () => void;
  touch: {
    move: (x: number, y: number) => void;
    look: (dx: number, dy: number) => void;
    setFire: (down: boolean) => void;
    setAds: (down: boolean) => void;
    setSprint: (down: boolean) => void;
    toggleCrouch: () => void;
    jump: () => void;
    reload: () => void;
  };
  getPosition: () => THREE.Vector3;
  takeDamage: (amount: number, fromWorld?: THREE.Vector3) => void;
  heal: (amount: number) => void;
  dispose: () => void;
  weapon: WeaponController;
} {
  const { camera, canvas, colliders, onHud, onShoot, onReloadStart, onFootstep, onEmpty } = opts;

  // Ensure camera is in the scene graph (for viewmodel lights, etc.)
  if (!camera.parent) {
    opts.scene.add(camera);
  }

  const weapon = createWeapon(camera);

  const body: PhysicsBody = {
    position: new THREE.Vector3(0, PHYSICS.groundY, 0),
    velocity: new THREE.Vector3(),
    grounded: true,
    crouching: false,
  };
  const position = body.position;
  const velocity = body.velocity;
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  euler.setFromQuaternion(camera.quaternion);

  let locked = document.pointerLockElement === canvas;
  let health = MAX_HEALTH;
  let armor = MAX_ARMOR;
  let outOfCombatT = REGEN_DELAY;

  let crouching = false;
  let grounded = true;
  let wasGrounded = true;
  let cameraHeight = 1.7;
  let targetCamHeight = 1.7;

  let bobPhase = 0;
  let bobOffset = 0;
  let bobSide = 0;
  let landOffset = 0;
  let landVel = 0;
  let footstepDist = 0;
  let cameraRoll = 0;

  let mouseDx = 0;
  let mouseDy = 0;
  let time = 0;
  let emptyClickCd = 0;
  let damageIndId = 1;
  const damageIndicators: DamageIndicator[] = [];
  let fovPunch = 0;
  let damagePitch = 0;
  let damageYaw = 0;
  let jumpBufferT = 0;
  let coyoteT = COYOTE_TIME;

  const keys: Record<string, boolean> = {};
  let fireHeld = false;
  let adsHeld = false;

  // --- Touch (phone/tablet) input state ---
  let touchMode = false;
  let touchActive = false;
  let touchMoveX = 0;
  let touchMoveY = 0;
  let touchLookDx = 0;
  let touchLookDy = 0;
  let touchSprint = false;
  let touchCrouch = false;

  // Previous HUD snapshot to avoid spam
  let lastHud: Partial<GameHudState> = {};

  const shootOrigin = new THREE.Vector3();
  const shootDir = new THREE.Vector3();
  const wishDir = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

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
        !!keys["KeyW"] &&
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
      mouseDx = 0;
      mouseDy = 0;
      for (const code of Object.keys(keys)) keys[code] = false;
    }
  };

  const onPointerLockError = (): void => {
    locked = false;
    pushHud({ locked: false, ads: false, sprinting: false });
  };

  const tryRequestLock = (): void => {
    if (touchMode) {
      touchActive = true;
      locked = true;
      pushHud({ locked: true });
      return;
    }
    try {
      void canvas.requestPointerLock().catch(onPointerLockError);
    } catch {
      onPointerLockError();
    }
  };

  const resetInput = (): void => {
    fireHeld = false;
    adsHeld = false;
    mouseDx = 0;
    mouseDy = 0;
    touchMoveX = 0;
    touchMoveY = 0;
    touchLookDx = 0;
    touchLookDy = 0;
    touchSprint = false;
    touchCrouch = false;
    for (const code of Object.keys(keys)) keys[code] = false;
  };

  const releaseTouch = (): void => {
    touchActive = false;
    locked = false;
    resetInput();
    pushHud({ locked: false, ads: false, sprinting: false });
  };

  const setTouchMode = (enabled: boolean): void => {
    touchMode = enabled;
    if (!enabled) touchActive = false;
  };

  const touchApi = {
    move: (x: number, y: number): void => {
      touchMoveX = x;
      touchMoveY = y;
    },
    look: (dx: number, dy: number): void => {
      touchLookDx += dx;
      touchLookDy += dy;
    },
    setFire: (down: boolean): void => {
      fireHeld = down;
    },
    setAds: (down: boolean): void => {
      adsHeld = down;
    },
    setSprint: (down: boolean): void => {
      touchSprint = down;
    },
    toggleCrouch: (): void => {
      touchCrouch = !touchCrouch;
    },
    jump: (): void => {
      if (locked) jumpBufferT = JUMP_BUFFER;
    },
    reload: (): void => {
      if (locked && weapon.reload()) {
        onReloadStart?.();
        syncWeaponHud();
      }
    },
  };


  const onMouseDown = (e: MouseEvent): void => {
    if (document.pointerLockElement !== canvas) {
      if (e.button === 0) tryRequestLock();
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
    if (e.code === "Space" && locked && !e.repeat) {
      jumpBufferT = JUMP_BUFFER;
    }
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
    if (locked && (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight")) {
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    keys[e.code] = false;
  };

  const onBlur = (): void => {
    fireHeld = false;
    adsHeld = false;
    mouseDx = 0;
    mouseDy = 0;
    for (const code of Object.keys(keys)) keys[code] = false;
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  document.addEventListener("pointerlockerror", onPointerLockError);
  canvas.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

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

  function update(dt: number): void {
    // Clamp huge frames (tab switch)
    const t = Math.min(dt, 0.05);
    time += t;
    emptyClickCd = Math.max(0, emptyClickCd - t);

    locked = document.pointerLockElement === canvas;

    const localStrafeSpeed = velocity.x * Math.cos(euler.y) + velocity.z * -Math.sin(euler.y);
    const targetRoll = grounded
      ? THREE.MathUtils.clamp(-localStrafeSpeed * 0.0018, -0.012, 0.012)
      : 0;
    cameraRoll = THREE.MathUtils.damp(cameraRoll, targetRoll, 11, t);
    damagePitch = THREE.MathUtils.damp(damagePitch, 0, 13, t);
    damageYaw = THREE.MathUtils.damp(damageYaw, 0, 15, t);

    // --- Look: view recoil, subtle locomotion roll, and directional damage flinch ---
    lookEuler.set(
      euler.x + weapon.getRecoilPitch() + damagePitch,
      euler.y + weapon.getRecoilYaw() + damageYaw,
      cameraRoll,
    );
    camera.quaternion.setFromEuler(lookEuler);

    // --- Stance ---
    const wantsCrouch = !!(keys["ControlLeft"] || keys["ControlRight"]);
    if (wantsCrouch) {
      crouching = true;
    } else if (crouching && canOccupyHeight(position, colliders, PHYSICS.standHeight)) {
      crouching = false;
    }
    body.crouching = crouching;
    targetCamHeight = crouching ? 1.15 : 1.7;
    cameraHeight = THREE.MathUtils.damp(cameraHeight, targetCamHeight, 12, t);

    // --- Movement wish ---
    const sprinting =
      locked &&
      !!keys["KeyW"] &&
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
    const hasMoveInput = wishDir.lengthSq() > 0.0001;
    if (hasMoveInput) wishDir.normalize();

    let speed = PHYSICS.walkSpeed;
    if (sprinting && hasMoveInput) speed *= PHYSICS.sprintMult;
    if (crouching) speed *= PHYSICS.crouchMult;
    if (ads) speed *= PHYSICS.adsMult;

    const prevVy = velocity.y;
    jumpBufferT = Math.max(0, jumpBufferT - t);
    coyoteT = grounded ? COYOTE_TIME : Math.max(0, coyoteT - t);
    const wantsJump = locked && jumpBufferT > 0 && coyoteT > 0;
    body.grounded = grounded;
    resolveBody(body, colliders, t, wishDir, speed, wantsJump);
    if (wantsJump && !body.grounded) {
      jumpBufferT = 0;
      coyoteT = 0;
    }
    grounded = body.grounded;
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const moving = hasMoveInput && horizontalSpeed > 0.18;

    // Soft landing impact
    if (!wasGrounded && grounded && prevVy < -2) {
      const impact = THREE.MathUtils.clamp(-prevVy / 18, 0, 1);
      landVel = -impact * 0.08;
    }
    wasGrounded = grounded;

    // Landing spring
    landVel += -landOffset * 40 * t;
    landVel *= Math.pow(0.85, t * 60);
    landOffset += landVel;

    // Head bob
    if (grounded && moving && locked) {
      const freq = sprinting ? BOB_SPRINT_FREQ : BOB_WALK_FREQ;
      const amp = sprinting ? BOB_SPRINT_AMP : BOB_WALK_AMP;
      bobPhase += t * freq * Math.PI * 2;
      bobOffset = (Math.abs(Math.sin(bobPhase)) - 0.35) * amp;
      bobSide = Math.cos(bobPhase) * amp * 0.55;
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
      bobSide = THREE.MathUtils.damp(bobSide, 0, 10, t);
      footstepDist = 0;
    }

    // Apply camera position
    camera.position.set(
      position.x + Math.cos(euler.y) * bobSide,
      position.y + cameraHeight + bobOffset + landOffset,
      position.z - Math.sin(euler.y) * bobSide,
    );

    // FOV lerp — snappy ADS + micro fire punch
    fovPunch = THREE.MathUtils.damp(fovPunch, 0, 14, t);
    const targetFov = (ads ? FOV_ADS : FOV_HIP) + fovPunch;
    const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, ads ? 18 : 13, t);
    if (Math.abs(nextFov - camera.fov) > 0.0001) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    // Weapon
    weapon.setAds(ads);
    weapon.update(t, {
      ads,
      moving,
      sprinting,
      mouseDx,
      mouseDy,
      time,
      moveSpeed: horizontalSpeed / Math.max(PHYSICS.walkSpeed, 0.001),
      strafe: THREE.MathUtils.clamp(localStrafeSpeed / Math.max(speed, 0.001), -1, 1),
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
      damagePitch -= THREE.MathUtils.clamp(amount * 0.00045, 0.004, 0.018);
      damageYaw += THREE.MathUtils.clamp(localX * amount * 0.0006, -0.025, 0.025);

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
    document.removeEventListener("pointerlockerror", onPointerLockError);
    canvas.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    weapon.dispose();
  }

  return {
    update,
    isLocked: () => locked,
    requestLock: tryRequestLock,
    getPosition: () => position.clone(),
    takeDamage,
    heal,
    dispose,
    weapon,
  };
}
