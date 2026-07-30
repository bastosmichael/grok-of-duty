export const TRAINING_MODES = {
  alley: {
    title: "Alley Operations",
    eyebrow: "Progressive pursuit",
    description:
      "Clear enclosed city blocks, breach lit interiors, and face a squad that grows every level.",
  },
  range: {
    title: "Legacy Training Range",
    eyebrow: "Dense contact drill",
    description:
      "Return to the original military compound for a faster drill against a full hostile squad.",
  },
} as const;

export type TrainingMode = keyof typeof TRAINING_MODES;
