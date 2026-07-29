/**
 * Slow day ↔ night cycle for outdoor combat.
 * Full period defaults to 12 minutes so both day and night last long enough to feel natural.
 */

export const DAY_NIGHT_PERIOD_SEC = 12 * 60;

export type DayNightSample = {
  /** 0..1 over full period (0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight). */
  phase: number;
  /** 0 = full night, 1 = full day. */
  dayFactor: number;
  /** 0 = lamps off, 1 = lamps full. */
  lampFactor: number;
  sunElevation: number;
  sunAzimuth: number;
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  exposure: number;
  envIntensity: number;
  starOpacity: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

/** Smooth day factor from solar elevation curve. */
function dayAmount(phase: number): number {
  // phase 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight
  const sunAngle = phase * Math.PI * 2 - Math.PI / 2; // -90° at phase 0
  const elev = Math.sin(sunAngle);
  // Map elev -1..1 → night..day with soft twilight band
  const t = (elev + 0.15) / 1.15;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Smoothstep
  return t * t * (3 - 2 * t);
}

export function sampleDayNight(elapsedSec: number, periodSec = DAY_NIGHT_PERIOD_SEC): DayNightSample {
  const phase = ((elapsedSec % periodSec) + periodSec) % periodSec / periodSec;
  const dayFactor = dayAmount(phase);
  const lampFactor = Math.max(0, Math.min(1, 1 - (dayFactor - 0.15) / 0.45));

  const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
  const sunElevation = Math.sin(sunAngle);
  const sunAzimuth = phase * Math.PI * 2;

  const daySky = 0x87b8e8;
  const duskSky = 0xc47848;
  const nightSky = 0x0a101c;
  const dayFog = 0xb8cce0;
  const nightFog = 0x0c1420;

  let skyColor: number;
  let fogColor: number;
  if (dayFactor > 0.55) {
    skyColor = lerpColor(duskSky, daySky, (dayFactor - 0.55) / 0.45);
    fogColor = lerpColor(0xd4a070, dayFog, (dayFactor - 0.55) / 0.45);
  } else if (dayFactor > 0.2) {
    skyColor = lerpColor(nightSky, duskSky, (dayFactor - 0.2) / 0.35);
    fogColor = lerpColor(nightFog, 0xd4a070, (dayFactor - 0.2) / 0.35);
  } else {
    skyColor = nightSky;
    fogColor = nightFog;
  }

  return {
    phase,
    dayFactor,
    lampFactor,
    sunElevation,
    sunAzimuth,
    skyColor,
    fogColor,
    fogDensity: lerp(0.0028, 0.0014, dayFactor),
    hemiSky: lerpColor(0x4a6080, 0xa8c8f0, dayFactor),
    hemiGround: lerpColor(0x1a1410, 0x8a7a60, dayFactor),
    hemiIntensity: lerp(0.35, 0.95, dayFactor),
    ambientColor: lerpColor(0x121a28, 0xc8d4e0, dayFactor),
    ambientIntensity: lerp(0.12, 0.55, dayFactor),
    sunColor: lerpColor(0xa0b8e0, 0xfff2d0, dayFactor),
    sunIntensity: lerp(0.35, 3.4, Math.max(0, sunElevation)),
    exposure: lerp(1.05, 1.25, dayFactor),
    envIntensity: lerp(0.28, 0.7, dayFactor),
    starOpacity: Math.max(0, 1 - dayFactor * 1.6),
  };
}
