import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TrackStack } from "../data/trackStacks";
import {
  getPreviewPressableHeight,
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
import TrackStackPreviewOnOverviewScreen, {
  getPreviewJitter,
  getPreviewParallaxRotation,
} from "../components/TrackStackPreviewOnOverviewScreen";

type TracksOverviewScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  previewRevealPrimed?: boolean;
  isMyTracksView?: boolean;
  onPressMyTracks?: () => void;
  onPressAllTracks?: () => void;
  onPreviewRevealPrimed?: () => void;
  onPressStack: (sectionIndex: number, stackIndex: number, previewRotationDeg?: number) => void;
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
  onPressStack: (sectionIndex: number, stackIndex: number, previewRotationDeg?: number) => void;
};

function OverviewStack({
  layout,
  stack,
  sectionIndex,
  revealFrontLayers,
  showDeferredLayers,
  scrollY,
  onFrontLayerReady,
  onPressStack,
}: OverviewStackProps) {
  const frame = useMemo(() => getSectionFrame(layout, sectionIndex), [layout, sectionIndex]);
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
      <Pressable
        hitSlop={12}
        onPress={() => onPressStack(sectionIndex, 0, previewRotation)}
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
          revealFrontLayers={revealFrontLayers}
          showDeferredLayers={showDeferredLayers}
          onFrontLayerReady={onFrontLayerReady}
        />
      </Pressable>
    </View>
  );
}

export default function TracksOverviewScreen({
  layout,
  sections,
  previewRevealPrimed = false,
  isMyTracksView = false,
  onPressMyTracks,
  onPressAllTracks,
  onPreviewRevealPrimed,
  onPressStack,
}: TracksOverviewScreenProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [readyFrontLayerIds, setReadyFrontLayerIds] = useState<Record<string, true>>({});
  const [revealOverviewFrontLayers, setRevealOverviewFrontLayers] = useState(previewRevealPrimed);
  const [showOverviewFrays, setShowOverviewFrays] = useState(previewRevealPrimed);
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
            paddingBottom: 140,
            transform: [{ translateY: gridOffset }],
          },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.worldSurface, { width: layout.worldWidth, height: layout.worldHeight }]}>
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
  stackSlot: {
    position: "absolute",
  },
  stackPressable: {
    alignItems: "center",
    justifyContent: "flex-end",
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
