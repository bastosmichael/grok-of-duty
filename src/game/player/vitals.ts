export type VitalState = {
  health: number;
  armor: number;
  defeated: boolean;
};

/**
 * Resolve one incoming hit. Armor absorbs half of the hit until depleted;
 * defeat is terminal once health reaches zero.
 */
export function applyDamageToVitals(health: number, armor: number, amount: number): VitalState {
  const safeHealth = Number.isFinite(health) ? Math.max(0, health) : 0;
  const safeArmor = Number.isFinite(armor) ? Math.max(0, armor) : 0;
  if (!Number.isFinite(amount) || amount <= 0 || safeHealth <= 0) {
    return {
      health: safeHealth,
      armor: safeArmor,
      defeated: safeHealth <= 0,
    };
  }

  const armorTake = Math.min(safeArmor, amount * 0.5);
  const nextHealth = Math.max(0, safeHealth - (amount - armorTake));

  return {
    health: nextHealth,
    armor: Math.max(0, safeArmor - armorTake),
    defeated: nextHealth <= 0,
  };
}
