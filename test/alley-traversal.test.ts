import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { createCombat } from "../src/game/combat/createCombat";
import { createAlleyTraversalThreat } from "../src/game/combat/traversal";
import type { GameHudState } from "../src/game/types";

describe("generative alley traversal pressure", () => {
  test("adds two contacts for each generated block reached", () => {
    expect(createAlleyTraversalThreat(0, 6, 1)).toEqual({
      band: 0,
      district: 1,
      targetFighters: 6,
      concurrentAttackers: 1,
    });
    expect(createAlleyTraversalThreat(40, 6, 1)).toEqual({
      band: 1,
      district: 2,
      targetFighters: 8,
      concurrentAttackers: 1,
    });
    expect(createAlleyTraversalThreat(123, 6, 1)).toEqual({
      band: 3,
      district: 4,
      targetFighters: 12,
      concurrentAttackers: 1,
    });
  });

  test("unlocks fire lanes slowly and caps total pressure", () => {
    const deep = createAlleyTraversalThreat(10_000, 30, 4);
    expect(deep.targetFighters).toBe(40);
    expect(deep.concurrentAttackers).toBe(6);
  });

  test("sanitizes invalid traversal values", () => {
    expect(createAlleyTraversalThreat(Number.NaN, 6, 1).district).toBe(1);
    expect(createAlleyTraversalThreat(-100, 6, 1).targetFighters).toBe(6);
  });

  test("adds a generated patrol when the player reaches the next district", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const player = new THREE.Vector3();
    const generatedSpawns = Array.from(
      { length: 18 },
      (_, index) => new THREE.Vector3((index % 3) * 2 - 2, 0, -12 - index * 3),
    );
    let distance = 0;
    let hud: Partial<GameHudState> = {};
    const combat = createCombat({
      scene,
      camera,
      mode: "alley",
      onHud: (partial) => {
        hud = { ...hud, ...partial };
      },
      onPlayerDamage: () => {},
      colliders: [],
      enemySpawnPoints: generatedSpawns,
      getTraversalDistance: () => distance,
      getReinforcementSpawnPoints: () => generatedSpawns,
    });

    try {
      expect(hud.hostilesTotal).toBe(6);
      expect(hud.district).toBe(1);

      distance = 40;
      combat.update(0.016, player);
      expect(hud.hostilesTotal).toBe(8);
      expect(hud.hostilesRemaining).toBe(8);
      expect(hud.district).toBe(2);
    } finally {
      combat.dispose();
    }
  });
});
