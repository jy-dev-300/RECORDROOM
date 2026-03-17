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
  Text,
  View,
} from "react-native";
import type { PreviewLayerSnapshot } from "../components/TrackStackPreviewOnOverviewScreen";

export type StackProject = {
  id: string;
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
  releaseTitle?: string | null;
  media: string;
  thumbnail?: string;
  type: "image" | "video";
  color: string;
  href?: string;
};

type SingleTrackStackScreenProps = {
  projects: StackProject[];
  enableIntroAnimation?: boolean;
  onActiveIndexChange?: (index: number) => void;
  focusIndex?: number | null;
  onProjectPress?: (project: StackProject, index: number) => void;
  onPlayPress?: (project: StackProject, index: number) => void;
  onGiftPress?: (project: StackProject, index: number) => void;
  isProjectSaved?: (project: StackProject) => boolean;
  onSaveProject?: (project: StackProject, index: number) => void;
  onRemoveProject?: (project: StackProject, index: number) => void;
  stackWidthOverride?: number;
  introRotationOffsetDeg?: number;
  introLayerSnapshots?: PreviewLayerSnapshot[];
};

function normalise(value: number, size: number) {
  return ((value % size) + size) % size;
}

const STRIP = 24;
const EASE = 0.12;
const TOUCH_EASE = 0.07;
const SNAP_EPSILON = 0.0009;
const SWIPE_GESTURE_PX = 18;
const SWIPE_COOLDOWN_MS = 120;
const EARLY_WRAP_START = 0.95;
const INTRO_DURATION_MS = 1200;
const DETAIL_VERTICAL_SHIFT_RATIO = 0.05;

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

function getIncomingCardOpacity() {
  return 1;
}

function getVisibleDepth(projectCount: number) {
  return clamp(projectCount - 1, 0, 4);
}

export default function SingleTrackStackScreen({
  projects,
  enableIntroAnimation = true,
  onActiveIndexChange,
  focusIndex,
  onProjectPress,
  onPlayPress,
  onGiftPress,
  isProjectSaved,
  onSaveProject,
  onRemoveProject,
  stackWidthOverride,
  introRotationOffsetDeg = 0,
  introLayerSnapshots,
}: SingleTrackStackScreenProps) {
  const renderProjects = useMemo(
    () => projects.filter((project) => project.type !== "image" || project.media.trim().length > 0),
    [projects]
  );
  const N = renderProjects.length;
  const visibleDepth = getVisibleDepth(N);
  const [viewportWidth, setViewportWidth] = useState(Dimensions.get("window").width);
  const [viewportHeight, setViewportHeight] = useState(Dimensions.get("window").height);
  const [stackReady, setStackReady] = useState(false);
  const [frameValue, setFrameValue] = useState(0);
  const [, setLoadedMap] = useState<Record<string, boolean>>({});
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
      setViewportHeight(window.height);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const boot = () => {
      setStackReady(true);
      progressRef.current = 0;
      targetRef.current = 0;
      setFrameValue(0);
      setLoadedMap(
        renderProjects.reduce<Record<string, boolean>>((acc, project) => {
          acc[project.id] = project.type !== "image" || !project.media;
          return acc;
        }, {})
      );

      renderProjects
        .slice(0, Math.min(2, renderProjects.length))
        .forEach((project) => {
          if (project.type !== "image" || !project.media) return;
          void Image.prefetch(project.media).catch(() => {});
        });
    };

    boot();
  }, [renderProjects]);

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
      Math.abs(candidate - current) < Math.abs(best - current) ? candidate : best
    );
  };

  useEffect(() => {
    if (focusIndex == null) return;
    targetRef.current = nearestEquivalentIndex(focusIndex, progressRef.current);
  }, [focusIndex, N]);

  useEffect(() => {
    if (!enableIntroAnimation) {
      introProgress.setValue(1);
      introLockedRef.current = false;
      setIntroLocked(false);
      return;
    }

    introProgress.setValue(0);
    introLockedRef.current = true;
    setIntroLocked(true);
    const animation = Animated.timing(introProgress, {
      toValue: 1,
      duration: INTRO_DURATION_MS,
      easing: Easing.bezier(0.2, 0.9, 0.25, 1),
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
  }, [enableIntroAnimation, introProgress, renderProjects]);

  useEffect(() => {
    const animate = () => {
      const activeEase = inputModeRef.current === "touch" ? TOUCH_EASE : EASE;

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
          !introLockedRef.current && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
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

  const stackWidth =
    stackWidthOverride ??
    (viewportWidth >= 756 && viewportWidth <= 1245 ? 360 : clamp(viewportWidth * 0.88, 280, 420));
  const messyOffsets = useMemo(
    () => renderProjects.map((project, index) => getMessyCardOffset(project.id, index, stackWidth)),
    [renderProjects, stackWidth]
  );

  const cardHeight = stackWidth;
  const verticalShift = viewportHeight * DETAIL_VERTICAL_SHIFT_RATIO;

  const rawP = frameValue;
  const stepProgress = rawP - Math.floor(rawP);
  const currentSlotBase = Math.floor(rawP);
  const activeSlot = normalise(currentSlotBase, N);
  const activeProject = renderProjects[activeSlot];
  const isActiveProjectSaved = activeProject ? isProjectSaved?.(activeProject) === true : false;

  if (N === 0) {
    return <View style={styles.outer} />;
  }

  return (
    <View style={[styles.outer, { transform: [{ translateY: verticalShift }] }]}>
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
        {renderProjects.map((project, index) => {
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
            scale = 1;
            const tyStrip = -(rel * STRIP);
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
                    current[project.id] ? current : { ...current, [project.id]: true }
                  )
                }
                style={styles.mediaFill}
              >
                {null}
              </ImageBackground>
            ) : (
              <View style={styles.transparentSurface} />
            );

          const messy = messyOffsets[index] ?? { x: 0, y: 0, rotate: 0 };
          const snapshot = introLayerSnapshots?.[index];
          const introTranslateXStart = snapshot?.translateX ?? messy.x;
          const introTranslateYStart = snapshot?.translateY ?? messy.y;
          const introRotateStart =
            (snapshot?.rotateDeg ?? messy.rotate) + introRotationOffsetDeg * Math.max(0.42, 1 - index * 0.18);
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
                          outputRange: [introTranslateXStart, 0],
                        }),
                      },
                      {
                        translateY: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [introTranslateYStart, 0],
                        }),
                      },
                      {
                        rotate: introProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [`${introRotateStart}deg`, "0deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={[StyleSheet.absoluteFillObject, styles.clipBoundary]}>
                  <View style={[styles.clipWindow, { top: clipFromTop }]}>
                    <View style={[styles.clipContent, { top: -clipFromTop, height: cardHeight }]}>
                      <View style={StyleSheet.absoluteFillObject}>{content}</View>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>
          );
        })}
      </View>
      {activeProject ? (
        <View style={styles.infoBlock}>
          <Text numberOfLines={1} style={styles.trackTitle}>
            {activeProject.title}
          </Text>
          <Text numberOfLines={1} style={styles.trackMeta}>
            <Text style={styles.metaLabel}>by </Text>
            {activeProject.artistName ?? "Unknown Artist"}
          </Text>
          {activeProject.releaseYear != null ? (
            <Text style={styles.trackMeta}>{String(activeProject.releaseYear)}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.controlsRow}>
        <Pressable
          style={styles.actionButton}
          disabled={introLocked || !activeProject}
          onPress={() => {
            if (!activeProject) return;
            onPlayPress?.(activeProject, activeSlot);
          }}
        >
          <View style={styles.actionButtonInner}>
            <View style={styles.playTriangle} />
          </View>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          disabled={introLocked || !activeProject}
          onPress={() => {
            if (!activeProject) return;
            if (isActiveProjectSaved) {
              onRemoveProject?.(activeProject, activeSlot);
            } else {
              onSaveProject?.(activeProject, activeSlot);
            }
            onProjectPress?.(activeProject, activeSlot);
          }}
        >
          <View style={styles.actionButtonInner}>
            <View style={styles.plusHorizontal} />
            {!isActiveProjectSaved ? <View style={styles.plusVertical} /> : null}
          </View>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          disabled={introLocked || !activeProject}
          onPress={() => {
            if (!activeProject) return;
            onGiftPress?.(activeProject, activeSlot);
          }}
        >
          <View style={styles.actionButtonInner}>
            <View style={styles.giftLid} />
            <View style={styles.giftRibbonVertical} />
            <View style={styles.giftRibbonHorizontal} />
            <View style={styles.giftBox} />
            <View style={[styles.giftBowLoop, styles.giftBowLeft]} />
            <View style={[styles.giftBowLoop, styles.giftBowRight]} />
            <View style={styles.giftBowCenter} />
          </View>
        </Pressable>
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
  infoBlock: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 62,
    paddingHorizontal: 28,
    width: "100%",
  },
  trackTitle: {
    color: "#111111",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  trackMeta: {
    marginTop: 4,
    color: "rgba(17,17,17,0.72)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  metaLabel: {
    fontStyle: "italic",
  },
  controlsRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
    elevation: 6,
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
  transparentSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#000000",
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
    borderLeftColor: "#000000",
    marginLeft: 3,
  },
  plusHorizontal: {
    position: "absolute",
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#000000",
  },
  plusVertical: {
    position: "absolute",
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#000000",
  },
  giftLid: {
    position: "absolute",
    top: 8,
    width: 20,
    height: 5,
    borderWidth: 2,
    borderColor: "#000000",
    borderBottomWidth: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  giftBox: {
    position: "absolute",
    bottom: 2,
    width: 18,
    height: 11,
    borderWidth: 2,
    borderColor: "#000000",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  giftRibbonVertical: {
    position: "absolute",
    top: 8,
    width: 2,
    height: 16,
    backgroundColor: "#000000",
  },
  giftRibbonHorizontal: {
    position: "absolute",
    top: 12,
    width: 20,
    height: 2,
    backgroundColor: "#000000",
  },
  giftBowLoop: {
    position: "absolute",
    top: 3,
    width: 7,
    height: 5,
    borderWidth: 2,
    borderColor: "#000000",
    borderBottomWidth: 0,
    borderRadius: 6,
  },
  giftBowLeft: {
    left: 5,
    transform: [{ rotate: "-24deg" }],
  },
  giftBowRight: {
    right: 5,
    transform: [{ rotate: "24deg" }],
  },
  giftBowCenter: {
    position: "absolute",
    top: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#000000",
  },
});
