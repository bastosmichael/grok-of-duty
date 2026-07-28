import * as THREE from "three";

/** Canvas-backed procedural PBR texture factory for zero-asset AAA look. */
function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function noise2(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * noise2(x * f, y * f, seed + i * 17);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

/** Shared sampler setup — mipmaps + anisotropy for oblique ground/wall views */
function configureMap(tex: THREE.CanvasTexture, anisotropy = 8, srgb = false): THREE.CanvasTexture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  if (srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

export function proceduralColorMap(
  size: number,
  base: [number, number, number],
  variance = 18,
  seed = 1,
): THREE.CanvasTexture {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 8, (y / size) * 8, 5, seed);
      const grain = (noise2(x, y, seed + 9) - 0.5) * variance;
      // Secondary low-freq blotch for less "static noise" look under moonlight
      const blotch =
        (fbm((x / size) * 2.5, (y / size) * 2.5, 3, seed + 40) - 0.5) * variance * 0.55;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, base[0] + n * variance + grain + blotch));
      img.data[i + 1] = Math.max(
        0,
        Math.min(255, base[1] + n * variance * 0.9 + grain + blotch * 0.9),
      );
      img.data[i + 2] = Math.max(
        0,
        Math.min(255, base[2] + n * variance * 0.7 + grain + blotch * 0.75),
      );
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureMap(new THREE.CanvasTexture(c), 8, true);
}

export function proceduralNormalMap(size: number, strength = 1, seed = 2): THREE.CanvasTexture {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => fbm((x / size) * 12, (y / size) * 12, 5, seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Central differences — strength scaled for MeshStandard normalScale ~1
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength * 3.2;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength * 3.2;
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, 128 + dx * 127));
      img.data[i + 1] = Math.max(0, Math.min(255, 128 + dy * 127));
      // Z channel encodes up-facing normal; full blue = flat detail maps
      const nz = 1 / Math.sqrt(1 + dx * dx + dy * dy);
      img.data[i + 2] = Math.max(0, Math.min(255, Math.floor(nz * 255)));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Linear data — do NOT tag as sRGB
  return configureMap(new THREE.CanvasTexture(c), 8, false);
}

export function proceduralRoughnessMap(
  size: number,
  base = 0.7,
  variance = 0.25,
  seed = 3,
): THREE.CanvasTexture {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 10, (y / size) * 10, 4, seed);
      // Wear streaks — slightly anisotropic roughness variation
      const streak = fbm((x / size) * 18, (y / size) * 3, 3, seed + 7);
      const v = Math.max(
        0,
        Math.min(1, base + (n - 0.5) * variance * 2 + (streak - 0.5) * variance * 0.35),
      );
      const g = Math.floor(v * 255);
      const i = (y * size + x) * 4;
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureMap(new THREE.CanvasTexture(c), 4, false);
}

export function asphaltTexture(size = 512): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  // Mid-grey grit — dark enough for night ops, light enough to read under moon
  return {
    map: proceduralColorMap(size, [48, 50, 54], 22, 11),
    normalMap: proceduralNormalMap(size, 1.15, 12),
    roughnessMap: proceduralRoughnessMap(size, 0.86, 0.16, 13),
  };
}

export function concreteTexture(size = 512): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return {
    map: proceduralColorMap(size, [142, 138, 128], 30, 21),
    normalMap: proceduralNormalMap(size, 1.35, 22),
    roughnessMap: proceduralRoughnessMap(size, 0.86, 0.14, 23),
  };
}

export function metalTexture(size = 256): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  return {
    map: proceduralColorMap(size, [96, 100, 108], 16, 31),
    normalMap: proceduralNormalMap(size, 0.5, 32),
    roughnessMap: proceduralRoughnessMap(size, 0.5, 0.22, 33),
  };
}

export function woodTexture(size = 256): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = fbm((x / size) * 2, (y / size) * 28, 5, 41);
      const ring = Math.sin((x / size) * Math.PI * 6 + grain * 3) * 0.5 + 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = Math.floor(55 + ring * 40 + grain * 20);
      img.data[i + 1] = Math.floor(38 + ring * 25 + grain * 12);
      img.data[i + 2] = Math.floor(22 + ring * 12);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = configureMap(new THREE.CanvasTexture(c), 8, true);
  return {
    map,
    normalMap: proceduralNormalMap(size, 1.15, 42),
    roughnessMap: proceduralRoughnessMap(size, 0.78, 0.2, 43),
  };
}

/**
 * Soft moon disc + atmospheric corona for sky billboard.
 * Alpha-premultiplied-ish edge so MeshBasicMaterial + transparent blends cleanly.
 */
export function moonGlowTexture(size = 256): THREE.CanvasTexture {
  const c = makeCanvas(size);
  const ctx = c.getContext("2d")!;
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.28;

  ctx.clearRect(0, 0, size, size);

  // Wide soft corona (reads as atmospheric bloom around disc)
  const corona = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, size * 0.48);
  corona.addColorStop(0, "rgba(210, 225, 255, 0.55)");
  corona.addColorStop(0.35, "rgba(160, 185, 230, 0.18)");
  corona.addColorStop(0.7, "rgba(100, 130, 190, 0.05)");
  corona.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, size, size);

  // Solid lunar disc with subtle limb darkening
  const disc = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r);
  disc.addColorStop(0, "rgba(245, 248, 255, 1)");
  disc.addColorStop(0.55, "rgba(220, 228, 245, 1)");
  disc.addColorStop(0.88, "rgba(185, 198, 225, 1)");
  disc.addColorStop(1, "rgba(150, 170, 205, 0.0)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Sparse crater noise (very subtle — COD moons are soft, not NASA photo)
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r * 0.92) continue;
      const n = noise2(x * 0.08, y * 0.08, 77);
      if (n < 0.55) continue;
      const i = (y * size + x) * 4;
      const shade = (n - 0.55) * 28;
      img.data[i] = Math.max(0, img.data[i]! - shade);
      img.data[i + 1] = Math.max(0, img.data[i + 1]! - shade * 0.95);
      img.data[i + 2] = Math.max(0, img.data[i + 2]! - shade * 0.85);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function disposeTextureSet(set: {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
}): void {
  set.map?.dispose();
  set.normalMap?.dispose();
  set.roughnessMap?.dispose();
}
