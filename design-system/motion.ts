export const motion = {
  duration: {
    instant: 45,
    quick: 120,
    standard: 220,
    relaxed: 280,
    long: 350,
    reveal: 900,
  },
  easing: {
    default: "out-cubic",
    settle: "in-out-cubic",
    reveal: "out-cubic",
  },
  overview: {
    driftMaxShiftY: 40,
    driftMaxShiftX: 6,
    driftMaxRotation: 2.5,
    tapStraightenScaleLoss: 0.02,
  },
  play: {
    discDegreesPerSecond: 720,
    tonearmTransitionMs: 280,
  },
  guidance: {
    physical:
      "Use for record stacks, disc movement, and object-like transitions. Motion should feel weighted, not springy.",
    ui:
      "Use for menus, sheets, and utility controls. Motion should be quick, quiet, and never compete with the record objects.",
  },
} as const;
