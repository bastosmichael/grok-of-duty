import * as THREE from "three";
import type { Collider } from "@/game/types";
import {
  createWorldMaterials,
  makeBarrel,
  makeBuilding,
  makeCollider,
  makeContainer,
  makeCrate,
  makeJerseyBarrier,
  makeSandbags,
  makeStarfieldAndMoon,
  type PropResult,
  type WorldMaterials,
} from "./props";

/** Size of one streamed city cell (meters). */
export const CITY_CHUNK = 44;
/** Keep this many rings of chunks around the player. */
const KEEP_RADIUS = 2;
/** Road half-width from center line. */
const ROAD_HALF = 5.2;
/** Sidewalk strip outside the road. */
const SIDEWALK = 2.2;

export type CityStreamApi = {
  colliders: Collider[];
  groundY: number;
  seed: number;
  starGroup: THREE.Group | null;
  update: (dt: number, elapsed: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
};

type ChunkRecord = {
  key: string;
  cx: number;
  cz: number;
  group: THREE.Group;
  colliders: Collider[];
  lamps: THREE.PointLight[];
};

function hash2(cx: number, cz: number, seed: number): number {
  let h = (cx * 374761393 + cz * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h >>> 0) / 4294967296;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      // Materials are shared kit — do not dispose
    }
    const light = child as THREE.Light;
    if ((light as THREE.PointLight).isLight) {
      // parent remove is enough
    }
  });
}

function addPropLocal(
  group: THREE.Group,
  colliders: Collider[],
  prop: PropResult,
): void {
  group.add(prop.group);
  colliders.push(...prop.colliders);
}

/**
 * Build one city cell: cross-streets through the center, buildings in quadrants,
 * roadside cover. Style varies by hash so every playthrough / district feels new.
 */
function buildChunk(
  cx: number,
  cz: number,
  seed: number,
  mats: WorldMaterials,
): ChunkRecord {
  const rnd = mulberry32((hash2(cx, cz, seed) * 1e9) | 0);
  const group = new THREE.Group();
  group.name = `CityChunk_${cx}_${cz}`;
  const colliders: Collider[] = [];
  const lamps: THREE.PointLight[] = [];

  const ox = cx * CITY_CHUNK;
  const oz = cz * CITY_CHUNK;
  const mid = CITY_CHUNK * 0.5;

  // District flavor
  const district = Math.floor(hash2(cx, cz, seed + 3) * 4);
  const buildingColors = [
    { c: 0xc8c0b4, d: 0x9a9088 }, // concrete
    { c: 0xb0b8c0, d: 0x788088 }, // grey
    { c: 0xc4b49a, d: 0x8a7860 }, // sand
    { c: 0xa8b0a0, d: 0x6a7868 }, // olive
  ][district]!;

  // Ground asphalt for whole cell
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_CHUNK, CITY_CHUNK),
    mats.asphalt,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ox + mid, 0, oz + mid);
  ground.receiveShadow = true;
  group.add(ground);

  // Center cross roads — continuous grid (every cell has NS + EW street)
  // Mark road with slightly different hazard lines / sidewalks
  const roadMat = mats.asphalt;
  const nsRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, CITY_CHUNK),
    roadMat,
  );
  nsRoad.rotation.x = -Math.PI / 2;
  nsRoad.position.set(ox + mid, 0.01, oz + mid);
  nsRoad.receiveShadow = true;
  group.add(nsRoad);

  const ewRoad = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_CHUNK, ROAD_HALF * 2),
    roadMat,
  );
  ewRoad.rotation.x = -Math.PI / 2;
  ewRoad.position.set(ox + mid, 0.012, oz + mid);
  ewRoad.receiveShadow = true;
  group.add(ewRoad);

  // Yellow center lines
  const lineMat = mats.hazard;
  for (let i = 0; i < 5; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.6), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(ox + mid, 0.02, oz + 6 + i * 8);
    group.add(dash);
  }
  for (let i = 0; i < 5; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.18), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(ox + 6 + i * 8, 0.021, oz + mid);
    group.add(dash);
  }

  // Sidewalks along roads
  const walkMat = mats.concrete;
  const walkW = SIDEWALK;
  const sidewalks: Array<{ x: number; z: number; w: number; d: number }> = [
    { x: ox + mid - ROAD_HALF - walkW / 2, z: oz + mid, w: walkW, d: CITY_CHUNK },
    { x: ox + mid + ROAD_HALF + walkW / 2, z: oz + mid, w: walkW, d: CITY_CHUNK },
    { x: ox + mid, z: oz + mid - ROAD_HALF - walkW / 2, w: CITY_CHUNK, d: walkW },
    { x: ox + mid, z: oz + mid + ROAD_HALF + walkW / 2, w: CITY_CHUNK, d: walkW },
  ];
  for (const s of sidewalks) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.12, s.d), walkMat);
    mesh.position.set(s.x, 0.06, s.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Four building lots (quadrants), inset from roads
  const inset = ROAD_HALF + SIDEWALK + 1.2;
  const lotMin = inset;
  const lotMax = CITY_CHUNK - inset;
  const lots = [
    { x0: lotMin, z0: lotMin, x1: mid - ROAD_HALF - SIDEWALK - 0.5, z1: mid - ROAD_HALF - SIDEWALK - 0.5 },
    { x0: mid + ROAD_HALF + SIDEWALK + 0.5, z0: lotMin, x1: lotMax, z1: mid - ROAD_HALF - SIDEWALK - 0.5 },
    { x0: lotMin, z0: mid + ROAD_HALF + SIDEWALK + 0.5, x1: mid - ROAD_HALF - SIDEWALK - 0.5, z1: lotMax },
    { x0: mid + ROAD_HALF + SIDEWALK + 0.5, z0: mid + ROAD_HALF + SIDEWALK + 0.5, x1: lotMax, z1: lotMax },
  ];

  for (const lot of lots) {
    const w = lot.x1 - lot.x0;
    const d = lot.z1 - lot.z0;
    if (w < 6 || d < 6) continue;

    const density = 0.55 + rnd() * 0.4;
    const buildings = 1 + Math.floor(rnd() * (density > 0.75 ? 3 : 2));
    for (let b = 0; b < buildings; b++) {
      const bw = 4 + rnd() * Math.min(10, w - 2);
      const bd = 4 + rnd() * Math.min(10, d - 2);
      const bh = 4 + rnd() * 14;
      const bx = lot.x0 + bw / 2 + rnd() * Math.max(0.1, w - bw);
      const bz = lot.z0 + bd / 2 + rnd() * Math.max(0.1, d - bd);
      const worldX = ox + bx;
      const worldZ = oz + bz;

      // Fake footprint as building using makeBuilding if possible, else box
      try {
        addPropLocal(
          group,
          colliders,
          makeBuilding(mats, {
            x: worldX,
            z: worldZ,
            w: bw,
            d: bd,
            h: bh,
            rotY: (Math.floor(rnd() * 4) * Math.PI) / 2,
          }),
        );
      } catch {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          rnd() > 0.5 ? mats.concrete : mats.concreteDark,
        );
        box.position.set(worldX, bh / 2, worldZ);
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
        colliders.push(makeCollider(worldX, bh / 2, worldZ, bw / 2, bh / 2, bd / 2, 0.05));
      }

      // Windows glow already on makeBuilding; add random AC unit / roof junk
      if (rnd() > 0.55) {
        const junk = new THREE.Mesh(
          new THREE.BoxGeometry(1.2 + rnd(), 0.8, 1 + rnd()),
          mats.metal,
        );
        junk.position.set(worldX + (rnd() - 0.5) * bw * 0.3, bh + 0.4, worldZ + (rnd() - 0.5) * bd * 0.3);
        junk.castShadow = true;
        group.add(junk);
      }
    }

    void buildingColors;
  }

  // Roadside cover — sandbags, jersey barriers, crates, containers, barrels
  const coverBudget = 6 + Math.floor(rnd() * 8);
  for (let i = 0; i < coverBudget; i++) {
    const alongNS = rnd() > 0.5;
    const side = rnd() > 0.5 ? 1 : -1;
    const t = 4 + rnd() * (CITY_CHUNK - 8);
    let x: number;
    let z: number;
    let rotY = 0;
    if (alongNS) {
      x = ox + mid + side * (ROAD_HALF + 1.4 + rnd() * 1.2);
      z = oz + t;
      rotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = ox + t;
      z = oz + mid + side * (ROAD_HALF + 1.4 + rnd() * 1.2);
      rotY = side > 0 ? 0 : Math.PI;
    }

    // Keep cover off the pure intersection center
    if (Math.abs(x - (ox + mid)) < ROAD_HALF + 0.5 && Math.abs(z - (oz + mid)) < ROAD_HALF + 0.5) {
      continue;
    }

    const kind = rnd();
    if (kind < 0.22) {
      addPropLocal(group, colliders, makeSandbags(mats, { x, z, rotY, rows: 1 + Math.floor(rnd() * 2) }));
    } else if (kind < 0.4) {
      addPropLocal(group, colliders, makeJerseyBarrier(mats, { x, z, rotY: rotY + (rnd() - 0.5) * 0.2 }));
    } else if (kind < 0.55) {
      addPropLocal(group, colliders, makeCrate(mats, { x, z, rotY: rnd() * Math.PI, scale: 0.8 + rnd() * 0.5 }));
    } else if (kind < 0.7) {
      addPropLocal(
        group,
        colliders,
        makeContainer(mats, {
          x,
          z,
          rotY: rotY + Math.PI / 2 * Math.floor(rnd() * 2),
          color: (["olive", "rust", "navy"] as const)[Math.floor(rnd() * 3)]!,
        }),
      );
    } else if (kind < 0.85) {
      addPropLocal(
        group,
        colliders,
        makeBarrel(mats, { x, z, color: rnd() > 0.5 ? "blue" : "yellow" }),
      );
    } else {
      // Parked van / car block as cover
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.3, 4.5),
        rnd() > 0.5 ? mats.metalNavy : mats.metalRust,
      );
      car.position.set(x, 0.65, z);
      car.rotation.y = rotY + (rnd() - 0.5) * 0.15;
      car.castShadow = true;
      car.receiveShadow = true;
      group.add(car);
      colliders.push(makeCollider(x, 0.65, z, 1.2, 0.65, 2.3, 0.08));
    }
  }

  // Street lamps at intersection corners
  const lampOffsets = [
    [ROAD_HALF + 1.5, ROAD_HALF + 1.5],
    [-ROAD_HALF - 1.5, ROAD_HALF + 1.5],
    [ROAD_HALF + 1.5, -ROAD_HALF - 1.5],
    [-ROAD_HALF - 1.5, -ROAD_HALF - 1.5],
  ];
  for (const [lx, lz] of lampOffsets) {
    const px = ox + mid + lx;
    const pz = oz + mid + lz;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6), mats.metal);
    pole.position.set(px, 2.75, pz);
    pole.castShadow = true;
    group.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mats.lampOrange);
    head.position.set(px, 5.4, pz);
    group.add(head);
    const light = new THREE.PointLight(0xffb060, 0, 22, 2);
    light.position.set(px, 5.2, pz);
    light.userData.baseIntensity = 120 + rnd() * 40;
    group.add(light);
    lamps.push(light);
  }

  // Corner traffic cabinet / bollards for variety
  if (rnd() > 0.4) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.5), mats.metal);
    cab.position.set(ox + mid + ROAD_HALF + 2.5, 0.7, oz + mid + ROAD_HALF + 2.2);
    cab.castShadow = true;
    group.add(cab);
    colliders.push(
      makeCollider(cab.position.x, 0.7, cab.position.z, 0.45, 0.7, 0.3, 0.05),
    );
  }

  return { key: chunkKey(cx, cz), cx, cz, group, colliders, lamps };
}

/**
 * Streaming Manhattan-style city: chunks spawn around the player and unload
 * when far away so memory stays bounded and every run is different.
 */
export function createCityStream(scene: THREE.Scene, seed = (Math.random() * 1e9) | 0): CityStreamApi {
  const mats = createWorldMaterials();
  const colliders: Collider[] = [];
  const chunks = new Map<string, ChunkRecord>();
  const worldRoot = new THREE.Group();
  worldRoot.name = "CityStream";
  scene.add(worldRoot);

  // Sky props (stars/moon) — faded by day/night cycle
  const sky = makeStarfieldAndMoon(mats);
  scene.add(sky.group);
  const starGroup = sky.group;

  let lastCx = Number.NaN;
  let lastCz = Number.NaN;

  const rebuildColliders = (): void => {
    colliders.length = 0;
    for (const ch of chunks.values()) {
      colliders.push(...ch.colliders);
    }
  };

  const ensureChunk = (cx: number, cz: number): void => {
    const key = chunkKey(cx, cz);
    if (chunks.has(key)) return;
    const rec = buildChunk(cx, cz, seed, mats);
    worldRoot.add(rec.group);
    chunks.set(key, rec);
  };

  const unloadFar = (pcx: number, pcz: number): void => {
    const toRemove: string[] = [];
    for (const [key, ch] of chunks) {
      if (Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz)) > KEEP_RADIUS) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      const ch = chunks.get(key)!;
      worldRoot.remove(ch.group);
      disposeObject(ch.group);
      chunks.delete(key);
    }
  };

  // Bootstrap around origin
  for (let dz = -KEEP_RADIUS; dz <= KEEP_RADIUS; dz++) {
    for (let dx = -KEEP_RADIUS; dx <= KEEP_RADIUS; dx++) {
      ensureChunk(dx, dz);
    }
  }
  rebuildColliders();
  lastCx = 0;
  lastCz = 0;

  const update = (_dt: number, _elapsed: number, playerPos: THREE.Vector3): void => {
    const pcx = Math.floor(playerPos.x / CITY_CHUNK);
    const pcz = Math.floor(playerPos.z / CITY_CHUNK);
    if (pcx === lastCx && pcz === lastCz) return;
    lastCx = pcx;
    lastCz = pcz;

    for (let dz = -KEEP_RADIUS; dz <= KEEP_RADIUS; dz++) {
      for (let dx = -KEEP_RADIUS; dx <= KEEP_RADIUS; dx++) {
        ensureChunk(pcx + dx, pcz + dz);
      }
    }
    unloadFar(pcx, pcz);
    rebuildColliders();
  };

  const setLampFactor = (factor: number): void => {
    for (const ch of chunks.values()) {
      for (const lamp of ch.lamps) {
        const base = (lamp.userData.baseIntensity as number) ?? 120;
        lamp.intensity = base * factor;
      }
    }
  };

  // Expose lamp control via userData for lighting system
  worldRoot.userData.setLampFactor = setLampFactor;
  worldRoot.userData.getChunks = () => chunks;

  const dispose = (): void => {
    for (const ch of chunks.values()) {
      worldRoot.remove(ch.group);
      disposeObject(ch.group);
    }
    chunks.clear();
    colliders.length = 0;
    scene.remove(worldRoot);
    scene.remove(starGroup);
    disposeObject(starGroup);
    mats.dispose();
  };

  return {
    colliders,
    groundY: 0,
    seed,
    starGroup,
    update,
    dispose,
  };
}

/** Apply night lamp brightness to all streamed street lights. */
export function setCityLampFactor(scene: THREE.Scene, factor: number): void {
  const root = scene.getObjectByName("CityStream");
  const fn = root?.userData?.setLampFactor as ((f: number) => void) | undefined;
  fn?.(factor);
}
