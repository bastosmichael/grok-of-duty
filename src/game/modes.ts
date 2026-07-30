export const TRAINING_MODES = {
  alley: {
    title: "Alley Operations",
    eyebrow: "Progressive pursuit",
    description:
      "Pursue growing patrols through wide, endless city blocks and breach interactive lit interiors.",
  },
  range: {
    title: "Legacy Training Range",
    eyebrow: "Dense contact drill",
    description:
      "Return to the original military compound for a faster drill against a full hostile squad.",
  },
} as const;

export type TrainingMode = keyof typeof TRAINING_MODES;
