import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

export type StackProject = {
  id: string;
  title: string;
  media: string;
  type: "image" | "video";
  color: string;
  href?: string;
};

type ProjectCardStackProps = {
  projects: StackProject[];
  onActiveIndexChange?: (index: number) => void;
  focusIndex?: number | null;
  onProjectPress?: (project: StackProject, index: number) => void;
  onPlayPress?: (project: StackProject, index: number) => void;
  stackWidthOverride?: number;
};

// Lerp along the shortest circular path so the wrap from N-1 -> 0 is seamless
function normalise(value: number, size: number) {
  return ((value % size) + size) % size;
}

// How many px of each background card are visible as a strip above the active card
const STRIP = 24;
const VISIBLE_DEPTH = 4;
const EASE = 0.12;
const TOUCH_EASE = 0.07;
const SNAP_EPSILON = 0.0009;
const SWIPE_GESTURE_PX = 18;
const SWIPE_COOLDOWN_MS = 120;
const EARLY_WRAP_START = 0.95;
const INTRO_DURATION_MS = 1000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

// Background cards should stay subdued, but the next card still needs to
// "bleed in" smoothly as it approaches the front. This curve keeps far cards
// dim, then ramps opacity up faster near the active position so the handoff
// feels more intentional and less poppy.
function getIncomingCardOpacity(rel: number) {
  return 1;
}

export default function ProjectCardStack({
  projects,
  onActiveIndexChange,
  focusIndex,
  onProjectPress,
  onPlayPress,
  stackWidthOverride,
}: ProjectCardStackProps) {
  const N = projects.length;
  const [viewportWidth, setViewportWidth] = useState(
    Dimensions.get("window").width
  );
  const [stackReady, setStackReady] = useState(false);
  const [frameValue, setFrameValue] = useState(0);
  const [loadedMap, setLoadedMap] = useState<Record<string, boolean>>({});
  const [overlayProjectId, setOverlayProjectId] = useState<string | null>(null);
  const [introLocked, setIntroLocked] = useState(true);

  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const frameRef = useRef<number>(0);
  const readyRef = useRef(false);
  const motionDirRef = useRef<1 | -1>(1);
  const touchStartYRef = useRef<number | null>(null);
  const touchAccumRef = useRef(0);
  const touchCooldownUntilRef = useRef(0);
  const inputModeRef = useRef<"default" | "touch">("default");
  const lastActiveNotifiedRef = useRef(-1);
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  const introProgress = useRef(new Animated.Value(0)).current;
  const introLockedRef = useRef(true);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setViewportWidth(window.width);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setStackReady(false);
      progressRef.current = 0;
      targetRef.current = 0;
      setFrameValue(0);
      setLoadedMap({});
      setOverlayProjectId(null);

      await Promise.all(
        projects.map(async (project) => {
          if (project.type !== "image" || !project.media) return;
          try {
            await Image.prefetch(project.media);
          } catch {
            // Ignore prefetch failures and keep rendering.
          }
        })
      );

      if (cancelled) return;

      setLoadedMap(
        projects.reduce<Record<string, boolean>>((acc, project) => {
          acc[project.id] = project.type !== "image" || !project.media;
          return acc;
        }, {})
      );
      setStackReady(true);
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    onActiveIndexChangeRef.current = onActiveIndexChange;
  }, [onActiveIndexChange]);

  useEffect(() => {
    readyRef.current = stackReady;
  }, [stackReady]);

  const nearestEquivalentIndex = (wanted: number, current: number) => {
    const base = normalise(Math.round(wanted), N);
    const k = Math.round((current - base) / N);
    const candidates = [base + (k - 1) * N, base + k * N, base + (k + 1) * N];
    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - current) < Math.abs(best - current)
        ? candidate
        : best
    );
  };

  useEffect(() => {
    if (focusIndex == null) return;
    targetRef.current = nearestEquivalentIndex(focusIndex, progressRef.current);
  }, [focusIndex, N]);

  useEffect(() => {
    introProgress.setValue(0);
    introLockedRef.current = true;
    setIntroLocked(true);
    const animation = Animated.timing(introProgress, {
      toValue: 1,
      duration: INTRO_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        introLockedRef.current = false;
        setIntroLocked(false);
      }
    });
    return () => {
      animation.stop();
    };
  }, [introProgress, projects]);

  useEffect(() => {
    const animate = () => {
      const activeEase =
        inputModeRef.current === "touch" ? TOUCH_EASE : EASE;

      progressRef.current =
        progressRef.current +
        (targetRef.current - progressRef.current) * activeEase;

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
  }, [N]);

  const stepByTouchDelta = (deltaY: number) => {
    if (introLockedRef.current) return;
    if (!readyRef.current) return;

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
      touchCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;
    } else if (touchAccumRef.current <= -SWIPE_GESTURE_PX) {
      targetRef.current = Math.round(progressRef.current) + 1;
      touchAccumRef.current = 0;
      touchCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !introLockedRef.current &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: (_, gestureState) => {
          if (introLockedRef.current) return;
          inputModeRef.current = "touch";
          touchStartYRef.current = gestureState.y0;
          touchAccumRef.current = 0;
        },
        onPanResponderMove: (_, gestureState) => {
          if (introLockedRef.current) return;
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

  // Freeze width between 756px and 1245px viewport so the stack does not
  // shrink in that band (mirrors the web version's behaviour).
  const stackWidth =
    stackWidthOverride ??
    (viewportWidth >= 756 && viewportWidth <= 1245
      ? 360
      : clamp(viewportWidth * 0.88, 280, 420));
  const messyOffsets = useMemo(
    () => projects.map((project, index) => getMessyCardOffset(project.id, index, stackWidth)),
    [projects, stackWidth]
  );

  // Square cards: keep current width, match height to width.
  const cardHeight = stackWidth;

  const rawP = frameValue;
  const stepProgress = rawP - Math.floor(rawP);
  const currentSlotBase = Math.floor(rawP);
  const activeSlot = normalise(currentSlotBase, N);
  const activeProjectId = projects[activeSlot]?.id ?? null;

  useEffect(() => {
    setOverlayProjectId((current) =>
      current != null && current === activeProjectId ? current : null
    );
  }, [activeProjectId]);

  return (
    <View style={styles.outer}>
      <View
        {...panResponder.panHandlers}
        style={[
          styles.stack,
          {
            width: stackWidth,
            height: cardHeight,
            opacity: stackReady ? 1 : 0,
          },
        ]}
      >
        {projects.map((project, index) => {
          const orderedDist = normalise(index - activeSlot, N);
          const rel = orderedDist - stepProgress;
          const absRel = Math.abs(rel);
          const isActive = absRel < 0.001;
          let earlyWrapped = false;
          let earlyWrappedDepth = 0;

          let ty = 0;
          let scale = 1;
          let opacity = 0;
          let clipFromTop = 0;

          if (isActive) {
            ty = 0;
            scale = 1;
            opacity = 1;
            clipFromTop = 0;
          } else if (rel >= 0) {
            // Background/incoming card: sits above the active card as a strip.
            // Scale from top-center (compensate for RN center-origin scaling).
            scale = 1;
            const tyStrip = -(rel * STRIP);
            // Shift up by half the height "lost" to center-based scaling so the
            // top edge stays anchored, matching CSS transformOrigin: "top center".
            ty = tyStrip - (cardHeight / 2) * (1 - scale);
            opacity = getIncomingCardOpacity(rel);
            clipFromTop = 0;
          } else {
            // Outgoing card: roll away by clipping from the bottom upward.
            const roll = clamp(absRel, 0, 1);
            if (roll < EARLY_WRAP_START) {
              const rollSmooth = 1 - Math.pow(1 - roll, 1.6);
              ty = 0;
              scale = 1;
              opacity = 1;
              clipFromTop = rollSmooth * cardHeight;
            } else {
              // In the last 5% of roll, blend into the back-slot pose so
              // re-entry feels continuous instead of a hard pop.
              const t = clamp(
                (roll - EARLY_WRAP_START) / (1 - EARLY_WRAP_START),
                0,
                1
              );
              const tFast = 1 - Math.pow(1 - t, 3);
              const wrappedRel = N + rel;
              const backRel = Math.min(wrappedRel, VISIBLE_DEPTH + 1);
              const backScale = 1;
              const backTyStrip = -(backRel * STRIP);
              const backTy = backTyStrip - (cardHeight / 2) * (1 - backScale);

              ty = backTy * tFast;
              scale = 1 + (backScale - 1) * tFast;
              opacity = 1;
              clipFromTop = (1 - tFast) * (roll * cardHeight);
              earlyWrapped = true;
              earlyWrappedDepth = backRel;
            }
          }

          // Keep the outgoing rolling card above the incoming card during handoff.
          const zIndex =
            rel < 0
              ? earlyWrapped
                ? Math.round(100 - earlyWrappedDepth * 10)
                : 220
              : Math.round(100 - absRel * 10);

          const content =
            project.type === "image" && project.media ? (
              <ImageBackground
                source={{ uri: project.media }}
                resizeMode="cover"
                onLoad={() =>
                  setLoadedMap((current) =>
                    current[project.id]
                      ? current
                      : { ...current, [project.id]: true }
                  )
                }
                style={styles.mediaFill}
              >
                {!loadedMap[project.id] ? (
                  <View style={styles.loadingFill} />
                ) : null}
              </ImageBackground>
            ) : (
              <View
                style={[
                  styles.colorSurface,
                  { backgroundColor: project.color },
                ]}
              />
            );

          const messy = messyOffsets[index] ?? { x: 0, y: 0, rotate: 0 };
          const showOverlay = overlayProjectId === project.id;
          const canInteract = !introLocked && absRel < 0.35;

          return (
            <View
              key={project.id}
              pointerEvents={canInteract ? "auto" : "none"}
              style={[
                StyleSheet.absoluteFillObject,
                {
                  zIndex,
                  opacity,
                  transform: [{ translateY: ty }, { scale }],
                },
              ]}
            >
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    transform: [
                      {
                        translateX: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [messy.x, 0],
                        }),
                      },
                      {
                        translateY: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [messy.y, 0],
                        }),
                      },
                      {
                        rotate: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [`${messy.rotate}deg`, "0deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
              {/*
               * Clip structure: simulates CSS clip-path inset(top 0 0 0).
               * clipBoundary — hard outer clip at the card's own bounds.
               * clipWindow   — its top edge moves down by clipFromTop, so only
               *                the bottom portion of the card remains visible.
               * clipContent  — counteracts the window offset so the image stays
               *                at y = 0 relative to the card frame.
               */}
              <View style={[StyleSheet.absoluteFillObject, styles.clipBoundary]}>
                <View style={[styles.clipWindow, { top: clipFromTop }]}>
                  <View
                    style={[
                      styles.clipContent,
                      { top: -clipFromTop, height: cardHeight },
                    ]}
                  >
                    <Pressable
                      disabled={!canInteract}
                      onPress={() => {
                        setOverlayProjectId((current) =>
                          current === project.id ? null : project.id
                        );
                        onProjectPress?.(project, index);
                      }}
                      style={StyleSheet.absoluteFillObject}
                    >
                      {content}
                      {showOverlay ? (
                        <View style={styles.overlay}>
                          <View style={styles.overlayBlur} />
                          <View style={styles.overlayActions}>
                            <Pressable
                              style={styles.actionButton}
                              onPress={() => onPlayPress?.(project, index)}
                            >
                              <View style={styles.actionButtonInner}>
                                <View style={styles.playTriangle} />
                              </View>
                            </Pressable>
                            <Pressable style={styles.actionButton}>
                              <View style={styles.actionButtonInner}>
                                <View style={styles.plusHorizontal} />
                                <View style={styles.plusVertical} />
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                </View>
              </View>
              </Animated.View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  stack: {
    position: "relative",
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
  },
  mediaFill: {
    ...StyleSheet.absoluteFillObject,
  },
  colorSurface: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  loadingFill: {
    flex: 1,
    backgroundColor: "#000000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 20, 0.25)",
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderWidth: 1,
  },
  overlayActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButtonInner: {
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 14,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#FFFFFF",
    marginLeft: 3,
  },
  plusHorizontal: {
    position: "absolute",
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  plusVertical: {
    position: "absolute",
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
});
