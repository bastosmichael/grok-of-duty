import { describe, expect, test } from "bun:test";
import { getAlternateTrainingMode } from "../src/game/modes";
import { applyDamageToVitals } from "../src/game/player/vitals";

describe("shared player defeat flow", () => {
  test("uses armor before reducing health and marks zero health as defeated", () => {
    const firstHit = applyDamageToVitals(100, 50, 120);
    expect(firstHit).toEqual({
      health: 30,
      armor: 0,
      defeated: false,
    });

    const lethalHit = applyDamageToVitals(firstHit.health, firstHit.armor, 30);
    expect(lethalHit).toEqual({
      health: 0,
      armor: 0,
      defeated: true,
    });
  });

  test("keeps defeat terminal and ignores invalid follow-up damage", () => {
    expect(applyDamageToVitals(0, 10, 20)).toEqual({
      health: 0,
      armor: 10,
      defeated: true,
    });
    expect(applyDamageToVitals(80, 20, Number.NaN)).toEqual({
      health: 80,
      armor: 20,
      defeated: false,
    });
  });

  test("offers the other training map after either scenario", () => {
    expect(getAlternateTrainingMode("alley")).toBe("range");
    expect(getAlternateTrainingMode("range")).toBe("alley");
  });
});
