export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function ratio(value: number, by: number) {
  return Math.round(value * by);
}

export const viewportLayout = {
  overview: {
    sideGutterPhone: 0.055,
    sideGutterTablet: 0.07,
    interColumnGapPhone: 0.018,
    interColumnGapTablet: 0.024,
    rowGapPhone: 0.0095,
    rowGapTablet: 0.012,
    previewSizePhone: 0.33,
    previewSizeTablet: 0.24,
    topInset: 0.028,
    bottomInset: 0.08,
    brandRailWidth: 0.13,
    maxRowHeightPhone: 0.2,
    maxRowHeightTablet: 0.24,
  },
  play: {
    contentShiftY: 0.05,
    infoLiftY: 90,
    transportLiftY: -140,
    stackDockBottom: 168,
  },
  detail: {
    detailStackWidthPhone: 0.72,
  },
} as const;

export type ViewportLayout = typeof viewportLayout;
