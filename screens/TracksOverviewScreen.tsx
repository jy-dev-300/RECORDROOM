import { useEffect, useMemo, useRef, useState } from "react";
import { useFonts } from "expo-font";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  SensorType,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  withRepeat,
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
import AppIcon from "../components/AppIcon";
import MenuToggleButton from "../components/MenuToggleButton";
import NavigationMenu from "../components/NavigationMenu";
import ScreenDustOverlay from "../components/ScreenDustOverlay";

type TracksOverviewScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  previewRevealPrimed?: boolean;
  onBack?: () => void;
  onPressSavedTracks?: () => void;
  onPressAllTracks?: () => void;
  onPressLoadingDebug?: () => void;
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
  screenTitle?: string;
  extraContentTopPadding?: number;
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

const BRAND_BELT_DURATION_MS = 30200;

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
  const stackZIndex = Math.round((layout.viewportHeight - (previewTop + previewHeight)) * 10) + 10000;
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
          zIndex: stackZIndex,
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
  onBack,
  onPressSavedTracks,
  onPressAllTracks,
  onPressLoadingDebug,
  onPressRefresh,
  onPressRefetch,
  accountLabel,
  sortOptions,
  onPreviewRevealPrimed,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  screenTitle,
  extraContentTopPadding = 0,
  onPrepareStack,
  onPressStack,
}: TracksOverviewScreenProps) {
  const [fontsLoaded] = useFonts({
    EurostileBoldItalic: require("../assets/fonts/Eurostile BoldItalic.ttf"),
  });
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  const hasRestoredScrollRef = useRef(false);
  const onPreviewRevealPrimedRef = useRef(onPreviewRevealPrimed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [brandBeltReady, setBrandBeltReady] = useState(false);
  const [readyFrontLayerIds, setReadyFrontLayerIds] = useState<Record<string, true>>({});
  const [revealOverviewFrontLayers, setRevealOverviewFrontLayers] = useState(previewRevealPrimed);
  const [showOverviewFrays, setShowOverviewFrays] = useState(previewRevealPrimed);
  const scrollY = useSharedValue(0);
  const menuProgress = useSharedValue(0);
  const brandBeltOffset = useSharedValue(0);
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 20 });
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const navTop = insets.top + NAV_TOP_PADDING + 24;
  const overviewTopInset = Math.round(layout.viewportHeight * -0.024);
  const overviewBottomInset = Math.round(layout.viewportHeight * 0.08);
  const contentTopPadding = navTop + NAV_BUTTON_SIZE + overviewTopInset + extraContentTopPadding;
  const filterControlHeight = sortOptions?.length ? 8 + 34 : 0;
  const refreshControlHeight = onPressRefresh ? 8 + NAV_BUTTON_SIZE + 16 : 0;
  const brandRailTop = navTop + NAV_BUTTON_SIZE + filterControlHeight + refreshControlHeight;
  const brandRailHeight = Math.max(1, layout.viewportHeight - brandRailTop);
  const brandRailWidth = Math.round(layout.viewportWidth * 0.13);
  const brandRailRightInset = Math.round(layout.viewportWidth * 0.0135);
  const filterRightInset = Math.round(layout.viewportWidth * 0.008);
  const brandMarkWidth = Math.max(Math.round(layout.viewportWidth * 3));
  const brandTrackDistance = brandRailHeight + brandMarkWidth-350;
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

  useEffect(() => {
    setBrandBeltReady(false);
    const startTimeout = setTimeout(() => {
      brandBeltOffset.value = -brandTrackDistance;
      setBrandBeltReady(true);
      brandBeltOffset.value = withRepeat(
        withTiming(0, {
          duration: BRAND_BELT_DURATION_MS,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    }, 0);

    return () => {
      clearTimeout(startTimeout);
      cancelAnimation(brandBeltOffset);
      brandBeltOffset.value = 0;
    };
  }, [brandBeltOffset, brandTrackDistance]);

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
      const verticalStrength = clampedY > 0 ? 9.5 : 2.6;
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
  const brandBeltStyle = useAnimatedStyle(() => ({
    opacity: withTiming(brandBeltReady ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    }),
    transform: [{ translateY: brandBeltOffset.value }],
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
            paddingTop: contentTopPadding,
            paddingBottom: overviewBottomInset,
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
          <AppIcon name="angle-left" size={NAV_ICON_SIZE} />
        </Pressable>
      ) : null}
      {screenTitle ? (
        <View style={[styles.screenTitleWrap, { top: navTop, height: NAV_BUTTON_SIZE }]}>
          <Text style={styles.screenTitle}>{screenTitle}</Text>
        </View>
      ) : null}
      <View style={[styles.topRightMenuWrap, { top: navTop }]}>
        <MenuToggleButton open={menuOpen} onPress={() => setMenuOpen((current) => !current)} size={NAV_ICON_SIZE} style={styles.hamburger} />
        {!menuOpen ? (
          <>
            {sortOptions?.length ? (
              <View style={[styles.filterWrap, { marginRight: filterRightInset }]}>
                <Pressable onPress={() => setFilterMenuOpen((current) => !current)} style={styles.filterButton}>
                  <AppIcon name="filter" size={24} />
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
                <AppIcon name="refresh" size={NAV_ICON_SIZE - 1} />
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
      <NavigationMenu
        open={menuOpen}
        navTop={navTop}
        onClose={() => setMenuOpen(false)}
        animatedStyle={menuPanelStyle}
        accountLabel={accountLabel}
        items={[
          {
            key: "home",
            label: "Home",
            onPress: () => {
              setMenuOpen(false);
              onPressAllTracks?.();
            },
          },
          {
            key: "my-tracks",
            label: "Saved Tracks",
            onPress: () => {
              setMenuOpen(false);
              onPressSavedTracks?.();
            },
          },
          {
            key: "loading-screen",
            label: "Loading Screen",
            onPress: () => {
              setMenuOpen(false);
              onPressLoadingDebug?.();
            },
          },
        ]}
      />
      <View
        style={[
          styles.brandRail,
          {
            top: brandRailTop,
            height: brandRailHeight,
            width: brandRailWidth,
            right: brandRailRightInset,
          },
        ]}
      >
        <Animated.View style={[styles.brandBelt, brandBeltStyle]}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[
                styles.brandMarkFloat,
                { top: index * brandTrackDistance },
              ]}
            >
              <View style={[styles.brandMarkBox, { width: brandMarkWidth }]}>
                <Text
                  style={[
                    styles.brandMarkText,
                    fontsLoaded ? styles.brandMarkTextEurostile : null,
                  ]}
                >
                  {"RECORDROOM\u00A9                                                                RECORDROOM\u00A9                                                                RECORDROOM\u00A9 "}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>
      </View>
      <ScreenDustOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FEFEFE",
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
  topRightMenuWrap: {
    position: "absolute",
    right: NAV_RIGHT_INSET,
    zIndex: NAV_Z_INDEX + 3,
    alignItems: "flex-end",
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
    fontFamily: "Eurostile",
    fontSize: 18,
    lineHeight: 18,
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
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
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemText: {
    color: "#111111",
    fontFamily: "Eurostile",
    fontSize: 22,
    lineHeight: 22,
  },
  hamburger: {
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
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
  brandRail: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    overflow: "hidden",
  },
  brandBelt: {
    ...StyleSheet.absoluteFillObject,
  },
  brandMarkFloat: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  brandMarkBox: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    transform: [{ rotate: "90deg" }],
  },
  brandMarkText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.4,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: "center",
  },
  brandMarkTextEurostile: {
    fontFamily: "EurostileBoldItalic",
    fontWeight: "400",
  },
});
