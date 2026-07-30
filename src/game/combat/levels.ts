import * as THREE from "three";
import type { TrainingMode } from "@/game/modes";
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
  concurrentAttackers: number;
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
  mode: TrainingMode = "alley",
): LevelProfile {
  const safeLevel = Math.max(1, Math.floor(level));
  const tier = safeLevel - 1;
  const sizeJitter = random() * 1.6;
  // Raw squad size already adds substantial pressure, so the remaining combat
  // stats rise in small training-grade steps instead of spiking every round.
  const durabilityBand = Math.floor(tier / 5);
  const concurrentAttackers =
    safeLevel < 9 ? 1 : safeLevel < 17 ? 2 : safeLevel < 29 ? 3 : safeLevel < 45 ? 4 : 5;

  const alleyProfile: LevelProfile = {
    level: safeLevel,
    codename: `${pick(LEVEL_ADJECTIVES, random)} ${pick(LEVEL_NOUNS, random)}`.toUpperCase(),
    // A visible patrol occupies the wider streets from the start. More contacts
    // join each level, while capped fire lanes keep the learning curve gentle.
    fighterCount: Math.min(30, 6 + tier * 2),
    // Large half-size so enemies can pursue along streaming streets (no boxed arena).
    arenaHalfSize: Math.min(120, 48 + tier * 1.2 + sizeJitter),
    coverCount: Math.min(10, 1 + Math.floor(tier / 4)),
    enemyHp: Math.min(72, 48 + durabilityBand * 2),
    enemySpeed: Math.min(3.25, 2.55 + tier * 0.02),
    enemyDamageScale: Math.min(0.6, 0.3 + tier * 0.006),
    enemyFireCooldownScale: Math.max(1.45, 2.25 - tier * 0.015),
    enemyAccuracy: Math.min(0.48, 0.24 + tier * 0.004),
    // Only one operator has an active fire lane through level eight. Later
    // lanes unlock in wide bands while the remaining squad repositions.
    concurrentAttackers,
    playerClearRadius: Math.min(10, 7.5 + tier * 0.1),
  };

  if (mode === "alley") return alleyProfile;

  return {
    ...alleyProfile,
    codename: `RANGE ${pick(LEVEL_NOUNS, random)}`.toUpperCase(),
    // The restored compound is the dense-contact option: a complete squad is
    // present from the first drill, while active fire lanes remain capped.
    fighterCount: Math.min(18, 10 + Math.floor(tier / 2)),
    arenaHalfSize: 46,
    coverCount: Math.min(5, 1 + Math.floor(tier / 5)),
    enemySpeed: Math.min(3.05, 2.45 + tier * 0.018),
    enemyDamageScale: Math.min(0.52, 0.24 + tier * 0.006),
    enemyFireCooldownScale: Math.max(1.6, 2.45 - tier * 0.016),
    enemyAccuracy: Math.min(0.42, 0.2 + tier * 0.004),
    concurrentAttackers: safeLevel < 7 ? 2 : safeLevel < 16 ? 3 : 4,
    playerClearRadius: 9,
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
  height = 1.25,
): Collider {
  return {
    min: new THREE.Vector3(centerX - halfX, 0.035, centerZ - halfZ),
    max: new THREE.Vector3(centerX + halfX, height, centerZ + halfZ),
  };
}

/**
 * Extra combat cover near the player — NO enclosing box walls.
 * The streaming city already provides corridor walls, doors, and street cover;
 * this only sprinkles a few extra pieces so each wave still feels staged.
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

  const coverGeometry = new THREE.BoxGeometry(1, 1, 1);
  const coverMaterial = new THREE.MeshStandardMaterial({
    color: 0x42483e,
    roughness: 0.88,
    metalness: 0.12,
  });
  const existingForCover = [...worldColliders];
  // Place relative to the player so cover follows the corridor, not world origin.
  const px = playerPosition.x;
  const pz = playerPosition.z;
  const coverCount = Math.min(6, profile.coverCount + 1);

  for (let index = 0; index < coverCount; index++) {
    let placed = false;
    for (let attempt = 0; attempt < 48 && !placed; attempt++) {
      const longAlongX = random() >= 0.5;
      const width = longAlongX ? 2.2 + random() * 1.4 : 0.8 + random() * 0.5;
      const depth = longAlongX ? 0.8 + random() * 0.5 : 2.2 + random() * 1.4;
      // Ring around the player — not under their feet, not a sealed box
      const ang = random() * Math.PI * 2;
      const rad = PLAYER_COVER_CLEAR + 2 + random() * 10;
      const x = px + Math.cos(ang) * rad;
      const z = pz + Math.sin(ang) * rad;

      const candidate = makeCollider(x, z, width / 2, depth / 2, 1.25);
      if (existingForCover.some((collider) => overlapsXZ(candidate, collider, 0.5))) continue;

      const cover = new THREE.Mesh(coverGeometry, coverMaterial);
      cover.name = `street_cover_${index + 1}`;
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
    coverGeometry.dispose();
    coverMaterial.dispose();
    group.clear();
  };

  return { group, colliders, dispose };
}
