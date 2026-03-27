export const colors = {
  canvas: "#FEFEFE",
  canvasMuted: "rgba(255,255,255,0.92)",
  ink: "#111111",
  inkMuted: "rgba(17,17,17,0.72)",
  inkSoft: "rgba(17,17,17,0.56)",
  inkFaint: "rgba(17,17,17,0.22)",
  borderSoft: "rgba(17,17,17,0.16)",
  borderFaint: "rgba(17,17,17,0.08)",
  overlayGray: "rgba(236,236,236,0.88)",
  danger: "#C62828",
  white: "#FFFFFF",
  shadow: "#000000",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const typography = {
  titleLg: {
    fontSize: 22,
    fontWeight: "600" as const,
    lineHeight: 26,
  },
  titleSm: {
    fontSize: 14,
    fontWeight: "600" as const,
    lineHeight: 14,
  },
  body: {
    fontSize: 14,
    fontWeight: "500" as const,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 14,
  },
  menu: {
    fontSize: 15,
    fontWeight: "500" as const,
    lineHeight: 18,
  },
  icon: {
    fontSize: 18,
    fontWeight: "500" as const,
  },
} as const;

export const radius = {
  pill: 999,
  card: 10,
  control: 7,
} as const;

export const shadows = {
  stackCard: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  stackDock: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

export const z = {
  nav: 1000,
  menu: 1002,
  playerStack: 12,
  transport: 20,
  disc: 999,
  tonearm: 1200,
} as const;

export const iconography = {
  back: "\u2190",
  menu: "\u2630",
  close: "\u2715",
  refresh: "\u21BB",
  play: "\u25B6",
  blocked: "\u26D4",
  gift: "\uD83C\uDF81",
} as const;
