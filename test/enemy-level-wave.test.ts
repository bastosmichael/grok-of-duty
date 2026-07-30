import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createEnemySystem } from "../src/game/combat/enemies";
import { ENEMY_BODY } from "../src/game/combat/enemyPhysics";
import { createLevelProfile } from "../src/game/combat/levels";

describe("level enemy waves", () => {
  test("creates the requested opening patrol and does not respawn a cleared fighter", () => {
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
      expect(enemies).toHaveLength(6);
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

  test("creates the restored full legacy-range squad", () => {
    const scene = new THREE.Scene();
    const profile = createLevelProfile(1, () => 0, "range");
    const system = createEnemySystem(scene, {
      count: profile.fighterCount,
      baseHp: profile.enemyHp,
      baseSpeed: profile.enemySpeed,
      damageScale: profile.enemyDamageScale,
      fireCooldownScale: profile.enemyFireCooldownScale,
      accuracy: profile.enemyAccuracy,
      maxConcurrentAttackers: profile.concurrentAttackers,
      arenaHalfSize: profile.arenaHalfSize,
      playerClearRadius: profile.playerClearRadius,
      respawn: false,
      colliders: [],
      onPlayerDamage: () => {},
    });

    try {
      expect(system.getEnemies()).toHaveLength(10);
      expect(system.getEnemies().every((enemy) => enemy.alive)).toBe(true);
    } finally {
      system.dispose();
    }
  });

  test("uses playable street candidates instead of spawning contacts beyond the alley", () => {
    const scene = new THREE.Scene();
    const spawnPoints = [
      new THREE.Vector3(-2, 0, -8),
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(2, 0, -12),
    ];
    const system = createEnemySystem(scene, {
      count: 3,
      arenaHalfSize: 20,
      playerClearRadius: 4,
      respawn: false,
      colliders: [],
      spawnPoints,
      onPlayerDamage: () => {},
    });

    try {
      const authored = new Set(spawnPoints.map((point) => `${point.x},${point.z}`));
      expect(system.getEnemies()).toHaveLength(3);
      for (const enemy of system.getEnemies()) {
        expect(authored.has(`${enemy.mesh.position.x},${enemy.mesh.position.z}`)).toBe(true);
      }
    } finally {
      system.dispose();
    }
  });

  test("adds generated reinforcements at newly streamed street positions", () => {
    const scene = new THREE.Scene();
    const system = createEnemySystem(scene, {
      count: 1,
      arenaHalfSize: 80,
      playerClearRadius: 4,
      respawn: false,
      colliders: [],
      spawnPoints: [new THREE.Vector3(0, 0, -10)],
      onPlayerDamage: () => {},
    });
    const generatedStreet = [
      new THREE.Vector3(-3, 0, -42),
      new THREE.Vector3(0, 0, -44),
      new THREE.Vector3(3, 0, -46),
    ];

    try {
      const added = system.addEnemies(2, new THREE.Vector3(), generatedStreet);
      const authored = new Set(generatedStreet.map((point) => `${point.x},${point.z}`));

      expect(system.getEnemies()).toHaveLength(3);
      expect(added).toHaveLength(2);
      for (const enemy of added) {
        expect(authored.has(`${enemy.mesh.position.x},${enemy.mesh.position.z}`)).toBe(true);
      }
    } finally {
      system.dispose();
    }
  });

  test("recycles contacts left behind by streaming into generated streets ahead", () => {
    const scene = new THREE.Scene();
    const system = createEnemySystem(scene, {
      count: 1,
      arenaHalfSize: 100,
      playerClearRadius: 4,
      respawn: false,
      colliders: [],
      spawnPoints: [new THREE.Vector3(0, 0, -10)],
      onPlayerDamage: () => {},
    });
    const forwardStreet = [new THREE.Vector3(-2, 0, -30), new THREE.Vector3(2, 0, -32)];

    try {
      const enemy = system.getEnemies()[0]!;
      enemy.mesh.position.set(75, 0, 75);
      expect(system.relocateDistantEnemies(50, new THREE.Vector3(), forwardStreet)).toBe(1);
      expect(
        forwardStreet.some(
          (point) => point.x === enemy.mesh.position.x && point.z === enemy.mesh.position.z,
        ),
      ).toBe(true);
      expect(enemy.mesh.position.y).toBe(ENEMY_BODY.groundY);
    } finally {
      system.dispose();
    }
  });
});
