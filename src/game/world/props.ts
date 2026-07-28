import * as THREE from "three";
import type { Collider } from "@/game/types";
import {
  asphaltTexture,
  concreteTexture,
  metalTexture,
  woodTexture,
  disposeTextureSet,
  proceduralColorMap,
  moonGlowTexture,
} from "@/game/utils/textures";

export type PropResult = {
  group: THREE.Group;
  colliders: Collider[];
};

export type WorldMaterials = {
  asphalt: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  metalOlive: THREE.MeshStandardMaterial;
  metalRust: THREE.MeshStandardMaterial;
  metalNavy: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  sandbag: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  grate: THREE.MeshStandardMaterial;
  windowWarm: THREE.MeshStandardMaterial;
  windowCyan: THREE.MeshStandardMaterial;
  windowDark: THREE.MeshStandardMaterial;
  lampOrange: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  hill: THREE.MeshStandardMaterial;
  barrelBlue: THREE.MeshStandardMaterial;
  barrelYellow: THREE.MeshStandardMaterial;
  moonMat: THREE.MeshBasicMaterial;
  starMat: THREE.PointsMaterial;
  dispose: () => void;
};

function cloneMaps(
  set: {
    map: THREE.CanvasTexture;
    normalMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  },
  repeatX: number,
  repeatY: number,
): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const map = set.map.clone();
  const normalMap = set.normalMap.clone();
  const roughnessMap = set.roughnessMap.clone();
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.needsUpdate = true;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap, roughnessMap };
}

/** Shared PBR material kit for the compound — create once per world. */
export function createWorldMaterials(): WorldMaterials {
  const asphalt = asphaltTexture(512);
  const concrete = concreteTexture(512);
  const metal = metalTexture(256);
  const wood = woodTexture(256);
  const sandColor = proceduralColorMap(256, [92, 84, 62], 20, 55);
  const moonTex = moonGlowTexture(256);

  const asphaltMaps = cloneMaps(asphalt, 36, 36);
  const concreteMaps = cloneMaps(concrete, 2.2, 2.2);
  const concreteDarkMaps = cloneMaps(concrete, 1.6, 1.6);
  const metalMaps = cloneMaps(metal, 1, 1);
  const woodMaps = cloneMaps(wood, 1, 1);

  // Night asphalt — mid-dark grit that reads under moon + sodium
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltMaps.map,
    normalMap: asphaltMaps.normalMap,
    roughnessMap: asphaltMaps.roughnessMap,
    roughness: 0.9,
    metalness: 0.04,
    color: 0x555a62,
    envMapIntensity: 0.35,
  });
  asphaltMat.normalScale.set(0.7, 0.7);

  // Weathered concrete — warm, form-readable under artificial lights
  const concreteMat = new THREE.MeshStandardMaterial({
    map: concreteMaps.map,
    normalMap: concreteMaps.normalMap,
    roughnessMap: concreteMaps.roughnessMap,
    roughness: 0.8,
    metalness: 0.05,
    color: 0xe0d6c4,
    envMapIntensity: 0.5,
  });
  concreteMat.normalScale.set(0.95, 0.95);

  const concreteDarkMat = new THREE.MeshStandardMaterial({
    map: concreteDarkMaps.map,
    normalMap: concreteDarkMaps.normalMap,
    roughnessMap: concreteDarkMaps.roughnessMap,
    roughness: 0.84,
    metalness: 0.05,
    color: 0xb8aea2,
    envMapIntensity: 0.45,
  });

  const baseMetal = {
    map: metalMaps.map,
    normalMap: metalMaps.normalMap,
    roughnessMap: metalMaps.roughnessMap,
  };

  // Painted military metal — mid roughness so night lights catch edges
  const metalMat = new THREE.MeshStandardMaterial({
    ...baseMetal,
    roughness: 0.55,
    metalness: 0.55,
    envMapIntensity: 0.65,
    color: 0x6a6e76,
    emissive: 0x0a0c10,
    emissiveIntensity: 0.08,
  });

  // Shipping containers — brighter painted so olive/rust/navy read at range
  const metalOlive = new THREE.MeshStandardMaterial({
    ...baseMetal,
    roughness: 0.58,
    metalness: 0.5,
    color: 0x6a7a42,
    emissive: 0x1a2210,
    emissiveIntensity: 0.14,
    envMapIntensity: 0.55,
  });

  const metalRust = new THREE.MeshStandardMaterial({
    ...baseMetal,
    roughness: 0.72,
    metalness: 0.42,
    color: 0xa05038,
    emissive: 0x281408,
    emissiveIntensity: 0.12,
    envMapIntensity: 0.5,
  });

  const metalNavy = new THREE.MeshStandardMaterial({
    ...baseMetal,
    roughness: 0.52,
    metalness: 0.58,
    color: 0x2e4268,
    emissive: 0x0a1220,
    emissiveIntensity: 0.14,
    envMapIntensity: 0.6,
  });

  const woodMat = new THREE.MeshStandardMaterial({
    map: woodMaps.map,
    normalMap: woodMaps.normalMap,
    roughnessMap: woodMaps.roughnessMap,
    roughness: 0.8,
    metalness: 0.0,
    color: 0xc8a878,
    emissive: 0x1a1208,
    emissiveIntensity: 0.1,
  });

  const sandbag = new THREE.MeshStandardMaterial({
    map: sandColor,
    roughness: 0.94,
    metalness: 0.0,
    color: 0xd0c090,
    emissive: 0x1a1810,
    emissiveIntensity: 0.08,
  });

  const hazard = new THREE.MeshStandardMaterial({
    color: 0xf0c820,
    roughness: 0.55,
    metalness: 0.1,
    emissive: 0x3a2800,
    emissiveIntensity: 0.22,
  });

  const grate = new THREE.MeshStandardMaterial({
    ...baseMetal,
    color: 0x464a52,
    roughness: 0.55,
    metalness: 0.75,
    envMapIntensity: 0.7,
  });

  // Emissive windows — punch above bloom threshold for practical glow (COD interior light)
  const windowWarm = new THREE.MeshStandardMaterial({
    color: 0xffd490,
    emissive: 0xffb050,
    emissiveIntensity: 2.15,
    roughness: 0.32,
    metalness: 0.06,
    toneMapped: false,
  });

  const windowCyan = new THREE.MeshStandardMaterial({
    color: 0x88eeff,
    emissive: 0x44ccee,
    emissiveIntensity: 1.95,
    roughness: 0.3,
    metalness: 0.1,
    toneMapped: false,
  });

  const windowDark = new THREE.MeshStandardMaterial({
    color: 0x121820,
    emissive: 0x0a1018,
    emissiveIntensity: 0.28,
    roughness: 0.22,
    metalness: 0.4,
  });

  const lampOrange = new THREE.MeshStandardMaterial({
    color: 0xffbb66,
    emissive: 0xff9933,
    emissiveIntensity: 3.2,
    roughness: 0.2,
    metalness: 0.0,
    toneMapped: false,
  });

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x1a1a1c,
    roughness: 0.96,
    metalness: 0.04,
  });

  const hill = new THREE.MeshStandardMaterial({
    color: 0x080e16,
    roughness: 1,
    metalness: 0,
    fog: true,
  });

  const barrelBlue = new THREE.MeshStandardMaterial({
    ...baseMetal,
    color: 0x3a5a8a,
    roughness: 0.5,
    metalness: 0.58,
    emissive: 0x081018,
    emissiveIntensity: 0.1,
  });

  const barrelYellow = new THREE.MeshStandardMaterial({
    ...baseMetal,
    color: 0xc8a828,
    roughness: 0.55,
    metalness: 0.48,
    emissive: 0x221800,
    emissiveIntensity: 0.12,
  });

  const moonMat = new THREE.MeshBasicMaterial({
    map: moonTex,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    color: 0xe8f0ff,
  });

  // Soft star points (texture optional — sizeAttenuation off for distant pinpricks)
  const starMat = new THREE.PointsMaterial({
    color: 0xdde8ff,
    size: 0.9,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const sourceSets = [asphalt, concrete, metal, wood];

  const ownedTextures: THREE.Texture[] = [
    asphaltMaps.map,
    asphaltMaps.normalMap,
    asphaltMaps.roughnessMap,
    concreteMaps.map,
    concreteMaps.normalMap,
    concreteMaps.roughnessMap,
    concreteDarkMaps.map,
    concreteDarkMaps.normalMap,
    concreteDarkMaps.roughnessMap,
    metalMaps.map,
    metalMaps.normalMap,
    metalMaps.roughnessMap,
    woodMaps.map,
    woodMaps.normalMap,
    woodMaps.roughnessMap,
    sandColor,
    moonTex,
  ];

  return {
    asphalt: asphaltMat,
    concrete: concreteMat,
    concreteDark: concreteDarkMat,
    metal: metalMat,
    metalOlive,
    metalRust,
    metalNavy,
    wood: woodMat,
    sandbag,
    hazard,
    grate,
    windowWarm,
    windowCyan,
    windowDark,
    lampOrange,
    rubber,
    hill,
    barrelBlue,
    barrelYellow,
    moonMat,
    starMat,
    dispose: () => {
      const mats = [
        asphaltMat,
        concreteMat,
        concreteDarkMat,
        metalMat,
        metalOlive,
        metalRust,
        metalNavy,
        woodMat,
        sandbag,
        hazard,
        grate,
        windowWarm,
        windowCyan,
        windowDark,
        lampOrange,
        rubber,
        hill,
        barrelBlue,
        barrelYellow,
        moonMat,
        starMat,
      ];
      for (const m of mats) m.dispose();
      for (const t of ownedTextures) t.dispose();
      for (const s of sourceSets) disposeTextureSet(s);
    },
  };
}

/** Axis-aligned collider from center + half extents, with optional pad. */
export function makeCollider(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  pad = 0.08,
): Collider {
  return {
    min: new THREE.Vector3(cx - hx - pad, cy - hy - pad * 0.25, cz - hz - pad),
    max: new THREE.Vector3(cx + hx + pad, cy + hy + pad, cz + hz + pad),
  };
}

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
}

function pickWindowMat(
  mats: WorldMaterials,
  style: "warm" | "cyan" | "mixed" | undefined,
  index: number,
  forceDark = false,
): THREE.MeshStandardMaterial {
  if (forceDark) return mats.windowDark;
  // Fewer dark panes so facade reads as lit at range (COD Estate night)
  if (style === "cyan") return index % 7 === 0 ? mats.windowDark : mats.windowCyan;
  if (style === "mixed") {
    if (index % 6 === 0) return mats.windowDark;
    return index % 2 === 0 ? mats.windowWarm : mats.windowCyan;
  }
  return index % 8 === 0 ? mats.windowDark : mats.windowWarm;
}

export function makeBuilding(
  mats: WorldMaterials,
  opts: {
    x: number;
    z: number;
    w: number;
    d: number;
    h: number;
    rotY?: number;
    dark?: boolean;
    windowStyle?: "warm" | "cyan" | "mixed";
  },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const bodyMat = opts.dark ? mats.concreteDark : mats.concrete;
  const body = new THREE.Mesh(new THREE.BoxGeometry(opts.w, opts.h, opts.d), bodyMat);
  body.position.y = opts.h / 2;
  group.add(body);

  // Plinth / foundation trim
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(opts.w + 0.35, 0.35, opts.d + 0.35),
    mats.concreteDark,
  );
  plinth.position.y = 0.15;
  group.add(plinth);

  // Mid-floor ledge belt
  if (opts.h > 4) {
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(opts.w + 0.22, 0.18, opts.d + 0.22),
      mats.concreteDark,
    );
    belt.position.y = opts.h * 0.52;
    group.add(belt);
  }

  // Corner pilasters
  const pilW = 0.28;
  const pilD = 0.28;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(pilW, opts.h + 0.1, pilD), mats.concreteDark);
    pil.position.set((sx * opts.w) / 2 - sx * 0.05, opts.h / 2, (sz * opts.d) / 2 - sz * 0.05);
    group.add(pil);
  }

  // Parapet roof lip — light concrete so moon skims the edge (not buried in dark mat)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(opts.w + 0.4, 0.28, opts.d + 0.4),
    mats.concrete,
  );
  roof.position.y = opts.h + 0.12;
  group.add(roof);

  // Thin metal coping strip on parapet — specular catch under moon
  const coping = new THREE.Mesh(
    new THREE.BoxGeometry(opts.w + 0.48, 0.06, opts.d + 0.48),
    mats.metal,
  );
  coping.position.y = opts.h + 0.28;
  group.add(coping);

  // Inner roof slab (slight recess)
  const roofInner = new THREE.Mesh(
    new THREE.BoxGeometry(opts.w - 0.15, 0.12, opts.d - 0.15),
    mats.concreteDark,
  );
  roofInner.position.y = opts.h + 0.22;
  group.add(roofInner);

  // Rooftop AC units
  const acCount = Math.max(1, Math.floor((opts.w * opts.d) / 40));
  for (let i = 0; i < acCount; i++) {
    const acW = 1.1 + (i % 2) * 0.3;
    const acD = 0.85;
    const acH = 0.55;
    const ac = new THREE.Mesh(new THREE.BoxGeometry(acW, acH, acD), mats.metal);
    const ax = ((i % 3) - 1) * Math.min(opts.w * 0.28, 2.5);
    const az = (Math.floor(i / 3) - 0.3) * Math.min(opts.d * 0.25, 1.8);
    ac.position.set(ax, opts.h + 0.55, az);
    group.add(ac);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(acW * 0.7, 0.08, acD * 0.7), mats.grate);
    vent.position.set(ax, opts.h + 0.85, az);
    group.add(vent);
  }

  // Roof antenna / mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 1.8 + (opts.h > 5 ? 1 : 0), 6),
    mats.metal,
  );
  mast.position.set(opts.w * 0.3, opts.h + 1.2, -opts.d * 0.25);
  group.add(mast);
  const mastBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mats.metal);
  mastBall.position.copy(mast.position);
  mastBall.position.y += 0.95;
  group.add(mastBall);

  // Side conduit pipes
  for (const side of [-1, 1] as const) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, opts.h * 0.7, 6),
      mats.metal,
    );
    pipe.position.set(side * (opts.w / 2 + 0.1), opts.h * 0.4, opts.d * 0.25);
    group.add(pipe);
  }

  // Windows — dense grid, framed, mostly lit for bloom + silhouette at range
  const winH = Math.min(1.28, opts.h * 0.24);
  const winW = 0.92;
  const floors = opts.h > 4.2 ? (opts.h > 5.8 ? 3 : 2) : 1;
  const faces: Array<{ ax: number; az: number; nx: number; nz: number; span: number }> = [
    { ax: 0, az: opts.d / 2 + 0.03, nx: 1, nz: 0, span: opts.w },
    { ax: 0, az: -opts.d / 2 - 0.03, nx: 1, nz: 0, span: opts.w },
    { ax: opts.w / 2 + 0.03, az: 0, nx: 0, nz: 1, span: opts.d },
    { ax: -opts.w / 2 - 0.03, az: 0, nx: 0, nz: 1, span: opts.d },
  ];

  let winIdx = 0;
  for (let fl = 0; fl < floors; fl++) {
    const winY =
      floors === 1
        ? opts.h * 0.5
        : floors === 2
          ? 1.55 + fl * (opts.h * 0.4)
          : 1.35 + fl * ((opts.h - 1.8) / Math.max(floors - 1, 1));
    for (const face of faces) {
      // Tighter spacing → higher window density (~1.55m pitch)
      const count = Math.max(2, Math.floor(face.span / 1.55));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        // Door clearance on front face lower floor
        if (fl === 0 && Math.abs(t) < 0.09 && face.az > 0 && face.nx === 1) continue;

        const m = pickWindowMat(mats, opts.windowStyle, winIdx++);
        // Frame
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(
            face.nx === 1 ? winW + 0.1 : 0.09,
            winH + 0.1,
            face.nx === 1 ? 0.09 : winW + 0.1,
          ),
          mats.metal,
        );
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(face.nx === 1 ? winW : 0.07, winH, face.nx === 1 ? 0.07 : winW),
          m,
        );
        // Mullion cross for denser facade read
        const mullion = new THREE.Mesh(
          new THREE.BoxGeometry(
            face.nx === 1 ? 0.04 : 0.06,
            winH * 0.92,
            face.nx === 1 ? 0.06 : 0.04,
          ),
          mats.metal,
        );
        if (face.nx === 1) {
          const px = t * face.span * 0.88;
          const pz = face.az;
          frame.position.set(px, winY, pz);
          pane.position.set(px, winY, pz + 0.02 * Math.sign(face.az || 1));
          mullion.position.set(px, winY, pz + 0.025 * Math.sign(face.az || 1));
        } else {
          const pz = t * face.span * 0.88;
          frame.position.set(face.ax, winY, pz);
          pane.position.set(face.ax + 0.02 * Math.sign(face.ax || 1), winY, pz);
          mullion.position.set(face.ax + 0.025 * Math.sign(face.ax || 1), winY, pz);
        }
        group.add(frame);
        group.add(pane);
        group.add(mullion);
      }
    }
  }

  // Door recess + frame + awning
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.55, 0.14), mats.metal);
  doorFrame.position.set(0, 1.25, opts.d / 2 + 0.05);
  group.add(doorFrame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.3, 0.1), mats.concreteDark);
  door.position.set(0, 1.15, opts.d / 2 + 0.1);
  group.add(door);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.7), mats.metal);
  awning.position.set(0, 2.55, opts.d / 2 + 0.4);
  group.add(awning);

  // Wall sconce above door (emissive only — engine owns key lights)
  const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.18), mats.lampOrange);
  sconce.position.set(0, 2.7, opts.d / 2 + 0.2);
  group.add(sconce);

  enableShadows(group);
  const colliders = [
    makeCollider(opts.x, opts.h / 2, opts.z, opts.w / 2, opts.h / 2, opts.d / 2, 0.12),
  ];
  return { group, colliders };
}

export function makeContainer(
  mats: WorldMaterials,
  opts: {
    x: number;
    z: number;
    y?: number;
    rotY?: number;
    color?: "olive" | "rust" | "navy";
    length?: number;
  },
): PropResult {
  const group = new THREE.Group();
  const L = opts.length ?? 6.1;
  const W = 2.45;
  const H = 2.6;
  const y = opts.y ?? 0;
  group.position.set(opts.x, y, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const mat =
    opts.color === "rust"
      ? mats.metalRust
      : opts.color === "navy"
        ? mats.metalNavy
        : mats.metalOlive;

  const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), mat);
  body.position.y = H / 2;
  group.add(body);

  // Corrugation ribs (readable silhouette)
  const ribCount = Math.floor(L / 0.55);
  for (let i = 0; i < ribCount; i++) {
    const t = (i + 0.5) / ribCount - 0.5;
    for (const side of [-1, 1] as const) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, H * 0.9, 0.05), mats.metal);
      rib.position.set(t * L * 0.95, H / 2, (W / 2 + 0.02) * side);
      group.add(rib);
    }
  }

  // Corner castings
  for (const [cx, cy, cz] of [
    [-L / 2, 0.12, -W / 2],
    [L / 2, 0.12, -W / 2],
    [-L / 2, 0.12, W / 2],
    [L / 2, 0.12, W / 2],
    [-L / 2, H - 0.12, -W / 2],
    [L / 2, H - 0.12, -W / 2],
    [-L / 2, H - 0.12, W / 2],
    [L / 2, H - 0.12, W / 2],
  ] as const) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mats.metal);
    corner.position.set(cx, cy, cz);
    group.add(corner);
  }

  // End door split + locking bars
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.08, H * 0.9, W * 0.44), mats.metal);
  doorL.position.set(L / 2 + 0.04, H / 2, -W * 0.22);
  group.add(doorL);
  const doorR = doorL.clone();
  doorR.position.z = W * 0.22;
  group.add(doorR);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, H * 0.75, 6), mats.metal);
  bar.position.set(L / 2 + 0.08, H / 2, 0);
  group.add(bar);

  enableShadows(group);

  const cos = Math.abs(Math.cos(opts.rotY ?? 0));
  const sin = Math.abs(Math.sin(opts.rotY ?? 0));
  const hx = (L / 2) * cos + (W / 2) * sin;
  const hz = (L / 2) * sin + (W / 2) * cos;
  const colliders = [makeCollider(opts.x, y + H / 2, opts.z, hx, H / 2, hz, 0.1)];
  return { group, colliders };
}

export function makeCrate(
  mats: WorldMaterials,
  opts: { x: number; z: number; y?: number; scale?: number; rotY?: number },
): PropResult {
  const group = new THREE.Group();
  const s = opts.scale ?? 1;
  const size = 1.1 * s;
  group.position.set(opts.x, opts.y ?? 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats.wood);
  box.position.y = size / 2;
  group.add(box);

  // Edge banding
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.02, size * 0.08, size * 1.02),
    mats.metal,
  );
  band.position.y = size * 0.35;
  group.add(band);
  const band2 = band.clone();
  band2.position.y = size * 0.7;
  group.add(band2);

  // Corner braces
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(size * 0.12, size * 0.95, size * 0.12),
      mats.metal,
    );
    brace.position.set(sx * size * 0.44, size / 2, sz * size * 0.44);
    group.add(brace);
  }

  enableShadows(group);
  const hy = size / 2;
  const colliders = [
    makeCollider(opts.x, (opts.y ?? 0) + hy, opts.z, size / 2, hy, size / 2, 0.06),
  ];
  return { group, colliders };
}

export function makeSandbags(
  mats: WorldMaterials,
  opts: {
    x: number;
    z: number;
    length?: number;
    rows?: number;
    rotY?: number;
  },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const length = opts.length ?? 4;
  const rows = opts.rows ?? 3;
  // Usable crouch cover: ~0.9m at 3 rows (COD-standard low wall)
  const bagW = 0.58;
  const bagH = 0.3;
  const bagD = 0.42;
  const perRow = Math.max(2, Math.floor(length / bagW));

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow - (r % 2); i++) {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(bagW * 0.94, bagH * 0.92, bagD),
        mats.sandbag,
      );
      const offset = (r % 2) * (bagW * 0.5);
      bag.position.set(
        -length / 2 + bagW / 2 + i * bagW + offset,
        bagH / 2 + r * bagH,
        (r % 2 === 0 ? 1 : -1) * 0.06,
      );
      bag.rotation.y = (((i * 17 + r * 31) % 10) - 5) * 0.012;
      group.add(bag);
    }
  }

  enableShadows(group);
  const totalH = rows * bagH;
  const cos = Math.abs(Math.cos(opts.rotY ?? 0));
  const sin = Math.abs(Math.sin(opts.rotY ?? 0));
  const hx = (length / 2) * cos + 0.35 * sin;
  const hz = (length / 2) * sin + 0.35 * cos;
  const colliders = [makeCollider(opts.x, totalH / 2, opts.z, hx, totalH / 2, hz, 0.05)];
  return { group, colliders };
}

export function makeBarrel(
  mats: WorldMaterials,
  opts: { x: number; z: number; color?: "blue" | "yellow" | "metal"; rotY?: number },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const mat =
    opts.color === "yellow"
      ? mats.barrelYellow
      : opts.color === "blue"
        ? mats.barrelBlue
        : mats.metal;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 1.05, 12), mat);
  body.position.y = 0.52;
  group.add(body);

  // Ridges
  for (const ry of [0.25, 0.52, 0.78] as const) {
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 5, 14), mats.metal);
    ridge.rotation.x = Math.PI / 2;
    ridge.position.y = ry;
    group.add(ridge);
  }

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 16), mats.metal);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.02;
  group.add(rim);
  const rim2 = rim.clone();
  rim2.position.y = 0.08;
  group.add(rim2);

  enableShadows(group);
  // Soft soft-cover height (~1m) — usable
  const colliders = [makeCollider(opts.x, 0.52, opts.z, 0.4, 0.52, 0.4, 0.05)];
  return { group, colliders };
}

export function makeLightPole(
  mats: WorldMaterials,
  opts: { x: number; z: number; height?: number; withLight?: boolean },
): PropResult {
  const group = new THREE.Group();
  const h = opts.height ?? 7;
  group.position.set(opts.x, 0, opts.z);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.25, 8), mats.concreteDark);
  base.position.y = 0.12;
  group.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, h, 8), mats.metal);
  pole.position.y = h / 2;
  group.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), mats.metal);
  arm.position.set(0.6, h - 0.15, 0);
  group.add(arm);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mats.lampOrange);
  lamp.position.set(1.15, h - 0.35, 0);
  group.add(lamp);

  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.38), mats.metal);
  fixture.position.set(1.15, h - 0.18, 0);
  group.add(fixture);

  // Local sodium only when requested — engine owns map key floods (avoid double wash)
  if (opts.withLight !== false) {
    const light = new THREE.PointLight(0xffaa55, 1.45, 20, 2);
    light.position.set(1.15, h - 0.4, 0);
    light.castShadow = false;
    group.add(light);
  }

  enableShadows(group, true, true);
  const colliders = [makeCollider(opts.x, h / 2, opts.z, 0.22, h / 2, 0.22, 0.05)];
  return { group, colliders };
}

export function makeWatchTower(
  mats: WorldMaterials,
  opts: { x: number; z: number; rotY?: number },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const legGeo = new THREE.BoxGeometry(0.18, 8, 0.18);
  const spread = 1.4;
  for (const [lx, lz] of [
    [-spread, -spread],
    [spread, -spread],
    [-spread, spread],
    [spread, spread],
  ] as const) {
    const leg = new THREE.Mesh(legGeo, mats.metal);
    leg.position.set(lx, 4, lz);
    group.add(leg);
  }

  // Cross braces X-pattern
  for (let i = 0; i < 3; i++) {
    const y = 1.5 + i * 2;
    for (const z of [-spread, spread] as const) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(spread * 2.1, 0.08, 0.08), mats.metal);
      brace.position.set(0, y, z);
      group.add(brace);
    }
    for (const x of [-spread, spread] as const) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, spread * 2.1), mats.metal);
      brace.position.set(x, y + 0.5, 0);
      group.add(brace);
    }
  }

  // Ladder
  for (let i = 0; i < 12; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), mats.metal);
    rung.position.set(0, 0.5 + i * 0.65, spread + 0.15);
    group.add(rung);
  }

  const platform = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 3.4), mats.grate);
  platform.position.y = 8;
  group.add(platform);

  // Railings
  for (const [rx, rz, rw, rd] of [
    [0, 1.6, 3.2, 0.06],
    [0, -1.6, 3.2, 0.06],
    [1.6, 0, 0.06, 3.2],
    [-1.6, 0, 0.06, 3.2],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, rd), mats.metal);
    rail.position.set(rx, 8.9, rz);
    group.add(rail);
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), mats.concreteDark);
  cabin.position.y = 9.2;
  group.add(cabin);

  for (const [wx, wz, ry] of [
    [0, 1.42, 0],
    [0, -1.42, 0],
    [1.42, 0, Math.PI / 2],
    [-1.42, 0, Math.PI / 2],
  ] as const) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.08), mats.windowWarm);
    win.position.set(wx, 9.3, wz);
    win.rotation.y = ry;
    group.add(win);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 3.2), mats.metal);
  roof.position.y = 10.4;
  group.add(roof);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mats.lampOrange);
  lamp.position.set(0, 10.7, 0);
  group.add(lamp);
  // Dim local only — engine searchlight owns the sweep
  const pl = new THREE.PointLight(0xffaa55, 0.7, 22, 2);
  pl.position.set(0, 10.5, 0);
  group.add(pl);

  enableShadows(group);

  const colliders = [
    makeCollider(opts.x, 4, opts.z, 1.55, 4, 1.55, 0.1),
    makeCollider(opts.x, 9.2, opts.z, 1.5, 1.2, 1.5, 0.1),
  ];
  return { group, colliders };
}

export function makeJerseyBarrier(
  mats: WorldMaterials,
  opts: { x: number; z: number; rotY?: number },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  // Classic jersey profile — ~1.05m standing soft cover
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.72), mats.concrete);
  base.position.y = 0.225;
  group.add(base);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.48), mats.concrete);
  mid.position.y = 0.65;
  group.add(mid);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.3), mats.concreteDark);
  top.position.y = 1.02;
  group.add(top);

  // Hazard stripe paint
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.04), mats.hazard);
  stripe.position.set(0, 0.7, 0.26);
  group.add(stripe);

  enableShadows(group);
  const cos = Math.abs(Math.cos(opts.rotY ?? 0));
  const sin = Math.abs(Math.sin(opts.rotY ?? 0));
  const hx = 1.1 * cos + 0.36 * sin;
  const hz = 1.1 * sin + 0.36 * cos;
  const colliders = [makeCollider(opts.x, 0.55, opts.z, hx, 0.55, hz, 0.06)];
  return { group, colliders };
}

export function makeTire(
  mats: WorldMaterials,
  opts: { x: number; z: number; y?: number; lying?: boolean },
): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, opts.y ?? 0, opts.z);

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 8, 18), mats.rubber);
  if (opts.lying) {
    tire.rotation.x = Math.PI / 2;
    tire.position.y = 0.14;
  } else {
    tire.position.y = 0.38;
  }
  group.add(tire);
  enableShadows(group);

  const colliders = [makeCollider(opts.x, (opts.y ?? 0) + 0.3, opts.z, 0.5, 0.35, 0.5, 0.04)];
  return { group, colliders };
}

export function makeMetalPlatform(
  mats: WorldMaterials,
  opts: { x: number; z: number; w?: number; d?: number; y?: number },
): PropResult {
  const group = new THREE.Group();
  const w = opts.w ?? 4;
  const d = opts.d ?? 3;
  const y = opts.y ?? 0.5;
  group.position.set(opts.x, 0, opts.z);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mats.grate);
  deck.position.y = y;
  group.add(deck);

  for (const [lx, lz] of [
    [-w / 2 + 0.2, -d / 2 + 0.2],
    [w / 2 - 0.2, -d / 2 + 0.2],
    [-w / 2 + 0.2, d / 2 - 0.2],
    [w / 2 - 0.2, d / 2 - 0.2],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, y, 0.12), mats.metal);
    leg.position.set(lx, y / 2, lz);
    group.add(leg);
  }

  // Full rail on three sides
  for (const [rx, rz, rw, rd] of [
    [0, -d / 2, w, 0.06],
    [-w / 2, 0, 0.06, d],
    [w / 2, 0, 0.06, d],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.06, rd), mats.metal);
    rail.position.set(rx, y + 0.95, rz);
    group.add(rail);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), mats.metal);
    post.position.set(rx === 0 ? -w / 2 : rx, y + 0.48, rz === 0 ? -d / 2 : rz);
    group.add(post);
  }

  enableShadows(group);
  const colliders = [makeCollider(opts.x, y / 2, opts.z, w / 2, y / 2 + 0.06, d / 2, 0.05)];
  return { group, colliders };
}

export function makeHazardLine(
  mats: WorldMaterials,
  opts: { x: number; z: number; length?: number; rotY?: number; width?: number },
): PropResult {
  const group = new THREE.Group();
  const len = opts.length ?? 8;
  const width = opts.width ?? 0.18;
  group.position.set(opts.x, 0.02, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, width), mats.hazard);
  group.add(line);
  return { group, colliders: [] };
}

export function makeWallSegment(
  mats: WorldMaterials,
  opts: {
    x: number;
    z: number;
    length: number;
    height?: number;
    thickness?: number;
    rotY?: number;
  },
): PropResult {
  const group = new THREE.Group();
  const h = opts.height ?? 5.5;
  const t = opts.thickness ?? 0.55;
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  const wall = new THREE.Mesh(new THREE.BoxGeometry(opts.length, h, t), mats.concrete);
  wall.position.y = h / 2;
  group.add(wall);

  // Top cap / walkway lip
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(opts.length + 0.1, 0.22, t + 0.35),
    mats.concreteDark,
  );
  cap.position.y = h + 0.08;
  group.add(cap);

  // Vertical ribs + wall-mounted light housings
  const ribs = Math.floor(opts.length / 4);
  for (let i = 0; i <= ribs; i++) {
    const lx = -opts.length / 2 + (i / Math.max(ribs, 1)) * opts.length;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, h * 0.98, t + 0.14), mats.concreteDark);
    rib.position.set(lx, h / 2, 0);
    group.add(rib);

    if (i > 0 && i < ribs && i % 2 === 0) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.25), mats.metal);
      housing.position.set(lx, h * 0.7, t / 2 + 0.15);
      group.add(housing);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), mats.lampOrange);
      bulb.position.set(lx, h * 0.68, t / 2 + 0.28);
      group.add(bulb);
    }
  }

  // Concertina / barbed silhouette on top
  for (let i = 0; i < Math.floor(opts.length / 1.2); i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 4, 10), mats.metal);
    coil.position.set(-opts.length / 2 + 0.6 + i * 1.2, h + 0.35, 0);
    coil.rotation.y = Math.PI / 2;
    group.add(coil);
  }

  enableShadows(group);
  const cos = Math.abs(Math.cos(opts.rotY ?? 0));
  const sin = Math.abs(Math.sin(opts.rotY ?? 0));
  const hx = (opts.length / 2) * cos + (t / 2) * sin;
  const hz = (opts.length / 2) * sin + (t / 2) * cos;
  const colliders = [makeCollider(opts.x, h / 2, opts.z, hx, h / 2, hz, 0.1)];
  return { group, colliders };
}

/** Gate arch frame — readable wall openings. */
export function makeGateFrame(
  mats: WorldMaterials,
  opts: { x: number; z: number; rotY?: number; width?: number; height?: number },
): PropResult {
  const group = new THREE.Group();
  const w = opts.width ?? 11;
  const h = opts.height ?? 6.5;
  group.position.set(opts.x, 0, opts.z);
  if (opts.rotY) group.rotation.y = opts.rotY;

  for (const sx of [-1, 1] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), mats.concreteDark);
    post.position.set(sx * (w / 2), h / 2, 0);
    group.add(post);
    // Cap lights
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.85), mats.metal);
    cap.position.set(sx * (w / 2), h + 0.1, 0);
    group.add(cap);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mats.lampOrange);
    lamp.position.set(sx * (w / 2), h - 0.5, 0.4);
    group.add(lamp);
  }

  // Cross beam
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.45, 0.5), mats.metal);
  beam.position.y = h - 0.1;
  group.add(beam);

  // Hazard stripe bar
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.18, 0.12), mats.hazard);
  stripe.position.set(0, h - 0.55, 0.28);
  group.add(stripe);

  enableShadows(group);
  // Post colliders only — opening is walkable (world-space for group rotY)
  const colliders: Collider[] = [];
  const rot = opts.rotY ?? 0;
  for (const sx of [-1, 1] as const) {
    const lx = sx * (w / 2);
    const wx = opts.x + lx * Math.cos(rot);
    const wz = opts.z - lx * Math.sin(rot);
    colliders.push(makeCollider(wx, h / 2, wz, 0.45, h / 2, 0.45, 0.08));
  }
  return { group, colliders };
}

export function makeHqTower(mats: WorldMaterials, opts: { x: number; z: number }): PropResult {
  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);

  // Plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 13), mats.concreteDark);
  plinth.position.y = 0.2;
  group.add(plinth);

  // Base building
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 12), mats.concrete);
  base.position.y = 2.7;
  group.add(base);

  // Base ledge
  const baseLedge = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.25, 12.4), mats.concreteDark);
  baseLedge.position.y = 5.25;
  group.add(baseLedge);

  // Mid stack
  const mid = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 9), mats.concreteDark);
  mid.position.y = 7.2;
  group.add(mid);

  // Central tower shaft with corner fins
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 5), mats.concrete);
  shaft.position.y = 14.2;
  group.add(shaft);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 10, 0.35), mats.concreteDark);
    fin.position.set(sx * 2.55, 14.2, sz * 2.55);
    group.add(fin);
  }

  // Tower top / comms deck
  const top = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.2, 6.5), mats.metal);
  top.position.y = 20.2;
  group.add(top);

  // Rooftop AC cluster
  for (const [ax, az] of [
    [-2, -2],
    [2, -1.5],
    [-1.5, 2],
  ] as const) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.1), mats.metal);
    ac.position.set(ax, 5.7, az);
    group.add(ac);
  }

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 8), mats.metal);
  mast.position.y = 23.5;
  group.add(mast);

  // Multiple antennas
  for (const [ox, oz, h] of [
    [1.5, 0.5, 3.2],
    [-1.2, 1.0, 2.4],
    [0.3, -1.4, 2.8],
  ] as const) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 5), mats.metal);
    ant.position.set(ox, 21.5 + h / 2, oz);
    group.add(ant);
  }

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 16), mats.metal);
  dish.rotation.x = Math.PI / 3;
  dish.position.set(1.4, 22.7, 0);
  group.add(dish);

  // Dense emissive windows on base + mid + shaft (extra rows for skyline bloom)
  const places: Array<[number, number, number, number, number, number]> = [];
  // Base faces — denser grids
  for (const face of [
    { y: 1.6, z: 6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 1.6, z: -6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 2.8, z: 6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 2.8, z: -6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 4.0, z: 6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 4.0, z: -6.08, x: 0, ry: 0, span: 12, axis: "x" as const },
    { y: 1.6, z: 0, x: 7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
    { y: 1.6, z: 0, x: -7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
    { y: 2.8, z: 0, x: 7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
    { y: 2.8, z: 0, x: -7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
    { y: 4.0, z: 0, x: 7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
    { y: 4.0, z: 0, x: -7.08, ry: Math.PI / 2, span: 10, axis: "z" as const },
  ]) {
    const count = Math.floor(face.span / 1.55);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      // Skip door zone on +Z
      if (face.z > 5 && Math.abs(t) < 0.12 && face.y < 3) continue;
      if (face.axis === "x") {
        places.push([t * face.span * 0.88, face.y, face.z, face.ry, 1.25, 0.95]);
      } else {
        places.push([face.x, face.y, t * face.span * 0.88, face.ry, 1.25, 0.95]);
      }
    }
  }
  // Mid — more panes
  for (const [px, py, pz, ry] of [
    [0, 6.6, 4.58, 0],
    [0, 6.6, -4.58, 0],
    [5.08, 6.6, 0, Math.PI / 2],
    [-5.08, 6.6, 0, Math.PI / 2],
    [0, 7.8, 4.58, 0],
    [0, 7.8, -4.58, 0],
    [5.08, 7.8, 0, Math.PI / 2],
    [-5.08, 7.8, 0, Math.PI / 2],
    [0, 8.9, 4.58, 0],
    [5.08, 8.9, 0, Math.PI / 2],
    [-5.08, 8.9, 0, Math.PI / 2],
  ] as const) {
    places.push([px, py, pz, ry, 1.7, 0.9]);
  }
  // Shaft
  for (const py of [11.2, 13.2, 15.2, 17.2, 18.8] as const) {
    places.push([0, py, 2.58, 0, 1.5, 0.85]);
    places.push([0, py, -2.58, 0, 1.5, 0.85]);
    places.push([2.58, py, 0, Math.PI / 2, 1.5, 0.85]);
    places.push([-2.58, py, 0, Math.PI / 2, 1.5, 0.85]);
  }

  for (let i = 0; i < places.length; i++) {
    const [px, py, pz, ry, ww, wh] = places[i]!;
    const dark = i % 8 === 0;
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(ww, wh, 0.1),
      dark ? mats.windowDark : i % 2 === 0 ? mats.windowWarm : mats.windowCyan,
    );
    win.position.set(px, py, pz);
    win.rotation.y = ry;
    group.add(win);
  }

  // Metal coping on HQ base roof ledge — moon edge catch
  const baseCoping = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.08, 12.6), mats.metal);
  baseCoping.position.y = 5.4;
  group.add(baseCoping);

  // Main entrance
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.15), mats.concreteDark);
  door.position.set(0, 1.5, 6.1);
  group.add(door);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.1, 0.2), mats.metal);
  doorFrame.position.set(0, 1.55, 6.05);
  group.add(doorFrame);

  // Rooftop flood mesh (engine owns the real searchlight at origin height — this is local HQ glow only)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mats.lampOrange);
  lamp.position.set(0, 21.5, 0);
  group.add(lamp);
  const pl = new THREE.PointLight(0xff9944, 1.6, 32, 2);
  pl.position.set(0, 21.2, 0);
  group.add(pl);

  enableShadows(group);
  const colliders = [
    makeCollider(opts.x, 2.7, opts.z, 7, 2.7, 6, 0.15),
    makeCollider(opts.x, 7.2, opts.z, 5, 2, 4.5, 0.12),
    makeCollider(opts.x, 14.2, opts.z, 2.5, 5, 2.5, 0.12),
    makeCollider(opts.x, 20.2, opts.z, 3.25, 1.1, 3.25, 0.1),
  ];
  return { group, colliders };
}

export function makeDistantHill(
  mats: WorldMaterials,
  opts: { x: number; z: number; sx: number; sy: number; sz: number },
): PropResult {
  const group = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 6), mats.hill);
  hill.scale.set(opts.sx, opts.sy, opts.sz);
  hill.position.set(opts.x, opts.sy * 0.35, opts.z);
  hill.rotation.y = (opts.x * 0.01 + opts.z * 0.007) % (Math.PI * 2);
  group.add(hill);
  return { group, colliders: [] };
}

/** Night sky: dense starfield points + soft moon disc. No colliders. */
export function makeStarfieldAndMoon(mats: WorldMaterials): PropResult {
  const group = new THREE.Group();
  group.name = "SkyDome";

  // Star points on large sphere (inside surface)
  const STAR_COUNT = 1800;
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const radius = 280;
  for (let i = 0; i < STAR_COUNT; i++) {
    // Bias toward upper hemisphere
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v * 0.92); // mostly sky
    const r = radius * (0.92 + Math.random() * 0.08);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    // Slight color variance (cool white / pale blue / warm)
    const tint = Math.random();
    if (tint > 0.92) {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 0.7;
    } else if (tint > 0.7) {
      colors[i * 3] = 0.75;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 1;
    } else {
      colors[i * 3] = 0.9;
      colors[i * 3 + 1] = 0.93;
      colors[i * 3 + 2] = 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const starMat = mats.starMat.clone();
  starMat.vertexColors = true;
  starMat.size = 1.1;
  const stars = new THREE.Points(geo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -10;
  group.add(stars);

  // Brighter sparse "constellation" layer
  const BRIGHT = 80;
  const bpos = new Float32Array(BRIGHT * 3);
  for (let i = 0; i < BRIGHT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 0.85);
    const r = radius * 0.95;
    bpos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    bpos[i * 3 + 1] = r * Math.cos(phi);
    bpos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute("position", new THREE.BufferAttribute(bpos, 3));
  const brightMat = mats.starMat.clone();
  brightMat.size = 2.2;
  brightMat.opacity = 1;
  const brightStars = new THREE.Points(bgeo, brightMat);
  brightStars.frustumCulled = false;
  brightStars.renderOrder = -9;
  group.add(brightStars);

  // Moon disc + glow halo — matches moon light direction-ish (NE sky)
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), mats.moonMat);
  moon.position.set(90, 110, -70);
  moon.lookAt(0, 40, 0);
  moon.renderOrder = -8;
  group.add(moon);

  const haloMat = mats.moonMat.clone();
  haloMat.opacity = 0.35;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), haloMat);
  halo.position.copy(moon.position);
  halo.position.multiplyScalar(0.98);
  halo.lookAt(0, 40, 0);
  halo.renderOrder = -11;
  group.add(halo);

  // Cloned mats disposed with world (not shared kit)
  group.userData.ownedMaterials = [starMat, brightMat, haloMat];

  return { group, colliders: [] };
}

/** Decorative spawn plaza chevron (no collider). */
export function makeSpawnPlazaMarkings(mats: WorldMaterials): PropResult {
  const group = new THREE.Group();
  group.position.set(0, 0.015, 0);

  // Outer dashed ring segments
  const segments = 12;
  for (let i = 0; i < segments; i++) {
    if (i % 3 === 0) continue; // gaps for lanes
    const a = (i / segments) * Math.PI * 2;
    const r = 7.2;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.22), mats.hazard);
    mark.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    mark.rotation.y = -a + Math.PI / 2;
    group.add(mark);
  }

  // Inner cross / drop-zone X
  for (const rot of [Math.PI / 4, -Math.PI / 4] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.02, 0.16), mats.hazard);
    arm.rotation.y = rot;
    group.add(arm);
  }

  // Center pad disc (dark concrete feel via metal dark)
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.03, 24), mats.concreteDark);
  pad.position.y = -0.005;
  group.add(pad);

  return { group, colliders: [] };
}
