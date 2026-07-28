import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEnemySystem } from "../src/game/combat/enemies";
import { ENEMY_BODY } from "../src/game/combat/enemyPhysics";

describe("level enemy waves", () => {
  test("creates the requested easy opening fighter and does not respawn a cleared wave", () => {
    const scene = new THREE.Scene();
    const arenaHalf = 16;
    const system = createEnemySystem(scene, {
      count: 1,
      baseHp: 58,
      baseSpeed: 3.15,
      damageScale: 0.52,
      fireCooldownScale: 1.42,
      accuracy: 0.4,
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
      expect(enemy.hp).toBe(58);
      expect(enemy.maxHp).toBe(58);
      expect(enemy.speed).toBeGreaterThanOrEqual(3.15 * 0.92);
      expect(enemy.speed).toBeLessThanOrEqual(3.15 * 1.08);
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
