import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { Collider } from "../src/game/types";
import {
  createFighterCallsign,
  createLevelArena,
  createLevelProfile,
} from "../src/game/combat/levels";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("progressive procedural levels", () => {
  test("starts with a visible patrol and adds two contacts per level", () => {
    const profiles = Array.from({ length: 10 }, (_, index) =>
      createLevelProfile(index + 1, seededRandom(index + 20)),
    );

    for (let index = 0; index < profiles.length; index++) {
      expect(profiles[index]!.fighterCount).toBe(6 + index * 2);
    }

    const first = profiles[0]!;
    const late = profiles[9]!;
    // Streaming pursuit stays grounded far beyond the original spawn block.
    expect(first.arenaHalfSize).toBe(4096);
    expect(first.enemyDamageScale).toBeLessThan(0.6);
    expect(first.enemySpeed).toBeLessThan(2.7);
    expect(first.enemyHp).toBeLessThanOrEqual(50);
    expect(first.concurrentAttackers).toBe(1);
    expect(profiles[7]!.concurrentAttackers).toBe(1);
    expect(profiles[8]!.concurrentAttackers).toBe(2);
    expect(late.arenaHalfSize).toBe(first.arenaHalfSize);
    expect(late.enemySpeed).toBeGreaterThan(first.enemySpeed);
    expect(late.enemyHp).toBeGreaterThan(first.enemyHp);
    expect(late.enemyAccuracy).toBeGreaterThan(first.enemyAccuracy);
    expect(late.enemyDamageScale).toBeGreaterThan(first.enemyDamageScale);
    expect(late.enemyFireCooldownScale).toBeLessThan(first.enemyFireCooldownScale);
  });

  test("keeps the opening ten levels on a gentle training curve", () => {
    const first = createLevelProfile(1, () => 0);
    const fifth = createLevelProfile(5, () => 0);
    const tenth = createLevelProfile(10, () => 0);
    const twentieth = createLevelProfile(20, () => 0);

    expect(fifth.enemySpeed - first.enemySpeed).toBeLessThan(0.15);
    expect(tenth.enemySpeed - first.enemySpeed).toBeLessThan(0.35);
    expect(tenth.enemyHp - first.enemyHp).toBeLessThan(12);
    expect(tenth.enemyDamageScale).toBeLessThan(0.37);
    expect(tenth.enemyAccuracy).toBeLessThan(0.3);
    expect(tenth.concurrentAttackers).toBe(2);
    expect(twentieth.concurrentAttackers).toBe(3);
    expect(twentieth.enemyFireCooldownScale).toBeGreaterThan(1.95);
    expect(twentieth.enemyHp).toBeLessThanOrEqual(56);
  });

  test("restores a full squad in the legacy range without opening every fire lane", () => {
    const first = createLevelProfile(1, () => 0, "range");
    const seventh = createLevelProfile(7, () => 0, "range");

    expect(first.fighterCount).toBe(10);
    expect(first.codename).toStartWith("RANGE ");
    expect(first.arenaHalfSize).toBe(46);
    expect(first.concurrentAttackers).toBe(2);
    expect(first.enemyDamageScale).toBeLessThan(0.3);
    expect(first.enemyAccuracy).toBeLessThan(0.25);
    expect(seventh.fighterCount).toBe(13);
    expect(seventh.concurrentAttackers).toBe(3);
  });

  test("generates deterministic random codenames and fighter callsigns", () => {
    const profileA = createLevelProfile(4, seededRandom(123));
    const profileB = createLevelProfile(4, seededRandom(123));
    const profileC = createLevelProfile(4, seededRandom(124));

    expect(profileA).toEqual(profileB);
    expect(profileA.codename).not.toBe(profileC.codename);

    const callsignRandom = seededRandom(88);
    const first = createFighterCallsign(callsignRandom, 1);
    const second = createFighterCallsign(callsignRandom, 2);
    expect(first).not.toBe(second);
    expect(first.endsWith("·1")).toBe(true);
    expect(second.endsWith("·2")).toBe(true);
  });

  test("builds removable street cover near the player without enclosing walls", () => {
    const scene = new THREE.Scene();
    const baseCollider: Collider = {
      min: new THREE.Vector3(70, 0, 70),
      max: new THREE.Vector3(72, 2, 72),
    };
    const worldColliders = [baseCollider];
    const profile = createLevelProfile(7, seededRandom(51));
    const player = new THREE.Vector3(5, 0, -4);
    const arena = createLevelArena(scene, worldColliders, profile, seededRandom(999), player);

    expect(arena.group.parent).toBe(scene);
    // Cover only — no four-wall box
    expect(arena.colliders.length).toBeGreaterThanOrEqual(1);
    expect(arena.colliders.length).toBeLessThanOrEqual(profile.coverCount + 2);
    expect(worldColliders.length).toBe(1 + arena.colliders.length);

    for (const cover of arena.colliders) {
      expect(cover.max.y).toBeLessThanOrEqual(1.35);
      const closestX = THREE.MathUtils.clamp(player.x, cover.min.x, cover.max.x);
      const closestZ = THREE.MathUtils.clamp(player.z, cover.min.z, cover.max.z);
      expect(Math.hypot(player.x - closestX, player.z - closestZ)).toBeGreaterThanOrEqual(5.75);
    }

    arena.dispose();
    arena.dispose();
    expect(arena.group.parent).toBeNull();
    expect(worldColliders).toEqual([baseCollider]);
  });
});
