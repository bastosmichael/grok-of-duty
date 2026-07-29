import * as THREE from "three";
import type { Collider } from "@/game/types";
import {
  createWorldMaterials,
  makeBarrel,
  makeCollider,
  makeCrate,
  makeJerseyBarrier,
  makeSandbags,
  makeStarfieldAndMoon,
  type PropResult,
  type WorldMaterials,
} from "./props";

/** How far ahead (meters along graph) we keep streets generated. */
const STREAM_AHEAD = 90;
/** How far behind the player streets are culled. */
const STREAM_BEHIND = 70;
/** Max active street segments in memory. */
const MAX_SEGMENTS = 28;

export type CityStreamApi = {
  colliders: Collider[];
  groundY: number;
  seed: number;
  starGroup: THREE.Group | null;
  update: (dt: number, elapsed: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
};

type JunctionKind = "straight" | "left" | "right" | "t" | "cross" | "end_with_lobby";

type Segment = {
  id: string;
  /** World-space transform: local +Z is down the street. */
  origin: THREE.Vector3;
  yaw: number;
  length: number;
  width: number;
  /** Depth of building mass on each side. */
  buildingDepth: number;
  buildingHeightL: number;
  buildingHeightR: number;
  hasDoorL: boolean;
  hasDoorR: boolean;
  interiorL: boolean;
  interiorR: boolean;
  group: THREE.Group;
  colliders: Collider[];
  lamps: THREE.PointLight[];
  /** Child segment ids generated from the far end. */
  nextIds: string[];
  /** Parent id (for culling direction). */
  parentId: string | null;
  /** Distance from spawn along the graph (approx). */
  pathDist: number;
};

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
}

function localToWorld(
  origin: THREE.Vector3,
  yaw: number,
  lx: number,
  ly: number,
  lz: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // local X right, Z forward
  return out.set(origin.x + c * lx + s * lz, ly, origin.z - s * lx + c * lz);
}

function addProp(group: THREE.Group, colliders: Collider[], prop: PropResult): void {
  group.add(prop.group);
  colliders.push(...prop.colliders);
}

function pickJunction(rnd: () => number, pathDist: number): JunctionKind {
  // Early path: more straights so the player learns the corridor
  if (pathDist < 40) return rnd() < 0.75 ? "straight" : rnd() < 0.5 ? "left" : "right";
  const r = rnd();
  if (r < 0.38) return "straight";
  if (r < 0.55) return "left";
  if (r < 0.72) return "right";
  if (r < 0.86) return "t";
  if (r < 0.95) return "cross";
  return "end_with_lobby";
}

/**
 * Solid building wall on one side of the street (local space then world colliders).
 * Optional door gap + interior room.
 */
function buildSideWall(
  group: THREE.Group,
  colliders: Collider[],
  mats: WorldMaterials,
  origin: THREE.Vector3,
  yaw: number,
  length: number,
  side: 1 | -1,
  streetHalf: number,
  buildingDepth: number,
  buildingHeight: number,
  hasDoor: boolean,
  interior: boolean,
  rnd: () => number,
): void {
  const wallFaceX = side * (streetHalf + 0.25);
  const doorW = 2.2;
  const doorZ0 = length * (0.35 + rnd() * 0.3);
  const doorZ1 = doorZ0 + doorW;

  const segments: Array<{ z0: number; z1: number }> = hasDoor
    ? [
        { z0: 0.15, z1: doorZ0 },
        { z0: doorZ1, z1: length - 0.15 },
      ]
    : [{ z0: 0.15, z1: length - 0.15 }];

  for (const seg of segments) {
    const zMid = (seg.z0 + seg.z1) / 2;
    const zLen = seg.z1 - seg.z0;
    if (zLen < 0.5) continue;

    // Facade slab
    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, buildingHeight, zLen),
      rnd() > 0.45 ? mats.concrete : mats.concreteDark,
    );
    const fw = localToWorld(origin, yaw, wallFaceX, buildingHeight / 2, zMid);
    facade.position.copy(fw);
    facade.rotation.y = yaw;
    facade.castShadow = true;
    facade.receiveShadow = true;
    group.add(facade);
    colliders.push(
      makeCollider(fw.x, buildingHeight / 2, fw.z, 0.4, buildingHeight / 2, zLen / 2 + 0.1, 0.06),
    );

    // Deep building mass behind facade (blocks line of sight / walking through)
    const massCenterX = side * (streetHalf + 0.25 + buildingDepth / 2);
    const mass = new THREE.Mesh(
      new THREE.BoxGeometry(buildingDepth, buildingHeight * 0.92, zLen * 0.98),
      mats.concreteDark,
    );
    const mw = localToWorld(origin, yaw, massCenterX, (buildingHeight * 0.92) / 2, zMid);
    mass.position.copy(mw);
    mass.rotation.y = yaw;
    mass.castShadow = true;
    mass.receiveShadow = true;
    group.add(mass);
    colliders.push(
      makeCollider(
        mw.x,
        (buildingHeight * 0.92) / 2,
        mw.z,
        buildingDepth / 2,
        (buildingHeight * 0.92) / 2,
        zLen / 2,
        0.05,
      ),
    );

    // Window strips (emissive panels)
    const floors = Math.max(1, Math.floor(buildingHeight / 3.2));
    for (let f = 0; f < floors; f++) {
      const winY = 1.6 + f * 3.0;
      if (winY > buildingHeight - 1) break;
      const nWin = Math.max(1, Math.floor(zLen / 3.5));
      for (let w = 0; w < nWin; w++) {
        if (rnd() < 0.2) continue;
        const wz = seg.z0 + 1.2 + (w + 0.5) * ((zLen - 2.4) / nWin);
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 1.3, 1.4),
          rnd() > 0.5 ? mats.windowWarm : mats.windowCyan,
        );
        const pw = localToWorld(origin, yaw, wallFaceX + side * 0.28, winY, wz);
        pane.position.copy(pw);
        pane.rotation.y = yaw;
        group.add(pane);
      }
    }
  }

  // Door opening + optional interior lobby
  if (hasDoor) {
    // Door frame pillars
    for (const z of [doorZ0, doorZ1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.35), mats.metal);
      const pp = localToWorld(origin, yaw, wallFaceX, 1.3, z);
      pillar.position.copy(pp);
      pillar.rotation.y = yaw;
      pillar.castShadow = true;
      group.add(pillar);
      colliders.push(makeCollider(pp.x, 1.3, pp.z, 0.25, 1.3, 0.25, 0.04));
    }
    // Lintels
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, doorW + 0.4), mats.concreteDark);
    const lp = localToWorld(origin, yaw, wallFaceX, 2.7, (doorZ0 + doorZ1) / 2);
    lintel.position.copy(lp);
    lintel.rotation.y = yaw;
    group.add(lintel);

    if (interior) {
      const roomDepth = 8 + rnd() * 6;
      const roomWidth = 7 + rnd() * 4;
      const roomH = 3.2;
      const roomCenterX = side * (streetHalf + 0.5 + roomDepth / 2);
      const roomCenterZ = (doorZ0 + doorZ1) / 2;

      // Floor
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(roomDepth, 0.15, roomWidth),
        mats.concrete,
      );
      const fp = localToWorld(origin, yaw, roomCenterX, 0.08, roomCenterZ);
      floor.position.copy(fp);
      floor.rotation.y = yaw;
      floor.receiveShadow = true;
      group.add(floor);

      // Three interior walls (back + two sides), opening toward street
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, roomH, roomWidth), mats.concreteDark);
      const bp = localToWorld(
        origin,
        yaw,
        side * (streetHalf + 0.5 + roomDepth),
        roomH / 2,
        roomCenterZ,
      );
      back.position.copy(bp);
      back.rotation.y = yaw;
      back.castShadow = true;
      group.add(back);
      colliders.push(makeCollider(bp.x, roomH / 2, bp.z, 0.35, roomH / 2, roomWidth / 2, 0.05));

      for (const sz of [-1, 1]) {
        const sideWall = new THREE.Mesh(
          new THREE.BoxGeometry(roomDepth, roomH, 0.4),
          mats.concrete,
        );
        const sp = localToWorld(
          origin,
          yaw,
          roomCenterX,
          roomH / 2,
          roomCenterZ + sz * (roomWidth / 2),
        );
        sideWall.position.copy(sp);
        sideWall.rotation.y = yaw;
        sideWall.castShadow = true;
        group.add(sideWall);
        colliders.push(makeCollider(sp.x, roomH / 2, sp.z, roomDepth / 2, roomH / 2, 0.3, 0.05));
      }

      // Interior cover crates
      const crateCount = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < crateCount; i++) {
        const lx = roomCenterX + side * (rnd() - 0.3) * roomDepth * 0.3;
        const lz = roomCenterZ + (rnd() - 0.5) * roomWidth * 0.5;
        const wp = localToWorld(origin, yaw, lx, 0, lz);
        addProp(
          group,
          colliders,
          makeCrate(mats, { x: wp.x, z: wp.z, scale: 0.7 + rnd() * 0.4, rotY: rnd() * Math.PI }),
        );
      }
    }
  }
}

function placeCoverAlongStreet(
  group: THREE.Group,
  colliders: Collider[],
  mats: WorldMaterials,
  origin: THREE.Vector3,
  yaw: number,
  length: number,
  streetHalf: number,
  rnd: () => number,
): void {
  const count = 4 + Math.floor(rnd() * 6);
  for (let i = 0; i < count; i++) {
    const z = 5 + rnd() * (length - 10);
    const side = rnd() > 0.5 ? 1 : -1;
    const x = side * (streetHalf - 1.6 - rnd() * 1.4);
    const wp = localToWorld(origin, yaw, x, 0, z);
    const rotY = yaw + (side > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.25;
    const kind = rnd();
    if (kind < 0.28) {
      addProp(
        group,
        colliders,
        makeSandbags(mats, {
          x: wp.x,
          z: wp.z,
          rotY,
          rows: 2 + Math.floor(rnd() * 2),
          length: 2.5 + rnd() * 2,
        }),
      );
    } else if (kind < 0.5) {
      addProp(group, colliders, makeJerseyBarrier(mats, { x: wp.x, z: wp.z, rotY }));
    } else if (kind < 0.72) {
      addProp(
        group,
        colliders,
        makeCrate(mats, { x: wp.x, z: wp.z, rotY: rnd() * Math.PI, scale: 0.85 + rnd() * 0.4 }),
      );
    } else if (kind < 0.88) {
      addProp(
        group,
        colliders,
        makeBarrel(mats, { x: wp.x, z: wp.z, color: rnd() > 0.5 ? "blue" : "yellow" }),
      );
    } else {
      // Car / van as hard cover
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 1.25, 4.2),
        rnd() > 0.5 ? mats.metalNavy : mats.metalRust,
      );
      car.position.set(wp.x, 0.62, wp.z);
      car.rotation.y = yaw + (rnd() - 0.5) * 0.2;
      car.castShadow = true;
      car.receiveShadow = true;
      group.add(car);
      colliders.push(makeCollider(wp.x, 0.62, wp.z, 1.15, 0.62, 2.15, 0.08));
    }
  }
}

function buildSegment(
  id: string,
  origin: THREE.Vector3,
  yaw: number,
  pathDist: number,
  parentId: string | null,
  seed: number,
  mats: WorldMaterials,
): Segment {
  const rnd = mulberry32(hashStr(id) ^ seed);
  const length = 28 + rnd() * 22;
  const width = 9 + rnd() * 3.5;
  const streetHalf = width / 2;
  const buildingDepth = 6 + rnd() * 8;
  const buildingHeightL = 6 + rnd() * 16;
  const buildingHeightR = 6 + rnd() * 16;
  const hasDoorL = rnd() > 0.45;
  const hasDoorR = rnd() > 0.45;
  const interiorL = hasDoorL && rnd() > 0.35;
  const interiorR = hasDoorR && rnd() > 0.35;

  const group = new THREE.Group();
  group.name = `Street_${id}`;
  const colliders: Collider[] = [];
  const lamps: THREE.PointLight[] = [];

  // Road bed
  const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, length), mats.asphalt);
  const roadCenter = localToWorld(origin, yaw, 0, 0.04, length / 2);
  road.position.copy(roadCenter);
  road.rotation.y = yaw;
  road.receiveShadow = true;
  group.add(road);

  // Center dashes
  const dashes = Math.floor(length / 5);
  for (let i = 0; i < dashes; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.5), mats.hazard);
    const dp = localToWorld(origin, yaw, 0, 0.1, 3 + i * 5);
    dash.position.copy(dp);
    dash.rotation.y = yaw;
    group.add(dash);
  }

  // Sidewalks
  for (const side of [-1, 1] as const) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, length), mats.concrete);
    const sp = localToWorld(origin, yaw, side * (streetHalf - 0.9), 0.07, length / 2);
    sw.position.copy(sp);
    sw.rotation.y = yaw;
    sw.receiveShadow = true;
    sw.castShadow = true;
    group.add(sw);
  }

  buildSideWall(
    group,
    colliders,
    mats,
    origin,
    yaw,
    length,
    -1,
    streetHalf,
    buildingDepth,
    buildingHeightL,
    hasDoorL,
    interiorL,
    rnd,
  );
  buildSideWall(
    group,
    colliders,
    mats,
    origin,
    yaw,
    length,
    1,
    streetHalf,
    buildingDepth,
    buildingHeightR,
    hasDoorR,
    interiorR,
    rnd,
  );

  placeCoverAlongStreet(group, colliders, mats, origin, yaw, length, streetHalf, rnd);

  // Street lamps along both sides
  const lampCount = 2 + Math.floor(length / 18);
  for (let i = 0; i < lampCount; i++) {
    const z = 6 + i * (length / lampCount);
    for (const side of [-1, 1] as const) {
      const lx = side * (streetHalf - 0.35);
      const base = localToWorld(origin, yaw, lx, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6), mats.metal);
      pole.position.set(base.x, 2.6, base.z);
      pole.castShadow = true;
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mats.lampOrange);
      head.position.set(base.x, 5.15, base.z);
      group.add(head);
      const light = new THREE.PointLight(0xffb060, 0, 20, 2);
      light.position.set(base.x, 5.0, base.z);
      light.userData.baseIntensity = 100 + rnd() * 40;
      group.add(light);
      lamps.push(light);
    }
  }

  return {
    id,
    origin: origin.clone(),
    yaw,
    length,
    width,
    buildingDepth,
    buildingHeightL,
    buildingHeightR,
    hasDoorL,
    hasDoorR,
    interiorL,
    interiorR,
    group,
    colliders,
    lamps,
    nextIds: [],
    parentId,
    pathDist,
  };
}

function farEnd(seg: Segment): { origin: THREE.Vector3; yaw: number } {
  const end = localToWorld(seg.origin, seg.yaw, 0, 0, seg.length);
  return { origin: end, yaw: seg.yaw };
}

/**
 * Corridor street streamer: always a street with buildings left/right.
 * Junctions branch into new streets; far segments unload. Optional building interiors.
 */
export function createCityStream(
  scene: THREE.Scene,
  seed = (Math.random() * 1e9) | 0,
): CityStreamApi {
  const mats = createWorldMaterials();
  const colliders: Collider[] = [];
  const segments = new Map<string, Segment>();
  const root = new THREE.Group();
  root.name = "CityStream";
  scene.add(root);

  const sky = makeStarfieldAndMoon(mats);
  scene.add(sky.group);

  let idCounter = 1;
  const nextId = () => `s${idCounter++}`;

  const rebuildColliders = (): void => {
    colliders.length = 0;
    for (const s of segments.values()) colliders.push(...s.colliders);
  };

  const addSegment = (seg: Segment): void => {
    root.add(seg.group);
    segments.set(seg.id, seg);
  };

  // Spawn corridor — long first street so you drop into an alley immediately
  const spawn = buildSegment(nextId(), new THREE.Vector3(0, 0, -6), 0, 0, null, seed, mats);
  addSegment(spawn);
  rebuildColliders();

  const expandFrom = (seg: Segment): void => {
    if (seg.nextIds.length > 0) return;
    const rnd = mulberry32(hashStr(seg.id + ":junc") ^ seed);
    const kind = pickJunction(rnd, seg.pathDist);
    const end = farEnd(seg);
    const halfW = seg.width / 2;

    // Junction plaza pad
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(seg.width + 4, 0.09, seg.width + 4),
      mats.asphalt,
    );
    pad.position.copy(end.origin);
    pad.position.y = 0.045;
    pad.rotation.y = end.yaw;
    pad.receiveShadow = true;
    seg.group.add(pad);

    const spawnChild = (yawOffset: number): Segment => {
      const yaw = end.yaw + yawOffset;
      // Nudge origin forward a bit so walls don't overlap
      const childOrigin = localToWorld(end.origin, yaw, 0, 0, 0.5);
      const child = buildSegment(
        nextId(),
        childOrigin,
        yaw,
        seg.pathDist + seg.length,
        seg.id,
        seed,
        mats,
      );
      addSegment(child);
      seg.nextIds.push(child.id);
      return child;
    };

    if (kind === "straight") {
      spawnChild(0);
    } else if (kind === "left") {
      spawnChild(Math.PI / 2);
    } else if (kind === "right") {
      spawnChild(-Math.PI / 2);
    } else if (kind === "t") {
      spawnChild(Math.PI / 2);
      spawnChild(-Math.PI / 2);
      // Optional forward continuation
      if (rnd() > 0.4) spawnChild(0);
    } else if (kind === "cross") {
      spawnChild(0);
      spawnChild(Math.PI / 2);
      spawnChild(-Math.PI / 2);
    } else {
      // Lobby dead-end building with side exits
      spawnChild(Math.PI / 2);
      spawnChild(-Math.PI / 2);
    }

    // Corner cover on the junction
    for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = halfW * 0.55 + rnd() * 1.5;
      const cx = end.origin.x + Math.cos(ang) * rad;
      const cz = end.origin.z + Math.sin(ang) * rad;
      if (rnd() > 0.5) {
        addProp(
          seg.group,
          seg.colliders,
          makeJerseyBarrier(mats, { x: cx, z: cz, rotY: rnd() * Math.PI }),
        );
      } else {
        addProp(
          seg.group,
          seg.colliders,
          makeSandbags(mats, { x: cx, z: cz, rotY: rnd() * Math.PI, rows: 2 }),
        );
      }
    }

    rebuildColliders();
  };

  const cullFar = (playerPos: THREE.Vector3): void => {
    // Find nearest segment
    let nearest: Segment | null = null;
    let best = Infinity;
    for (const s of segments.values()) {
      const mid = localToWorld(s.origin, s.yaw, 0, 0, s.length * 0.5);
      const d = mid.distanceToSquared(playerPos);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    if (!nearest) return;

    // Expand if player is past 55% of nearest segment
    const localZ =
      Math.cos(nearest.yaw) * (playerPos.z - nearest.origin.z) +
      Math.sin(nearest.yaw) * (playerPos.x - nearest.origin.x);
    // Wait - local transform inverse:
    // world = origin + R * local
    // local.x = cos*dx - sin*dz?
    // R = [[c,0,s],[0,1,0],[-s,0,c]] for yaw around Y with +Z forward
    // Actually localToWorld: x = ox + c*lx + s*lz, z = oz - s*lx + c*lz
    // Inverse: dx = x-ox, dz = z-oz
    // lx = c*dx - s*dz, lz = s*dx + c*dz
    const c = Math.cos(nearest.yaw);
    const s = Math.sin(nearest.yaw);
    const dx = playerPos.x - nearest.origin.x;
    const dz = playerPos.z - nearest.origin.z;
    const lz = s * dx + c * dz;

    if (lz > nearest.length * 0.5 || nearest.nextIds.length === 0) {
      expandFrom(nearest);
      // Also expand children that are close
      for (const nid of nearest.nextIds) {
        const child = segments.get(nid);
        if (child) expandFrom(child);
      }
    }

    // Cull segments far from player
    if (segments.size <= MAX_SEGMENTS) return;
    const toRemove: string[] = [];
    for (const seg of segments.values()) {
      if (seg.id === nearest.id || seg.id === spawn.id) continue;
      const mid = localToWorld(seg.origin, seg.yaw, 0, 0, seg.length * 0.5);
      const dist = mid.distanceTo(playerPos);
      // Prefer culling behind
      if (dist > STREAM_AHEAD + STREAM_BEHIND) toRemove.push(seg.id);
    }
    // If still over cap, remove farthest
    if (segments.size - toRemove.length > MAX_SEGMENTS) {
      const ranked = [...segments.values()]
        .filter((seg) => seg.id !== nearest.id && seg.id !== spawn.id)
        .map((seg) => ({
          id: seg.id,
          d: localToWorld(seg.origin, seg.yaw, 0, 0, seg.length * 0.5).distanceToSquared(playerPos),
        }))
        .sort((a, b) => b.d - a.d);
      for (const r of ranked) {
        if (segments.size - toRemove.length <= MAX_SEGMENTS) break;
        if (!toRemove.includes(r.id)) toRemove.push(r.id);
      }
    }

    for (const id of toRemove) {
      const seg = segments.get(id);
      if (!seg) continue;
      // Detach parent links
      if (seg.parentId) {
        const parent = segments.get(seg.parentId);
        if (parent) parent.nextIds = parent.nextIds.filter((x) => x !== id);
      }
      root.remove(seg.group);
      disposeObject(seg.group);
      segments.delete(id);
    }
    if (toRemove.length) rebuildColliders();
  };

  let lampFactor = 1;

  const update = (_dt: number, _elapsed: number, playerPos: THREE.Vector3): void => {
    cullFar(playerPos);
    // Keep lamps updated if factor changed externally
    for (const seg of segments.values()) {
      for (const lamp of seg.lamps) {
        const base = (lamp.userData.baseIntensity as number) ?? 100;
        lamp.intensity = base * lampFactor;
      }
    }
  };

  const setLampFactor = (factor: number): void => {
    lampFactor = factor;
    for (const seg of segments.values()) {
      for (const lamp of seg.lamps) {
        const base = (lamp.userData.baseIntensity as number) ?? 100;
        lamp.intensity = base * factor;
      }
    }
  };

  root.userData.setLampFactor = setLampFactor;

  const dispose = (): void => {
    for (const seg of segments.values()) {
      root.remove(seg.group);
      disposeObject(seg.group);
    }
    segments.clear();
    colliders.length = 0;
    scene.remove(root);
    scene.remove(sky.group);
    disposeObject(sky.group);
    mats.dispose();
  };

  return {
    colliders,
    groundY: 0,
    seed,
    starGroup: sky.group,
    update,
    dispose,
  };
}

export function setCityLampFactor(scene: THREE.Scene, factor: number): void {
  const root = scene.getObjectByName("CityStream");
  const fn = root?.userData?.setLampFactor as ((f: number) => void) | undefined;
  fn?.(factor);
}

/** @deprecated kept for imports that referenced grid size */
export const CITY_CHUNK = 40;
