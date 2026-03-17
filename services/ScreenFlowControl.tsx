import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTrackStackSections, createTrackStacksFromTracks } from "../data/trackStacks";
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
import MyTracksScreen from "../screens/MyTracksScreen";
import PlayOptionsScreen from "../screens/PlayOptionsScreen";
import SingleTrackStackScreen, { type StackProject } from "../screens/SingleTrackStackScreen";
import TracksOverviewScreen from "../screens/TracksOverviewScreen";
import { cacheRandomTracks, fetchRandomTracks, loadCachedRandomTracks } from "./musicBrainzTrackFetchService";
import { loadSavedTracks, saveSavedTracks, type SavedTrackRecord } from "./deviceSavedTracks";
import type { PreviewLayerSnapshot } from "../components/TrackStackPreviewOnOverviewScreen";
import type { FeedTrack } from "./soundCloudRandomTracks";

type RootScreen = "all_tracks" | "my_tracks";

async function prefetchStackAssets(projects: StackProject[]) {
  // Warm just the artwork files for a stack so detail view opens without visible pop-in.
  await Promise.allSettled(
    projects.map(async (project) => {
      if (project.type !== "image" || !project.media.trim()) {
        return;
      }

      await Image.prefetch(project.media);
    })
  );
}

async function warmTrackSet(tracks: FeedTrack[]) {
  // Rebuild the same stack grouping the UI uses, then warm each stack's images.
  const stacks = createTrackStacksFromTracks(tracks);
  await Promise.allSettled(stacks.map((stack) => prefetchStackAssets(stack.projects)));
}

function warmTrackSetInBackground(tracks: FeedTrack[]) {
  // Background warmup should never block rendering.
  void warmTrackSet(tracks);
}

export default function ScreenFlowControl() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStackIndex, setSelectedStackIndex] = useState<number | null>(null);
  const [selectedStackIntroRotation, setSelectedStackIntroRotation] = useState(0);
  const [selectedStackIntroSnapshots, setSelectedStackIntroSnapshots] = useState<PreviewLayerSnapshot[] | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<StackProject[] | null>(null);
  const [shouldAnimateDetailIntro, setShouldAnimateDetailIntro] = useState(false);
  const [returningFromPlayOptions, setReturningFromPlayOptions] = useState(false);
  const [playingProject, setPlayingProject] = useState<{ projectIndex: number } | null>(null);
  const [giftingProjects, setGiftingProjects] = useState<StackProject[] | null>(null);
  const [rootScreen, setRootScreen] = useState<RootScreen>("all_tracks");
  const [savedTracksSet, setSavedTracksSet] = useState<Record<string, SavedTrackRecord>>({});
  const [feedTracks, setFeedTracks] = useState<FeedTrack[]>([]);
  const [overviewPreviewPrimed, setOverviewPreviewPrimed] = useState(false);
  const [feedReady, setFeedReady] = useState(false);
  const [overviewScrollOffset, setOverviewScrollOffset] = useState(0);
  const [myTracksScrollOffset, setMyTracksScrollOffset] = useState(0);

  const backGestureTriggered = useSharedValue(false);

  const layout = useMemo(() => buildTrackWorldLayout(width, height), [height, width]);
  const activeTrackStacks = useMemo(() => createTrackStacksFromTracks(feedTracks), [feedTracks]);
  const allTrackSections = useMemo(
    () => createTrackStackSections(feedTracks),
    [feedTracks]
  );

  const refreshFeed = async (options?: { preferCache?: boolean; preserveVisibleFeed?: boolean }) => {
    // During manual refreshes we can keep the current UI visible until the replacement payload is ready.
    const preserveVisibleFeed = options?.preserveVisibleFeed === true;
    const previousTracks = feedTracks;

    if (!preserveVisibleFeed) {
      setFeedReady(false);
    }

    if (options?.preferCache !== false) {
      try {
        // First try the device cache so a normal launch feels immediate.
        const cached = await loadCachedRandomTracks();
        if (cached && cached.tracks.length > 0) {
          setFeedTracks(cached.tracks);
          setFeedReady(true);
          warmTrackSetInBackground(cached.tracks);
          return;
        }
      } catch {
        // Ignore cache read failures and continue to fresh fetch.
      }
    }

    try {
      // If cache is unavailable or bypassed, fetch the prepared backend payload.
      const result = await fetchRandomTracks();
      if (result.tracks.length === 0) {
        if (previousTracks.length > 0) {
          setFeedTracks(previousTracks);
        }
        setFeedReady(true);
        return;
      }

      setFeedTracks(result.tracks);
      setOverviewScrollOffset(0);
      setFeedReady(true);
      warmTrackSetInBackground(result.tracks);
      void cacheRandomTracks(result);
    } catch (error) {
      console.warn("MusicBrainz track fetch failed; no track stacks available.", error);
      // On failure, keep the prior visible feed if we have one so the app never collapses to nothing.
      if (previousTracks.length > 0) {
        setFeedTracks(previousTracks);
      } else {
        setFeedTracks([]);
      }
      setFeedReady(true);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootFeed = async () => {
      try {
        if (cancelled) return;
        // Boot prefers cache so the first usable feed appears with minimal waiting.
        await refreshFeed({ preferCache: true });
      } catch {
        if (!cancelled) {
          setFeedTracks([]);
          setFeedReady(true);
        }
      }
    };

    void bootFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootSavedTracks = async () => {
      const savedTracks = await loadSavedTracks();
      if (!cancelled) {
        setSavedTracksSet(savedTracks);
      }
    };

    void bootSavedTracks();

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

  const savedTrackStacks = useMemo(() => {
    return Object.keys(savedTracksSet)
      .map((trackId) => {
        const savedTrack = savedTracksSet[trackId];
        if (!savedTrack) return null;
        return {
          id: `saved-${trackId}`,
          projects: [savedTrack.project],
        };
      })
      .filter((value): value is (typeof activeTrackStacks)[number] => value != null);
  }, [savedTracksSet]);

  const myTrackSections = useMemo(
    () => chunkItems(savedTrackStacks, STACKS_PER_SECTION),
    [savedTrackStacks]
  );

  const allTrackSourceSections = useMemo(
    () =>
      allTrackSections.map((section) =>
        section.map((stack) => activeTrackStacks.findIndex((candidate) => candidate.id === stack.id))
      ),
    [activeTrackStacks, allTrackSections]
  );
  const overviewShift = 0;
  const navTop = insets.top;
  const selectedStack = selectedProjects ?? (selectedStackIndex != null ? activeTrackStacks[selectedStackIndex] ?? null : null)?.projects ?? null;
  const giftingStack = giftingProjects;
  const playingStack = selectedStack;

  const handleSaveProject = (project: StackProject) => {
    // Saved tracks are tracked by project id so the same item stays stable across screens.
    setSavedTracksSet((current) => {
      if (current[project.id]) return current;
      const next = {
        ...current,
        [project.id]: {
          track_id: project.id,
          track_artwork: project.media || project.color,
          project,
        },
      };
      void saveSavedTracks(next);
      return next;
    });
  };

  const handleRemoveProject = (project: StackProject) => {
    setSavedTracksSet((current) => {
      if (!current[project.id]) return current;
      const next = { ...current };
      delete next[project.id];
      void saveSavedTracks(next);
      return next;
    });
  };

  const handleBackFromDetail = () => {
    if (selectedStackIndex == null) return;
    setMenuOpen(false);
    setSelectedStackIndex(null);
    setSelectedProjects(null);
    setSelectedStackIntroRotation(0);
    setSelectedStackIntroSnapshots(null);
    setShouldAnimateDetailIntro(false);
    setReturningFromPlayOptions(false);
  };

  const handleBackFromPlay = () => {
    setPlayingProject(null);
    setReturningFromPlayOptions(true);
  };

  const handleBackFromGift = () => {
    setGiftingProjects(null);
  };

  const handleGlobalBack = () => {
    // Back behavior is centralized here so gestures and buttons follow the same rules.
    if (playingProject != null) {
      handleBackFromPlay();
      return;
    }

    if (giftingProjects != null) {
      handleBackFromGift();
      return;
    }

    if (selectedStackIndex != null) {
      handleBackFromDetail();
      return;
    }

    if (rootScreen === "my_tracks") {
      setMenuOpen(false);
      setRootScreen("all_tracks");
    }
  };

  const canGoBack =
    playingProject != null ||
    giftingProjects != null ||
    selectedStack != null ||
    rootScreen === "my_tracks";

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
    const projects = playingStack ?? [];
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

  if (selectedStack != null) {
    if (selectedStack.length === 0) {
      return <View style={styles.pageRoot} />;
    }

    // Once a stack is selected, the flow switches from overview mode into the single-stack experience.
    return (
      <View style={styles.detailPage}>
        <View pointerEvents="box-none" style={styles.detailNavLayer}>
          {giftingProjects == null ? (
            <GestureDetector gesture={globalBackGesture}>
              <View style={styles.detailBackGestureEdge} />
            </GestureDetector>
          ) : null}
          <Pressable
            hitSlop={20}
            onPress={giftingProjects != null ? handleBackFromGift : handleBackFromDetail}
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
                {rootScreen === "my_tracks" ? (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setSelectedStackIndex(null);
                      setRootScreen("all_tracks");
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
                      setRootScreen("my_tracks");
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
          {giftingProjects != null ? (
            <GiftCreationPage projects={giftingStack ?? []} />
          ) : (
            <SingleTrackStackScreen
              projects={selectedStack}
              enableIntroAnimation={shouldAnimateDetailIntro && !returningFromPlayOptions}
              introRotationOffsetDeg={selectedStackIntroRotation}
              introLayerSnapshots={selectedStackIntroSnapshots ?? undefined}
              onPlayPress={(_, index) => setPlayingProject({ projectIndex: index })}
              onGiftPress={() => setGiftingProjects(selectedStack)}
              isProjectSaved={(project) => savedTracksSet[project.id] != null}
              onSaveProject={(project) => handleSaveProject(project)}
              onRemoveProject={(project) => handleRemoveProject(project)}
            />
          )}
        </View>
      </View>
    );
  }

  if (!feedReady) {
    // While booting, render a blank root instead of half-built UI.
    return <View style={styles.pageRoot} />;
  }

  return (
    <View style={styles.pageRoot}>
      {rootScreen === "my_tracks" ? (
        <MyTracksScreen
          layout={layout}
          sections={myTrackSections}
          previewRevealPrimed={overviewPreviewPrimed}
          initialScrollOffset={myTracksScrollOffset}
          onBack={() => {
            setRootScreen("all_tracks");
          }}
          onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
          onScrollOffsetChange={setMyTracksScrollOffset}
          onPressStack={async (sectionIndex, stackIndex, previewRotationDeg, previewLayerSnapshots) => {
            const savedStack = myTrackSections[sectionIndex]?.[stackIndex];
            if (!savedStack) return;
            await prefetchStackAssets(savedStack.projects);
            setShouldAnimateDetailIntro(true);
            setReturningFromPlayOptions(false);
            setSelectedStackIntroRotation(previewRotationDeg ?? 0);
            setSelectedStackIntroSnapshots(previewLayerSnapshots ?? null);
            setSelectedProjects(savedStack.projects);
            setSelectedStackIndex(null);
          }}
        />
      ) : (
        <TracksOverviewScreen
          layout={layout}
          sections={allTrackSections}
          previewRevealPrimed={overviewPreviewPrimed}
          initialScrollOffset={overviewScrollOffset}
          onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
          onPressRefresh={() => {
            void refreshFeed({ preferCache: false, preserveVisibleFeed: true });
          }}
          onScrollOffsetChange={setOverviewScrollOffset}
          onPressStack={async (sectionIndex, stackIndex, previewRotationDeg, previewLayerSnapshots) => {
            const sourceStackIndex = allTrackSourceSections[sectionIndex]?.[stackIndex];
            if (sourceStackIndex == null) return;
            // Before opening detail, warm the tapped stack so the transition lands on already-ready art.
            await prefetchStackAssets(activeTrackStacks[sourceStackIndex]?.projects ?? []);
            setShouldAnimateDetailIntro(true);
            setReturningFromPlayOptions(false);
            setSelectedStackIntroRotation(previewRotationDeg ?? 0);
            setSelectedStackIntroSnapshots(previewLayerSnapshots ?? null);
            setSelectedStackIndex(sourceStackIndex);
            setSelectedProjects(null);
          }}
          onPressMyTracks={() => {
            setMenuOpen(false);
            setRootScreen("my_tracks");
          }}
        />
      )}
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
