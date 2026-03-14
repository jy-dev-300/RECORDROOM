import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { albumStacks } from "../data/albumStacks";
import {
  buildAlbumWorldLayout,
  chunkItems,
  clampCameraX,
  clampCameraY,
  clampWorklet,
  EDGE_BACK_TRIGGER,
  EDGE_BACK_ZONE,
  getPreviewStackOffset,
  MIN_SCALE,
  SECTIONS_PER_ROW,
  STACKS_PER_ROW,
  STACKS_PER_SECTION,
  type StackFrame,
} from "../lib/albumWorldLayout";
import AlbumStackPreview from "./AlbumStackPreview";
import ProjectCardStack from "./ProjectCardStack";

const RUBBER_BAND_CONSTANT = 0.55;
const PREVIEW_VISIBLE_LAYERS = 5;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: number) {
  return (seed % 10000) / 10000;
}

function getPreviewJitter(stackId: string, layerIndex: number, size: number) {
  const seedBase = hashString(`${stackId}-${layerIndex}`);
  const x = (randomFromSeed(seedBase) - 0.5) * size * 0.12;
  const y = (randomFromSeed(seedBase * 3) - 0.5) * size * 0.05;
  const rotate = (randomFromSeed(seedBase * 7) - 0.5) * 6;
  return { x, y, rotate };
}

function isPointInsideRotatedSquare(
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  size: number,
  rotationDeg: number
) {
  const radians = (rotationDeg * Math.PI) / 180;
  const cosTheta = Math.cos(radians);
  const sinTheta = Math.sin(radians);

  const dx = pointX - centerX;
  const dy = pointY - centerY;
  const localX = dx * cosTheta + dy * sinTheta;
  const localY = -dx * sinTheta + dy * cosTheta;

  const half = size / 2;
  return Math.abs(localX) <= half && Math.abs(localY) <= half;
}

export default function AlbumWorld() {
  const { width, height } = useWindowDimensions();
  const [selectedStackIndex, setSelectedStackIndex] = useState<number | null>(null);
  const [playingProject, setPlayingProject] = useState<{
    stackIndex: number;
    projectIndex: number;
  } | null>(null);
  const focusedStackSV = useSharedValue(-1);
  const entryModeRef = useRef<"tap" | "zoom">("tap");
  const preTapCameraRef = useRef<{ scale: number; translateX: number; translateY: number } | null>(
    null
  );

  const layout = useMemo(() => buildAlbumWorldLayout(width, height), [height, width]);
  const sections = useMemo(() => chunkItems(albumStacks, STACKS_PER_SECTION), []);

  const stackFrames = useMemo<StackFrame[]>(() => {
    const frames: StackFrame[] = [];
    for (
      let sectionIndex = 0;
      sectionIndex < albumStacks.length / STACKS_PER_SECTION;
      sectionIndex += 1
    ) {
      const sectionRow = Math.floor(sectionIndex / SECTIONS_PER_ROW);
      const sectionCol = sectionIndex % SECTIONS_PER_ROW;
      const sectionX =
        layout.megaBlockLeft + sectionCol * (layout.sectionWidth + layout.sectionGapX);
      const sectionY =
        layout.megaBlockTop + sectionRow * (layout.sectionHeight + layout.sectionGapY);

      for (let stackIndex = 0; stackIndex < STACKS_PER_SECTION; stackIndex += 1) {
        const row = Math.floor(stackIndex / STACKS_PER_ROW);
        const col = stackIndex % STACKS_PER_ROW;
        const absoluteIndex = sectionIndex * STACKS_PER_SECTION + stackIndex;
        frames.push({
          index: absoluteIndex,
          x: sectionX + layout.sectionInnerPadding + col * (layout.previewSize + layout.stackGapX),
          y:
            sectionY +
            layout.sectionInnerPadding +
            row * (layout.rowHeight + layout.internalRowGapY),
          width: layout.previewSize,
          height: layout.rowHeight,
        });
      }
    }
    return frames;
  }, [layout]);

  useEffect(() => {
    focusedStackSV.value = selectedStackIndex ?? -1;
  }, [focusedStackSV, selectedStackIndex]);

  const initialTranslateX = (layout.viewportWidth - layout.worldWidth) / 2;
  const initialTranslateY = (layout.viewportHeight - layout.worldHeight) / 2;

  const translateX = useSharedValue(initialTranslateX);
  const translateY = useSharedValue(initialTranslateY);
  const scale = useSharedValue(1);
  const lastPinchScale = useSharedValue(1);
  const zoomOpenTriggered = useSharedValue(false);

  useEffect(() => {
    translateX.value = initialTranslateX;
    translateY.value = initialTranslateY;
  }, [initialTranslateX, initialTranslateY, translateX, translateY]);

  const translatedSurfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const scaledSurfaceStyle = useAnimatedStyle(() => ({
    transformOrigin: [0, 0, 0],
    transform: [{ scale: scale.value }],
  }));

  const focusNearestAtPoint = (
    focalX: number,
    focalY: number,
    nextScale: number,
    nextTranslateX: number,
    nextTranslateY: number
  ) => {
    const worldX = (focalX - nextTranslateX) / nextScale;
    const worldY = (focalY - nextTranslateY) / nextScale;

    let targetIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const frame of stackFrames) {
      const centerX = frame.x + frame.width / 2;
      const centerY = frame.y + frame.height / 2;
      const distance = Math.hypot(worldX - centerX, worldY - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        targetIndex = frame.index;
      }
    }

    entryModeRef.current = "zoom";
    preTapCameraRef.current = null;
    setSelectedStackIndex(targetIndex);
  };

  const openStackFromTap = (index: number) => {
    zoomOpenTriggered.value = false;
    lastPinchScale.value = 1;
    preTapCameraRef.current = {
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    };
    entryModeRef.current = "tap";
    setSelectedStackIndex(index);
  };

  const openStackFromScreenPoint = (
    screenX: number,
    screenY: number,
    cameraScale: number,
    cameraTranslateX: number,
    cameraTranslateY: number
  ) => {
    const worldX = (screenX - cameraTranslateX) / cameraScale;
    const worldY = (screenY - cameraTranslateY) / cameraScale;

    for (const frame of stackFrames) {
      const stack = albumStacks[frame.index];
      if (!stack) continue;

      const layerCount = Math.min(PREVIEW_VISIBLE_LAYERS, stack.projects.length);
      for (let rel = 0; rel < layerCount; rel += 1) {
        const jitter = getPreviewJitter(stack.id, rel, frame.width);
        const cardCenterX = frame.x + frame.width / 2 + jitter.x;
        const cardCenterY =
          frame.y +
          (frame.height - frame.width) +
          frame.width / 2 -
          getPreviewStackOffset(frame.width, rel) +
          jitter.y;

        if (
          isPointInsideRotatedSquare(
            worldX,
            worldY,
            cardCenterX,
            cardCenterY,
            frame.width,
            jitter.rotate
          )
        ) {
          openStackFromTap(frame.index);
          return;
        }
      }
    }
  };

  const handleBackFromDetail = () => {
    const currentSelected = selectedStackIndex;
    if (currentSelected == null) return;

    const tapCamera = preTapCameraRef.current;
    if (entryModeRef.current === "tap" && tapCamera) {
      zoomOpenTriggered.value = false;
      lastPinchScale.value = 1;

      scale.value = withTiming(tapCamera.scale, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      translateX.value = withTiming(tapCamera.translateX, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
      translateY.value = withTiming(tapCamera.translateY, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });

      setSelectedStackIndex(null);
      return;
    }

    const targetFrame = stackFrames.find((frame) => frame.index === currentSelected);
    if (!targetFrame) {
      setSelectedStackIndex(null);
      return;
    }

    const returnScale = Math.max(MIN_SCALE, layout.resolveEndScale * 0.75);
    const centerX = targetFrame.x + targetFrame.width / 2;
    const centerY = targetFrame.y + targetFrame.height / 2;
    const nextTranslateX = layout.viewportWidth / 2 - centerX * returnScale;
    const nextTranslateY = layout.viewportHeight * 0.42 - centerY * returnScale;

    zoomOpenTriggered.value = false;
    lastPinchScale.value = 1;

    scale.value = withTiming(returnScale, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    translateX.value = withTiming(
      clampCameraX(
        nextTranslateX,
        layout.viewportWidth,
        layout.worldWidth,
        layout.worldHeight,
        returnScale
      ),
      { duration: 220, easing: Easing.out(Easing.cubic) }
    );
    translateY.value = withTiming(
      clampCameraY(
        nextTranslateY,
        layout.viewportHeight,
        layout.worldWidth,
        layout.worldHeight,
        returnScale
      ),
      { duration: 220, easing: Easing.out(Easing.cubic) }
    );

    setSelectedStackIndex(null);
  };

  const handlePlayProject = (projectIndex: number) => {
    const stackIndex = selectedStackIndex;
    if (stackIndex == null) return;
    setPlayingProject({ stackIndex, projectIndex });
  };

  const handleBackFromPlay = () => {
    setPlayingProject(null);
  };

  if (playingProject != null) {
    return (
      <View style={styles.detailPage}>
        <Pressable hitSlop={20} onPress={handleBackFromPlay} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.playColumns}>
          <View style={styles.playColumn} />
          <View style={styles.playColumn} />
        </View>
      </View>
    );
  }

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      lastPinchScale.value = 1;
      zoomOpenTriggered.value = false;
    })
    .onUpdate((event) => {
      if (Math.abs(event.scale - 1) <= 0.015) {
        lastPinchScale.value = event.scale;
        return;
      }

      const previousScale = scale.value;
      const scaleDelta = event.scale / lastPinchScale.value;
      if (!Number.isFinite(scaleDelta) || scaleDelta <= 0) return;

      const rawScale = previousScale * scaleDelta;
      const nextScale = clampWorklet(rawScale, MIN_SCALE, layout.maxScale);
      const appliedRatio = nextScale / previousScale;
      if (!Number.isFinite(appliedRatio) || appliedRatio <= 0) {
        lastPinchScale.value = event.scale;
        return;
      }

      const nextTranslateX = event.focalX - (event.focalX - translateX.value) * appliedRatio;
      const nextTranslateY = event.focalY - (event.focalY - translateY.value) * appliedRatio;

      scale.value = nextScale;
      translateX.value = clampCameraX(
        nextTranslateX,
        layout.viewportWidth,
        layout.worldWidth,
        layout.worldHeight,
        nextScale
      );
      translateY.value = clampCameraY(
        nextTranslateY,
        layout.viewportHeight,
        layout.worldWidth,
        layout.worldHeight,
        nextScale
      );

      if (
        focusedStackSV.value < 0 &&
        nextScale >= layout.resolveEndScale &&
        !zoomOpenTriggered.value
      ) {
        zoomOpenTriggered.value = true;
        runOnJS(focusNearestAtPoint)(
          event.focalX,
          event.focalY,
          nextScale,
          nextTranslateX,
          nextTranslateY
        );
      }

      if (nextScale < layout.resolveStartScale) {
        zoomOpenTriggered.value = false;
      }

      lastPinchScale.value = event.scale;
    })
    .onEnd(() => {
      lastPinchScale.value = 1;
      zoomOpenTriggered.value = false;
    })
    .onFinalize(() => {
      lastPinchScale.value = 1;
      zoomOpenTriggered.value = false;
    });

  const panGesture = Gesture.Pan()
    .minDistance(6)
    .activeOffsetX([-4, 4])
    .activeOffsetY([-4, 4])
    .maxPointers(1)
    .onChange((event) => {
      const getAxisBounds = (viewportSize: number, contentSize: number) => {
        "worklet";
        if (contentSize <= viewportSize) {
          const centered = (viewportSize - contentSize) / 2;
          return { min: centered, max: centered };
        }
        return { min: viewportSize - contentSize, max: 0 };
      };

      const rubberBandDistance = (offset: number, dimension: number) => {
        "worklet";
        if (offset <= 0) return 0;
        const d = Math.max(1, dimension);
        return (offset * d * RUBBER_BAND_CONSTANT) / (d + RUBBER_BAND_CONSTANT * offset);
      };

      const applyAxisRubberBand = (
        proposedValue: number,
        minBound: number,
        maxBound: number,
        viewportSize: number
      ) => {
        "worklet";
        if (proposedValue < minBound) {
          const overscroll = minBound - proposedValue;
          return minBound - rubberBandDistance(overscroll, viewportSize);
        }
        if (proposedValue > maxBound) {
          const overscroll = proposedValue - maxBound;
          return maxBound + rubberBandDistance(overscroll, viewportSize);
        }
        return proposedValue;
      };

      const scaledWidth = layout.worldWidth * scale.value;
      const scaledHeight = layout.worldHeight * scale.value;
      const xBounds = getAxisBounds(layout.viewportWidth, scaledWidth);
      const yBounds = getAxisBounds(layout.viewportHeight, scaledHeight);

      const proposedX = translateX.value + event.changeX;
      const proposedY = translateY.value + event.changeY;

      translateX.value = applyAxisRubberBand(
        proposedX,
        xBounds.min,
        xBounds.max,
        layout.viewportWidth
      );
      translateY.value = applyAxisRubberBand(
        proposedY,
        yBounds.min,
        yBounds.max,
        layout.viewportHeight
      );
    })
    .onEnd(() => {
      const clampedX = clampCameraX(
        translateX.value,
        layout.viewportWidth,
        layout.worldWidth,
        layout.worldHeight,
        scale.value
      );
      const clampedY = clampCameraY(
        translateY.value,
        layout.viewportHeight,
        layout.worldWidth,
        layout.worldHeight,
        scale.value
      );

      if (Math.abs(clampedX - translateX.value) > 0.01) {
        translateX.value = withSpring(clampedX, {
          stiffness: 320,
          damping: 34,
          mass: 0.9,
        });
      }
      if (Math.abs(clampedY - translateY.value) > 0.01) {
        translateY.value = withSpring(clampedY, {
          stiffness: 320,
          damping: 34,
          mass: 0.9,
        });
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDistance(10)
    .onEnd((event, success) => {
      if (!success || focusedStackSV.value >= 0) return;
      runOnJS(openStackFromScreenPoint)(
        event.x,
        event.y,
        scale.value,
        translateX.value,
        translateY.value
      );
    });

  const worldGesture = Gesture.Exclusive(
    tapGesture,
    Gesture.Simultaneous(panGesture, pinchGesture)
  );

  const detailBackGesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX(12)
    .failOffsetY([-24, 24])
    .onEnd((event) => {
      if (event.translationX >= EDGE_BACK_TRIGGER) {
        runOnJS(handleBackFromDetail)();
      }
    });

  if (selectedStackIndex != null) {
    return (
      <View style={styles.detailPage}>
        <GestureDetector gesture={detailBackGesture}>
          <View style={styles.detailBackEdge} />
        </GestureDetector>
        <Pressable hitSlop={20} onPress={handleBackFromDetail} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.detailCanvas}>
          <ProjectCardStack
            projects={albumStacks[selectedStackIndex].projects}
            onPlayPress={(_, index) => handlePlayProject(index)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GestureDetector gesture={worldGesture}>
        <Animated.View
          style={[
            styles.zoomViewport,
            {
              width: layout.viewportWidth,
              height: layout.viewportHeight,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.zoomSurface,
              translatedSurfaceStyle,
              { width: layout.worldWidth, height: layout.worldHeight },
            ]}
          >
            <Animated.View
              style={[
                styles.scaledSurface,
                scaledSurfaceStyle,
                { width: layout.worldWidth, height: layout.worldHeight },
              ]}
            >
              <View
                style={[
                  styles.worldSurface,
                  { width: layout.worldWidth, height: layout.worldHeight },
                ]}
              >
                <View
                  style={[
                    styles.megaBlock,
                    {
                      left: layout.megaBlockLeft,
                      top: layout.megaBlockTop,
                      width: layout.megaBlockWidth,
                      height: layout.megaBlockHeight,
                    },
                  ]}
                >
                  {chunkItems(sections, SECTIONS_PER_ROW).map((sectionRow, rowIndex) => (
                    <View
                      key={`section-row-${rowIndex}`}
                      style={[
                        styles.sectionsRow,
                        { marginBottom: rowIndex === 3 ? 0 : layout.sectionGapY },
                      ]}
                    >
                      {sectionRow.map((section, sectionIndexInRow) => {
                        const sectionIndex = rowIndex * SECTIONS_PER_ROW + sectionIndexInRow;
                        return (
                          <View
                            key={`section-${sectionIndex}`}
                            style={[
                              styles.section,
                              {
                                width: layout.sectionWidth,
                                height: layout.sectionHeight,
                                padding: layout.sectionInnerPadding,
                                marginRight:
                                  sectionIndexInRow === 0 ? layout.sectionGapX : 0,
                              },
                            ]}
                          >
                            {chunkItems(section, STACKS_PER_ROW).map(
                              (stackRow, stackRowIndex) => (
                                <View
                                  key={`section-${sectionIndex}-stack-row-${stackRowIndex}`}
                                  style={[
                                    styles.stackRow,
                                    {
                                      marginBottom:
                                        stackRowIndex === 1
                                          ? 0
                                          : layout.internalRowGapY,
                                    },
                                  ]}
                                >
                                  {stackRow.map((stack, stackIndexInRow) => (
                                    <View
                                      key={stack.id}
                                      style={[
                                        styles.stackPressable,
                                        {
                                          width: layout.previewSize,
                                          height: layout.rowHeight,
                                          marginRight:
                                            stackIndexInRow === STACKS_PER_ROW - 1
                                              ? 0
                                              : layout.stackGapX,
                                        },
                                      ]}
                                    >
                                      <AlbumStackPreview
                                        stack={stack}
                                        size={layout.previewSize}
                                      />
                                    </View>
                                  ))}
                                </View>
                              )
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  zoomViewport: {
    overflow: "hidden",
  },
  zoomSurface: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  scaledSurface: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  worldSurface: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  megaBlock: {
    position: "absolute",
    justifyContent: "flex-start",
  },
  sectionsRow: {
    flexDirection: "row",
  },
  section: {
    justifyContent: "center",
    borderRadius: 4,
  },
  stackRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  stackPressable: {
    alignItems: "center",
  },
  detailPage: {
    flex: 1,
    backgroundColor: "#FEFEFE",
  },
  detailBackEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_BACK_ZONE,
    zIndex: 20,
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 10,
    zIndex: 30,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "600",
  },
  detailCanvas: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playColumns: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 110,
    paddingBottom: 24,
  },
  playColumn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#FFFFFF",
  },
});
