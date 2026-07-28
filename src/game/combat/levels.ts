import * as THREE from "three";
import type { Collider, LevelState } from "@/game/types";

const LEVEL_ADJECTIVES = [
  "Black",
  "Cold",
  "Crimson",
  "Fallen",
  "Ghost",
  "Iron",
  "Night",
  "Silent",
  "Steel",
  "Winter",
] as const;

const LEVEL_NOUNS = [
  "Anvil",
  "Citadel",
  "Dagger",
  "Echo",
  "Falcon",
  "Horizon",
  "Raven",
  "Sentinel",
  "Viper",
  "Wolf",
] as const;

const CALLSIGN_PREFIXES = [
  "Ash",
  "Blitz",
  "Cross",
  "Flint",
  "Grim",
  "Knox",
  "Rook",
  "Slate",
  "Vex",
  "Zero",
] as const;

const CALLSIGN_SUFFIXES = [
  "Actual",
  "Bravo",
  "Four",
  "Nine",
  "One",
  "Six",
  "Three",
  "Two",
  "X",
  "Zulu",
] as const;

const WALL_HEIGHT = 2.6;
const WALL_THICKNESS = 0.48;
const PLAYER_COVER_CLEAR = 6.25;

export type LevelProfile = {
  level: number;
  codename: string;
  fighterCount: number;
  arenaHalfSize: number;
  coverCount: number;
  enemyHp: number;
  enemySpeed: number;
  enemyDamageScale: number;
  enemyFireCooldownScale: number;
  enemyAccuracy: number;
  playerClearRadius: number;
};

export type LevelArena = {
  group: THREE.Group;
  colliders: Collider[];
  dispose: () => void;
};

function pick<T>(values: readonly T[], random: () => number): T {
  const index = Math.min(values.length - 1, Math.floor(random() * values.length));
  return values[index]!;
}

/** A fresh but steadily escalating encounter profile for an endless run. */
export function createLevelProfile(
  level: number,
  random: () => number = Math.random,
): LevelProfile {
  const safeLevel = Math.max(1, Math.floor(level));
  const tier = safeLevel - 1;
  const sizeJitter = random() * 1.6;

  return {
    level: safeLevel,
    codename: `${pick(LEVEL_ADJECTIVES, random)} ${pick(LEVEL_NOUNS, random)}`.toUpperCase(),
    // The central promise of the mode: every level adds exactly one fighter.
    fighterCount: safeLevel,
    arenaHalfSize: Math.min(48, 15.5 + tier * 2.55 + sizeJitter),
    coverCount: Math.min(8, 1 + Math.floor(tier / 2)),
    enemyHp: Math.min(118, 58 + tier * 4.5),
    enemySpeed: Math.min(5.8, 3.15 + tier * 0.2),
    enemyDamageScale: Math.min(1.25, 0.52 + tier * 0.055),
    enemyFireCooldownScale: Math.max(0.7, 1.42 - tier * 0.05),
    enemyAccuracy: Math.min(0.76, 0.4 + tier * 0.035),
    playerClearRadius: Math.min(10, 7.5 + tier * 0.25),
  };
}

export function createFighterCallsign(random: () => number = Math.random, ordinal = 1): string {
  return `${pick(CALLSIGN_PREFIXES, random)}-${pick(CALLSIGN_SUFFIXES, random)}·${ordinal}`;
}

function overlapsXZ(a: Collider, b: Collider, padding = 0): boolean {
  return (
    a.max.x + padding > b.min.x &&
    a.min.x - padding < b.max.x &&
    a.max.z + padding > b.min.z &&
    a.min.z - padding < b.max.z
  );
}

function makeCollider(
  centerX: number,
  centerZ: number,
  halfX: number,
  halfZ: number,
  height = WALL_HEIGHT,
): Collider {
  return {
    min: new THREE.Vector3(centerX - halfX, 0.035, centerZ - halfZ),
    max: new THREE.Vector3(centerX + halfX, height, centerZ + halfZ),
  };
}

/**
 * Builds the current procedural combat pocket and appends its colliders to the
 * shared world array. Disposing removes only this level's additions.
 */
export function createLevelArena(
  scene: THREE.Scene,
  worldColliders: Collider[],
  profile: LevelProfile,
  random: () => number = Math.random,
  playerPosition: Readonly<THREE.Vector3> = new THREE.Vector3(),
): LevelArena {
  const group = new THREE.Group();
  group.name = `level_${profile.level}_${profile.codename.toLowerCase().replaceAll(" ", "_")}`;
  const colliders: Collider[] = [];
  const half = profile.arenaHalfSize;

  const wallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f383d,
    roughness: 0.62,
    metalness: 0.45,
    emissive: 0x172a32,
    emissiveIntensity: 0.32,
  });
  const boundaryMaterial = new THREE.MeshStandardMaterial({
    color: 0xd88926,
    roughness: 0.45,
    metalness: 0.52,
    emissive: 0xd88926,
    emissiveIntensity: 1.25,
  });
  const coverMaterial = new THREE.MeshStandardMaterial({
    color: 0x42483e,
    roughness: 0.88,
    metalness: 0.12,
  });

  const addWall = (
    x: number,
    z: number,
    width: number,
    depth: number,
    collider: Collider,
  ): void => {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, WALL_HEIGHT / 2, z);
    wall.scale.set(width, WALL_HEIGHT, depth);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const stripe = new THREE.Mesh(wallGeometry, boundaryMaterial);
    stripe.position.set(x, 0.46, z);
    stripe.scale.set(width + 0.04, 0.08, depth + 0.04);
    group.add(stripe);
    colliders.push(collider);
  };

  addWall(
    -half - WALL_THICKNESS / 2,
    0,
    WALL_THICKNESS,
    half * 2 + WALL_THICKNESS * 2,
    makeCollider(-half - WALL_THICKNESS / 2, 0, WALL_THICKNESS / 2, half + WALL_THICKNESS),
  );
  addWall(
    half + WALL_THICKNESS / 2,
    0,
    WALL_THICKNESS,
    half * 2 + WALL_THICKNESS * 2,
    makeCollider(half + WALL_THICKNESS / 2, 0, WALL_THICKNESS / 2, half + WALL_THICKNESS),
  );
  addWall(
    0,
    -half - WALL_THICKNESS / 2,
    half * 2,
    WALL_THICKNESS,
    makeCollider(0, -half - WALL_THICKNESS / 2, half, WALL_THICKNESS / 2),
  );
  addWall(
    0,
    half + WALL_THICKNESS / 2,
    half * 2,
    WALL_THICKNESS,
    makeCollider(0, half + WALL_THICKNESS / 2, half, WALL_THICKNESS / 2),
  );

  const coverGeometry = new THREE.BoxGeometry(1, 1, 1);
  const existingForCover = [...worldColliders, ...colliders];
  const coverLimit = Math.max(4, half - 3.2);

  for (let index = 0; index < profile.coverCount; index++) {
    let placed = false;
    for (let attempt = 0; attempt < 48 && !placed; attempt++) {
      const longAlongX = random() >= 0.5;
      const width = longAlongX ? 2.6 + random() * 1.6 : 0.85 + random() * 0.55;
      const depth = longAlongX ? 0.85 + random() * 0.55 : 2.6 + random() * 1.6;
      const x = THREE.MathUtils.lerp(-coverLimit, coverLimit, random());
      const z = THREE.MathUtils.lerp(-coverLimit, coverLimit, random());
      const playerDx = x - playerPosition.x;
      const playerDz = z - playerPosition.z;
      if (playerDx * playerDx + playerDz * playerDz < PLAYER_COVER_CLEAR * PLAYER_COVER_CLEAR) {
        continue;
      }

      const candidate = makeCollider(x, z, width / 2, depth / 2, 1.25);
      if (existingForCover.some((collider) => overlapsXZ(candidate, collider, 0.5))) continue;

      const cover = new THREE.Mesh(coverGeometry, coverMaterial);
      cover.name = `procedural_cover_${index + 1}`;
      cover.position.set(x, 0.625, z);
      cover.scale.set(width, 1.25, depth);
      cover.castShadow = true;
      cover.receiveShadow = true;
      group.add(cover);
      colliders.push(candidate);
      existingForCover.push(candidate);
      placed = true;
    }
  }

  scene.add(group);
  worldColliders.push(...colliders);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const collider of colliders) {
      const index = worldColliders.indexOf(collider);
      if (index >= 0) worldColliders.splice(index, 1);
    }
    group.removeFromParent();
    wallGeometry.dispose();
    coverGeometry.dispose();
    wallMaterial.dispose();
    boundaryMaterial.dispose();
    coverMaterial.dispose();
    group.clear();
  };

  return { group, colliders, dispose };
}
