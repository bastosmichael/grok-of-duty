import * as THREE from "three";
import type { TrainingMode } from "@/game/modes";
import type { Collider } from "@/game/types";
import { createCityStream, setCityLampFactor, type CityStreamApi } from "./cityStream";
import { createLegacyRange } from "./legacyRange";

export type WorldApi = {
  colliders: Collider[];
  /** Playable insertion points for enemies; empty worlds use validated random placement. */
  enemySpawnPoints: THREE.Vector3[];
  groundY: number;
  /** Session seed for procedural variety. */
  seed: number;
  /**
   * Stream city chunks around the player and apply any world-side animation.
   * Pass player position so far streets unload and new ones spawn.
   */
  update: (dt: number, elapsed: number, playerPos?: THREE.Vector3) => void;
  /** Open or close the nearest usable world door in the player's view. */
  interact: (origin: THREE.Vector3, direction: THREE.Vector3) => boolean;
  /** Apply day/night lamp factor (0 night lamps off → 1 full). */
  setLampFactor: (factor: number) => void;
  /** Star/sky group for day-night opacity. */
  starGroup: THREE.Group | null;
  dispose: () => void;
};

/**
 * Procedural streaming city: endless streets with cover, buildings, and lamps.
 * Chunks enter memory near the player and leave when far away.
 */
export function createWorld(scene: THREE.Scene, mode: TrainingMode = "alley"): WorldApi {
  if (mode === "range") return createLegacyRange(scene);

  const seed = (Math.random() * 0x7fffffff) | 0;
  const city: CityStreamApi = createCityStream(scene, seed);
  const fallbackPos = new THREE.Vector3();

  return {
    colliders: city.colliders,
    enemySpawnPoints: city.enemySpawnPoints,
    groundY: city.groundY,
    seed: city.seed,
    starGroup: city.starGroup,
    setLampFactor: (factor: number) => setCityLampFactor(scene, factor),
    update: (dt, elapsed, playerPos) => {
      city.update(dt, elapsed, playerPos ?? fallbackPos);
    },
    interact: (origin, direction) => city.interact(origin, direction),
    dispose: () => city.dispose(),
  };
}
