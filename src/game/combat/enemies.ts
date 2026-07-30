import * as THREE from "three";
import type { Collider, Enemy } from "@/game/types";
import { raycastColliders } from "@/game/player/physics";
import {
  createEnemyModel,
  poseEnemyDeath,
  poseEnemyModel,
  resetEnemyModelPose,
  setEnemyModelOwner,
  type EnemyModel,
} from "./enemyModel";
import {
  clampEnemyImpulse,
  canEnemyOccupy,
  dampEnemyYaw,
  ENEMY_BODY,
  findEnemySpawn,
  moveEnemyGrounded,
  separateEnemyBodies,
  type GroundedBody,
} from "./enemyPhysics";

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
const DEATH_SETTLE_DURATION = 0.72;
const DEATH_HOLD_DURATION = 0.78;
const RESPAWN_DELAY = 2.1;
const PLAYER_SPAWN_CLEAR = 12;
const MAX_KNOCK_SPEED = 4.4;

const _toPlayer = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _knock = new THREE.Vector3();
const _flashWhite = new THREE.Color(0xffffff);
const _fromPos = new THREE.Vector3();
const _shotEnd = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _motion = new THREE.Vector3();
const _separation = new THREE.Vector3();

export type EnemySystemOpts = {
  /** amount, attacker world position for damage direction */
  onPlayerDamage: (amount: number, fromWorld: THREE.Vector3) => void;
  count?: number;
  baseHp?: number;
  baseSpeed?: number;
  damageScale?: number;
  fireCooldownScale?: number;
  accuracy?: number;
  maxConcurrentAttackers?: number;
  arenaHalfSize?: number;
  playerClearRadius?: number;
  /** Endless sandbox behavior defaults to true; level waves disable it. */
  respawn?: boolean;
  /** Avoid spawning near this point (player spawn). Defaults to origin. */
  playerSpawn?: THREE.Vector3;
  /** World solids used for spawn safety, movement, and line-of-sight. */
  colliders?: Collider[];
  /** Authored playable insertion points, such as road centers in a streamed city. */
  spawnPoints?: readonly THREE.Vector3[];
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
  /** Add a fresh generated patrol to the existing streamed encounter. */
  addEnemies: (
    count: number,
    playerPosition: THREE.Vector3,
    spawnPoints?: readonly THREE.Vector3[],
  ) => readonly Enemy[];
  /** Raise or lower the rotating set of operators allowed to fire. */
  setMaxConcurrentAttackers: (count: number) => void;
  /** Move contacts left behind by world streaming into generated streets ahead. */
  relocateDistantEnemies: (
    maxDistance: number,
    playerPosition: THREE.Vector3,
    spawnPoints?: readonly THREE.Vector3[],
  ) => number;
  getEnemies: () => readonly Enemy[];
  dispose: () => void;
};

type EnemyRuntime = Enemy & {
  deathTimer: number;
  respawnTimer: number;
  collapsing: boolean;
  strafePhase: number;
  behavior: number; // 0 rush, 1 circle, 2 pause-burst
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
  physicsBody: GroundedBody;
  model: EnemyModel;
  gaitPhase: number;
  flinchYaw: number;
  recoil: number;
  deathSide: -1 | 1;
};

let nextEnemyId = 1;

function randomSpawnPosition(
  playerSpawn: THREE.Vector3,
  out: THREE.Vector3,
  colliders: readonly Collider[],
  occupied: readonly THREE.Vector3[],
  playerClearRadius: number,
  arenaHalfSize: number,
  spawnPoints: readonly THREE.Vector3[],
): THREE.Vector3 {
  if (spawnPoints.length > 0) {
    const start = Math.floor(Math.random() * spawnPoints.length);
    const playerClearSq = playerClearRadius * playerClearRadius;
    const spacingSq = (ENEMY_BODY.minimumSpacing * 1.35) ** 2;

    for (let offset = 0; offset < spawnPoints.length; offset++) {
      const point = spawnPoints[(start + offset) % spawnPoints.length]!;
      out.set(point.x, ENEMY_BODY.groundY, point.z);
      const dx = out.x - playerSpawn.x;
      const dz = out.z - playerSpawn.z;
      if (dx * dx + dz * dz < playerClearSq) continue;
      if (!canEnemyOccupy(out, colliders, arenaHalfSize)) continue;
      if (
        occupied.some((other) => {
          const ox = out.x - other.x;
          const oz = out.z - other.z;
          return ox * ox + oz * oz < spacingSq;
        })
      ) {
        continue;
      }
      return out;
    }
  }

  return findEnemySpawn(
    playerSpawn,
    out,
    colliders,
    occupied,
    playerClearRadius,
    Math.random,
    arenaHalfSize,
  );
}

function createEnemyRuntime(
  scene: THREE.Scene,
  playerSpawn: THREE.Vector3,
  colliders: Collider[],
  occupied: readonly THREE.Vector3[],
  baseHp: number,
  baseSpeed: number,
  playerClearRadius: number,
  arenaHalfSize: number,
  spawnPoints: readonly THREE.Vector3[],
): EnemyRuntime {
  const variant = nextEnemyId;
  const model = createEnemyModel(variant);
  const { root: group, bodyParts, headMesh, materials, teamHue } = model;
  const pos = randomSpawnPosition(
    playerSpawn,
    new THREE.Vector3(),
    colliders,
    occupied,
    playerClearRadius,
    arenaHalfSize,
    spawnPoints,
  );
  group.position.copy(pos);
  group.rotation.set(0, Math.random() * Math.PI * 2, 0);

  const savedColors = materials.map((m) => m.color.clone());
  const savedEmissive = materials.map((m) => m.emissive.clone());
  const savedEmissiveIntensity = materials.map((m) => m.emissiveIntensity);
  const id = nextEnemyId++;

  const enemy: EnemyRuntime = {
    mesh: group,
    hp: baseHp,
    maxHp: baseHp,
    speed: baseSpeed * (0.92 + Math.random() * 0.16),
    alive: true,
    hitFlash: 0,
    attackCooldown: Math.random() * 0.5,
    id,
    deathTimer: 0,
    respawnTimer: 0,
    collapsing: false,
    strafePhase: Math.random() * Math.PI * 2,
    behavior: Math.floor(Math.random() * 3),
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
    physicsBody: { id, position: group.position },
    model,
    gaitPhase: Math.random() * Math.PI * 2,
    flinchYaw: 0,
    recoil: 0,
    deathSide: Math.random() < 0.5 ? -1 : 1,
  };

  setEnemyModelOwner(model, enemy.id);

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

function respawnEnemy(
  e: EnemyRuntime,
  playerPosition: THREE.Vector3,
  colliders: Collider[],
  occupied: readonly THREE.Vector3[],
  playerClearRadius: number,
  arenaHalfSize: number,
  spawnPoints: readonly THREE.Vector3[],
): void {
  e.alive = true;
  e.collapsing = false;
  e.hp = e.maxHp;
  e.hitFlash = 0;
  e.deathTimer = 0;
  e.respawnTimer = 0;
  e.attackCooldown = 0.35;
  e.staggerTimer = 0;
  e.moveBlend = 0;
  e.gaitPhase = Math.random() * Math.PI * 2;
  e.flinchYaw = 0;
  e.recoil = 0;
  e.deathSide = Math.random() < 0.5 ? -1 : 1;
  e.knockVelocity.set(0, 0, 0);
  e.strafePhase = Math.random() * Math.PI * 2;
  e.behavior = Math.floor(Math.random() * 3);
  e.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
  e.mesh.scale.set(1, 1, 1);
  e.mesh.visible = true;
  randomSpawnPosition(
    playerPosition,
    e.mesh.position,
    colliders,
    occupied,
    playerClearRadius,
    arenaHalfSize,
    spawnPoints,
  );
  e.mesh.position.y = ENEMY_BODY.groundY;
  resetEnemyModelPose(e.model.rig);
  restoreMaterials(e);
}

/**
 * Enemy operator system: tactical silhouettes, seek/strafe/attack AI,
 * hit flash + knockback, collapse death, delayed respawn.
 */
export function createEnemySystem(scene: THREE.Scene, opts: EnemySystemOpts): EnemySystem {
  const initialCount = opts.count ?? SPAWN_COUNT;
  const baseHp = opts.baseHp ?? DEFAULT_HP;
  const baseSpeed = opts.baseSpeed ?? DEFAULT_SPEED;
  const damageScale = opts.damageScale ?? 1;
  const fireCooldownScale = opts.fireCooldownScale ?? 1;
  const accuracyBase = opts.accuracy ?? 0.7;
  let maxConcurrentAttackers = Math.max(
    1,
    Math.min(initialCount, Math.floor(opts.maxConcurrentAttackers ?? Math.ceil(initialCount / 3))),
  );
  const arenaHalfSize = opts.arenaHalfSize ?? ENEMY_BODY.mapHalf;
  const playerClearRadius = opts.playerClearRadius ?? PLAYER_SPAWN_CLEAR;
  const allowRespawn = opts.respawn ?? true;
  const playerSpawn = (opts.playerSpawn ?? new THREE.Vector3(0, 0, 0)).clone();
  const colliders = opts.colliders ?? [];
  const spawnPoints = opts.spawnPoints ?? [];
  const enemies: EnemyRuntime[] = [];
  const byId = new Map<number, EnemyRuntime>();

  const addEnemies = (
    requestedCount: number,
    spawnOrigin: THREE.Vector3,
    generatedSpawnPoints: readonly THREE.Vector3[] = spawnPoints,
  ): readonly Enemy[] => {
    const added: EnemyRuntime[] = [];
    const safeCount = Math.max(0, Math.floor(requestedCount));
    for (let i = 0; i < safeCount; i++) {
      const occupied = enemies.map((enemy) => enemy.mesh.position);
      const enemy = createEnemyRuntime(
        scene,
        spawnOrigin,
        colliders,
        occupied,
        baseHp,
        baseSpeed,
        playerClearRadius,
        arenaHalfSize,
        generatedSpawnPoints,
      );
      // Generated patrols have time to shoulder their rifles before joining
      // the rotating live-fire set.
      enemy.attackCooldown = (0.85 + Math.random() * 0.55) * fireCooldownScale;
      enemies.push(enemy);
      byId.set(enemy.id, enemy);
      added.push(enemy);
    }
    return added;
  };

  addEnemies(initialCount, playerSpawn);

  const raycastList: THREE.Object3D[] = [];
  const activeBodies: GroundedBody[] = [];
  const occupiedPositions: THREE.Vector3[] = [];
  let combatTime = 0;

  const update = (dt: number, playerPos: THREE.Vector3): void => {
    const safeDt = THREE.MathUtils.clamp(dt, 0, 0.05);
    combatTime += safeDt;

    for (const e of enemies) {
      if (!e.alive) {
        if (e.collapsing) {
          e.deathTimer += safeDt;
          const t = Math.min(1, e.deathTimer / DEATH_SETTLE_DURATION);

          // A contact-corrected articulated collapse settles knees and torso
          // while the physical root remains a strict ground support point.
          poseEnemyDeath(e.model.rig, t, e.deathSide);
          e.mesh.rotation.x = 0;
          e.mesh.rotation.z = 0;
          e.mesh.position.y = ENEMY_BODY.groundY;
          e.mesh.scale.set(1, 1, 1);

          if (e.deathTimer >= DEATH_SETTLE_DURATION + DEATH_HOLD_DURATION) {
            e.collapsing = false;
            e.mesh.visible = false;
            e.respawnTimer = allowRespawn ? RESPAWN_DELAY : 0;
          }
        } else if (e.respawnTimer > 0) {
          e.respawnTimer -= safeDt;
          if (e.respawnTimer <= 0) {
            occupiedPositions.length = 0;
            for (const other of enemies) {
              if (other !== e && other.alive) occupiedPositions.push(other.mesh.position);
            }
            // Respawns clear the player's current location, not merely the
            // original insertion point.
            respawnEnemy(
              e,
              playerPos,
              colliders,
              occupiedPositions,
              playerClearRadius,
              arenaHalfSize,
              spawnPoints,
            );
          }
        }
        continue;
      }

      const frameStartX = e.mesh.position.x;
      const frameStartZ = e.mesh.position.z;

      // Hit flash decay
      if (e.hitFlash > 0) {
        e.hitFlash = Math.max(0, e.hitFlash - safeDt * 5);
        applyHitFlashVisual(e, e.hitFlash);
        if (e.hitFlash <= 0) restoreMaterials(e);
      }
      e.staggerTimer = Math.max(0, e.staggerTimer - safeDt);

      if (e.knockVelocity.lengthSq() > 0.0004) {
        _motion.copy(e.knockVelocity).multiplyScalar(safeDt);
        moveEnemyGrounded(e.mesh.position, _motion, colliders, arenaHalfSize);
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
        _motion.set(moveX, 0, moveZ);
        moveEnemyGrounded(e.mesh.position, _motion, colliders, arenaHalfSize);

        const targetYaw = Math.atan2(_toPlayer.x, _toPlayer.z);
        const yaw = dampEnemyYaw(e.mesh.rotation.y, targetYaw, 11, safeDt);
        e.mesh.rotation.set(0, yaw, 0);
      }

      // A living operator's root is a physical support point, not animation
      // data. Locomotion rigs may animate children, but the boots never hover
      // or penetrate because the root remains exactly on the ground plane.
      e.mesh.position.y = ENEMY_BODY.groundY;
      e.mesh.rotation.x = 0;
      e.mesh.rotation.z = 0;
      e.mesh.scale.set(1, 1, 1);

      const frameTravel = Math.hypot(
        e.mesh.position.x - frameStartX,
        e.mesh.position.z - frameStartZ,
      );
      e.gaitPhase += frameTravel * 6.2;
      const locomotionTarget =
        safeDt > 0
          ? THREE.MathUtils.clamp(frameTravel / Math.max(e.speed * safeDt * 0.72, 0.001), 0, 1)
          : 0;
      e.moveBlend = THREE.MathUtils.damp(e.moveBlend, locomotionTarget, 10, safeDt);
      e.recoil = Math.max(0, e.recoil - safeDt * 8.5);
      poseEnemyModel(e.model.rig, {
        gaitPhase: e.gaitPhase,
        locomotion: e.moveBlend,
        aim: dist <= FIRE_MAX_RANGE ? 1 : dist < SEEK_RANGE ? 0.72 : 0.35,
        recoil: e.recoil,
        flinch: THREE.MathUtils.clamp(e.staggerTimer / 0.28, 0, 1),
        flinchYaw: e.flinchYaw,
      });

      // Close strike or paced rifle fire. Only a rotating subset of the squad
      // may fire at once so pressure stays intense without becoming unfair.
      e.attackCooldown = Math.max(0, e.attackCooldown - safeDt);
      if (dist <= MELEE_RANGE && e.attackCooldown <= 0) {
        e.attackCooldown = (MELEE_COOLDOWN + Math.random() * 0.22) * fireCooldownScale;
        _fromPos.copy(e.mesh.position);
        _fromPos.y += 1.2;
        _shotDir.set(playerPos.x, playerPos.y + 1.05, playerPos.z).sub(_fromPos);
        const strikeDistance = _shotDir.length();
        _shotDir.normalize();
        const strikeCover = colliders.length
          ? raycastColliders(_fromPos, _shotDir, colliders, strikeDistance)
          : null;
        // A wall blocks close strikes just as decisively as it blocks rifle
        // fire; proximity alone is never sufficient line of sight.
        if (!strikeCover || strikeCover.t >= strikeDistance - 0.12) {
          opts.onPlayerDamage(MELEE_DAMAGE * damageScale, _fromPos);
        }
      } else if (
        dist >= FIRE_MIN_RANGE &&
        dist <= FIRE_MAX_RANGE &&
        e.attackCooldown <= 0 &&
        e.staggerTimer <= 0 &&
        (e.id + Math.floor(combatTime * 0.48)) % Math.max(1, enemies.length) <
          maxConcurrentAttackers
      ) {
        e.model.rig.muzzle.getWorldPosition(_fromPos);
        _shotDir.set(playerPos.x, playerPos.y + 1.22, playerPos.z).sub(_fromPos);
        const shotDistance = _shotDir.length();
        _shotDir.normalize();
        const coverHit = colliders.length
          ? raycastColliders(_fromPos, _shotDir, colliders, shotDistance)
          : null;

        e.attackCooldown =
          (FIRE_COOLDOWN + Math.random() * 0.55 + (e.behavior === 2 ? -0.12 : 0.12)) *
          fireCooldownScale;
        e.recoil = 1;
        if (coverHit && coverHit.t < shotDistance - 0.25) {
          opts.onEnemyShot?.(_fromPos, coverHit.point, false, coverHit.normal);
        } else {
          const accuracy = THREE.MathUtils.clamp(accuracyBase - shotDistance * 0.006, 0.1, 0.82);
          const hit = Math.random() < accuracy;
          _shotEnd.set(playerPos.x, playerPos.y + 1.15, playerPos.z);
          if (!hit) {
            const missRadius = 0.65 + shotDistance * 0.018;
            _shotEnd.x += (Math.random() - 0.5) * missRadius * 2;
            _shotEnd.y += (Math.random() - 0.5) * missRadius;
            _shotEnd.z += (Math.random() - 0.5) * missRadius * 2;
          }
          opts.onEnemyShot?.(_fromPos, _shotEnd, hit);
          if (hit) opts.onPlayerDamage(FIRE_DAMAGE * damageScale, _fromPos);
        }
      }
    }

    activeBodies.length = 0;
    for (const e of enemies) {
      if (e.alive) activeBodies.push(e.physicsBody);
    }
    separateEnemyBodies(activeBodies, colliders, arenaHalfSize);
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
        _knock.normalize();
        const hitYaw = Math.atan2(_knock.x, _knock.z);
        e.flinchYaw = Math.atan2(
          Math.sin(hitYaw - e.mesh.rotation.y),
          Math.cos(hitYaw - e.mesh.rotation.y),
        );
        if (Math.abs(Math.sin(e.flinchYaw)) > 0.08) {
          e.deathSide = Math.sin(e.flinchYaw) >= 0 ? 1 : -1;
        }
        _knock.multiplyScalar(isHeadshot ? 4.8 : 3.2);
        e.knockVelocity.add(_knock);
        clampEnemyImpulse(e.knockVelocity, MAX_KNOCK_SPEED);
      }
    }
    e.staggerTimer = isHeadshot ? 0.28 : 0.16;

    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      e.collapsing = true;
      e.deathTimer = 0;
      e.hitFlash = 0;
      e.knockVelocity.set(0, 0, 0);
      e.mesh.position.y = ENEMY_BODY.groundY;
      e.mesh.rotation.x = 0;
      e.mesh.rotation.z = 0;
      e.mesh.scale.set(1, 1, 1);
      restoreMaterials(e);
      for (const m of e.materials) {
        m.color.multiplyScalar(0.4);
        m.emissiveIntensity *= 0.15;
      }
      return { killed: true, headshot: isHeadshot };
    }

    return { killed: false, headshot: isHeadshot };
  };

  const setMaxConcurrentAttackers = (count: number): void => {
    maxConcurrentAttackers = Math.max(1, Math.min(enemies.length, Math.floor(count)));
  };

  const relocateDistantEnemies = (
    maxDistance: number,
    currentPlayerPosition: THREE.Vector3,
    generatedSpawnPoints: readonly THREE.Vector3[] = spawnPoints,
  ): number => {
    const maxDistanceSq = Math.max(1, maxDistance) ** 2;
    let relocated = 0;

    for (const enemy of enemies) {
      if (
        !enemy.alive ||
        enemy.mesh.position.distanceToSquared(currentPlayerPosition) <= maxDistanceSq
      ) {
        continue;
      }
      occupiedPositions.length = 0;
      for (const other of enemies) {
        if (other !== enemy && other.alive) occupiedPositions.push(other.mesh.position);
      }
      const remainingHp = enemy.hp;
      respawnEnemy(
        enemy,
        currentPlayerPosition,
        colliders,
        occupiedPositions,
        playerClearRadius,
        arenaHalfSize,
        generatedSpawnPoints,
      );
      enemy.hp = Math.min(remainingHp, enemy.maxHp);
      relocated += 1;
    }

    return relocated;
  };

  const dispose = (): void => {
    for (const e of enemies) {
      e.model.dispose();
    }
    enemies.length = 0;
    byId.clear();
  };

  return {
    update,
    raycastTargets,
    getEnemyFromObject,
    applyDamage,
    addEnemies,
    setMaxConcurrentAttackers,
    relocateDistantEnemies,
    getEnemies: () => enemies,
    dispose,
  };
}
