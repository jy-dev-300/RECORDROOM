export const SECTIONS_PER_ROW = 2;
export const STACKS_PER_SECTION = 1;
export const STACKS_PER_ROW = 1;
export const MIN_SCALE = 1;
export const MAX_SCALE_PHONE = 14;
export const MAX_SCALE_TABLET = 12;
export const PREVIEW_STRIP_RATIO = 24 / 360;
export const PREVIEW_STRIP_FALLOFF = 0.76;
export const EDGE_BACK_ZONE = 64;
export const EDGE_BACK_TRIGGER = 40;
export const OVERVIEW_VERTICAL_SHIFT_RATIO = 0.02;
const OVERVIEW_SIDE_GUTTER_RATIO_PHONE = 0.055;
const OVERVIEW_SIDE_GUTTER_RATIO_TABLET = 0.07;
const OVERVIEW_INTER_COLUMN_GAP_RATIO_PHONE = 0.09;
const OVERVIEW_INTER_COLUMN_GAP_RATIO_TABLET = 0.024;
const OVERVIEW_ROW_GAP_RATIO_PHONE = 0.0095;
const OVERVIEW_ROW_GAP_RATIO_TABLET = 0.012;
const OVERVIEW_PREVIEW_SIZE_RATIO_PHONE = 0.33;
const OVERVIEW_PREVIEW_SIZE_RATIO_TABLET = 0.24;
const OVERVIEW_MAX_ROW_HEIGHT_RATIO_PHONE = 0.2;
const OVERVIEW_MAX_ROW_HEIGHT_RATIO_TABLET = 0.24;

export type StackFrame = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TrackWorldLayout = {
  isTabletLike: boolean;
  viewportWidth: number;
  viewportHeight: number;
  sectionGapX: number;
  sectionGapY: number;
  internalRowGapY: number;
  sectionInnerPadding: number;
  stackGapX: number;
  sectionWidth: number;
  previewSize: number;
  rowHeight: number;
  sectionHeight: number;
  megaBlockWidth: number;
  megaBlockHeight: number;
  worldWidth: number;
  worldHeight: number;
  megaBlockLeft: number;
  megaBlockTop: number;
  detailStackWidth: number;
  resolveEndScale: number;
  resolveStartScale: number;
  maxScale: number;
};

export function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampWorklet(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

export function clampCameraX(
  value: number,
  viewportWidth: number,
  worldWidth: number,
  worldHeight: number,
  scale: number
) {
  "worklet";
  const bounds = {
    width: worldWidth * scale,
    height: worldHeight * scale,
  };
  const minTranslation = Math.min(0, viewportWidth - bounds.width);
  const maxTranslation = 0;
  return clampWorklet(value, minTranslation, maxTranslation);
}

export function clampCameraY(
  value: number,
  viewportHeight: number,
  worldWidth: number,
  worldHeight: number,
  scale: number
) {
  "worklet";
  const bounds = {
    width: worldWidth * scale,
    height: worldHeight * scale,
  };
  const minTranslation = Math.min(0, viewportHeight - bounds.height);
  const maxTranslation = 0;
  return clampWorklet(value, minTranslation, maxTranslation);
}

export function getPreviewStrip(size: number) {
  return Math.max(2, Math.round(size * PREVIEW_STRIP_RATIO));
}

export function getPreviewStackOffset(size: number, rel: number) {
  if (rel <= 0) return 0;

  const strip = getPreviewStrip(size);
  const whole = Math.floor(rel);
  const fractional = rel - whole;
  let offset = 0;

  for (let depth = 0; depth < whole; depth += 1) {
    offset += strip * Math.pow(PREVIEW_STRIP_FALLOFF, depth);
  }

  offset += strip * Math.pow(PREVIEW_STRIP_FALLOFF, whole) * fractional;
  return offset;
}

export function getPreviewPressableHeight(size: number) {
  return size + getPreviewStackOffset(size, 3);
}

export function buildTrackWorldLayout(width: number, height: number): TrackWorldLayout {
  const isTabletLike = width >= 768;
  const viewportWidth = width;
  const viewportHeight = height;
  const sideGutter = Math.round(
    viewportWidth * (isTabletLike ? OVERVIEW_SIDE_GUTTER_RATIO_TABLET : OVERVIEW_SIDE_GUTTER_RATIO_PHONE)
  );
  const sectionGapX = Math.round(
    viewportWidth
      * (isTabletLike ? OVERVIEW_INTER_COLUMN_GAP_RATIO_TABLET : OVERVIEW_INTER_COLUMN_GAP_RATIO_PHONE)
  );
  const internalRowGapY = Math.round(
    viewportHeight * (isTabletLike ? OVERVIEW_ROW_GAP_RATIO_TABLET : OVERVIEW_ROW_GAP_RATIO_PHONE)
  );
  const sectionGapY = internalRowGapY;
  const sectionInnerPadding = 0;
  const stackGapX = isTabletLike ? 7 : 5;
  const minPreview = isTabletLike ? 144 : 80;
  const maxPreview = isTabletLike ? 288 : 144;
  const previewSizeRatio = isTabletLike
    ? OVERVIEW_PREVIEW_SIZE_RATIO_TABLET
    : OVERVIEW_PREVIEW_SIZE_RATIO_PHONE;
  let previewSize = clamp(Math.floor(viewportWidth * previewSizeRatio), minPreview, maxPreview);

  const maxRowHeight =
    viewportHeight * (isTabletLike ? OVERVIEW_MAX_ROW_HEIGHT_RATIO_TABLET : OVERVIEW_MAX_ROW_HEIGHT_RATIO_PHONE);
  while (previewSize > minPreview && getPreviewPressableHeight(previewSize) > maxRowHeight) {
    previewSize -= 1;
  }
  const maxPreviewWidthFromViewport = Math.floor(
    (viewportWidth - sideGutter * 2 - sectionGapX) / SECTIONS_PER_ROW
  );
  previewSize = Math.min(previewSize, maxPreviewWidthFromViewport);

  const sectionWidth = previewSize;
  const rowHeight = getPreviewPressableHeight(previewSize);
  const sectionHeight = sectionInnerPadding * 2 + rowHeight;
  const megaBlockWidth = sectionWidth * 2 + sectionGapX;
  const megaBlockHeight = sectionHeight * 16 + sectionGapY * 15;

  const worldWidth = viewportWidth;
  const worldHeight = Math.max(viewportHeight, megaBlockHeight);
  const megaBlockLeft = sideGutter;
  const megaBlockTop = 0;

  const detailStackWidth = clamp(width * 0.72, 240, 340);
  const resolveEndScale = clamp(detailStackWidth / Math.max(1, previewSize), 2.4, 24);
  const resolveStartScale = resolveEndScale * 0.72;
  const maxScale = Math.max(
    isTabletLike ? MAX_SCALE_TABLET : MAX_SCALE_PHONE,
    resolveEndScale * 1.15
  );

  return {
    isTabletLike,
    viewportWidth,
    viewportHeight,
    sectionGapX,
    sectionGapY,
    internalRowGapY,
    sectionInnerPadding,
    stackGapX,
    sectionWidth,
    previewSize,
    rowHeight,
    sectionHeight,
    megaBlockWidth,
    megaBlockHeight,
    worldWidth,
    worldHeight,
    megaBlockLeft,
    megaBlockTop,
    detailStackWidth,
    resolveEndScale,
    resolveStartScale,
    maxScale,
  };
}
