import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
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
      jitter.rotate +
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
      <Animated.View style={pressableStyle}>
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
  const [readyFrontLayerIds, setReadyFrontLayerIds] = useState<Record<string, true>>({});
  const [revealOverviewFrontLayers, setRevealOverviewFrontLayers] = useState(previewRevealPrimed);
  const [showOverviewFrays, setShowOverviewFrays] = useState(previewRevealPrimed);
  const scrollY = useSharedValue(0);
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

  const handleFrontLayerReady = (stackId: string) => {
    setReadyFrontLayerIds((current) => {
      if (current[stackId]) {
        return current;
      }
      return { ...current, [stackId]: true };
    });
  };
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (onScrollOffsetChange) {
        runOnJS(onScrollOffsetChange)(event.contentOffset.y);
      }
    },
  });

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
      <View style={[styles.topRightMenuWrap, { top: navTop }]}>
        <Pressable onPress={() => setMenuOpen((current) => !current)} style={styles.hamburger}>
          <Text style={styles.hamburgerText}>{"\u2630"}</Text>
        </Pressable>
        {onPressRefresh ? (
          <Pressable onPress={onPressRefresh} style={styles.refreshButton}>
            <Text style={styles.refreshText}>{"\u21BB"}</Text>
          </Pressable>
        ) : null}
        {menuOpen ? (
          <View style={styles.menuSheet}>
            {onPressRefetch ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  onPressRefetch();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>Refetch</Text>
              </Pressable>
            ) : null}
            {isMyTracksView ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  onPressAllTracks?.();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>All Tracks</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  onPressMyTracks?.();
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>My Tracks</Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
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
  refreshButton: {
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    marginTop: 8,
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
