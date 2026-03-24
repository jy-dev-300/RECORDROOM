import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  SensorType,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TrackStack } from "../data/trackStacks";
import {
  getPreviewPressableHeight,
  SECTIONS_PER_ROW,
  type TrackWorldLayout,
} from "../lib/trackWorldLayout";
import {
  NAV_LEFT_INSET,
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_RIGHT_INSET,
  NAV_TOP_PADDING,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import TrackStackPreviewOnOverviewScreen, {
  getPreviewJitter,
  getPreviewLayerSnapshot,
  getPreviewParallaxRotation,
  type PreviewLayerSnapshot,
} from "../components/TrackStackPreviewOnOverviewScreen";

type TracksOverviewScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  previewRevealPrimed?: boolean;
  isMyTracksView?: boolean;
  onBack?: () => void;
  onPressMyTracks?: () => void;
  onPressAllTracks?: () => void;
  onPressRefresh?: () => void;
  onPressRefetch?: () => void;
  accountLabel?: string;
  sortOptions?: Array<{
    id: string;
    label: string;
    onPress: () => void;
  }>;
  onPreviewRevealPrimed?: () => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onPrepareStack?: (sectionIndex: number, stackIndex: number) => void;
  onPressStack: (
    sectionIndex: number,
    stackIndex: number,
    previewRotationDeg?: number,
    previewLayerSnapshots?: PreviewLayerSnapshot[]
  ) => void;
};

type SectionFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function getSectionFrame(layout: TrackWorldLayout, sectionIndex: number): SectionFrame {
  const row = Math.floor(sectionIndex / SECTIONS_PER_ROW);
  const col = sectionIndex % SECTIONS_PER_ROW;
  return {
    left: layout.megaBlockLeft + col * (layout.sectionWidth + layout.sectionGapX),
    top: layout.megaBlockTop + row * (layout.sectionHeight + layout.sectionGapY),
    width: layout.sectionWidth,
    height: layout.sectionHeight,
  };
}

type OverviewStackProps = {
  layout: TrackWorldLayout;
  stack: TrackStack;
  sectionIndex: number;
  revealFrontLayers: boolean;
  showDeferredLayers: boolean;
  scrollY: SharedValue<number>;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  onFrontLayerReady: (stackId: string) => void;
  onPrepareStack?: (sectionIndex: number, stackIndex: number) => void;
  onPressStack: (
    sectionIndex: number,
    stackIndex: number,
    previewRotationDeg?: number,
    previewLayerSnapshots?: PreviewLayerSnapshot[]
  ) => void;
};

function OverviewStack({
  layout,
  stack,
  sectionIndex,
  revealFrontLayers,
  showDeferredLayers,
  scrollY,
  tiltX,
  tiltY,
  onFrontLayerReady,
  onPrepareStack,
  onPressStack,
}: OverviewStackProps) {
  const frame = useMemo(() => getSectionFrame(layout, sectionIndex), [layout, sectionIndex]);
  const [isStraightening, setIsStraightening] = useState(false);
  const tapStraightenProgress = useSharedValue(0);
  const previewSize = layout.previewSize;
  const previewHeight = useMemo(() => getPreviewPressableHeight(previewSize), [previewSize]);
  const previewLeft = frame.left + (frame.width - previewSize) / 2;
  const previewTop = frame.top + frame.height - previewHeight;
  const previewRotation = useMemo(() => {
    const jitter = getPreviewJitter(stack.id, 0, previewSize);
    return (
      //jitter.rotate +
      getPreviewParallaxRotation(previewLeft + jitter.x + previewSize / 2, layout.viewportWidth)
    );
  }, [layout.viewportWidth, previewLeft, previewSize, stack.id]);
  const pressableStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - tapStraightenProgress.value * 0.02 }],
  }));

  return (
    <View
      style={[
        styles.stackSlot,
        {
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
        },
      ]}
    >
      <Animated.View style={[styles.stackTiltWrap, pressableStyle]}>
        <Pressable
        hitSlop={12}
        onPress={() => {
          if (isStraightening) {
            return;
          }

          setIsStraightening(true);
          onPrepareStack?.(sectionIndex, 0);
          const previewLayerSnapshots = stack.projects.slice(0, 4).map((_, layerIndex) =>
            getPreviewLayerSnapshot({
              stackId: stack.id,
              layerIndex,
              size: previewSize,
              stackTop: previewTop,
              stackLeft: previewLeft,
              viewportWidth: layout.viewportWidth,
              viewportHeight: layout.viewportHeight,
              scrollY: scrollY.value,
            })
          );
          tapStraightenProgress.value = withTiming(
            1,
            {
              duration: 350,
              easing: Easing.out(Easing.cubic),
            },
            (finished) => {
              if (finished) {
                runOnJS(onPressStack)(sectionIndex, 0, previewRotation, previewLayerSnapshots);
              }
            }
          );
        }}
        style={[
          styles.stackPressable,
          {
            width: previewSize,
            height: previewHeight,
          },
        ]}
        >
          <TrackStackPreviewOnOverviewScreen
            stack={stack}
            size={previewSize}
            stackTop={previewTop}
            stackLeft={previewLeft}
            viewportWidth={layout.viewportWidth}
            viewportHeight={layout.viewportHeight}
            scrollY={scrollY}
            tiltX={tiltX}
            tiltY={tiltY}
            straightenProgress={tapStraightenProgress}
            revealFrontLayers={revealFrontLayers}
            showDeferredLayers={showDeferredLayers}
            onFrontLayerReady={onFrontLayerReady}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TracksOverviewScreen({
  layout,
  sections,
  previewRevealPrimed = false,
  isMyTracksView = false,
  onBack,
  onPressMyTracks,
  onPressAllTracks,
  onPressRefresh,
  onPressRefetch,
  accountLabel,
  sortOptions,
  onPreviewRevealPrimed,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onPrepareStack,
  onPressStack,
}: TracksOverviewScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const hasRestoredScrollRef = useRef(false);
  const onPreviewRevealPrimedRef = useRef(onPreviewRevealPrimed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [readyFrontLayerIds, setReadyFrontLayerIds] = useState<Record<string, true>>({});
  const [revealOverviewFrontLayers, setRevealOverviewFrontLayers] = useState(previewRevealPrimed);
  const [showOverviewFrays, setShowOverviewFrays] = useState(previewRevealPrimed);
  const scrollY = useSharedValue(0);
  const menuProgress = useSharedValue(0);
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 20 });
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const navTop = insets.top + NAV_TOP_PADDING + 24;
  const GRID_TOP_OFFSET = 36;
  const gridOffset = navTop - layout.megaBlockTop + GRID_TOP_OFFSET;
  const gridEdgeWhitespace = Math.max(0, gridOffset);
  const gridBottomWhitespace = gridEdgeWhitespace + 68;
  const renderedRowCount = Math.max(1, Math.ceil(sections.length / SECTIONS_PER_ROW));
  const contentWorldHeight =
    layout.sectionHeight * renderedRowCount + layout.sectionGapY * Math.max(0, renderedRowCount - 1);
  const totalStackCount = useMemo(
    () => sections.reduce((count, section) => count + section.length, 0),
    [sections]
  );

  useEffect(() => {
    onPreviewRevealPrimedRef.current = onPreviewRevealPrimed;
  }, [onPreviewRevealPrimed]);

  useEffect(() => {
    if (hasRestoredScrollRef.current) {
      return;
    }

    scrollY.value = initialScrollOffset;
    scrollViewRef.current?.scrollTo({ x: 0, y: initialScrollOffset, animated: false });
    hasRestoredScrollRef.current = true;
  }, [initialScrollOffset, scrollY]);

  useEffect(() => {
    setReadyFrontLayerIds({});
    if (previewRevealPrimed) {
      setRevealOverviewFrontLayers(true);
      setShowOverviewFrays(true);
      return;
    }

    setRevealOverviewFrontLayers(totalStackCount === 0);
    setShowOverviewFrays(totalStackCount === 0);
  }, [previewRevealPrimed, totalStackCount, sections]);

  useEffect(() => {
    if (previewRevealPrimed) {
      setRevealOverviewFrontLayers(true);
      setShowOverviewFrays(true);
    }
  }, [previewRevealPrimed]);

  useEffect(() => {
    if (revealOverviewFrontLayers || totalStackCount === 0) {
      return;
    }

    if (Object.keys(readyFrontLayerIds).length >= totalStackCount) {
      setRevealOverviewFrontLayers(true);
      return;
    }

    const timeout = setTimeout(() => {
      setRevealOverviewFrontLayers(true);
    }, 900);

    return () => {
      clearTimeout(timeout);
    };
  }, [readyFrontLayerIds, revealOverviewFrontLayers, totalStackCount]);

  useEffect(() => {
    if (!revealOverviewFrontLayers || showOverviewFrays) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowOverviewFrays(true);
    }, 120);

    return () => {
      clearTimeout(timeout);
    };
  }, [revealOverviewFrontLayers, showOverviewFrays]);

  useEffect(() => {
    if (showOverviewFrays) {
      onPreviewRevealPrimedRef.current?.();
    }
  }, [showOverviewFrays]);

  useEffect(() => {
    menuProgress.value = withTiming(menuOpen ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [menuOpen, menuProgress]);

  const handleFrontLayerReady = (stackId: string) => {
    setReadyFrontLayerIds((current) => {
      if (current[stackId]) {
        return current;
      }
      return { ...current, [stackId]: true };
    });
  };
  useAnimatedReaction(
    () => ({
      x: gravity.sensor.value.x ?? 0,
      y: gravity.sensor.value.y ?? 0,
    }),
    (value) => {
      const clampedX = Math.max(-7, Math.min(7, value.x));
      const clampedY = Math.max(-7, Math.min(7, value.y));
      tiltX.value = clampedX * 6.5;
      const verticalStrength = clampedY > 0 ? 9.5 : 3.8;
      tiltY.value = clampedY * -verticalStrength;
    },
    [gravity, tiltX, tiltY]
  );
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (onScrollOffsetChange) {
        runOnJS(onScrollOffsetChange)(event.contentOffset.y);
      }
    },
  });
  const menuPanelStyle = useAnimatedStyle(() => ({
    opacity: menuProgress.value,
    transform: [{ translateX: (1 - menuProgress.value) * 32 }],
  }));

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        bounces
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.viewport,
          {
            width: layout.viewportWidth,
            minHeight: layout.viewportHeight,
            paddingBottom: gridBottomWhitespace,
            transform: [{ translateY: gridOffset }],
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.worldSurface,
            {
              width: layout.worldWidth,
              height: Math.max(layout.viewportHeight, contentWorldHeight),
            },
          ]}
        >
          {sections.map((section, sectionIndex) => {
            const stack = section[0];
            if (!stack) return null;

            return (
              <OverviewStack
                key={stack.id}
                layout={layout}
                stack={stack}
                sectionIndex={sectionIndex}
                revealFrontLayers={revealOverviewFrontLayers}
                showDeferredLayers={showOverviewFrays}
                scrollY={scrollY}
                tiltX={tiltX}
                tiltY={tiltY}
                onFrontLayerReady={handleFrontLayerReady}
                onPrepareStack={onPrepareStack}
                onPressStack={onPressStack}
              />
            );
          })}
        </View>
      </Animated.ScrollView>
      {onBack ? (
        <Pressable hitSlop={20} onPress={onBack} style={[styles.backButton, { top: navTop }]}>
          <Text style={styles.backArrow}>{"\u2190"}</Text>
        </Pressable>
      ) : null}
      {isMyTracksView ? (
        <View style={[styles.screenTitleWrap, { top: navTop, height: NAV_BUTTON_SIZE }]}>
          <Text style={styles.screenTitle}>My Tracks</Text>
        </View>
      ) : null}
      {!menuOpen ? (
        <View style={[styles.topRightMenuWrap, { top: navTop }]}>
          <Pressable onPress={() => setMenuOpen(true)} style={styles.hamburger}>
            <Text style={styles.hamburgerText}>{"\u2630"}</Text>
          </Pressable>
          {sortOptions?.length ? (
            <View style={styles.filterWrap}>
              <Pressable onPress={() => setFilterMenuOpen((current) => !current)} style={styles.filterButton}>
                <Text style={styles.filterText}>{"\u25BD"}</Text>
              </Pressable>
              {filterMenuOpen ? (
                <View style={styles.filterSheet}>
                  {sortOptions.map((option) => (
                    <Pressable
                      key={option.id}
                      onPress={() => {
                        setFilterMenuOpen(false);
                        option.onPress();
                      }}
                      style={styles.menuItem}
                    >
                      <Text style={styles.menuItemText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          {onPressRefresh ? (
            <Pressable onPress={onPressRefresh} style={styles.refreshButton}>
              <Text style={styles.refreshText}>{"\u21BB"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Animated.View pointerEvents={menuOpen ? "auto" : "none"} style={[styles.menuPanel, menuPanelStyle]}>
        <View style={[styles.menuPanelInner, { paddingTop: navTop }]}>
          <View style={styles.menuPanelHeader}>
            <Pressable onPress={() => setMenuOpen(false)} style={styles.hamburger}>
              <Text style={styles.hamburgerText}>{"\u2715"}</Text>
            </Pressable>
          </View>
          {accountLabel ? (
            <View style={styles.menuHeader}>
              <Text numberOfLines={1} style={styles.menuHeaderText}>
                {accountLabel}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onPressAllTracks?.();
            }}
            style={styles.menuItem}
          >
            <Text style={styles.menuItemText}>Home</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onPressMyTracks?.();
            }}
            style={styles.menuItem}
          >
            <Text style={styles.menuItemText}>My Tracks</Text>
          </Pressable>
        </View>
      </Animated.View>
      <View
        style={[
          styles.brandMark,
          {
            top: "50%",
            right: -135,
          },
        ]}
      >
        <Text numberOfLines={1} style={styles.brandMarkText}>
          {"RECORDROOM\u00A9 RECORDROOM\u00A9 RECORDROOM\u00A9"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  viewport: {
    alignItems: "center",
  },
  worldSurface: {
    flex: 1,
  },
  stackSlot: {
    position: "absolute",
  },
  stackPressable: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  stackTiltWrap: {
    overflow: "visible",
  },
  backButton: {
    position: "absolute",
    left: NAV_LEFT_INSET,
    zIndex: NAV_Z_INDEX,
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: {
    color: "#111111",
    fontSize: NAV_ICON_SIZE,
    fontWeight: "600",
    lineHeight: NAV_ICON_SIZE,
  },
  topRightMenuWrap: {
    position: "absolute",
    right: NAV_RIGHT_INSET,
    zIndex: NAV_Z_INDEX,
    alignItems: "flex-end",
  },
  menuPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "50%",
    zIndex: NAV_Z_INDEX + 2,
    backgroundColor: "rgba(236,236,236,0.88)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(17,17,17,0.08)",
  },
  menuPanelInner: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  menuPanelHeader: {
    alignItems: "flex-end",
    marginBottom: 18,
  },
  screenTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: NAV_Z_INDEX,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  screenTitle: {
    color: "#111111",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 14,
  },
  refreshButton: {
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    marginTop: 8,
  },
  filterWrap: {
    marginTop: 8,
    alignItems: "flex-end",
  },
  filterButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.16)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  filterText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 16,
  },
  filterSheet: {
    marginTop: 8,
    minWidth: 140,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 10,
    overflow: "hidden",
  },
  refreshText: {
    fontSize: NAV_ICON_SIZE - 2,
    color: "#111111",
    lineHeight: NAV_ICON_SIZE - 2,
    fontWeight: "600",
  },
  hamburger: {
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  hamburgerText: {
    fontSize: NAV_ICON_SIZE,
    color: "#111111",
    lineHeight: NAV_ICON_SIZE,
  },
  menuSheet: {
    marginTop: 8,
    minWidth: 128,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 10,
    overflow: "hidden",
  },
  menuHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  menuHeaderText: {
    color: "rgba(17,17,17,0.56)",
    fontSize: 12,
    fontWeight: "600",
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemText: {
    color: "#111111",
    fontSize: 15,
    fontWeight: "500",
  },
  brandMark: {
    position: "absolute",
    transform: [{ translateY: 160 }, { rotate: "-90deg" }],
  },
  brandMarkText: {
    color: "#111111",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 2,
    includeFontPadding: false,
    textAlign: "left",
  },
});
