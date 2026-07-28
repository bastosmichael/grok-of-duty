import * as THREE from "three";

/** Canvas-backed procedural PBR texture factory for zero-asset AAA look. */
function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return c;
}

function hash2(x: number, y: number, seed = 0): number {
  // Fast integer avalanche hash. Procedural map construction runs millions of
  // samples at boot, so avoiding transcendental sine calls is material to TTI.
  let h =
    Math.imul(Math.trunc(x), 374761393) ^
    Math.imul(Math.trunc(y), 668265263) ^
    Math.imul(Math.trunc(seed), 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smoothCurve(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Tileable lattice noise. The old direct sine hash looked like television
 * static even at low frequencies; interpolation produces believable broad
 * staining and wear while the wrapped lattice keeps repeated maps seamless.
 */
function valueNoiseTiled(x: number, y: number, period: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const wrap = (v: number): number => ((v % period) + period) % period;
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

function fbm(uCoord: number, vCoord: number, octaves = 4, seed = 0, baseFrequency = 4): number {
  let value = 0;
  let a = 0.5;
  let frequency = Math.max(1, Math.floor(baseFrequency));
  let amplitudeSum = 0;
  for (let i = 0; i < octaves; i++) {
    value += a * valueNoiseTiled(uCoord * frequency, vCoord * frequency, frequency, seed + i * 17);
    amplitudeSum += a;
    a *= 0.5;
    frequency *= 2;
  }
  return value / Math.max(amplitudeSum, 0.001);
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
      const u = x / size;
      const v = y / size;
      const n = fbm(u, v, 5, seed, 7);
      const grain = (hash2(x, y, seed + 9) - 0.5) * variance;
      // Secondary low-freq blotch for less "static noise" look under moonlight
      const blotch = (fbm(u, v, 3, seed + 40, 2) - 0.5) * variance * 0.55;
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
  const heightField = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heightField[y * size + x] = fbm(x / size, y / size, 5, seed, 12);
    }
  }
  const h = (x: number, y: number): number =>
    heightField[((y + size) % size) * size + ((x + size) % size)]!;
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
      const u = x / size;
      const vCoord = y / size;
      const n = fbm(u, vCoord, 4, seed, 10);
      // Wear streaks — slightly anisotropic roughness variation
      const streak = fbm(u, vCoord, 3, seed + 7, 3);
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

function canvasOf(texture: THREE.CanvasTexture): HTMLCanvasElement {
  return texture.image as HTMLCanvasElement;
}

function drawAsphaltWear(
  map: THREE.CanvasTexture,
  roughnessMap: THREE.CanvasTexture,
  size: number,
): void {
  const colorCtx = canvasOf(map).getContext("2d")!;
  const roughCtx = canvasOf(roughnessMap).getContext("2d")!;

  // Fine aggregate catches the moon without turning the road into uniform noise.
  for (let i = 0; i < size * 5; i++) {
    const x = hash2(i, 1, 901) * size;
    const y = hash2(i, 2, 902) * size;
    const radius = 0.25 + hash2(i, 3, 903) * 1.15;
    const warm = hash2(i, 4, 904) > 0.72;
    colorCtx.fillStyle = warm ? "rgba(105,98,84,0.18)" : "rgba(175,184,196,0.11)";
    colorCtx.beginPath();
    colorCtx.arc(x, y, radius, 0, Math.PI * 2);
    colorCtx.fill();
  }

  // Hairline repair cracks. Paths are deterministic and cross the tile edges rarely.
  for (let crack = 0; crack < 9; crack++) {
    let x = hash2(crack, 0, 910) * size;
    let y = hash2(crack, 1, 911) * size;
    colorCtx.beginPath();
    colorCtx.moveTo(x, y);
    roughCtx.beginPath();
    roughCtx.moveTo(x, y);
    for (let segment = 0; segment < 8; segment++) {
      x += (hash2(crack, segment, 912) - 0.47) * size * 0.045;
      y += (0.035 + hash2(crack, segment, 913) * 0.035) * size;
      colorCtx.lineTo(x, y);
      roughCtx.lineTo(x, y);
    }
    colorCtx.strokeStyle = "rgba(8,10,12,0.56)";
    colorCtx.lineWidth = Math.max(0.8, size / 420);
    colorCtx.stroke();
    roughCtx.strokeStyle = "rgba(65,65,65,0.45)";
    roughCtx.lineWidth = Math.max(1, size / 320);
    roughCtx.stroke();
  }

  map.needsUpdate = true;
  roughnessMap.needsUpdate = true;
}

function drawConcreteWear(
  map: THREE.CanvasTexture,
  roughnessMap: THREE.CanvasTexture,
  size: number,
): void {
  const colorCtx = canvasOf(map).getContext("2d")!;
  const roughCtx = canvasOf(roughnessMap).getContext("2d")!;

  // Mineral speckle and shallow pitting provide mid-frequency read at arm's length.
  for (let i = 0; i < size * 1.5; i++) {
    const x = hash2(i, 0, 921) * size;
    const y = hash2(i, 1, 922) * size;
    const r = 0.4 + hash2(i, 2, 923) * 1.8;
    const dark = hash2(i, 3, 924) > 0.44;
    colorCtx.fillStyle = dark ? "rgba(46,44,40,0.16)" : "rgba(240,235,220,0.12)";
    colorCtx.beginPath();
    colorCtx.arc(x, y, r, 0, Math.PI * 2);
    colorCtx.fill();

    if (i % 4 === 0) {
      roughCtx.fillStyle = dark ? "rgba(250,250,250,0.14)" : "rgba(95,95,95,0.12)";
      roughCtx.beginPath();
      roughCtx.arc(x, y, r * 1.4, 0, Math.PI * 2);
      roughCtx.fill();
    }
  }

  // Damp vertical runoff gives walls scale and a history.
  const stain = colorCtx.createLinearGradient(0, 0, 0, size);
  stain.addColorStop(0, "rgba(40,48,50,0.02)");
  stain.addColorStop(0.72, "rgba(34,40,39,0.06)");
  stain.addColorStop(1, "rgba(24,30,28,0.18)");
  colorCtx.fillStyle = stain;
  colorCtx.fillRect(0, 0, size, size);

  map.needsUpdate = true;
  roughnessMap.needsUpdate = true;
}

function drawMetalWear(
  map: THREE.CanvasTexture,
  roughnessMap: THREE.CanvasTexture,
  size: number,
): void {
  const colorCtx = canvasOf(map).getContext("2d")!;
  const roughCtx = canvasOf(roughnessMap).getContext("2d")!;

  // Directional brushing and sparse bare-metal scratches.
  for (let i = 0; i < 90; i++) {
    const y = hash2(i, 0, 931) * size;
    const x = hash2(i, 1, 932) * size;
    const length = size * (0.04 + hash2(i, 2, 933) * 0.28);
    colorCtx.strokeStyle =
      hash2(i, 3, 934) > 0.7 ? "rgba(220,225,230,0.20)" : "rgba(18,20,22,0.18)";
    colorCtx.lineWidth = 0.45 + hash2(i, 4, 935);
    colorCtx.beginPath();
    colorCtx.moveTo(x, y);
    colorCtx.lineTo(Math.min(size, x + length), y + (hash2(i, 5, 936) - 0.5) * 2);
    colorCtx.stroke();

    roughCtx.strokeStyle = "rgba(38,38,38,0.18)";
    roughCtx.lineWidth = 1;
    roughCtx.beginPath();
    roughCtx.moveTo(x, y);
    roughCtx.lineTo(Math.min(size, x + length), y);
    roughCtx.stroke();
  }

  map.needsUpdate = true;
  roughnessMap.needsUpdate = true;
}

export function asphaltTexture(size = 512): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  // Mid-grey grit — dark enough for night ops, light enough to read under moon
  const result = {
    map: proceduralColorMap(size, [48, 50, 54], 22, 11),
    normalMap: proceduralNormalMap(size, 1.15, 12),
    roughnessMap: proceduralRoughnessMap(size, 0.86, 0.16, 13),
  };
  drawAsphaltWear(result.map, result.roughnessMap, size);
  return result;
}

export function concreteTexture(size = 512): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const result = {
    map: proceduralColorMap(size, [142, 138, 128], 30, 21),
    normalMap: proceduralNormalMap(size, 1.35, 22),
    roughnessMap: proceduralRoughnessMap(size, 0.86, 0.14, 23),
  };
  drawConcreteWear(result.map, result.roughnessMap, size);
  return result;
}

export function metalTexture(size = 256): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const result = {
    map: proceduralColorMap(size, [96, 100, 108], 16, 31),
    normalMap: proceduralNormalMap(size, 0.5, 32),
    roughnessMap: proceduralRoughnessMap(size, 0.5, 0.22, 33),
  };
  drawMetalWear(result.map, result.roughnessMap, size);
  return result;
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
      const u = x / size;
      const v = y / size;
      const grain = fbm(u, v, 5, 41, 9);
      const longGrain = fbm(u, v, 3, 48, 3);
      const ring =
        Math.sin(v * Math.PI * 30 + longGrain * 5 + Math.sin(u * Math.PI * 4) * 0.5) * 0.5 + 0.5;
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
      const n = hash2(Math.floor(x * 0.08), Math.floor(y * 0.08), 77);
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
