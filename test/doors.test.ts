import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  createInteractiveDoor,
  interactWithNearestDoor,
  updateInteractiveDoor,
} from "../src/game/world/doors";

describe("interactive city doors", () => {
  test("opens and closes the nearest door in the player's view", () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const door = createInteractiveDoor({
      parent,
      panelMaterial: material,
      handleMaterial: material,
      hinge: new THREE.Vector3(0, 0, -2),
      yaw: 0,
      side: 1,
      width: 2,
    });
    const origin = new THREE.Vector3(0, 1.5, 0);
    const direction = new THREE.Vector3(0, 0, -1);

    expect(interactWithNearestDoor([door], origin, direction)).toBe(true);
    expect(door.targetOpen).toBe(true);
    const closedCollider = door.collider.max.x - door.collider.min.x;
    updateInteractiveDoor(door, 1);
    expect(door.pivot.rotation.y).toBeCloseTo(Math.PI / 2, 3);
    expect(door.collider.max.x - door.collider.min.x).toBeGreaterThan(closedCollider);

    expect(interactWithNearestDoor([door], origin, direction)).toBe(true);
    expect(door.targetOpen).toBe(false);
    updateInteractiveDoor(door, 1);
    expect(door.pivot.rotation.y).toBeCloseTo(0, 3);

    material.dispose();
  });

  test("ignores doors outside the interaction cone", () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const door = createInteractiveDoor({
      parent,
      panelMaterial: material,
      handleMaterial: material,
      hinge: new THREE.Vector3(5, 0, -2),
      yaw: 0,
      side: 1,
      width: 2,
    });

    expect(
      interactWithNearestDoor([door], new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, -1)),
    ).toBe(false);
    expect(door.targetOpen).toBe(false);

    material.dispose();
  });
});
