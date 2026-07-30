import * as THREE from "three";
import type { Collider } from "@/game/types";

const DOOR_HEIGHT = 2.4;
const DOOR_THICKNESS = 0.16;
const DOOR_SPEED = 11;
const MAX_INTERACTION_DISTANCE = 3.4;
const MAX_INTERACTION_OFFSET = 1.25;
const doorCenter = new THREE.Vector3();
const doorOffset = new THREE.Vector3();
const doorDirection = new THREE.Vector3();

export type InteractiveDoor = {
  pivot: THREE.Group;
  panel: THREE.Mesh;
  collider: Collider;
  colliderBounds: THREE.Box3;
  closedYaw: number;
  openYaw: number;
  targetOpen: boolean;
};

export function createInteractiveDoor({
  parent,
  panelMaterial,
  handleMaterial,
  hinge,
  yaw,
  side,
  width,
}: {
  parent: THREE.Group;
  panelMaterial: THREE.Material;
  handleMaterial: THREE.Material;
  hinge: THREE.Vector3;
  yaw: number;
  side: 1 | -1;
  width: number;
}): InteractiveDoor {
  const pivot = new THREE.Group();
  pivot.name = "InteractiveDoor";
  pivot.position.copy(hinge);
  pivot.rotation.y = yaw;

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_THICKNESS, DOOR_HEIGHT, width),
    panelMaterial,
  );
  panel.name = "DoorPanel";
  panel.position.set(0, DOOR_HEIGHT / 2, width / 2);
  panel.castShadow = true;
  panel.receiveShadow = true;
  pivot.add(panel);

  for (const face of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), handleMaterial);
    handle.name = "DoorHandle";
    handle.position.set(face * (DOOR_THICKNESS / 2 + 0.035), 1.05, width * 0.78);
    pivot.add(handle);
  }

  parent.add(pivot);
  const colliderBounds = new THREE.Box3();
  const collider: Collider = {
    min: new THREE.Vector3(),
    max: new THREE.Vector3(),
  };
  const door: InteractiveDoor = {
    pivot,
    panel,
    collider,
    colliderBounds,
    closedYaw: yaw,
    openYaw: yaw + side * Math.PI * 0.5,
    targetOpen: false,
  };
  syncDoorCollider(door);
  return door;
}

export function syncDoorCollider(door: InteractiveDoor): void {
  door.pivot.updateMatrixWorld(true);
  door.colliderBounds.setFromObject(door.panel);
  door.collider.min.copy(door.colliderBounds.min);
  door.collider.max.copy(door.colliderBounds.max);
}

export function updateInteractiveDoor(door: InteractiveDoor, dt: number): void {
  const targetYaw = door.targetOpen ? door.openYaw : door.closedYaw;
  door.pivot.rotation.y = THREE.MathUtils.damp(door.pivot.rotation.y, targetYaw, DOOR_SPEED, dt);
  syncDoorCollider(door);
}

/**
 * Toggle the closest door in a short view cone. Door selection lives in the
 * world layer so desktop and touch players share exactly the same behavior.
 */
export function findNearestInteractiveDoor(
  doors: Iterable<InteractiveDoor>,
  origin: Readonly<THREE.Vector3>,
  direction: Readonly<THREE.Vector3>,
): InteractiveDoor | null {
  let selected: InteractiveDoor | null = null;
  let bestScore = Infinity;
  doorDirection.copy(direction).normalize();

  for (const door of doors) {
    door.panel.getWorldPosition(doorCenter);
    doorOffset.copy(doorCenter).sub(origin);
    const forwardDistance = doorOffset.dot(doorDirection);
    if (forwardDistance <= 0 || forwardDistance > MAX_INTERACTION_DISTANCE) continue;
    const sideDistanceSq = Math.max(0, doorOffset.lengthSq() - forwardDistance * forwardDistance);
    if (sideDistanceSq > MAX_INTERACTION_OFFSET * MAX_INTERACTION_OFFSET) continue;
    const score = forwardDistance + Math.sqrt(sideDistanceSq) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      selected = door;
    }
  }

  return selected;
}

export function getDoorInteractionPrompt(
  doors: Iterable<InteractiveDoor>,
  origin: Readonly<THREE.Vector3>,
  direction: Readonly<THREE.Vector3>,
): "Open door" | "Close door" | null {
  const door = findNearestInteractiveDoor(doors, origin, direction);
  if (!door) return null;
  return door.targetOpen ? "Close door" : "Open door";
}

export function interactWithNearestDoor(
  doors: Iterable<InteractiveDoor>,
  origin: Readonly<THREE.Vector3>,
  direction: Readonly<THREE.Vector3>,
): boolean {
  const selected = findNearestInteractiveDoor(doors, origin, direction);
  if (!selected) return false;
  selected.targetOpen = !selected.targetOpen;
  return true;
}
