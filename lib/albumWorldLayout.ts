export const SECTIONS_PER_ROW = 2;
export const STACKS_PER_SECTION = 16;
export const STACKS_PER_ROW = 8;
export const MIN_SCALE = 1;
export const MAX_SCALE_PHONE = 14;
export const MAX_SCALE_TABLET = 12;
export const PREVIEW_STRIP_RATIO = 24 / 360;
export const PREVIEW_STRIP_FALLOFF = 0.76;
export const EDGE_BACK_ZONE = 44;
export const EDGE_BACK_TRIGGER = 48;
export const OVERVIEW_VERTICAL_SHIFT_RATIO = 0.02;

export type StackFrame = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AlbumWorldLayout = {
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
  return size + getPreviewStackOffset(size, 4);
}

export function buildAlbumWorldLayout(width: number, height: number): AlbumWorldLayout {
  const isTabletLike = width >= 768;
  const viewportWidth = width;
  const viewportHeight = height;
  const sectionGapX = isTabletLike ? 26 : 16;
  const sectionGapY = isTabletLike ? 104 : 72;
  const internalRowGapY = isTabletLike ? 10 : 8;
  const sectionInnerPadding = isTabletLike ? 10 : 6;
  const stackGapX = isTabletLike ? 7 : 5;

  const sectionWidth = (viewportWidth - sectionGapX) / 2;
  const usableSectionWidth = sectionWidth - sectionInnerPadding * 2;
  const minPreview = isTabletLike ? 18 : 10;
  const maxPreview = isTabletLike ? 36 : 18;
  let previewSize = clamp(
    Math.floor((usableSectionWidth - stackGapX * (STACKS_PER_ROW - 1)) / STACKS_PER_ROW),
    minPreview,
    maxPreview
  );

  const baseMaxSectionHeight = (viewportHeight - (isTabletLike ? 30 : 20) * 3) / 4;
  const maxRowHeight = (baseMaxSectionHeight - sectionInnerPadding * 2 - internalRowGapY) / 2;
  while (previewSize > minPreview && getPreviewPressableHeight(previewSize) > maxRowHeight) {
    previewSize -= 1;
  }

  const rowHeight = getPreviewPressableHeight(previewSize);
  const sectionHeight = sectionInnerPadding * 2 + rowHeight * 2 + internalRowGapY;
  const megaBlockWidth = sectionWidth * 2 + sectionGapX;
  const megaBlockHeight = sectionHeight * 4 + sectionGapY * 3;

  const worldWidth = Math.max(viewportWidth, megaBlockWidth);
  const worldHeight = Math.max(viewportHeight, megaBlockHeight);
  const megaBlockLeft = (worldWidth - megaBlockWidth) / 2;
  const centeredTop = (worldHeight - megaBlockHeight) / 2;
  const megaBlockTop = centeredTop - viewportHeight * OVERVIEW_VERTICAL_SHIFT_RATIO;

  const detailStackWidth = clamp(width * 0.88, 280, 420);
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
