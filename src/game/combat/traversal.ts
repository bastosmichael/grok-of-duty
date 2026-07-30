const ALLEY_DEPTH_STEP_METERS = 40;
const MAX_ALLEY_FIGHTERS = 40;
const MAX_ALLEY_ATTACKERS = 6;

export type AlleyTraversalThreat = {
  /** Zero-based distance band; one band is approximately one city block. */
  band: number;
  /** One-based district label shown to the player. */
  district: number;
  targetFighters: number;
  concurrentAttackers: number;
};

/**
 * Convert forward traversal into a predictable pressure curve. Each generated
 * block adds two contacts, while live fire lanes unlock much more slowly.
 */
export function createAlleyTraversalThreat(
  distanceMeters: number,
  baseFighters: number,
  baseConcurrentAttackers: number,
): AlleyTraversalThreat {
  const safeDistance = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 0;
  const band = Math.floor(safeDistance / ALLEY_DEPTH_STEP_METERS);

  return {
    band,
    district: band + 1,
    targetFighters: Math.min(MAX_ALLEY_FIGHTERS, Math.max(1, Math.floor(baseFighters)) + band * 2),
    concurrentAttackers: Math.min(
      MAX_ALLEY_ATTACKERS,
      Math.max(1, Math.floor(baseConcurrentAttackers)) + Math.floor(band / 4),
    ),
  };
}

export { ALLEY_DEPTH_STEP_METERS };
