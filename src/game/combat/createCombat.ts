import * as THREE from "three";
import type { Collider, GameHudState, KillFeedEntry } from "@/game/types";
import { raycastColliders } from "@/game/player/physics";
import { createEnemySystem } from "./enemies";
import { createEffects } from "./effects";

const BODY_DAMAGE = 32;
const HEAD_MULT = 2.15;
const SCORE_HIT = 25;
const SCORE_HEADSHOT = 50;
const SCORE_KILL = 100;
const MAX_RANGE = 180;
const HIP_SPREAD = 0.0115;
const KILL_FEED_MAX = 6;
const KILL_FEED_TTL_MS = 4500;

const ENEMY_NAMES = [
  "Reaper-6",
  "Vandal",
  "Spectre",
  "Wraith",
  "Jackal",
  "Marauder",
  "Ghost",
  "Nomad",
  "Razor",
  "Havoc",
  "Sable",
  "Kestrel",
];

export type CreateCombatOpts = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  onHud: (p: Partial<GameHudState>) => void;
  onPlayerDamage: (amount: number, fromWorld?: THREE.Vector3) => void;
  playHitSound?: () => void;
  playKillSound?: () => void;
  /** World solid colliders for bullet occlusion / wall impacts. */
  colliders?: Collider[];
};

export type CombatSystem = {
  handleShot: (origin: THREE.Vector3, direction: THREE.Vector3, ads: boolean) => void;
  update: (dt: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
};

/**
 * Hitscan combat glue: raycast operators, score/kill-feed HUD,
 * world VFX, and enemy AI tick.
 */
export function createCombat(opts: CreateCombatOpts): CombatSystem {
  const {
    scene,
    camera,
    onHud,
    onPlayerDamage,
    playHitSound,
    playKillSound,
    colliders = [],
  } = opts;

  const effects = createEffects(scene);
  const enemies = createEnemySystem(scene, {
    onPlayerDamage: (amount, fromWorld) => {
      onPlayerDamage(amount, fromWorld);
    },
    count: 10,
    playerSpawn: new THREE.Vector3(0, 0, 5),
    colliders,
    onEnemyShot: (origin, end, hit, impactNormal) => {
      effects.spawnTracer(origin, end, hit ? 0xff563c : 0xffb05a);
      effects.spawnMuzzleSmoke(origin, _enemyForward.copy(end).sub(origin).normalize());
      if (impactNormal) effects.spawnImpact(end, impactNormal);
    },
  });

  const raycaster = new THREE.Raycaster();
  const shotDir = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const hitNormal = new THREE.Vector3(0, 1, 0);
  const farPoint = new THREE.Vector3();
  const knockDir = new THREE.Vector3();
  const deathPos = new THREE.Vector3();
  const visualOrigin = new THREE.Vector3();
  const visualOffset = new THREE.Vector3();
  const spreadRight = new THREE.Vector3();
  const spreadUp = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const cameraQuat = new THREE.Quaternion();
  const _enemyForward = new THREE.Vector3();

  let score = 0;
  let kills = 0;
  let streak = 0;
  let killFeedId = 1;
  let killFeed: KillFeedEntry[] = [];

  const pushKillFeed = (text: string): void => {
    const entry: KillFeedEntry = {
      id: killFeedId++,
      text,
      at: performance.now(),
    };
    killFeed = [entry, ...killFeed].slice(0, KILL_FEED_MAX);
    onHud({ killFeed: killFeed.slice() });
  };

  const pruneKillFeed = (): void => {
    const now = performance.now();
    const next = killFeed.filter((e) => now - e.at < KILL_FEED_TTL_MS);
    if (next.length !== killFeed.length) {
      killFeed = next;
      onHud({ killFeed: killFeed.slice() });
    }
  };

  const enemyName = (id: number): string => ENEMY_NAMES[id % ENEMY_NAMES.length];

  const handleShot = (origin: THREE.Vector3, direction: THREE.Vector3, ads: boolean): void => {
    // ADS is deterministic: the sight line and the authored recoil pattern
    // fully determine placement. Hip fire keeps a fixed cone represented by
    // the open reticle, without hidden accuracy bloom.
    const spread = ads ? 0 : HIP_SPREAD;
    shotDir.copy(direction).normalize();
    if (spread > 0) {
      spreadRight.crossVectors(shotDir, worldUp);
      if (spreadRight.lengthSq() < 0.001) spreadRight.set(1, 0, 0);
      else spreadRight.normalize();
      spreadUp.crossVectors(spreadRight, shotDir).normalize();
      const radius = Math.sqrt(Math.random()) * spread;
      const angle = Math.random() * Math.PI * 2;
      shotDir
        .addScaledVector(spreadRight, Math.cos(angle) * radius)
        .addScaledVector(spreadUp, Math.sin(angle) * radius);
      shotDir.normalize();
    }

    raycaster.set(origin, shotDir);
    raycaster.far = MAX_RANGE;

    const targets = enemies.raycastTargets();
    const hits = raycaster.intersectObjects(targets, false);

    // World occlusion (cover / walls) via AABB raycast
    const worldHit = colliders.length
      ? raycastColliders(origin, shotDir, colliders, MAX_RANGE)
      : null;
    const enemyDist = hits.length > 0 ? hits[0]!.distance : Infinity;
    const worldDist = worldHit ? worldHit.t : Infinity;

    // Cosmetic tracer starts at the viewmodel muzzle while hit registration
    // remains camera-centered, avoiding both corner-peek errors and face smoke.
    camera.getWorldPosition(visualOrigin);
    camera.getWorldQuaternion(cameraQuat);
    visualOffset.set(0.2, -0.18, -0.5).applyQuaternion(cameraQuat);
    visualOrigin.add(visualOffset);
    effects.spawnMuzzleSmoke(visualOrigin, shotDir);

    // Wall hit first — bullet stops on cover
    if (worldHit && worldDist <= enemyDist) {
      effects.spawnTracer(visualOrigin, worldHit.point);
      effects.spawnImpact(worldHit.point, worldHit.normal);
      return;
    }

    if (hits.length === 0) {
      farPoint.copy(origin).addScaledVector(shotDir, Math.min(48, MAX_RANGE));
      effects.spawnTracer(visualOrigin, farPoint);
      return;
    }

    const hit = hits[0]!;
    hitPoint.copy(hit.point);
    if (hit.face) {
      hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
    } else {
      hitNormal.copy(shotDir).negate();
    }

    effects.spawnTracer(visualOrigin, hitPoint);

    const enemy = enemies.getEnemyFromObject(hit.object);
    if (!enemy || !enemy.alive) {
      effects.spawnImpact(hitPoint, hitNormal);
      return;
    }

    const isHead = Boolean(hit.object.userData?.isHead);
    const falloff = THREE.MathUtils.lerp(1, 0.76, THREE.MathUtils.clamp(hit.distance / 95, 0, 1));
    const damage = (isHead ? BODY_DAMAGE * HEAD_MULT : BODY_DAMAGE) * falloff;

    knockDir.copy(shotDir);
    const result = enemies.applyDamage(enemy, damage, knockDir, isHead);

    effects.spawnFleshHit(hitPoint, hitNormal);
    playHitSound?.();

    if (result.killed) {
      kills += 1;
      streak += 1;
      score += SCORE_KILL + (isHead ? SCORE_HEADSHOT : 0);
      deathPos.copy(enemy.mesh.position);
      effects.spawnDeath(deathPos);
      playKillSound?.();

      const label = isHead
        ? `YOU  ✖  ${enemyName(enemy.id)}  [HS]`
        : `YOU  ✖  ${enemyName(enemy.id)}`;
      pushKillFeed(label);

      onHud({
        score,
        kills,
        streak,
        hitMarker: 1,
        hitMarkerKill: true,
        hitMarkerHeadshot: isHead,
      });
    } else {
      score += isHead ? SCORE_HEADSHOT : SCORE_HIT;
      onHud({
        score,
        hitMarker: 1,
        hitMarkerKill: false,
        hitMarkerHeadshot: isHead,
      });
    }
  };

  const update = (dt: number, playerPos: THREE.Vector3): void => {
    enemies.update(dt, playerPos);
    effects.update(dt);
    pruneKillFeed();
    void camera;
  };

  const dispose = (): void => {
    enemies.dispose();
    effects.dispose();
    killFeed = [];
  };

  return { handleShot, update, dispose };
}
