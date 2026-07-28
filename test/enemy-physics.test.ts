import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { Collider } from "../src/game/types";
import {
  canEnemyOccupy,
  clampEnemyImpulse,
  ENEMY_BODY,
  findEnemySpawn,
  moveEnemyGrounded,
  separateEnemyBodies,
} from "../src/game/combat/enemyPhysics";

function collider(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Collider {
  return {
    min: new THREE.Vector3(minX, minY, minZ),
    max: new THREE.Vector3(maxX, maxY, maxZ),
  };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function planarDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("enemy grounded physics", () => {
  test("rejects non-finite, underground, out-of-bounds, and solid-overlap positions", () => {
    const wall = collider(-1, 0.05, -1, 1, 2.2, 1);
    const floorSlab = collider(-4, -0.1, -4, 4, ENEMY_BODY.skin, 4);

    expect(canEnemyOccupy(new THREE.Vector3(4, ENEMY_BODY.groundY, 4), [wall])).toBe(true);
    expect(canEnemyOccupy(new THREE.Vector3(0, ENEMY_BODY.groundY, 0), [wall])).toBe(false);
    expect(canEnemyOccupy(new THREE.Vector3(0, ENEMY_BODY.groundY, 0), [floorSlab])).toBe(true);
    expect(canEnemyOccupy(new THREE.Vector3(4, -0.02, 4), [])).toBe(false);
    expect(canEnemyOccupy(new THREE.Vector3(Infinity, 0, 0), [])).toBe(false);
    expect(canEnemyOccupy(new THREE.Vector3(ENEMY_BODY.mapHalf, 0, 0), [])).toBe(false);
  });

  test("uses a validated fallback when deterministic random samples are blocked", () => {
    const blockedCenter = collider(-2, 0.05, -2, 2, 2.2, 2);
    const player = new THREE.Vector3(18, 0, 18);
    const spawn = findEnemySpawn(
      player,
      new THREE.Vector3(),
      [blockedCenter],
      [],
      12,
      () => 0.5,
    ).clone();

    expect(canEnemyOccupy(spawn, [blockedCenter])).toBe(true);
    expect(spawn.y).toBe(ENEMY_BODY.groundY);
    expect(planarDistance(spawn, player)).toBeGreaterThanOrEqual(12);
  });

  test("fails explicitly rather than returning an invalid fully-blocked spawn", () => {
    const mapBlocker = collider(-100, 0.05, -100, 100, 3, 100);
    expect(() =>
      findEnemySpawn(
        new THREE.Vector3(),
        new THREE.Vector3(),
        [mapBlocker],
        [],
        12,
        seededRandom(7),
      ),
    ).toThrow("Enemy spawn invariant failed");
  });

  test("keeps seeded spawns clear of the current player and one another", () => {
    const player = new THREE.Vector3(11, 0, -9);
    const occupied: THREE.Vector3[] = [];
    const random = seededRandom(0x5eed);

    for (let i = 0; i < 24; i++) {
      const spawn = findEnemySpawn(player, new THREE.Vector3(), [], occupied, 12, random).clone();
      expect(planarDistance(spawn, player)).toBeGreaterThanOrEqual(12);
      expect(canEnemyOccupy(spawn, [])).toBe(true);
      for (const other of occupied) {
        expect(planarDistance(spawn, other)).toBeGreaterThanOrEqual(
          ENEMY_BODY.minimumSpacing * 1.35,
        );
      }
      occupied.push(spawn);
    }
  });

  test("swept movement cannot tunnel through a thin wall and retains wall sliding", () => {
    const thinWall = collider(-0.02, 0.04, -2, 0.02, 2.4, 2);
    const position = new THREE.Vector3(-2, 0, -1.5);

    moveEnemyGrounded(position, new THREE.Vector3(4, 0, 2.5), [thinWall]);

    expect(position.x).toBeLessThanOrEqual(
      thinWall.min.x - ENEMY_BODY.radius + ENEMY_BODY.skin + 1e-6,
    );
    expect(position.z).toBeGreaterThan(-1.5);
    expect(position.y).toBe(ENEMY_BODY.groundY);
    expect(canEnemyOccupy(position, [thinWall])).toBe(true);
  });

  test("movement enforces finite map bounds and exact ground support", () => {
    const movementLimit = ENEMY_BODY.mapHalf - ENEMY_BODY.radius - ENEMY_BODY.skin;
    const position = new THREE.Vector3(54, 7, 54);

    moveEnemyGrounded(position, new THREE.Vector3(1_000, 99, 1_000), []);
    expect(position.x).toBeLessThanOrEqual(movementLimit);
    expect(position.z).toBeLessThanOrEqual(movementLimit);
    expect(position.y).toBe(ENEMY_BODY.groundY);
    expect(canEnemyOccupy(position, [])).toBe(true);

    moveEnemyGrounded(position, new THREE.Vector3(Number.NaN, 1, Infinity), []);
    expect(position.toArray().every(Number.isFinite)).toBe(true);
    expect(position.y).toBe(ENEMY_BODY.groundY);
  });

  test("separates exact-overlap bodies without NaN or loss of ground contact", () => {
    const bodies = [
      { id: 3, position: new THREE.Vector3(4, 0, 4) },
      { id: 8, position: new THREE.Vector3(4, 0, 4) },
    ];

    separateEnemyBodies(bodies, []);

    expect(planarDistance(bodies[0]!.position, bodies[1]!.position)).toBeGreaterThanOrEqual(
      ENEMY_BODY.minimumSpacing - 1e-6,
    );
    for (const body of bodies) {
      expect(body.position.toArray().every(Number.isFinite)).toBe(true);
      expect(body.position.y).toBe(ENEMY_BODY.groundY);
      expect(canEnemyOccupy(body.position, [])).toBe(true);
    }
  });

  test("clamps hit impulse to a finite planar velocity", () => {
    const velocity = new THREE.Vector3(100, 45, -70);
    clampEnemyImpulse(velocity, 6);

    expect(velocity.y).toBe(0);
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(6 + 1e-9);
    expect(velocity.toArray().every(Number.isFinite)).toBe(true);

    velocity.set(Number.NaN, Infinity, 4);
    clampEnemyImpulse(velocity, 6);
    expect(velocity.toArray()).toEqual([0, 0, 0]);
  });
});
