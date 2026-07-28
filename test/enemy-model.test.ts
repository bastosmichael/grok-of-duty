import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  createEnemyModel,
  poseEnemyDeath,
  poseEnemyModel,
  resetEnemyModelPose,
} from "../src/game/combat/enemyModel";

const FLOOR_TOLERANCE = 1e-6;

function boundsFor(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(root);
}

function expectGroundSafe(root: THREE.Object3D): void {
  const bounds = boundsFor(root);
  expect(Number.isFinite(bounds.min.y)).toBe(true);
  expect(bounds.min.y).toBeGreaterThanOrEqual(-FLOOR_TOLERANCE);
}

describe("enemy articulated model contact", () => {
  test("neutral and full gait poses keep the rendered operator above ground", () => {
    const model = createEnemyModel(1);
    try {
      resetEnemyModelPose(model.rig);
      expectGroundSafe(model.root);

      for (let i = 0; i <= 64; i++) {
        poseEnemyModel(model.rig, {
          gaitPhase: (i / 64) * Math.PI * 2,
          locomotion: 1,
          aim: i % 2,
          recoil: (i % 5) / 4,
          flinch: (i % 7) / 6,
          flinchYaw: (i / 64) * Math.PI * 2,
        });
        expectGroundSafe(model.root);
      }
    } finally {
      model.dispose();
    }
  });

  test("every sampled death pose stays grounded without mutating the locomotion root", () => {
    const model = createEnemyModel(2);
    try {
      model.root.position.set(7, 0, -3);
      model.root.rotation.set(0, 1.17, 0);
      const expectedPosition = model.root.position.clone();
      const expectedYaw = model.root.rotation.y;

      for (const side of [-1, 1] as const) {
        for (let i = 0; i <= 80; i++) {
          poseEnemyDeath(model.rig, i / 80, side);
          expectGroundSafe(model.root);
          expect(model.root.position.toArray()).toEqual(expectedPosition.toArray());
          expect(model.root.rotation.x).toBe(0);
          expect(model.root.rotation.y).toBe(expectedYaw);
          expect(model.root.rotation.z).toBe(0);
        }
      }
    } finally {
      model.dispose();
    }
  });

  test("dispose is idempotent and releases the model once", () => {
    const model = createEnemyModel();
    let materialDisposeEvents = 0;
    model.materials[0]!.addEventListener("dispose", () => {
      materialDisposeEvents += 1;
    });

    expect(() => {
      model.dispose();
      model.dispose();
    }).not.toThrow();
    expect(materialDisposeEvents).toBe(1);
    expect(model.root.children).toHaveLength(0);
  });
});
