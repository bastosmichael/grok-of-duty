import * as THREE from "three";

const MAG_SIZE = 30;
const MAX_RESERVE = 120;
const FIRE_INTERVAL = 0.095; // ~10.5 rps — COD AR pace
const RELOAD_DURATION = 1.65;

// Hip: slightly lower/right for readable silhouette; ADS centers tight
const HIP_POS = new THREE.Vector3(0.26, -0.24, -0.52);
const ADS_POS = new THREE.Vector3(0.0, -0.155, -0.38);
const HIP_ROT = new THREE.Euler(0.015, 0.035, 0.015);
const ADS_ROT = new THREE.Euler(0, 0, 0);

// Recoil — snappier COD kick with ADS reduction applied at fire time
const RECOIL_KICK_PITCH = 0.042;
const RECOIL_KICK_YAW = 0.01;
const RECOIL_WEAPON_KICK = 0.065;
const RECOIL_SPRING = 30;
const RECOIL_DAMP = 0.78;
const ADS_RECOIL_MULT = 0.48;
const HIP_RECOIL_MULT = 1.0;

const SWAY_SENS = 0.00032;
const SWAY_RETURN = 9;
const BREATH_AMP = 0.003;
const BREATH_FREQ = 1.1;

export type WeaponController = {
  group: THREE.Group;
  update: (
    dt: number,
    opts: {
      ads: boolean;
      moving: boolean;
      sprinting: boolean;
      mouseDx: number;
      mouseDy: number;
      time: number;
      /** Horizontal speed normalized around walk speed. */
      moveSpeed?: number;
      /** Signed local strafe input/velocity, -1..1. */
      strafe?: number;
    },
  ) => void;
  tryFire: () => boolean;
  /** True when trigger pulled but mag empty (for empty click SFX). */
  isDry: () => boolean;
  reload: () => boolean;
  setAds: (ads: boolean) => void;
  getAmmo: () => number;
  getReserve: () => number;
  isReloading: () => boolean;
  /** Camera pitch kick remaining this frame (consume via getRecoilPitch). */
  getRecoilPitch: () => number;
  getRecoilYaw: () => number;
  /** World-space muzzle position for cosmetic effects. */
  getMuzzleWorldPosition: (out: THREE.Vector3) => THREE.Vector3;
  dispose: () => void;
};

type Shell = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  active: boolean;
};

/**
 * COD-style night viewmodel materials:
 * tactical dark base + specular metalness + cool fill emissive so the gun
 * doesn't crush to matte black under ACES night exposure.
 */
function gunMetal(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x2a2e32,
    metalness: 0.96,
    roughness: 0.22,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    // Cool rim fill — reads edges against night sky without glowing like a lamp
    emissive: 0x1a2838,
    emissiveIntensity: 0.28,
    envMapIntensity: 1.15,
    reflectivity: 0.9,
  });
}

function darkSteel(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x3a4048,
    metalness: 0.98,
    roughness: 0.16,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    emissive: 0x142030,
    emissiveIntensity: 0.22,
    envMapIntensity: 1.25,
  });
}

function polymer(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x282420,
    metalness: 0.12,
    roughness: 0.62,
    // Soft warm fill so grips/stock separate from metal under sodium
    emissive: 0x100c08,
    emissiveIntensity: 0.16,
    clearcoat: 0.08,
    clearcoatRoughness: 0.7,
  });
}

function accentPolymer(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x383028,
    metalness: 0.1,
    roughness: 0.68,
    emissive: 0x120e08,
    emissiveIntensity: 0.14,
  });
}

function opticGlass(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a4858,
    metalness: 0.7,
    roughness: 0.12,
    emissive: 0x184060,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.78,
    envMapIntensity: 1.2,
  });
}

function buildM4Viewmodel(): {
  root: THREE.Group;
  magazine: THREE.Group;
  muzzlePoint: THREE.Object3D;
  flashLight: THREE.PointLight;
  flashMesh: THREE.Mesh;
  materials: THREE.Material[];
} {
  const materials: THREE.Material[] = [];
  const matGun = gunMetal();
  const matSteel = darkSteel();
  const matPoly = polymer();
  const matAccent = accentPolymer();
  const matGlass = opticGlass();
  materials.push(matGun, matSteel, matPoly, matAccent, matGlass);

  const root = new THREE.Group();
  root.name = "m4_viewmodel";

  // Lower receiver
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.085, 0.4), matGun);
  body.position.set(0, 0, 0.02);
  root.add(body);

  // Upper receiver
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.052, 0.36), matSteel);
  upper.position.set(0, 0.062, 0.0);
  root.add(upper);

  // Handguard / rail (slightly tapered feel via dual boxes)
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.048, 0.26), matGun);
  rail.position.set(0, 0.052, -0.26);
  root.add(rail);
  const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.22), matPoly);
  railBottom.position.set(0, 0.02, -0.26);
  root.add(railBottom);

  // Top picatinny rail ridges
  for (let i = 0; i < 8; i++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.01, 0.016), matSteel);
    ridge.position.set(0, 0.084, -0.14 - i * 0.032);
    root.add(ridge);
  }

  // Side rail details
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.02), matSteel);
    side.position.set(0.032, 0.05, -0.18 - i * 0.04);
    root.add(side);
    const sideL = side.clone();
    sideL.position.x = -0.032;
    root.add(sideL);
  }

  // Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.36, 10), matSteel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.048, -0.5);
  root.add(barrel);

  // Gas tube
  const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), matSteel);
  gasTube.rotation.x = Math.PI / 2;
  gasTube.position.set(0, 0.078, -0.32);
  root.add(gasTube);

  // Gas block
  const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.038), matGun);
  gasBlock.position.set(0, 0.068, -0.4);
  root.add(gasBlock);

  // Muzzle device (flash hider)
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.05, 8), matSteel);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.048, -0.7);
  root.add(muzzle);
  // Hider slots suggestion
  const hiderRing = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8), matGun);
  hiderRing.rotation.x = Math.PI / 2;
  hiderRing.position.set(0, 0.048, -0.675);
  root.add(hiderRing);

  // Compact red-dot optic (more modern COD than irons alone)
  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.055), matSteel);
  opticBase.position.set(0, 0.095, 0.02);
  root.add(opticBase);
  const opticBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.032, 0.05), matGun);
  opticBody.position.set(0, 0.118, 0.02);
  root.add(opticBody);
  const opticLens = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 12), matGlass);
  opticLens.rotation.x = Math.PI / 2;
  opticLens.position.set(0, 0.12, -0.008);
  root.add(opticLens);
  // Red-dot reticle glow (subtle — sells optic under night grade)
  const reticleMat = new THREE.MeshBasicMaterial({
    color: 0xff4422,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  materials.push(reticleMat);
  const reticle = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 6), reticleMat);
  reticle.position.set(0, 0.12, -0.004);
  root.add(reticle);
  // Front sight post (backup)
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.032, 0.01), matSteel);
  frontSight.position.set(0, 0.09, -0.56);
  root.add(frontSight);

  // Stock (collapsible look)
  const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), matSteel);
  stockTube.rotation.x = Math.PI / 2;
  stockTube.position.set(0, 0.02, 0.22);
  root.add(stockTube);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.065, 0.18), matPoly);
  stock.position.set(0, 0.008, 0.34);
  root.add(stock);
  const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.022), matAccent);
  stockPad.position.set(0, -0.005, 0.44);
  root.add(stockPad);
  // Stock cheek riser
  const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.1), matAccent);
  cheek.position.set(0, 0.04, 0.32);
  root.add(cheek);

  // Pistol grip (angled)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.115, 0.05), matPoly);
  grip.position.set(0, -0.095, 0.075);
  grip.rotation.x = 0.28;
  root.add(grip);
  // Grip texture ridges
  for (let i = 0; i < 3; i++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.008, 0.04), matAccent);
    ridge.position.set(0, -0.06 - i * 0.028, 0.07 + i * 0.008);
    ridge.rotation.x = 0.28;
    root.add(ridge);
  }

  // Trigger guard + trigger
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.055), matGun);
  triggerGuard.position.set(0, -0.042, 0.018);
  root.add(triggerGuard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.022, 0.012), matSteel);
  trigger.position.set(0, -0.038, 0.01);
  root.add(trigger);

  // Magazine (group so we can animate drop/insert)
  const magazine = new THREE.Group();
  magazine.name = "magazine";
  const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.135, 0.052), matAccent);
  magBody.position.set(0, -0.115, -0.02);
  magBody.rotation.x = 0.1;
  magazine.add(magBody);
  const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 0.055), matPoly);
  magBase.position.set(0, -0.188, -0.012);
  magazine.add(magBase);
  // Mag window stripe
  const magStripe = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.08, 0.054), matSteel);
  magStripe.position.set(0.016, -0.11, -0.018);
  magStripe.rotation.x = 0.1;
  magazine.add(magStripe);
  root.add(magazine);

  // Forward assist / bolt catch nubs
  const assist = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.018, 0.02), matSteel);
  assist.position.set(0.034, 0.03, 0.06);
  root.add(assist);

  // Muzzle attachment point
  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.048, -0.74);
  root.add(muzzlePoint);

  // Muzzle flash light + mesh
  const flashLight = new THREE.PointLight(0xffaa55, 0, 6, 2);
  flashLight.position.copy(muzzlePoint.position);
  root.add(flashLight);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  materials.push(flashMat);
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), flashMat);
  flashMesh.position.copy(muzzlePoint.position);
  flashMesh.visible = false;
  root.add(flashMesh);

  // Secondary flash cone
  const flashCone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), flashMat);
  flashCone.rotation.x = -Math.PI / 2;
  flashCone.position.set(0, 0.048, -0.8);
  flashCone.visible = false;
  root.add(flashCone);
  (flashMesh as THREE.Mesh & { userData: { cone?: THREE.Mesh } }).userData.cone = flashCone;

  // Specular catch strip along top rail (reads metal under moon/sodium)
  const railCatch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.42), matSteel);
  railCatch.position.set(0.012, 0.09, -0.12);
  root.add(railCatch);

  // FPS framing scale — slightly smaller so it doesn't dominate FOV
  root.scale.setScalar(0.95);

  return { root, magazine, muzzlePoint, flashLight, flashMesh, materials };
}

export function createWeapon(camera: THREE.PerspectiveCamera): WeaponController {
  // Local fill so dark gun metal reads under night ops (COD viewmodel trick)
  const viewFill = new THREE.PointLight(0xd0dce8, 1.15, 1.6, 2);
  viewFill.position.set(0.15, 0.12, -0.12);
  camera.add(viewFill);
  const viewRim = new THREE.PointLight(0xffb070, 0.45, 1.3, 2);
  viewRim.position.set(-0.22, -0.02, -0.28);
  camera.add(viewRim);
  const built = buildM4Viewmodel();
  const group = built.root;
  group.position.copy(HIP_POS);
  group.rotation.copy(HIP_ROT);
  camera.add(group);

  let ammo = MAG_SIZE;
  let reserve = MAX_RESERVE;
  let reloading = false;
  let reloadT = 0;
  let fireCooldown = 0;
  let ads = false;

  const basePos = HIP_POS.clone();
  const baseRot = new THREE.Euler(HIP_ROT.x, HIP_ROT.y, HIP_ROT.z);

  let weaponKick = 0;
  let weaponKickVel = 0;
  let camPitchKick = 0;
  let camYawKick = 0;
  let camPitchVel = 0;
  let camYawVel = 0;

  // Permanent climb that recovers (COD-like)
  let climbPitch = 0;
  let climbYaw = 0;

  let swayX = 0;
  let swayY = 0;
  let flashTimer = 0;
  let sprintBlend = 0;
  let shotIndex = 0;
  let timeSinceFire = 1;

  const magRestY = 0;
  const magRestRotX = 0;

  const shellGeo = new THREE.BoxGeometry(0.01, 0.01, 0.024);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xc4a35a,
    metalness: 0.85,
    roughness: 0.35,
  });
  const shells: Shell[] = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.visible = false;
    camera.add(mesh);
    shells.push({
      mesh,
      vel: new THREE.Vector3(),
      life: 0,
      active: false,
    });
  }

  const flashCone = (built.flashMesh.userData as { cone?: THREE.Mesh }).cone;

  function ejectShell(): void {
    let shell = shells.find((s) => !s.active);
    if (!shell) shell = shells[0]!;
    shell.mesh.position.set(0.08 + group.position.x * 0.3, -0.1 + group.position.y * 0.2, -0.32);
    shell.mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    shell.vel.set(
      1.4 + Math.random() * 0.9,
      0.7 + Math.random() * 0.55,
      0.15 + Math.random() * 0.35,
    );
    shell.life = 0.85;
    shell.active = true;
    shell.mesh.visible = true;
  }

  function tryFire(): boolean {
    if (reloading || fireCooldown > 0 || ammo <= 0) return false;
    ammo -= 1;
    fireCooldown = FIRE_INTERVAL;
    if (timeSinceFire > FIRE_INTERVAL * 2.15) shotIndex = 0;
    timeSinceFire = 0;
    shotIndex += 1;

    const rMult = ads ? ADS_RECOIL_MULT : HIP_RECOIL_MULT;
    const sustained = Math.min(1.24, 1 + shotIndex * 0.018);
    const pitchKick = RECOIL_KICK_PITCH * rMult * sustained * (0.93 + Math.random() * 0.14);
    // A soft repeatable S-curve gives learnable recoil, with just enough noise
    // to keep long bursts from feeling mechanical.
    const yawPattern = Math.sin(shotIndex * 1.72) * 0.68;
    const yawKick = (yawPattern + (Math.random() - 0.5) * 0.65) * RECOIL_KICK_YAW * rMult;

    weaponKick += RECOIL_WEAPON_KICK * rMult * 0.5;
    weaponKickVel += RECOIL_WEAPON_KICK * rMult * 5.5;
    camPitchKick += pitchKick * 0.28;
    camYawKick += yawKick * 0.22;
    camPitchVel += pitchKick * 4.8;
    camYawVel += yawKick * 4;

    // Sticky climb (partially recovered in update)
    climbPitch += pitchKick * 0.35;
    climbYaw += yawKick * 0.4;
    climbPitch = Math.min(climbPitch, ads ? 0.04 : 0.07);
    climbYaw = THREE.MathUtils.clamp(climbYaw, -0.03, 0.03);

    // Muzzle flash
    flashTimer = 0.04;
    built.flashLight.intensity = 6 + Math.random() * 2.5;
    built.flashMesh.visible = true;
    (built.flashMesh.material as THREE.MeshBasicMaterial).opacity = 1;
    built.flashMesh.scale.setScalar(0.9 + Math.random() * 0.7);
    if (flashCone) {
      flashCone.visible = true;
      flashCone.scale.setScalar(0.8 + Math.random() * 0.5);
    }

    ejectShell();
    return true;
  }

  function isDry(): boolean {
    return ammo <= 0 && !reloading;
  }

  function reload(): boolean {
    if (reloading || ammo >= MAG_SIZE || reserve <= 0) return false;
    reloading = true;
    reloadT = 0;
    return true;
  }

  function finishReload(): void {
    const need = MAG_SIZE - ammo;
    const take = Math.min(need, reserve);
    ammo += take;
    reserve -= take;
    reloading = false;
    reloadT = 0;
    built.magazine.position.y = magRestY;
    built.magazine.rotation.x = magRestRotX;
  }

  function update(
    dt: number,
    opts: {
      ads: boolean;
      moving: boolean;
      sprinting: boolean;
      mouseDx: number;
      mouseDy: number;
      time: number;
      moveSpeed?: number;
      strafe?: number;
    },
  ): void {
    ads = opts.ads;
    fireCooldown = Math.max(0, fireCooldown - dt);
    timeSinceFire += dt;

    const targetPos = ads ? ADS_POS : HIP_POS;
    const targetRot = ads ? ADS_ROT : HIP_ROT;
    // Snappier ADS — COD-like optic snap
    const adsSpeed = ads ? 16 : 12;
    const t = 1 - Math.exp(-adsSpeed * dt);
    basePos.lerp(targetPos, t);
    baseRot.x = THREE.MathUtils.lerp(baseRot.x, targetRot.x, t);
    baseRot.y = THREE.MathUtils.lerp(baseRot.y, targetRot.y, t);
    baseRot.z = THREE.MathUtils.lerp(baseRot.z, targetRot.z, t);

    const swayMul = ads ? 0.28 : 1;
    swayX += opts.mouseDx * SWAY_SENS * swayMul;
    swayY += opts.mouseDy * SWAY_SENS * swayMul;
    swayX = THREE.MathUtils.clamp(swayX, -0.035, 0.035);
    swayY = THREE.MathUtils.clamp(swayY, -0.028, 0.028);
    const swayRet = 1 - Math.exp(-SWAY_RETURN * dt);
    swayX = THREE.MathUtils.lerp(swayX, 0, swayRet);
    swayY = THREE.MathUtils.lerp(swayY, 0, swayRet);

    const breath =
      Math.sin(opts.time * BREATH_FREQ * Math.PI * 2) * BREATH_AMP +
      Math.sin(opts.time * BREATH_FREQ * 1.7 * Math.PI * 2) * BREATH_AMP * 0.4;
    const breathX = Math.cos(opts.time * BREATH_FREQ * 0.9 * Math.PI * 2) * BREATH_AMP * 0.6;

    sprintBlend = THREE.MathUtils.damp(sprintBlend, opts.sprinting && !ads ? 1 : 0, 12, dt);
    const moveBlend = THREE.MathUtils.clamp(opts.moveSpeed ?? (opts.moving ? 1 : 0), 0, 1.55);
    const gaitPhase = opts.time * Math.PI * 2 * (1.55 + moveBlend * 0.5);
    const gait = opts.moving ? Math.sin(gaitPhase) * 0.007 * moveBlend : 0;
    const gaitLift = opts.moving ? Math.abs(Math.cos(gaitPhase)) * 0.006 * moveBlend : 0;
    const strafe = THREE.MathUtils.clamp(opts.strafe ?? 0, -1, 1);

    const sprintDip = sprintBlend * 0.072;
    const sprintPull = sprintBlend * 0.085;
    const moveDip = opts.moving && !ads ? 0.005 : 0;

    // Recoil springs
    weaponKickVel += -weaponKick * RECOIL_SPRING * dt;
    weaponKickVel *= Math.pow(RECOIL_DAMP, dt * 60);
    weaponKick += weaponKickVel;

    camPitchVel += -camPitchKick * RECOIL_SPRING * dt;
    camPitchVel *= Math.pow(RECOIL_DAMP, dt * 60);
    camPitchKick += camPitchVel;

    camYawVel += -camYawKick * RECOIL_SPRING * dt;
    camYawVel *= Math.pow(RECOIL_DAMP, dt * 60);
    camYawKick += camYawVel;

    // Climb recovery (pull back while not firing)
    const climbRet = 1 - Math.exp(-3.2 * dt);
    climbPitch = THREE.MathUtils.lerp(climbPitch, 0, climbRet);
    climbYaw = THREE.MathUtils.lerp(climbYaw, 0, climbRet);

    // Reload animation
    let reloadDip = 0;
    let reloadRoll = 0;
    let reloadYaw = 0;
    if (reloading) {
      reloadT += dt;
      const p = reloadT / RELOAD_DURATION;
      if (p < 0.32) {
        const u = p / 0.32;
        built.magazine.position.y = magRestY - u * 0.3;
        built.magazine.rotation.x = magRestRotX + u * 0.7;
        built.magazine.visible = u < 0.92;
      } else if (p < 0.5) {
        built.magazine.visible = false;
        built.magazine.position.y = magRestY - 0.3;
      } else if (p < 0.88) {
        const u = (p - 0.5) / 0.38;
        built.magazine.visible = true;
        built.magazine.position.y = magRestY - 0.3 * (1 - u);
        built.magazine.rotation.x = magRestRotX + 0.7 * (1 - u);
      } else {
        built.magazine.visible = true;
        built.magazine.position.y = magRestY;
        built.magazine.rotation.x = magRestRotX;
      }
      // Weapon tilt during reload (charge-handle style dip)
      reloadRoll = Math.sin(p * Math.PI) * 0.12;
      reloadDip = Math.sin(p * Math.PI) * 0.045;
      reloadYaw = Math.sin(p * Math.PI) * 0.08;

      if (reloadT >= RELOAD_DURATION) {
        finishReload();
      }
    }

    group.position.set(
      basePos.x + swayX + breathX - sprintPull * 0.3 + gait,
      basePos.y - swayY + breath - sprintDip - moveDip - gaitLift + weaponKick * 0.18 - reloadDip,
      basePos.z + weaponKick * 0.42 + sprintPull,
    );
    group.rotation.set(
      baseRot.x + weaponKick * 1.05 + swayY * 0.5 - sprintBlend * 0.16,
      baseRot.y + swayX * 0.8 + reloadYaw + sprintBlend * 0.18,
      baseRot.z + swayX * 0.4 - weaponKick * 0.2 + reloadRoll - sprintBlend * 0.22 - strafe * 0.008,
    );

    // Flash decay
    if (flashTimer > 0) {
      flashTimer -= dt;
      const f = Math.max(0, flashTimer / 0.04);
      built.flashLight.intensity = 7 * f;
      (built.flashMesh.material as THREE.MeshBasicMaterial).opacity = f;
      if (flashTimer <= 0) {
        built.flashLight.intensity = 0;
        built.flashMesh.visible = false;
        if (flashCone) flashCone.visible = false;
      }
    }

    for (const s of shells) {
      if (!s.active) continue;
      s.life -= dt;
      s.vel.y -= 6 * dt;
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      s.mesh.rotation.x += 8 * dt;
      s.mesh.rotation.z += 12 * dt;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }

  function dispose(): void {
    camera.remove(group);
    camera.remove(viewFill);
    camera.remove(viewRim);
    for (const s of shells) {
      camera.remove(s.mesh);
    }
    shellGeo.dispose();
    shellMat.dispose();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
      }
    });
    for (const m of built.materials) m.dispose();
  }

  return {
    group,
    update,
    tryFire,
    isDry,
    reload,
    setAds: (v: boolean) => {
      ads = v;
    },
    getAmmo: () => ammo,
    getReserve: () => reserve,
    isReloading: () => reloading,
    getRecoilPitch: () => camPitchKick + climbPitch,
    getRecoilYaw: () => camYawKick + climbYaw,
    getMuzzleWorldPosition: (out: THREE.Vector3) => built.muzzlePoint.getWorldPosition(out),
    dispose,
  };
}
