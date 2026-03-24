import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

export type Stack = {
  id: string;
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
  releaseTitle?: string | null;
  media: string;
  thumbnail?: string;
  previewFallback?: string;
  type: "image" | "video";
  color: string;
  href?: string;
};

type StackProps = {
  projects: Stack[];
  focusIndex?: number | null;
  onActiveIndexChange?: (index: number) => void;
  stackWidthOverride?: number;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
};

export const STACK_LAYER_OFFSET = 24;
const STACK_EASE = 0.12;
const STACK_TOUCH_EASE = 0.07;
const SNAP_EPSILON = 0.0009;
const SWIPE_GESTURE_PX = 18;
const SWIPE_COOLDOWN_MS = 120;
const EARLY_WRAP_START = 0.95;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalise(value: number, size: number) {
  return ((value % size) + size) % size;
}

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

function getStackIdFromProjectId(projectId: string) {
  const marker = "-card-";
  const markerIndex = projectId.indexOf(marker);
  if (markerIndex <= 0) return projectId;
  return projectId.slice(0, markerIndex);
}

function getMessyCardOffset(projectId: string, layerIndex: number, stackWidth: number) {
  const stackId = getStackIdFromProjectId(projectId);
  const seedBase = hashString(`${stackId}-${layerIndex}`);
  const x = (randomFromSeed(seedBase) - 0.5) * stackWidth * 0.12;
  const y = (randomFromSeed(seedBase * 3) - 0.5) * stackWidth * 0.05;
  const rotate = (randomFromSeed(seedBase * 7) - 0.5) * 6;
  return { x, y, rotate };
}

function getIncomingCardOpacity() {
  return 1;
}

export function getVisibleDepth(projectCount: number) {
  return clamp(projectCount - 1, 0, 4);
}

function StackLayerShell({
  cardHeight,
  clipFromTop,
  depthFactor,
  failedMediaMap,
  messy,
  opacity,
  project,
  scale,
  setFailedMediaMap,
  tiltX,
  tiltY,
  ty,
  zIndex,
}: {
  cardHeight: number;
  clipFromTop: number;
  depthFactor: number;
  failedMediaMap: Record<string, boolean>;
  messy: { x: number; y: number; rotate: number };
  opacity: number;
  project: Stack;
  scale: number;
  setFailedMediaMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  tiltX?: SharedValue<number>;
  tiltY?: SharedValue<number>;
  ty: number;
  zIndex: number;
}) {
  const cardMessStyle = useAnimatedStyle(() => {
    const driftX = tiltX?.value ?? 0;
    const driftY = tiltY?.value ?? 0;
    const horizontalStrength = Math.min(1, Math.abs(driftX) / 12) * depthFactor;
    const verticalStrength = Math.min(1, Math.abs(driftY) / 12) * depthFactor;

    return {
      transform: [
        { translateX: driftX * depthFactor + messy.x * horizontalStrength },
        { translateY: driftY * depthFactor + messy.y * verticalStrength },
        { rotate: `${messy.rotate * verticalStrength}deg` },
      ],
    };
  }, [depthFactor, messy, tiltX, tiltY]);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          zIndex,
          opacity,
          transform: [{ translateY: ty }, { scale }],
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFillObject, cardMessStyle]}>
        <View style={[StyleSheet.absoluteFillObject, styles.clipBoundary]}>
          <View
            style={[
              styles.clipWindow,
              { top: clipFromTop },
            ]}
          >
            <View
              style={[
                styles.clipContent,
                { top: -clipFromTop, height: cardHeight },
              ]}
            >
              <View style={StyleSheet.absoluteFillObject}>
                {project.type === "image" && project.media ? (
                  <ExpoImage
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    onError={() => {
                      if (project.previewFallback && project.previewFallback !== project.media) {
                        setFailedMediaMap((current) =>
                          current[project.id] ? current : { ...current, [project.id]: true }
                        );
                      }
                    }}
                    source={{
                      uri:
                        failedMediaMap[project.id] && project.previewFallback
                          ? project.previewFallback
                          : project.media,
                    }}
                    style={styles.mediaFill}
                    transition={0}
                  />
                ) : (
                  <View style={styles.transparentSurface} />
                )}
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function Stack({
  projects,
  focusIndex,
  onActiveIndexChange,
  stackWidthOverride,
  tiltX,
  tiltY,
}: StackProps) {
  const renderProjects = useMemo(
    () => projects.filter((project) => project.type !== "image" || project.media.trim().length > 0),
    [projects]
  );
  const N = renderProjects.length;
  const visibleDepth = getVisibleDepth(N);
  const [viewportWidth, setViewportWidth] = useState(Dimensions.get("window").width);
  const [frameValue, setFrameValue] = useState(0);
  const [failedMediaMap, setFailedMediaMap] = useState<Record<string, boolean>>({});

  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number>(0);
  const motionDirRef = useRef<1 | -1>(1);
  const touchStartYRef = useRef<number | null>(null);
  const touchAccumRef = useRef(0);
  const touchCooldownUntilRef = useRef(0);
  const inputModeRef = useRef<"default" | "touch">("default");
  const lastActiveNotifiedRef = useRef(-1);
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setViewportWidth(window.width);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    progressRef.current = 0;
    targetRef.current = 0;
    setFrameValue(0);
    setFailedMediaMap({});

    renderProjects
      .slice(0, Math.min(2, renderProjects.length))
      .forEach((project) => {
        if (project.type !== "image" || !project.media) return;
        void Image.prefetch(project.media).catch(() => {});
      });
  }, [renderProjects]);

  useEffect(() => {
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [onActiveIndexChange]);

  const nearestEquivalentIndex = (wanted: number, current: number) => {
    const base = normalise(Math.round(wanted), N);
    const k = Math.round((current - base) / N);
    const candidates = [base + (k - 1) * N, base + k * N, base + (k + 1) * N];
    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - current) < Math.abs(best - current) ? candidate : best
    );
  };

  useEffect(() => {
    if (focusIndex == null || N === 0) return;
    targetRef.current = nearestEquivalentIndex(focusIndex, progressRef.current);
  }, [focusIndex, N]);

  useEffect(() => {
    if (N === 0) return;

    const animate = () => {
      const activeEase = inputModeRef.current === "touch" ? STACK_TOUCH_EASE : STACK_EASE;

      progressRef.current =
        progressRef.current + (targetRef.current - progressRef.current) * activeEase;

      const diff = targetRef.current - progressRef.current;
      if (diff > 0.001) motionDirRef.current = 1;
      else if (diff < -0.001) motionDirRef.current = -1;

      if (Math.abs(diff) < SNAP_EPSILON) {
        progressRef.current = targetRef.current;
      }

      setFrameValue(progressRef.current);

      const activeIdx = normalise(Math.round(progressRef.current), N);
      if (activeIdx !== lastActiveNotifiedRef.current) {
        lastActiveNotifiedRef.current = activeIdx;
        onActiveIndexChangeRef.current?.(activeIdx);
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [N, renderProjects]);

  const stepByTouchDelta = (deltaY: number) => {
    const now = Date.now();
    if (now < touchCooldownUntilRef.current) return;

    if (
      (touchAccumRef.current > 0 && deltaY < 0) ||
      (touchAccumRef.current < 0 && deltaY > 0)
    ) {
      touchAccumRef.current = 0;
    }

    touchAccumRef.current += deltaY;

    if (touchAccumRef.current >= SWIPE_GESTURE_PX) {
      targetRef.current = Math.round(progressRef.current) - 1;
      touchAccumRef.current = 0;
      touchStartYRef.current = null;
      touchCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;
    } else if (touchAccumRef.current <= -SWIPE_GESTURE_PX) {
      targetRef.current = Math.round(progressRef.current) + 1;
      touchAccumRef.current = 0;
      touchStartYRef.current = null;
      touchCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: (_, gestureState) => {
          inputModeRef.current = "touch";
          touchStartYRef.current = gestureState.y0;
          touchAccumRef.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          inputModeRef.current = "touch";
          const currentY = gestureState.moveY;
          const lastY = touchStartYRef.current;
          if (lastY == null) {
            touchStartYRef.current = currentY;
            return;
          }
          const deltaY = lastY - currentY;
          touchStartYRef.current = currentY;
          stepByTouchDelta(deltaY);
        },
        onPanResponderRelease: () => {
          touchStartYRef.current = null;
          touchAccumRef.current = 0;
          inputModeRef.current = "default";
        },
        onPanResponderTerminate: () => {
          touchStartYRef.current = null;
          touchAccumRef.current = 0;
          inputModeRef.current = "default";
        },
      }),
    []
  );

  const stackWidth =
    stackWidthOverride ??
    (viewportWidth >= 756 && viewportWidth <= 1245 ? 360 : clamp(viewportWidth * 0.88, 280, 420));
  const displayedStackWidth = stackWidth * 0.72;
  const messyOffsets = useMemo(
    () =>
      renderProjects.map((project, index) =>
        getMessyCardOffset(project.id, index, displayedStackWidth)
      ),
    [displayedStackWidth, renderProjects]
  );

  const cardHeight = displayedStackWidth;
  const rawP = frameValue;
  const stepProgress = rawP - Math.floor(rawP);
  const currentSlotBase = Math.floor(rawP);
  const activeSlot = N === 0 ? 0 : normalise(currentSlotBase, N);

  if (N === 0) {
    return <View style={styles.outer} />;
  }

  const panHandlers = N > 1 ? panResponder.panHandlers : undefined;

  return (
    <View style={styles.outer}>
      <View
        {...panHandlers}
        style={[
          styles.stack,
          {
            width: displayedStackWidth,
            height: cardHeight,
          },
        ]}
      >
        {renderProjects.map((project, index) => {
          const orderedDist = normalise(index - activeSlot, N);
          const rel = orderedDist - stepProgress;
          const absRel = Math.abs(rel);
          let earlyWrapped = false;
          let earlyWrappedDepth = 0;

          let ty = 0;
          let scale = 1;
          let opacity = 0;
          let clipFromTop = 0;

          if (absRel < 0.001) {
            ty = 0;
            scale = 1;
            opacity = 1;
            clipFromTop = 0;
          } else if (rel >= 0) {
            scale = 1;
            const tyStrip = -(rel * STACK_LAYER_OFFSET);
            ty = tyStrip - (cardHeight / 2) * (1 - scale);
            opacity = getIncomingCardOpacity();
            clipFromTop = 0;
          } else {
            const roll = clamp(absRel, 0, 1);
            if (roll < EARLY_WRAP_START) {
              const rollSmooth = 1 - Math.pow(1 - roll, 1.6);
              ty = 0;
              scale = 1;
              opacity = 1;
              clipFromTop = rollSmooth * cardHeight;
            } else {
              const t = clamp((roll - EARLY_WRAP_START) / (1 - EARLY_WRAP_START), 0, 1);
              const tFast = 1 - Math.pow(1 - t, 3);
              const wrappedRel = N + rel;
              const backRel = Math.min(wrappedRel, visibleDepth + 1);
              const backScale = 1;
              const backTyStrip = -(backRel * STACK_LAYER_OFFSET);
              const backTy = backTyStrip - (cardHeight / 2) * (1 - backScale);

              ty = backTy * tFast;
              scale = 1 + (backScale - 1) * tFast;
              opacity = 1;
              clipFromTop = (1 - tFast) * (roll * cardHeight);
              earlyWrapped = true;
              earlyWrappedDepth = backRel;
            }
          }

          const zIndex =
            rel < 0
              ? earlyWrapped
                ? Math.round(100 - earlyWrappedDepth * 10)
                : 220
              : Math.round(100 - absRel * 10);

          const messy = messyOffsets[index] ?? { x: 0, y: 0, rotate: 0 };
          const depthFactor = Math.max(0.38, 1 - absRel * 0.16);

          return (
            <StackLayerShell
              cardHeight={cardHeight}
              clipFromTop={clipFromTop}
              depthFactor={depthFactor}
              failedMediaMap={failedMediaMap}
              key={project.id}
              messy={messy}
              opacity={opacity}
              project={project}
              scale={scale}
              setFailedMediaMap={setFailedMediaMap}
              tiltX={tiltX}
              tiltY={tiltY}
              ty={ty}
              zIndex={zIndex}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    opacity: 1,
  },
  clipBoundary: {
    overflow: "hidden",
  },
  clipWindow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  clipContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "visible",
  },
  mediaFill: {
    position: "absolute",
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
  },
  transparentSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});
