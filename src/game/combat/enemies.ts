import * as THREE from "three";
import type { Collider, Enemy } from "@/game/types";
import { raycastColliders } from "@/game/player/physics";

const SEEK_RANGE = 48;
const MELEE_RANGE = 1.8;
const MELEE_DAMAGE = 18;
const MELEE_COOLDOWN = 0.95;
const FIRE_MIN_RANGE = 4;
const FIRE_MAX_RANGE = 34;
const FIRE_DAMAGE = 8;
const FIRE_COOLDOWN = 1.05;
const DEFAULT_HP = 85;
const DEFAULT_SPEED = 3.55;
const SPAWN_COUNT = 10;
const DEATH_SINK_DURATION = 0.75;
const RESPAWN_DELAY = 2.1;
const PLAYER_SPAWN_CLEAR = 12;
const MAP_HALF = 55;

const _toPlayer = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _knock = new THREE.Vector3();
const _look = new THREE.Vector3();
const _flashWhite = new THREE.Color(0xffffff);
const _fromPos = new THREE.Vector3();
const _shotEnd = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _candidate = new THREE.Vector3();
const _separation = new THREE.Vector3();

export type EnemySystemOpts = {
  /** amount, attacker world position for damage direction */
  onPlayerDamage: (amount: number, fromWorld: THREE.Vector3) => void;
  count?: number;
  /** Avoid spawning near this point (player spawn). Defaults to origin. */
  playerSpawn?: THREE.Vector3;
  /** World solids used for spawn safety, movement, and line-of-sight. */
  colliders?: Collider[];
  /** Cosmetic enemy tracer callback. `hit` means the shot damaged the player. */
  onEnemyShot?: (
    origin: THREE.Vector3,
    end: THREE.Vector3,
    hit: boolean,
    impactNormal?: THREE.Vector3,
  ) => void;
};

export type EnemySystem = {
  update: (dt: number, playerPos: THREE.Vector3) => void;
  /** Body meshes suitable for raycast hit-testing (alive only). */
  raycastTargets: () => THREE.Object3D[];
  /** Resolve an intersected object to its owning enemy. */
  getEnemyFromObject: (obj: THREE.Object3D) => Enemy | null;
  /** Apply damage; returns true if the enemy was killed by this hit. */
  applyDamage: (
    enemy: Enemy,
    amount: number,
    hitDir?: THREE.Vector3,
    isHeadshot?: boolean,
  ) => { killed: boolean; headshot: boolean };
  getEnemies: () => readonly Enemy[];
  dispose: () => void;
};

type EnemyRuntime = Enemy & {
  deathTimer: number;
  respawnTimer: number;
  collapsing: boolean;
  strafePhase: number;
  behavior: number; // 0 rush, 1 circle, 2 pause-burst
  baseY: number;
  bodyParts: THREE.Mesh[];
  headMesh: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  savedColors: THREE.Color[];
  savedEmissive: THREE.Color[];
  savedEmissiveIntensity: number[];
  teamHue: number;
  knockVelocity: THREE.Vector3;
  staggerTimer: number;
  moveBlend: number;
};

let nextEnemyId = 1;
let sharedGeo: {
  torso: THREE.BoxGeometry;
  head: THREE.BoxGeometry;
  limb: THREE.BoxGeometry;
  leg: THREE.BoxGeometry;
  visor: THREE.BoxGeometry;
  shoulder: THREE.BoxGeometry;
  plate: THREE.BoxGeometry;
  pouch: THREE.BoxGeometry;
  boot: THREE.BoxGeometry;
  weapon: THREE.BoxGeometry;
  barrel: THREE.CylinderGeometry;
} | null = null;

function getSharedGeo() {
  if (!sharedGeo) {
    sharedGeo = {
      torso: new THREE.BoxGeometry(0.5, 0.68, 0.28),
      head: new THREE.BoxGeometry(0.3, 0.3, 0.32),
      limb: new THREE.BoxGeometry(0.14, 0.52, 0.14),
      leg: new THREE.BoxGeometry(0.16, 0.58, 0.18),
      visor: new THREE.BoxGeometry(0.28, 0.055, 0.05),
      shoulder: new THREE.BoxGeometry(0.58, 0.12, 0.26),
      plate: new THREE.BoxGeometry(0.42, 0.4, 0.08),
      pouch: new THREE.BoxGeometry(0.1, 0.1, 0.08),
      boot: new THREE.BoxGeometry(0.18, 0.1, 0.28),
      weapon: new THREE.BoxGeometry(0.06, 0.08, 0.42),
      barrel: new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6),
    };
  }
  return sharedGeo;
}

function mat(
  color: number,
  opts: {
    roughness?: number;
    metalness?: number;
    emissive?: number;
    emissiveIntensity?: number;
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.22,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/**
 * Hostile operator silhouette:
 * - Dark plate carrier + red team accent stripes
 * - Glowing visor for night readability
 * - Shoulder pads, pouches, boots, held rifle
 */
function buildOperatorMesh(variant: number): {
  group: THREE.Group;
  bodyParts: THREE.Mesh[];
  headMesh: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  teamHue: number;
} {
  const geo = getSharedGeo();
  const group = new THREE.Group();
  group.name = "enemy_operator";

  // Team color: hostile red/orange family with slight variant — punchy for range ID
  const accentHex = variant % 3 === 0 ? 0xff2e1a : variant % 3 === 1 ? 0xff4818 : 0xe02420;
  const gearDark = mat(0x1a1e26, {
    roughness: 0.78,
    metalness: 0.28,
    emissive: 0x080a10,
    emissiveIntensity: 0.12,
  });
  const gearMid = mat(0x2a323c, {
    roughness: 0.62,
    metalness: 0.35,
    emissive: 0x0a0e14,
    emissiveIntensity: 0.1,
  });
  // Team accents stay lit at range (COD enemy ID without HUD markers)
  const gearAccent = mat(accentHex, {
    roughness: 0.4,
    metalness: 0.45,
    emissive: accentHex,
    emissiveIntensity: 1.15,
  });
  const helmet = mat(0x161a20, {
    roughness: 0.42,
    metalness: 0.62,
    emissive: 0x0a1018,
    emissiveIntensity: 0.1,
  });
  // Visor — primary silhouette cue; sits well above bloom threshold
  const visorMat = mat(accentHex, {
    roughness: 0.12,
    metalness: 0.95,
    emissive: accentHex,
    emissiveIntensity: 2.8,
  });
  const cloth = mat(0x242820, {
    roughness: 0.85,
    metalness: 0.08,
    emissive: 0x080a06,
    emissiveIntensity: 0.08,
  });
  const bootMat = mat(0x121416, { roughness: 0.8, metalness: 0.2 });

  const materials = [gearDark, gearMid, gearAccent, helmet, visorMat, cloth, bootMat];
  const bodyParts: THREE.Mesh[] = [];

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rotX, rotY, rotZ);
    const majorSilhouette =
      geometry === geo.torso ||
      geometry === geo.head ||
      geometry === geo.limb ||
      geometry === geo.leg ||
      geometry === geo.shoulder ||
      geometry === geo.weapon;
    mesh.castShadow = majorSilhouette;
    mesh.receiveShadow = majorSilhouette;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    // Keep hit registration generous on the actual silhouette without
    // ray-testing every pouch, rail, and decorative nub on every shot.
    if (
      majorSilhouette ||
      geometry === geo.visor ||
      geometry === geo.barrel ||
      geometry === geo.boot
    ) {
      bodyParts.push(mesh);
    }
    return mesh;
  };

  // Boots
  add(geo.boot, bootMat, -0.13, 0.05, 0.04);
  add(geo.boot, bootMat, 0.13, 0.05, 0.04);
  // Legs
  add(geo.leg, cloth, -0.13, 0.38, 0);
  add(geo.leg, cloth, 0.13, 0.38, 0);
  // Knee pads
  add(geo.pouch, gearDark, -0.13, 0.42, 0.1, 1.1, 0.7, 0.6);
  add(geo.pouch, gearDark, 0.13, 0.42, 0.1, 1.1, 0.7, 0.6);
  // Hip / belt
  add(geo.shoulder, gearDark, 0, 0.72, 0, 0.9, 0.65, 0.95);
  // Mag pouches on belt
  add(geo.pouch, gearAccent, -0.18, 0.78, 0.14, 0.9, 0.9, 1);
  add(geo.pouch, gearAccent, 0, 0.78, 0.14, 0.9, 0.9, 1);
  add(geo.pouch, gearAccent, 0.18, 0.78, 0.14, 0.9, 0.9, 1);
  // Torso
  add(geo.torso, gearMid, 0, 1.14, 0);
  // Plate carrier front (raised)
  add(geo.plate, gearDark, 0, 1.18, 0.14, 1, 1, 1);
  // Team stripe on plate
  add(geo.pouch, gearAccent, 0, 1.22, 0.19, 2.2, 0.35, 0.4);
  // Shoulder pads
  add(geo.shoulder, gearDark, 0, 1.46, 0, 1.05, 0.9, 1);
  // Team armband L
  add(geo.pouch, gearAccent, -0.42, 1.2, 0, 0.5, 0.55, 1.1);
  // Arms
  add(geo.limb, gearDark, -0.38, 1.12, 0, 1, 1, 1);
  add(geo.limb, gearDark, 0.38, 1.12, 0.05, 1, 1, 1, -0.35, 0, 0);
  // Held rifle (right side, forward)
  const rifle = add(geo.weapon, gearDark, 0.28, 1.05, 0.22, 1, 1, 1, 0.1, 0.15, 0);
  rifle.userData.isWeapon = true;
  const barrel = add(geo.barrel, gearMid, 0.28, 1.08, 0.48, 1, 1, 1, Math.PI / 2, 0, 0);
  barrel.userData.isWeapon = true;
  // Head / helmet
  const headMesh = add(geo.head, helmet, 0, 1.72, 0.02);
  headMesh.userData.isHead = true;
  // Helmet ridge
  add(geo.pouch, gearDark, 0, 1.88, 0, 2.2, 0.35, 1.6);
  // Soft emissive visor strip (hostile team color) — primary long-range ID
  const visor = add(geo.visor, visorMat, 0, 1.74, 0.16);
  visor.userData.isHead = true;
  visor.userData.isVisor = true;
  // Secondary visor glow slab slightly larger (reads at distance)
  const visorGlow = add(geo.visor, visorMat, 0, 1.74, 0.18, 1.15, 1.35, 0.6);
  visorGlow.userData.isHead = true;
  visorGlow.userData.isVisor = true;
  // Headset mic boom
  add(geo.pouch, gearMid, 0.16, 1.7, 0.05, 0.4, 0.35, 1.2);

  // Aggressive forward lean
  group.rotation.x = 0.04;

  return { group, bodyParts, headMesh, materials, teamHue: accentHex };
}

function canEnemyOccupy(position: THREE.Vector3, colliders: Collider[]): boolean {
  const radius = 0.42;
  for (const c of colliders) {
    // Ignore ground/floor volumes the operator is intended to stand on.
    if (c.max.y <= 0.12 || c.min.y >= 1.9) continue;
    if (
      position.x + radius > c.min.x &&
      position.x - radius < c.max.x &&
      position.z + radius > c.min.z &&
      position.z - radius < c.max.z
    ) {
      return false;
    }
  }
  return true;
}

function randomSpawnPosition(
  playerSpawn: THREE.Vector3,
  out: THREE.Vector3,
  colliders: Collider[],
): THREE.Vector3 {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() - 0.5) * 2 * MAP_HALF;
    const z = (Math.random() - 0.5) * 2 * MAP_HALF;
    const dx = x - playerSpawn.x;
    const dz = z - playerSpawn.z;
    if (dx * dx + dz * dz >= PLAYER_SPAWN_CLEAR * PLAYER_SPAWN_CLEAR) {
      out.set(x, 0, z);
      if (canEnemyOccupy(out, colliders)) return out;
    }
  }
  return out.set(MAP_HALF * 0.7, 0, MAP_HALF * 0.7);
}

function createEnemyRuntime(
  scene: THREE.Scene,
  playerSpawn: THREE.Vector3,
  colliders: Collider[],
): EnemyRuntime {
  const variant = nextEnemyId;
  const { group, bodyParts, headMesh, materials, teamHue } = buildOperatorMesh(variant);
  const pos = randomSpawnPosition(playerSpawn, new THREE.Vector3(), colliders);
  group.position.copy(pos);

  const savedColors = materials.map((m) => m.color.clone());
  const savedEmissive = materials.map((m) => m.emissive.clone());
  const savedEmissiveIntensity = materials.map((m) => m.emissiveIntensity);

  const enemy: EnemyRuntime = {
    mesh: group,
    hp: DEFAULT_HP,
    maxHp: DEFAULT_HP,
    speed: DEFAULT_SPEED * (0.88 + Math.random() * 0.3),
    alive: true,
    hitFlash: 0,
    attackCooldown: Math.random() * 0.5,
    id: nextEnemyId++,
    deathTimer: 0,
    respawnTimer: 0,
    collapsing: false,
    strafePhase: Math.random() * Math.PI * 2,
    behavior: Math.floor(Math.random() * 3),
    baseY: 0,
    bodyParts,
    headMesh,
    materials,
    savedColors,
    savedEmissive,
    savedEmissiveIntensity,
    teamHue,
    knockVelocity: new THREE.Vector3(),
    staggerTimer: 0,
    moveBlend: 0,
  };

  group.userData.enemyId = enemy.id;
  for (const part of bodyParts) {
    part.userData.enemyId = enemy.id;
  }

  scene.add(group);
  return enemy;
}

function restoreMaterials(e: EnemyRuntime): void {
  for (let i = 0; i < e.materials.length; i++) {
    e.materials[i].color.copy(e.savedColors[i]);
    e.materials[i].emissive.copy(e.savedEmissive[i]);
    e.materials[i].emissiveIntensity = e.savedEmissiveIntensity[i];
  }
}

function applyHitFlashVisual(e: EnemyRuntime, t: number): void {
  const flash = Math.max(0, Math.min(1, t));
  for (let i = 0; i < e.materials.length; i++) {
    const m = e.materials[i];
    m.color.copy(e.savedColors[i]).lerp(_flashWhite, flash * 0.9);
    m.emissive.copy(e.savedEmissive[i]).lerp(_flashWhite, flash);
    m.emissiveIntensity = THREE.MathUtils.lerp(e.savedEmissiveIntensity[i], 2.2, flash);
  }
}

function respawnEnemy(e: EnemyRuntime, playerSpawn: THREE.Vector3, colliders: Collider[]): void {
  e.alive = true;
  e.collapsing = false;
  e.hp = e.maxHp;
  e.hitFlash = 0;
  e.deathTimer = 0;
  e.respawnTimer = 0;
  e.attackCooldown = 0.35;
  e.staggerTimer = 0;
  e.moveBlend = 0;
  e.knockVelocity.set(0, 0, 0);
  e.strafePhase = Math.random() * Math.PI * 2;
  e.behavior = Math.floor(Math.random() * 3);
  e.mesh.rotation.set(0.04, Math.random() * Math.PI * 2, 0);
  e.mesh.scale.set(1, 1, 1);
  e.mesh.visible = true;
  randomSpawnPosition(playerSpawn, e.mesh.position, colliders);
  e.mesh.position.y = e.baseY;
  restoreMaterials(e);
}

/**
 * Enemy operator system: tactical silhouettes, seek/strafe/attack AI,
 * hit flash + knockback, collapse death, delayed respawn.
 */
export function createEnemySystem(scene: THREE.Scene, opts: EnemySystemOpts): EnemySystem {
  const count = opts.count ?? SPAWN_COUNT;
  const playerSpawn = (opts.playerSpawn ?? new THREE.Vector3(0, 0, 0)).clone();
  const colliders = opts.colliders ?? [];
  const enemies: EnemyRuntime[] = [];
  const byId = new Map<number, EnemyRuntime>();

  for (let i = 0; i < count; i++) {
    const e = createEnemyRuntime(scene, playerSpawn, colliders);
    enemies.push(e);
    byId.set(e.id, e);
  }

  const raycastList: THREE.Object3D[] = [];
  let combatTime = 0;

  const update = (dt: number, playerPos: THREE.Vector3): void => {
    const safeDt = Math.min(dt, 0.05);
    combatTime += safeDt;

    for (const e of enemies) {
      if (!e.alive) {
        if (e.collapsing) {
          e.deathTimer += safeDt;
          const t = Math.min(1, e.deathTimer / DEATH_SINK_DURATION);
          e.mesh.rotation.x = THREE.MathUtils.lerp(0.04, Math.PI / 2.1, t);
          e.mesh.rotation.z = THREE.MathUtils.lerp(0, 0.4, t);
          e.mesh.position.y = e.baseY - t * 0.9;
          e.mesh.scale.y = 1 - t * 0.18;
          if (e.deathTimer >= DEATH_SINK_DURATION) {
            e.collapsing = false;
            e.mesh.visible = false;
            e.respawnTimer = RESPAWN_DELAY;
          }
        } else if (e.respawnTimer > 0) {
          e.respawnTimer -= safeDt;
          if (e.respawnTimer <= 0) {
            respawnEnemy(e, playerSpawn, colliders);
          }
        }
        continue;
      }

      // Hit flash decay
      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - safeDt * 5);
        applyHitFlashVisual(e, e.hitFlash);
        if (e.hitFlash <= 0) restoreMaterials(e);
      }
      e.staggerTimer = Math.max(0, e.staggerTimer - safeDt);

      if (e.knockVelocity.lengthSq() > 0.0004) {
        _candidate.copy(e.mesh.position).addScaledVector(e.knockVelocity, safeDt);
        if (canEnemyOccupy(_candidate, colliders)) {
          e.mesh.position.copy(_candidate);
        }
        e.knockVelocity.multiplyScalar(Math.exp(-9 * safeDt));
      } else {
        e.knockVelocity.set(0, 0, 0);
      }

      _toPlayer.set(playerPos.x - e.mesh.position.x, 0, playerPos.z - e.mesh.position.z);
      const dist = _toPlayer.length();

      if (dist < SEEK_RANGE && dist > 0.001) {
        _toPlayer.multiplyScalar(1 / dist);

        e.strafePhase += safeDt * (1.4 + (e.id % 5) * 0.18);
        _strafe.set(-_toPlayer.z, 0, _toPlayer.x);

        // Behavior variants use different engagement distances, producing a
        // readable mix of flankers, riflemen, and close-range pressure.
        let strafeAmt = Math.sin(e.strafePhase) * 0.7;
        let preferredRange = 6;
        if (e.behavior === 1) {
          // Flanker — holds mid range and commits to wide lateral paths.
          strafeAmt = Math.sin(e.strafePhase * 1.3) * 1.15;
          preferredRange = 12;
        } else if (e.behavior === 2) {
          // Rifleman — anchors at range with short repositioning bursts.
          preferredRange = 19;
          strafeAmt *= 0.4;
        }

        const rangeDelta = dist - preferredRange;
        const approach = THREE.MathUtils.clamp(rangeDelta / 4, -0.72, 1);
        const repositionPulse =
          e.behavior === 2 ? 0.35 + Math.max(0, Math.sin(e.strafePhase * 0.7)) * 0.65 : 1;
        const staggerMult = e.staggerTimer > 0 ? 0.18 : 1;
        const moveSpeed = e.speed * safeDt * repositionPulse * staggerMult;

        _separation.set(0, 0, 0);
        for (const other of enemies) {
          if (other === e || !other.alive) continue;
          const dx = e.mesh.position.x - other.mesh.position.x;
          const dz = e.mesh.position.z - other.mesh.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > 0.001 && d2 < 1.5) {
            const strength = (1.5 - d2) / 1.5;
            _separation.x += (dx / Math.sqrt(d2)) * strength;
            _separation.z += (dz / Math.sqrt(d2)) * strength;
          }
        }

        const moveX =
          (_toPlayer.x * approach + _strafe.x * strafeAmt + _separation.x * 0.8) * moveSpeed;
        const moveZ =
          (_toPlayer.z * approach + _strafe.z * strafeAmt + _separation.z * 0.8) * moveSpeed;
        _candidate.copy(e.mesh.position);
        _candidate.x += moveX;
        if (canEnemyOccupy(_candidate, colliders)) e.mesh.position.x = _candidate.x;
        _candidate.copy(e.mesh.position);
        _candidate.z += moveZ;
        if (canEnemyOccupy(_candidate, colliders)) e.mesh.position.z = _candidate.z;
        e.mesh.position.x = THREE.MathUtils.clamp(e.mesh.position.x, -MAP_HALF, MAP_HALF);
        e.mesh.position.z = THREE.MathUtils.clamp(e.mesh.position.z, -MAP_HALF, MAP_HALF);

        const moving = Math.abs(moveX) + Math.abs(moveZ) > 0.002;
        e.moveBlend = THREE.MathUtils.damp(e.moveBlend, moving ? 1 : 0, 8, safeDt);
        // Restrained gear-weighted run cycle.
        e.mesh.position.y = e.baseY + Math.abs(Math.sin(e.strafePhase * 2.2)) * 0.045 * e.moveBlend;

        _look.set(playerPos.x, e.mesh.position.y + 1.25, playerPos.z);
        e.mesh.lookAt(_look);
        e.mesh.rotation.x = 0.04;
      }

      // Close strike or paced rifle fire. Only a rotating subset of the squad
      // may fire at once so pressure stays intense without becoming unfair.
      e.attackCooldown = Math.max(0, e.attackCooldown - safeDt);
      if (dist <= MELEE_RANGE && e.attackCooldown <= 0) {
        e.attackCooldown = MELEE_COOLDOWN + Math.random() * 0.22;
        _fromPos.copy(e.mesh.position);
        _fromPos.y += 1.2;
        opts.onPlayerDamage(MELEE_DAMAGE, _fromPos);
      } else if (
        dist >= FIRE_MIN_RANGE &&
        dist <= FIRE_MAX_RANGE &&
        e.attackCooldown <= 0 &&
        e.staggerTimer <= 0 &&
        (e.id + Math.floor(combatTime * 0.7)) % 3 === 0
      ) {
        _fromPos.copy(e.mesh.position);
        _fromPos.y += 1.18;
        _shotDir.set(playerPos.x, playerPos.y + 1.22, playerPos.z).sub(_fromPos);
        const shotDistance = _shotDir.length();
        _shotDir.normalize();
        const coverHit = colliders.length
          ? raycastColliders(_fromPos, _shotDir, colliders, shotDistance)
          : null;

        e.attackCooldown = FIRE_COOLDOWN + Math.random() * 0.55 + (e.behavior === 2 ? -0.12 : 0.12);
        if (coverHit && coverHit.t < shotDistance - 0.25) {
          opts.onEnemyShot?.(_fromPos, coverHit.point, false, coverHit.normal);
        } else {
          const accuracy = THREE.MathUtils.clamp(0.78 - shotDistance * 0.014, 0.3, 0.7);
          const hit = Math.random() < accuracy;
          _shotEnd.set(playerPos.x, playerPos.y + 1.15, playerPos.z);
          if (!hit) {
            const missRadius = 0.65 + shotDistance * 0.018;
            _shotEnd.x += (Math.random() - 0.5) * missRadius * 2;
            _shotEnd.y += (Math.random() - 0.5) * missRadius;
            _shotEnd.z += (Math.random() - 0.5) * missRadius * 2;
          }
          opts.onEnemyShot?.(_fromPos, _shotEnd, hit);
          if (hit) opts.onPlayerDamage(FIRE_DAMAGE, _fromPos);
        }
      }
    }
  };

  const raycastTargets = (): THREE.Object3D[] => {
    raycastList.length = 0;
    for (const e of enemies) {
      if (!e.alive) continue;
      for (const part of e.bodyParts) {
        raycastList.push(part);
      }
    }
    return raycastList;
  };

  const getEnemyFromObject = (obj: THREE.Object3D): Enemy | null => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const id = cur.userData?.enemyId as number | undefined;
      if (id != null) {
        const e = byId.get(id);
        return e ?? null;
      }
      cur = cur.parent;
    }
    return null;
  };

  const applyDamage = (
    enemy: Enemy,
    amount: number,
    hitDir?: THREE.Vector3,
    isHeadshot = false,
  ): { killed: boolean; headshot: boolean } => {
    const e = enemy as EnemyRuntime;
    if (!e.alive) return { killed: false, headshot: false };

    e.hp -= amount;
    e.hitFlash = 1;
    applyHitFlashVisual(e, 1);

    if (hitDir && hitDir.lengthSq() > 0) {
      _knock.copy(hitDir).setY(0);
      if (_knock.lengthSq() > 0) {
        _knock.normalize().multiplyScalar(isHeadshot ? 4.8 : 3.2);
        e.knockVelocity.add(_knock);
      }
    }
    e.staggerTimer = isHeadshot ? 0.28 : 0.16;

    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      e.collapsing = true;
      e.deathTimer = 0;
      e.hitFlash = 0;
      restoreMaterials(e);
      for (const m of e.materials) {
        m.color.multiplyScalar(0.4);
        m.emissiveIntensity *= 0.15;
      }
      return { killed: true, headshot: isHeadshot };
    }

    return { killed: false, headshot: isHeadshot };
  };

  const dispose = (): void => {
    for (const e of enemies) {
      scene.remove(e.mesh);
      for (const m of e.materials) m.dispose();
    }
    enemies.length = 0;
    byId.clear();
    if (sharedGeo) {
      sharedGeo.torso.dispose();
      sharedGeo.head.dispose();
      sharedGeo.limb.dispose();
      sharedGeo.leg.dispose();
      sharedGeo.visor.dispose();
      sharedGeo.shoulder.dispose();
      sharedGeo.plate.dispose();
      sharedGeo.pouch.dispose();
      sharedGeo.boot.dispose();
      sharedGeo.weapon.dispose();
      sharedGeo.barrel.dispose();
      sharedGeo = null;
    }
  };

  return {
    update,
    raycastTargets,
    getEnemyFromObject,
    applyDamage,
    getEnemies: () => enemies,
    dispose,
  };
}
