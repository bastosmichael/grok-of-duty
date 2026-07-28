import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEnemySystem } from "../src/game/combat/enemies";
import { ENEMY_BODY } from "../src/game/combat/enemyPhysics";
import { createLevelProfile } from "../src/game/combat/levels";

describe("level enemy waves", () => {
  test("creates the requested easy opening fighter and does not respawn a cleared wave", () => {
    const scene = new THREE.Scene();
    const arenaHalf = 16;
    const profile = createLevelProfile(1, () => 0);
    const system = createEnemySystem(scene, {
      count: profile.fighterCount,
      baseHp: profile.enemyHp,
      baseSpeed: profile.enemySpeed,
      damageScale: profile.enemyDamageScale,
      fireCooldownScale: profile.enemyFireCooldownScale,
      accuracy: profile.enemyAccuracy,
      maxConcurrentAttackers: profile.concurrentAttackers,
      arenaHalfSize: arenaHalf,
      playerClearRadius: 7.5,
      respawn: false,
      colliders: [],
      onPlayerDamage: () => {},
    });

    try {
      const enemies = system.getEnemies();
      expect(enemies).toHaveLength(1);
      const enemy = enemies[0]!;
      expect(enemy.hp).toBe(profile.enemyHp);
      expect(enemy.maxHp).toBe(profile.enemyHp);
      expect(enemy.speed).toBeGreaterThanOrEqual(profile.enemySpeed * 0.92);
      expect(enemy.speed).toBeLessThanOrEqual(profile.enemySpeed * 1.08);
      expect(enemy.attackCooldown).toBeGreaterThanOrEqual(0.85 * profile.enemyFireCooldownScale);
      expect(Math.abs(enemy.mesh.position.x)).toBeLessThan(arenaHalf - ENEMY_BODY.radius);
      expect(Math.abs(enemy.mesh.position.z)).toBeLessThan(arenaHalf - ENEMY_BODY.radius);

      expect(system.applyDamage(enemy, 999, new THREE.Vector3(1, 0, 0)).killed).toBe(true);
      for (let frame = 0; frame < 180; frame++) {
        system.update(0.05, new THREE.Vector3());
      }

      expect(enemy.alive).toBe(false);
      expect(enemy.mesh.visible).toBe(false);

      for (let frame = 0; frame < 180; frame++) {
        system.update(0.05, new THREE.Vector3());
      }
      expect(enemy.alive).toBe(false);
      expect(enemy.mesh.visible).toBe(false);
    } finally {
      system.dispose();
    }
  });
});
