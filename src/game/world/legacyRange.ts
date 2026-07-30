import * as THREE from "three";
import type { Collider } from "@/game/types";
import {
  createWorldMaterials,
  makeBuilding,
  makeContainer,
  makeCrate,
  makeSandbags,
  makeBarrel,
  makeLightPole,
  makeWatchTower,
  makeJerseyBarrier,
  makeTire,
  makeMetalPlatform,
  makeHazardLine,
  makeWallSegment,
  makeHqTower,
  makeDistantHill,
  makeStarfieldAndMoon,
  makeSpawnPlazaMarkings,
  makeGateFrame,
  makeSurfaceDetails,
  type PropResult,
} from "./props";

/** Hard clear radius around player spawn (origin) — no solid colliders inside. */
const SPAWN_CLEAR_RADIUS = 8;

function addProp(
  scene: THREE.Scene,
  colliders: Collider[],
  disposables: THREE.Object3D[],
  prop: PropResult,
): void {
  scene.add(prop.group);
  disposables.push(prop.group);
  colliders.push(...prop.colliders);
}

/** Reject colliders that invade the spawn plaza (AABB vs circle on XZ). */
function filterSpawnSafe(colliders: Collider[]): Collider[] {
  const r = SPAWN_CLEAR_RADIUS;
  return colliders.filter((c) => {
    // Closest point on AABB to origin on XZ
    const cx = Math.max(c.min.x, Math.min(0, c.max.x));
    const cz = Math.max(c.min.z, Math.min(0, c.max.z));
    return cx * cx + cz * cz >= r * r;
  });
}

function createDustMotes(count: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Keep dust out of immediate spawn eye-line clutter — outer ring bias
    const ang = Math.random() * Math.PI * 2;
    const rad = 10 + Math.random() * 45;
    positions[i * 3] = Math.cos(ang) * rad;
    positions[i * 3 + 1] = 0.4 + Math.random() * 8;
    positions[i * 3 + 2] = Math.sin(ang) * rad;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,230,180,0.9)");
  g.addColorStop(0.4, "rgba(200,180,140,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(c);

  const mat = new THREE.PointsMaterial({
    map: sprite,
    size: 0.14,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xe8d4b0,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.phases = phases;
  return points;
}

function createGroundFog(count: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 12 + Math.random() * 48;
    positions[i * 3] = Math.cos(ang) * rad;
    positions[i * 3 + 1] = 0.15 + Math.random() * 1.2;
    positions[i * 3 + 2] = Math.sin(ang) * rad;
    sizes[i] = 3.5 + Math.random() * 5.5;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    name: "LowGroundMist",
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x6d89a8) },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      varying float vDistanceFade;
      varying float vPhase;

      void main() {
        vec3 animated = position;
        animated.x += sin(uTime * 0.07 + aPhase) * 2.2;
        animated.z += cos(uTime * 0.055 + aPhase * 1.7) * 1.8;
        animated.y += sin(uTime * 0.14 + aPhase * 0.8) * 0.12;
        vec4 mvPosition = modelViewMatrix * vec4(animated, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(aSize * (150.0 / max(-mvPosition.z, 1.0)), 5.0, 84.0);
        vDistanceFade = 1.0 - smoothstep(32.0, 95.0, -mvPosition.z);
        vPhase = aPhase;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying float vDistanceFade;
      varying float vPhase;

      void main() {
        vec2 p = gl_PointCoord - 0.5;
        p.y *= 2.4;
        float body = 1.0 - smoothstep(0.08, 0.5, length(p));
        float wisps = 0.72 + sin((p.x * 9.0 + p.y * 4.0) + vPhase + uTime * 0.08) * 0.28;
        float alpha = body * wisps * vDistanceFade * 0.085;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return points;
}

/**
 * Dense night military training compound (~100×100 playable).
 * COD-inspired layout: clear spawn plaza, readable fire lanes, layered cover.
 * Key lights owned by engine; world adds sky + local prop sodium only.
 */
export function createLegacyRange(scene: THREE.Scene) {
  const colliders: Collider[] = [];
  const disposables: THREE.Object3D[] = [];
  const mats = createWorldMaterials();
  const geometries: THREE.BufferGeometry[] = [];

  // ── Starfield + moon disc (Estate-night sky read) ──
  addProp(scene, colliders, disposables, makeStarfieldAndMoon(mats));

  // ── Ground: large asphalt plane ──
  const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
  geometries.push(groundGeo);
  const ground = new THREE.Mesh(groundGeo, mats.asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.position.y = 0;
  scene.add(ground);
  disposables.push(ground);

  // ── Instanced puddles, drains, paint and rubble ──
  addProp(scene, colliders, disposables, makeSurfaceDetails(mats));

  // ── Spawn plaza markings (no colliders) ──
  addProp(scene, colliders, disposables, makeSpawnPlazaMarkings(mats));

  // ── Perimeter walls with gate openings (~100×100 playable interior) ──
  const wallH = 5.5;
  const half = 52;

  // North wall (z = +half) — center gate
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: -28,
      z: half,
      length: 36,
      height: wallH,
      rotY: 0,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: 28,
      z: half,
      length: 36,
      height: wallH,
      rotY: 0,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeGateFrame(mats, {
      x: 0,
      z: half,
      width: 12,
      height: wallH + 1,
    }),
  );

  // South wall (z = -half) — two offset gates
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: -32,
      z: -half,
      length: 28,
      height: wallH,
      rotY: 0,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: 8,
      z: -half,
      length: 24,
      height: wallH,
      rotY: 0,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: 40,
      z: -half,
      length: 16,
      height: wallH,
      rotY: 0,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeGateFrame(mats, {
      x: -10,
      z: -half,
      width: 10,
      height: wallH + 1,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeGateFrame(mats, {
      x: 28,
      z: -half,
      width: 10,
      height: wallH + 1,
    }),
  );

  // East wall (x = +half) — mid gate
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: half,
      z: -22,
      length: 40,
      height: wallH,
      rotY: Math.PI / 2,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: half,
      z: 32,
      length: 28,
      height: wallH,
      rotY: Math.PI / 2,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeGateFrame(mats, {
      x: half,
      z: 8,
      rotY: Math.PI / 2,
      width: 12,
      height: wallH + 1,
    }),
  );

  // West wall mostly solid (x = -half) — small service gate
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: -half,
      z: -28,
      length: 40,
      height: wallH,
      rotY: Math.PI / 2,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeWallSegment(mats, {
      x: -half,
      z: 28,
      length: 40,
      height: wallH,
      rotY: Math.PI / 2,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeGateFrame(mats, {
      x: -half,
      z: 0,
      rotY: Math.PI / 2,
      width: 10,
      height: wallH + 1,
    }),
  );

  // ── HQ tower OFFSET north — never at origin (spawn blocker fix) ──
  addProp(scene, colliders, disposables, makeHqTower(mats, { x: 0, z: 32 }));

  // ── Interior buildings — quadrants, keep mid lanes open ──
  const buildings: Array<Parameters<typeof makeBuilding>[1]> = [
    // SW block
    { x: -30, z: -26, w: 12, d: 9, h: 5.5, windowStyle: "warm" },
    // NW block
    { x: -32, z: 16, w: 10, d: 8, h: 4.5, dark: true, windowStyle: "cyan" },
    // SE block
    { x: 28, z: -26, w: 14, d: 8, h: 6, windowStyle: "mixed", rotY: 0.08 },
    // NE block
    { x: 32, z: 18, w: 9, d: 11, h: 5, windowStyle: "warm" },
    // Far north wings flanking HQ
    { x: -18, z: 38, w: 10, d: 7, h: 4, dark: true, windowStyle: "cyan" },
    { x: 18, z: 38, w: 8, d: 8, h: 6.5, windowStyle: "mixed" },
    // West hangar strip
    { x: -40, z: -4, w: 7, d: 14, h: 4.5, windowStyle: "warm", rotY: 0.04 },
    // East hangar strip
    { x: 40, z: -6, w: 8, d: 10, h: 5.5, dark: true, windowStyle: "cyan" },
  ];
  for (const b of buildings) {
    addProp(scene, colliders, disposables, makeBuilding(mats, b));
  }

  // ── Watch towers at corners ──
  addProp(scene, colliders, disposables, makeWatchTower(mats, { x: -46, z: -46, rotY: 0.2 }));
  addProp(scene, colliders, disposables, makeWatchTower(mats, { x: 46, z: -46, rotY: -0.3 }));
  addProp(scene, colliders, disposables, makeWatchTower(mats, { x: -46, z: 46, rotY: 0.5 }));
  addProp(scene, colliders, disposables, makeWatchTower(mats, { x: 46, z: 46, rotY: -0.1 }));

  // ── Shipping containers — composed cover lanes (Shipment DNA) ──
  // SW container alley (parallel stacks forming a chokepoint)
  const containers: Array<Parameters<typeof makeContainer>[1]> = [
    // SW lane wall
    { x: -14, z: -18, color: "olive", rotY: 0.02 },
    { x: -14, z: -15.2, color: "rust", rotY: 0.01, y: 2.6 },
    { x: -14, z: -12.4, color: "navy", rotY: 0.03 },
    // SE lane wall
    { x: 14, z: -18, color: "navy", rotY: Math.PI / 2 },
    { x: 14, z: -12, color: "olive", rotY: Math.PI / 2 + 0.03 },
    { x: 17, z: -12, color: "rust", rotY: Math.PI / 2, y: 2.6 },
    // Mid-west angled cover (outside spawn ring)
    { x: -20, z: 4, color: "rust", rotY: 0.75 },
    { x: -22, z: 8, color: "olive", rotY: 0.9 },
    // Mid-east
    { x: 20, z: 6, color: "navy", rotY: -0.45 },
    { x: 22, z: 10, color: "rust", rotY: -0.3 },
    // North mid — approach to HQ (flank cover)
    { x: -10, z: 18, color: "olive", length: 5, rotY: 0.1 },
    { x: 10, z: 20, color: "navy", length: 5, rotY: -0.15 },
    // Far corners
    { x: 34, z: -38, color: "navy", rotY: 0.12 },
    { x: -36, z: 28, color: "olive", rotY: Math.PI / 4 },
    { x: 6, z: -36, color: "rust", rotY: 0.08 },
    { x: -8, z: 42, color: "navy", rotY: 0.2 },
  ];
  for (const c of containers) {
    addProp(scene, colliders, disposables, makeContainer(mats, c));
  }

  // ── Sandbag cover — readable low walls on lane edges (all outside 8m) ──
  const sandbags: Array<Parameters<typeof makeSandbags>[1]> = [
    // Plaza ring soft cover (~9.5–11m)
    { x: -10, z: -4, length: 4.5, rows: 3, rotY: 0.35 },
    { x: 10, z: -5, length: 4.5, rows: 3, rotY: -0.4 },
    { x: -6, z: 10, length: 5, rows: 3, rotY: Math.PI / 2 + 0.1 },
    { x: 7, z: 10, length: 4, rows: 2, rotY: Math.PI / 2 - 0.1 },
    // SW approach
    { x: -18, z: -10, length: 4, rows: 3, rotY: 1.0 },
    { x: 18, z: -8, length: 5, rows: 3, rotY: -0.85 },
    // Mid cross
    { x: -24, z: 12, length: 4, rows: 3, rotY: -0.4 },
    { x: 24, z: 14, length: 4, rows: 2, rotY: 0.5 },
    // South choke
    { x: -4, z: -28, length: 5, rows: 3, rotY: Math.PI / 2 },
    { x: 8, z: -26, length: 4, rows: 3, rotY: 0.2 },
    // HQ approach flanks
    { x: -12, z: 26, length: 4.5, rows: 3, rotY: 0.15 },
    { x: 12, z: 26, length: 4.5, rows: 3, rotY: -0.15 },
  ];
  for (const s of sandbags) {
    addProp(scene, colliders, disposables, makeSandbags(mats, s));
  }

  // ── Wooden supply crates — clustered compositions (not random scatter) ──
  const crateClusters: Array<Array<[number, number, number?, number?, number?]>> = [
    // SW depot near containers [x, z, scale?, rotY?, y?]
    [
      [-10, -20, 1, 0.3],
      [-9, -19, 0.85, 1.1],
      [-11, -19.5, 1.1, -0.4],
      [-10, -19, 0.9, 0.2, 1.05],
    ],
    // SE depot
    [
      [16, -14, 1.2, 0.5],
      [17.2, -13, 0.9, 0.2],
      [16.5, -13.5, 0.9, 0.4, 1.1],
    ],
    // Mid-east
    [
      [26, 4, 1, 0.1],
      [27, 5, 0.85, 0.6],
    ],
    // Mid-west
    [
      [-26, 10, 1.15, 0.4],
      [-27, 11.2, 0.9, 1.4],
      [-25.5, 11, 0.8, 0.2, 1.0],
    ],
    // North side of plaza (outside clear)
    [
      [12, 12, 0.95, 0.3],
      [13, 13, 0.75, -0.2],
    ],
    // Far clusters
    [
      [-32, -30, 1.1, 0.7],
      [34, -18, 1.2, -0.3],
      [-2, 42, 0.85, 0.5],
      [20, 30, 0.95, 0.3],
    ],
  ];
  for (const cluster of crateClusters) {
    for (const [x, z, scale, rotY, y] of cluster) {
      addProp(
        scene,
        colliders,
        disposables,
        makeCrate(mats, {
          x,
          z,
          scale: scale ?? 1,
          rotY: rotY ?? 0,
          y: y ?? 0,
        }),
      );
    }
  }

  // ── Tactical light poles (local sodium; engine owns map key floods) ──
  const poles: Array<[number, number, boolean?]> = [
    [-22, -22, true],
    [22, -22, true],
    [-22, 22, false],
    [22, 22, true],
    [0, -30, true],
    [0, 22, false], // near HQ — engine searchlight covers
    [-40, 0, false],
    [40, 0, true],
    [-12, 42, false],
    [12, -42, false],
    [36, 36, true],
    [-36, -36, false],
  ];
  for (const [x, z, withLight] of poles) {
    addProp(
      scene,
      colliders,
      disposables,
      makeLightPole(mats, { x, z, height: 6.8, withLight: withLight !== false }),
    );
  }

  // ── Jersey barriers — continuous lines for vehicle-lane cover ──
  // South vehicle block line
  for (let i = 0; i < 8; i++) {
    addProp(
      scene,
      colliders,
      disposables,
      makeJerseyBarrier(mats, {
        x: -8 + i * 2.25,
        z: -40,
        rotY: 0.015 * (i % 3),
      }),
    );
  }
  // East flank line
  for (let i = 0; i < 5; i++) {
    addProp(
      scene,
      colliders,
      disposables,
      makeJerseyBarrier(mats, {
        x: 42,
        z: -14 + i * 2.4,
        rotY: Math.PI / 2 + 0.02 * i,
      }),
    );
  }
  // Mid soft cover pieces (outside spawn)
  addProp(scene, colliders, disposables, makeJerseyBarrier(mats, { x: -16, z: 0, rotY: 0.55 }));
  addProp(scene, colliders, disposables, makeJerseyBarrier(mats, { x: 16, z: 2, rotY: -0.5 }));
  addProp(scene, colliders, disposables, makeJerseyBarrier(mats, { x: 0, z: -16, rotY: 0.05 }));

  // ── Barrels & tires — clustered debris at cover edges ──
  const barrelSpots: Array<[number, number, "blue" | "yellow" | "metal"]> = [
    [-14, -12, "blue"],
    [-13.2, -11.5, "yellow"],
    [12, -16, "metal"],
    [22, -8, "blue"],
    [-26, 14, "yellow"],
    [8, 16, "blue"],
    [30, 12, "metal"],
    [-8, 36, "yellow"],
    [15, 34, "blue"],
    [-38, 20, "metal"],
    [4, -22, "yellow"],
    [-18, -34, "blue"],
    [18, 8, "metal"],
    [-12, 14, "blue"],
  ];
  for (const [x, z, color] of barrelSpots) {
    addProp(scene, colliders, disposables, makeBarrel(mats, { x, z, color }));
  }

  const tireSpots: Array<[number, number, boolean]> = [
    [-12, -14, true],
    [-12.5, -13.2, true],
    [12, -12, false],
    [24, 2, true],
    [-22, 20, true],
    [10, 8, false],
    [18, -30, true],
    [-30, -18, true],
    [8, -8, true],
  ];
  for (const [x, z, lying] of tireSpots) {
    addProp(scene, colliders, disposables, makeTire(mats, { x, z, lying }));
  }

  // ── Metal grated platforms (verticality without blocking plaza) ──
  addProp(
    scene,
    colliders,
    disposables,
    makeMetalPlatform(mats, {
      x: -18,
      z: -6,
      w: 5,
      d: 3.5,
      y: 0.95,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeMetalPlatform(mats, {
      x: 18,
      z: -4,
      w: 4,
      d: 4,
      y: 1.1,
    }),
  );
  addProp(
    scene,
    colliders,
    disposables,
    makeMetalPlatform(mats, {
      x: 8,
      z: 28,
      w: 6,
      d: 3,
      y: 0.75,
    }),
  );

  // ── Hazard / painted lines — fire-lane readability ──
  const hazards: Array<Parameters<typeof makeHazardLine>[1]> = [
    // Gate approaches
    { x: 0, z: -46, length: 14, rotY: 0 },
    { x: 0, z: 48, length: 10 },
    { x: 48, z: 8, length: 12, rotY: Math.PI / 2 },
    { x: -48, z: 0, length: 10, rotY: Math.PI / 2 },
    // Mid lanes
    { x: -20, z: 0, length: 12, rotY: Math.PI / 2 },
    { x: 20, z: 0, length: 12, rotY: Math.PI / 2 },
    { x: 0, z: -22, length: 8, rotY: 0 },
    { x: 14, z: 12, length: 8, rotY: -0.4 },
    { x: -14, z: 12, length: 8, rotY: 0.4 },
    { x: 22, z: -24, length: 7, rotY: 0.12 },
  ];
  for (const h of hazards) {
    addProp(scene, colliders, disposables, makeHazardLine(mats, h));
  }

  // Center dashed strip: south approach → plaza → north toward HQ (stops short of HQ)
  for (let i = 0; i < 10; i++) {
    const z = -24 + i * 3.4;
    if (Math.abs(z) < 3) continue; // gap at plaza center
    if (z > 22) continue; // stop before HQ
    addProp(
      scene,
      colliders,
      disposables,
      makeHazardLine(mats, { x: 0, z, length: 1.5, rotY: Math.PI / 2 }),
    );
  }
  // East-west dashed through plaza edges only
  for (let i = 0; i < 6; i++) {
    const x = -18 + i * 7;
    if (Math.abs(x) < 8) continue;
    addProp(scene, colliders, disposables, makeHazardLine(mats, { x, z: 0, length: 1.4, rotY: 0 }));
  }

  // ── Distant silhouette hills ──
  const hills: Array<Parameters<typeof makeDistantHill>[1]> = [
    { x: -120, z: -80, sx: 50, sy: 22, sz: 40 },
    { x: -90, z: 100, sx: 60, sy: 28, sz: 45 },
    { x: 100, z: -90, sx: 55, sy: 20, sz: 50 },
    { x: 110, z: 70, sx: 45, sy: 26, sz: 38 },
    { x: 0, z: -130, sx: 80, sy: 18, sz: 30 },
    { x: -130, z: 20, sx: 40, sy: 30, sz: 55 },
    { x: 80, z: 120, sx: 70, sy: 24, sz: 40 },
  ];
  for (const h of hills) {
    addProp(scene, colliders, disposables, makeDistantHill(mats, h));
  }

  // ── Dust motes + ground fog atmosphere ──
  const dust = createDustMotes(380);
  scene.add(dust);
  disposables.push(dust);

  const fogPts = createGroundFog(96);
  scene.add(fogPts);
  disposables.push(fogPts);

  const dustPositions = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
  const dustPhases = dust.userData.phases as Float32Array;

  // Safety: strip any collider that still invades spawn plaza
  const safeColliders = filterSpawnSafe(colliders);
  colliders.length = 0;
  colliders.push(...safeColliders);

  return {
    colliders,
    enemySpawnPoints: [] as THREE.Vector3[],
    groundY: 0,
    seed: 0x4c454741,
    starGroup: scene.getObjectByName("SkyDome") as THREE.Group | null,
    setLampFactor: (_factor: number) => {},
    interact: (_origin: THREE.Vector3, _direction: THREE.Vector3) => false,
    update: (_dt: number, elapsed: number) => {
      const arr = dustPositions.array as Float32Array;
      for (let i = 0; i < dustPhases.length; i++) {
        const ix = i * 3;
        const ph = dustPhases[i]!;
        arr[ix]! += Math.sin(elapsed * 0.15 + ph) * _dt * 0.12;
        arr[ix + 1]! += Math.sin(elapsed * 0.4 + ph * 1.7) * _dt * 0.05;
        arr[ix + 2]! += Math.cos(elapsed * 0.12 + ph) * _dt * 0.1;
        if (arr[ix]! > 55) arr[ix] = -55;
        if (arr[ix]! < -55) arr[ix] = 55;
        if (arr[ix + 2]! > 55) arr[ix + 2] = -55;
        if (arr[ix + 2]! < -55) arr[ix + 2] = 55;
        if (arr[ix + 1]! > 9) arr[ix + 1] = 0.5;
        if (arr[ix + 1]! < 0.2) arr[ix + 1] = 6;
      }
      dustPositions.needsUpdate = true;
      fogPts.rotation.y = elapsed * 0.01;
      fogPts.material.uniforms.uTime!.value = elapsed;
      mats.sky.uniforms.uTime!.value = elapsed;
    },
    dispose: () => {
      for (const obj of disposables) {
        scene.remove(obj);
        // Sky clones etc.
        const owned = obj.userData?.ownedMaterials as THREE.Material[] | undefined;
        if (owned) {
          for (const m of owned) m.dispose();
        }
        obj.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            // Prop geos are unique; materials are shared kit (or owned above)
            mesh.geometry?.dispose();
          }
          const pts = child as THREE.Points;
          if (pts.isPoints) {
            pts.geometry?.dispose();
            const pm = pts.material as THREE.PointsMaterial;
            // Dust / fog: unique material + sprite map
            if (pm !== mats.starMat && !(owned && owned.includes(pm))) {
              pm.map?.dispose();
              pm.dispose();
            }
          }
        });
      }
      for (const g of geometries) g.dispose();
      mats.dispose();
    },
  };
}
