import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTrackStackSections, createTrackStacksFromTracks, trackStacks } from "../data/trackStacks";
import {
  buildTrackWorldLayout,
  chunkItems,
  EDGE_BACK_TRIGGER,
  EDGE_BACK_ZONE,
  STACKS_PER_SECTION,
} from "../lib/trackWorldLayout";
import {
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_LEFT_INSET,
  NAV_RIGHT_INSET,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import GiftCreationPage from "../screens/GiftCreationPage";
import PlayOptionsScreen from "../screens/PlayOptionsScreen";
import SingleTrackStackScreen, { type StackProject } from "../screens/SingleTrackStackScreen";
import TracksOverviewScreen from "../screens/TracksOverviewScreen";
import { cacheRandomTracks, fetchRandomTracks, loadCachedRandomTracks } from "./musicBrainzTrackFetchService";
import type { FeedTrack } from "./soundCloudRandomTracks";

type OverviewMode = "all" | "my_tracks";
type SavedTrackDictionary = {
  track_id: string;
  track_artwork: string;
};

export default function ScreenFlowControl() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStackIndex, setSelectedStackIndex] = useState<number | null>(null);
  const [selectedStackIntroRotation, setSelectedStackIntroRotation] = useState(0);
  const [shouldAnimateDetailIntro, setShouldAnimateDetailIntro] = useState(false);
  const [returningFromPlayOptions, setReturningFromPlayOptions] = useState(false);
  const [playingProject, setPlayingProject] = useState<{ stackIndex: number; projectIndex: number } | null>(null);
  const [giftingStackIndex, setGiftingStackIndex] = useState<number | null>(null);
  const [overviewMode, setOverviewMode] = useState<OverviewMode>("all");
  const [savedTracksSet, setSavedTracksSet] = useState<Record<string, SavedTrackDictionary>>({});
  const [feedTracks, setFeedTracks] = useState<FeedTrack[]>([]);
  const [overviewPreviewPrimed, setOverviewPreviewPrimed] = useState(false);

  const backGestureTriggered = useSharedValue(false);

  const layout = useMemo(() => buildTrackWorldLayout(width, height), [height, width]);
  const activeTrackStacks = useMemo(
    () => (feedTracks.length > 0 ? createTrackStacksFromTracks(feedTracks) : trackStacks),
    [feedTracks]
  );
  const allTrackSections = useMemo(
    () =>
      feedTracks.length > 0
        ? createTrackStackSections(feedTracks)
        : chunkItems(activeTrackStacks, STACKS_PER_SECTION),
    [activeTrackStacks, feedTracks]
  );

  useEffect(() => {
    let cancelled = false;

    loadCachedRandomTracks()
      .then((cached) => {
        if (!cancelled && cached) {
          setFeedTracks(cached.tracks);
        }
      })
      .catch(() => {
        // Ignore cache read failures and continue to network.
      })
      .finally(() => {
        fetchRandomTracks()
          .then((result) => {
            if (!cancelled) {
              setFeedTracks(result.tracks);
            }
            void cacheRandomTracks(result);
          })
          .catch((error) => {
            console.warn("MusicBrainz track fetch failed; using fallback track stacks.", error);
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const projectLookup = useMemo(() => {
    const map = new Map<string, { project: StackProject; stackIndex: number }>();
    activeTrackStacks.forEach((stack, stackIndex) => {
      stack.projects.forEach((project) => {
        map.set(project.id, { project, stackIndex });
      });
    });
    return map;
  }, [activeTrackStacks]);

  const overviewStacks = useMemo(() => {
    if (overviewMode === "all") {
      return activeTrackStacks;
    }

    return Object.keys(savedTracksSet)
      .map((trackId) => {
        const found = projectLookup.get(trackId);
        if (!found) return null;
        return {
          id: `saved-${trackId}`,
          projects: [found.project],
        };
      })
      .filter((value): value is (typeof activeTrackStacks)[number] => value != null);
  }, [activeTrackStacks, overviewMode, projectLookup, savedTracksSet]);

  const overviewSourceStackIndexes = useMemo(() => {
    if (overviewMode === "all") {
      return activeTrackStacks.map((_, index) => index);
    }

    return Object.keys(savedTracksSet)
      .map((trackId) => projectLookup.get(trackId)?.stackIndex ?? -1)
      .filter((index) => index >= 0);
  }, [activeTrackStacks, overviewMode, projectLookup, savedTracksSet]);

  const sections = useMemo(() => {
    if (overviewMode === "all") {
      return allTrackSections;
    }

    return chunkItems(overviewStacks, STACKS_PER_SECTION);
  }, [allTrackSections, overviewMode, overviewStacks]);

  const overviewSourceSections = useMemo(() => {
    if (overviewMode === "all") {
      return allTrackSections.map((section) =>
        section.map((stack) => activeTrackStacks.findIndex((candidate) => candidate.id === stack.id))
      );
    }

    return chunkItems(overviewSourceStackIndexes, STACKS_PER_SECTION);
  }, [activeTrackStacks, allTrackSections, overviewMode, overviewSourceStackIndexes]);

  const overviewShift = 0;
  const navTop = insets.top;

  const handleSaveProject = (project: StackProject) => {
    setSavedTracksSet((current) => {
      if (current[project.id]) return current;
      return {
        ...current,
        [project.id]: {
          track_id: project.id,
          track_artwork: project.media || project.color,
        },
      };
    });
  };

  const handleRemoveProject = (project: StackProject) => {
    setSavedTracksSet((current) => {
      if (!current[project.id]) return current;
      const next = { ...current };
      delete next[project.id];
      return next;
    });
  };

  const handleBackFromDetail = () => {
    if (selectedStackIndex == null) return;
    setMenuOpen(false);
    setSelectedStackIndex(null);
    setSelectedStackIntroRotation(0);
    setShouldAnimateDetailIntro(false);
    setReturningFromPlayOptions(false);
  };

  const handleBackFromPlay = () => {
    setPlayingProject(null);
    setReturningFromPlayOptions(true);
  };

  const handleBackFromGift = () => {
    setGiftingStackIndex(null);
  };

  const handleGlobalBack = () => {
    if (playingProject != null) {
      handleBackFromPlay();
      return;
    }

    if (giftingStackIndex != null) {
      handleBackFromGift();
      return;
    }

    if (selectedStackIndex != null) {
      handleBackFromDetail();
      return;
    }

    if (overviewMode === "my_tracks") {
      setMenuOpen(false);
      setOverviewMode("all");
    }
  };

  const canGoBack =
    playingProject != null ||
    giftingStackIndex != null ||
    selectedStackIndex != null ||
    overviewMode === "my_tracks";

  const globalBackGesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX(4)
    .failOffsetY([-18, 18])
    .onBegin(() => {
      backGestureTriggered.value = false;
    })
    .onUpdate((event) => {
      if (!canGoBack || backGestureTriggered.value || event.translationX < EDGE_BACK_TRIGGER) {
        return;
      }
      backGestureTriggered.value = true;
      runOnJS(handleGlobalBack)();
    })
    .onEnd((event) => {
      if (!backGestureTriggered.value && canGoBack && event.translationX >= EDGE_BACK_TRIGGER) {
        backGestureTriggered.value = true;
        runOnJS(handleGlobalBack)();
      }
    });

  if (playingProject != null) {
    const projects = activeTrackStacks[playingProject.stackIndex]?.projects ?? [];
    return (
      <View style={styles.pageRoot}>
        <PlayOptionsScreen
          projects={projects}
          initialProjectIndex={playingProject.projectIndex}
          onBack={handleBackFromPlay}
          navTop={navTop}
        />
        <GestureDetector gesture={globalBackGesture}>
          <View style={styles.globalBackEdge} />
        </GestureDetector>
      </View>
    );
  }

  if (selectedStackIndex != null) {
    return (
      <View style={styles.detailPage}>
        <View pointerEvents="box-none" style={styles.detailNavLayer}>
          {giftingStackIndex == null ? (
            <GestureDetector gesture={globalBackGesture}>
              <View style={styles.detailBackGestureEdge} />
            </GestureDetector>
          ) : null}
          <Pressable
            hitSlop={20}
            onPress={giftingStackIndex != null ? handleBackFromGift : handleBackFromDetail}
            style={[styles.backButton, { top: navTop }]}
          >
            <Text style={styles.backArrow}>{"\u2190"}</Text>
          </Pressable>
          <View style={[styles.topRightMenuWrap, { top: navTop }]}>
            <Pressable onPress={() => setMenuOpen((current) => !current)} style={styles.hamburger}>
              <Text style={styles.hamburgerText}>{"\u2630"}</Text>
            </Pressable>
            {menuOpen ? (
              <View style={styles.menuSheet}>
                {overviewMode === "my_tracks" ? (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setSelectedStackIndex(null);
                      setOverviewMode("all");
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={styles.menuItemText}>All Tracks</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setSelectedStackIndex(null);
                      setOverviewMode("my_tracks");
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
        <View style={styles.detailCanvas}>
          {giftingStackIndex != null ? (
            <GiftCreationPage projects={activeTrackStacks[giftingStackIndex]?.projects ?? []} />
          ) : (
            <SingleTrackStackScreen
              projects={activeTrackStacks[selectedStackIndex].projects}
              enableIntroAnimation={shouldAnimateDetailIntro && !returningFromPlayOptions}
              introRotationOffsetDeg={selectedStackIntroRotation}
              onPlayPress={(_, index) => setPlayingProject({ stackIndex: selectedStackIndex, projectIndex: index })}
              onGiftPress={() => setGiftingStackIndex(selectedStackIndex)}
              isProjectSaved={(project) => savedTracksSet[project.id] != null}
              onSaveProject={(project) => handleSaveProject(project)}
              onRemoveProject={(project) => handleRemoveProject(project)}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pageRoot}>
      <TracksOverviewScreen
        layout={layout}
        sections={sections}
        previewRevealPrimed={overviewPreviewPrimed}
        isMyTracksView={overviewMode === "my_tracks"}
        onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
        onPressStack={(sectionIndex, stackIndex, previewRotationDeg) => {
          const sourceStackIndex = overviewSourceSections[sectionIndex]?.[stackIndex];
          if (sourceStackIndex == null) return;
          setShouldAnimateDetailIntro(true);
          setReturningFromPlayOptions(false);
          setSelectedStackIntroRotation(previewRotationDeg ?? 0);
          setSelectedStackIndex(sourceStackIndex);
        }}
        onPressMyTracks={() => {
          setMenuOpen(false);
          setOverviewMode("my_tracks");
        }}
        onPressAllTracks={() => {
          setMenuOpen(false);
          setOverviewMode("all");
        }}
      />
      <GestureDetector gesture={globalBackGesture}>
        <View style={styles.globalBackEdge} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
  },
  detailPage: {
    flex: 1,
    backgroundColor: "#FEFEFE",
  },
  detailNavLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 70,
  },
  detailBackGestureEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_BACK_ZONE,
    zIndex: 75,
  },
  globalBackEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_BACK_ZONE,
    zIndex: 60,
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
  detailCanvas: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
