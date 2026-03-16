import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TrackStack } from "../data/trackStacks";
import {
  SECTIONS_PER_ROW,
  type TrackWorldLayout,
} from "../lib/trackWorldLayout";
import {
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_RIGHT_INSET,
  NAV_TOP_PADDING,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import Partition16Screen from "./Partition16Screen";

type TracksOverviewScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  focusedSectionIndex?: number | null;
  previewRevealPrimed?: boolean;
  isMyTracksView?: boolean;
  onPressMyTracks?: () => void;
  onPressAllTracks?: () => void;
  onPreviewRevealPrimed?: () => void;
  onPressSection: (sectionIndex: number) => void;
  onPressStack: (sectionIndex: number, stackIndex: number, previewRotationDeg?: number) => void;
};

type SectionFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const FOCUS_ANIMATION_MS = 280;
const FOCUSED_SECTION_SIDE_PADDING = 8;
const FOCUSED_SECTION_VERTICAL_PADDING = 16;
const FOCUSED_SECTION_UPWARD_SHIFT_RATIO = -0.04;
const OVERVIEW_UPWARD_SHIFT_RATIO = 0.05;
const PARTITION_TOUCH_SLOP_Y = 18;

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

function getFocusedSectionFrame(layout: TrackWorldLayout): SectionFrame {
  const left = FOCUSED_SECTION_SIDE_PADDING;
  const width = layout.viewportWidth - FOCUSED_SECTION_SIDE_PADDING * 2;
  const height = layout.viewportHeight - FOCUSED_SECTION_VERTICAL_PADDING * 2;
  const top = (layout.viewportHeight - height) / 2 - layout.viewportHeight * FOCUSED_SECTION_UPWARD_SHIFT_RATIO;
  return { left, top, width, height };
}

type AnimatedSectionProps = {
  layout: TrackWorldLayout;
  section: TrackStack[];
  sectionIndex: number;
  activeSectionIndex: number | null;
  focusProgress: SharedValue<number>;
  overlayOpacity: SharedValue<number>;
  revealFrontLayers: boolean;
  showDeferredLayers: boolean;
  scrollY: SharedValue<number>;
  sectionTop: number;
  sectionLeft: number;
  onFrontLayerReady: (stackId: string) => void;
  onPressSection: (sectionIndex: number) => void;
  onPressStack: (sectionIndex: number, stackIndex: number, previewRotationDeg?: number) => void;
};

function AnimatedSection({
  layout,
  section,
  sectionIndex,
  activeSectionIndex,
  focusProgress,
  overlayOpacity,
  revealFrontLayers,
  showDeferredLayers,
  scrollY,
  sectionTop,
  sectionLeft,
  onFrontLayerReady,
  onPressSection,
  onPressStack,
}: AnimatedSectionProps) {
  const baseFrame = useMemo(() => getSectionFrame(layout, sectionIndex), [layout, sectionIndex]);
  const focusedFrame = useMemo(() => getFocusedSectionFrame(layout), [layout]);
  const isFocusedSection = activeSectionIndex === sectionIndex;

  const animatedStyle = useAnimatedStyle(() => {
    const active = isFocusedSection ? focusProgress.value : 0;
    const dimmed = activeSectionIndex != null && !isFocusedSection;
    return {
      position: "absolute",
      left: baseFrame.left + (focusedFrame.left - baseFrame.left) * active,
      top: baseFrame.top + (focusedFrame.top - baseFrame.top) * active,
      width: baseFrame.width + (focusedFrame.width - baseFrame.width) * active,
      height: baseFrame.height + (focusedFrame.height - baseFrame.height) * active,
      zIndex: isFocusedSection ? 20 : 1,
      opacity: dimmed ? 1 - overlayOpacity.value : 1,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        disabled={activeSectionIndex != null}
        hitSlop={{ top: PARTITION_TOUCH_SLOP_Y, bottom: PARTITION_TOUCH_SLOP_Y, left: 0, right: 0 }}
        onPress={() => onPressSection(sectionIndex)}
        style={styles.sectionPressable}
      >
        <View style={styles.sectionCard}>
          <Partition16Screen
            layout={layout}
            section={section}
            progress={focusProgress}
            scrollY={scrollY}
            sectionTop={sectionTop}
            sectionLeft={sectionLeft}
            isActive={isFocusedSection}
            revealFrontLayers={revealFrontLayers}
            showDeferredLayers={showDeferredLayers}
            onFrontLayerReady={onFrontLayerReady}
            onPressStack={(stackIndex, previewRotationDeg) =>
              onPressStack(sectionIndex, stackIndex, previewRotationDeg)
            }
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function TracksOverviewScreen({
  layout,
  sections,
  focusedSectionIndex = null,
  previewRevealPrimed = false,
  isMyTracksView = false,
  onPressMyTracks,
  onPressAllTracks,
  onPreviewRevealPrimed,
  onPressSection,
  onPressStack,
}: TracksOverviewScreenProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number | null>(focusedSectionIndex);
  const [readyFrontLayerIds, setReadyFrontLayerIds] = useState<Record<string, true>>({});
  const [revealOverviewFrontLayers, setRevealOverviewFrontLayers] = useState(previewRevealPrimed);
  const [showOverviewFrays, setShowOverviewFrays] = useState(previewRevealPrimed);
  const focusProgress = useSharedValue(focusedSectionIndex != null ? 1 : 0);
  const overlayOpacity = useSharedValue(focusedSectionIndex != null ? 1 : 0);
  const scrollY = useSharedValue(0);
  const navTop = insets.top + NAV_TOP_PADDING + 24;
  const GRID_TOP_OFFSET = 36;
  const gridOffset = navTop - layout.megaBlockTop + GRID_TOP_OFFSET;
  const totalStackCount = useMemo(
    () => sections.reduce((count, section) => count + section.length, 0),
    [sections]
  );

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
      onPreviewRevealPrimed?.();
    }
  }, [onPreviewRevealPrimed, showOverviewFrays]);

  const handleFrontLayerReady = (stackId: string) => {
    setReadyFrontLayerIds((current) => {
      if (current[stackId]) {
        return current;
      }
      return { ...current, [stackId]: true };
    });
  };

  useEffect(() => {
    if (focusedSectionIndex != null) {
      setActiveSectionIndex(focusedSectionIndex);
      focusProgress.value = withTiming(1, {
        duration: FOCUS_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      overlayOpacity.value = withTiming(1, {
        duration: FOCUS_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    focusProgress.value = withTiming(0, {
      duration: FOCUS_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    overlayOpacity.value = withTiming(
      0,
      {
        duration: FOCUS_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(setActiveSectionIndex)(null);
        }
      }
    );
  }, [focusProgress, focusedSectionIndex, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        bounces
        contentContainerStyle={[
          styles.viewport,
          {
            width: layout.viewportWidth,
            minHeight: layout.viewportHeight,
            paddingBottom: 120,
            transform: [{ translateY: gridOffset }],
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.worldSurface, { width: layout.worldWidth, height: layout.worldHeight }]}>
          <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle]} />
          {sections.map((section, sectionIndex) => {
            const sectionFrame = getSectionFrame(layout, sectionIndex);

            return (
              <AnimatedSection
                key={`section-${sectionIndex}`}
                layout={layout}
                section={section}
                sectionIndex={sectionIndex}
                activeSectionIndex={activeSectionIndex}
                focusProgress={focusProgress}
                overlayOpacity={overlayOpacity}
                revealFrontLayers={revealOverviewFrontLayers}
                showDeferredLayers={showOverviewFrays}
                scrollY={scrollY}
                sectionTop={sectionFrame.top}
                sectionLeft={sectionFrame.left}
                onFrontLayerReady={handleFrontLayerReady}
                onPressSection={onPressSection}
                onPressStack={onPressStack}
              />
            );
          })}
        </View>
      </Animated.ScrollView>
      <View style={[styles.topRightMenuWrap, { top: navTop }]}>
        <Pressable onPress={() => setMenuOpen((current) => !current)} style={styles.hamburger}>
          <Text style={styles.hamburgerText}>{"\u2630"}</Text>
        </Pressable>
        {menuOpen ? (
          <View style={styles.menuSheet}>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
  },
  sectionPressable: {
    flex: 1,
  },
  sectionCard: {
    flex: 1,
  },
  topRightMenuWrap: {
    position: "absolute",
    right: NAV_RIGHT_INSET,
    zIndex: NAV_Z_INDEX,
    alignItems: "flex-end",
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
});
