import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTrackStacksFromTracks } from "../data/trackStacks";
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
import GiftMessageComposeScreen from "../screens/GiftMessageComposeScreen";
import MyTracksScreen from "../screens/MyTracksScreen";
import type { Stack } from "../components/Stack";
import PlayScreen from "../screens/PlayScreen";
import TracksOverviewScreen from "../screens/TracksOverviewScreen";
import { loadDemoAccount, type DemoAccount } from "./demoAccountService";
import {
  cacheRandomTracks,
  fetchGeneratedTracks,
  fetchRandomTracks,
  loadCachedRandomTracks,
} from "./musicBrainzTrackFetchService";
import { loadSavedTracks, saveSavedTracks, type SavedTrackRecord } from "./deviceSavedTracks";
import type { FeedTrack } from "./soundCloudRandomTracks";

type RootScreen = "all_tracks" | "my_tracks";
type MyTracksSortMode = "title" | "artist" | "color";

function shuffleItems<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

async function prefetchStackAssets(projects: Stack[]) {
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

function compareAlpha(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

export default function ScreenFlowControl() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStackIndex, setSelectedStackIndex] = useState<number | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Stack[] | null>(null);
  const [giftingProjects, setGiftingProjects] = useState<Stack[] | null>(null);
  const [giftMessage, setGiftMessage] = useState("");
  const [giftMessageComposerOpen, setGiftMessageComposerOpen] = useState(false);
  const [rootScreen, setRootScreen] = useState<RootScreen>("all_tracks");
  const [savedTracksSet, setSavedTracksSet] = useState<Record<string, SavedTrackRecord>>({});
  const [demoAccount, setDemoAccount] = useState<DemoAccount | null>(null);
  const [feedTracks, setFeedTracks] = useState<FeedTrack[]>([]);
  const [overviewPreviewPrimed, setOverviewPreviewPrimed] = useState(false);
  const [feedReady, setFeedReady] = useState(false);
  const [overviewScrollOffset, setOverviewScrollOffset] = useState(0);
  const [myTracksScrollOffset, setMyTracksScrollOffset] = useState(0);
  const [overviewStackShuffleVersion, setOverviewStackShuffleVersion] = useState(0);
  const [myTracksSortMode, setMyTracksSortMode] = useState<MyTracksSortMode>("title");
  const screenFade = useRef(new Animated.Value(1)).current;
  const menuPanelProgress = useRef(new Animated.Value(0)).current;

  const backGestureTriggered = useSharedValue(false);

  const layout = useMemo(() => buildTrackWorldLayout(width, height), [height, width]);
  const activeTrackStacks = useMemo(() => createTrackStacksFromTracks(feedTracks), [feedTracks]);
  const orderedTrackStacks = useMemo(
    () =>
      activeTrackStacks.map((stack) => ({
        ...stack,
        projects:
          overviewStackShuffleVersion === 0 ? stack.projects : shuffleItems(stack.projects),
      })),
    [activeTrackStacks, overviewStackShuffleVersion]
  );
  const allTrackSections = useMemo(
    () => chunkItems(orderedTrackStacks, STACKS_PER_SECTION),
    [orderedTrackStacks]
  );

  const refreshFeed = async (options?: { preferCache?: boolean; preserveVisibleFeed?: boolean; warmBeforeReady?: boolean }) => {
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
          if (options?.warmBeforeReady) {
            await warmTrackSet(cached.tracks);
            setOverviewPreviewPrimed(true);
          }
          setFeedReady(true);
          if (!options?.warmBeforeReady) {
            warmTrackSetInBackground(cached.tracks);
          }
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
      if (options?.warmBeforeReady) {
        await warmTrackSet(result.tracks);
        setOverviewPreviewPrimed(true);
      }
      setFeedReady(true);
      if (!options?.warmBeforeReady) {
        warmTrackSetInBackground(result.tracks);
      }
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
        await refreshFeed({ preferCache: true, warmBeforeReady: true });
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

  useEffect(() => {
    let cancelled = false;

    const bootDemoAccount = async () => {
      const account = await loadDemoAccount();
      if (!cancelled) {
        setDemoAccount(account);
      }
    };

    void bootDemoAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  const projectLookup = useMemo(() => {
    const map = new Map<string, { project: Stack; stackIndex: number }>();
    activeTrackStacks.forEach((stack, stackIndex) => {
      stack.projects.forEach((project) => {
        map.set(project.id, { project, stackIndex });
      });
    });
    return map;
  }, [activeTrackStacks]);

  const savedTrackStacks = useMemo(() => {
    const stacks = Object.keys(savedTracksSet)
      .map((trackId) => {
        const savedTrack = savedTracksSet[trackId];
        if (!savedTrack) return null;
        return {
          id: `saved-${trackId}`,
          projects: [savedTrack.project],
        };
      })
      .filter((value): value is (typeof activeTrackStacks)[number] => value != null);

    if (myTracksSortMode === "artist") {
      return [...stacks].sort((left, right) =>
        compareAlpha(left.projects[0]?.artistName, right.projects[0]?.artistName) ||
        compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
      );
    }

    if (myTracksSortMode === "color") {
      return [...stacks].sort((left, right) =>
        compareAlpha(left.projects[0]?.color, right.projects[0]?.color) ||
        compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
      );
    }

    return [...stacks].sort((left, right) =>
      compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
    );
  }, [myTracksSortMode, savedTracksSet]);

  const myTrackSections = useMemo(
    () => chunkItems(savedTrackStacks, STACKS_PER_SECTION),
    [savedTrackStacks]
  );

  const overviewShift = 0;
  const navTop = insets.top;
  const selectedStack = selectedProjects ?? (selectedStackIndex != null ? activeTrackStacks[selectedStackIndex] ?? null : null)?.projects ?? null;
  const giftingStack = giftingProjects;
  const routeKey = useMemo(() => {
    if (giftMessageComposerOpen) return "gift-message";
    if (giftingProjects != null) return "gift";
    if (selectedStack != null) return `detail-${selectedStack[0]?.id ?? "stack"}`;
    return rootScreen;
  }, [giftMessageComposerOpen, giftingProjects, rootScreen, selectedStack]);

  useLayoutEffect(() => {
    screenFade.setValue(1);
    const timeout = setTimeout(() => {
      const animation = Animated.timing(screenFade, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      });
      animation.start();
    }, 90);

    return () => {
      clearTimeout(timeout);
      screenFade.stopAnimation();
    };
  }, [routeKey, screenFade]);

  useEffect(() => {
    Animated.timing(menuPanelProgress, {
      toValue: menuOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, menuPanelProgress]);

  const handleSaveProject = (project: Stack) => {
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

  const handleRemoveProject = (project: Stack) => {
    setSavedTracksSet((current) => {
      if (!current[project.id]) return current;
      const next = { ...current };
      delete next[project.id];
      void saveSavedTracks(next);
      return next;
    });
  };

  const handleConfirmRemoveProject = (project: Stack) => {
    Alert.alert(
      "Unsave Track?",
      "Are you sure you want to unsave this track?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unsave",
          style: "destructive",
          onPress: () => handleRemoveProject(project),
        },
      ]
    );
  };

  const handleBackFromDetail = () => {
    setMenuOpen(false);
    setSelectedStackIndex(null);
    setSelectedProjects(null);
  };

  const refetchFromGenerated = async () => {
    const previousTracks = feedTracks;

    try {
      const result = await fetchGeneratedTracks();
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
      console.warn("Generated track refetch failed; keeping previous visible feed.", error);
      if (previousTracks.length > 0) {
        setFeedTracks(previousTracks);
      }
      setFeedReady(true);
    }
  };

  const handleBackFromGift = () => {
    setGiftMessageComposerOpen(false);
    setGiftingProjects(null);
  };

  const handleGlobalBack = () => {
    // Back behavior is centralized here so gestures and buttons follow the same rules.
    if (giftingProjects != null) {
      if (giftMessageComposerOpen) {
        setGiftMessageComposerOpen(false);
        return;
      }
      handleBackFromGift();
      return;
    }

    if (selectedStack != null) {
      handleBackFromDetail();
      return;
    }

    if (rootScreen === "my_tracks") {
      setMenuOpen(false);
      setRootScreen("all_tracks");
    }
  };

  const canGoBack =
    giftingProjects != null || selectedStack != null || rootScreen === "my_tracks";

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
            onPress={
              giftMessageComposerOpen
                ? () => setGiftMessageComposerOpen(false)
                : giftingProjects != null
                  ? handleBackFromGift
                  : handleBackFromDetail
            }
            style={[styles.backButton, { top: navTop }]}
          >
            <Text style={styles.backArrow}>{"\u2190"}</Text>
          </Pressable>
          {!menuOpen ? (
            <View style={[styles.topRightMenuWrap, { top: navTop }]}>
              <Pressable onPress={() => setMenuOpen(true)} style={styles.hamburger}>
                <Text style={styles.hamburgerText}>{"\u2630"}</Text>
              </Pressable>
            </View>
          ) : null}
          <Animated.View
            pointerEvents={menuOpen ? "auto" : "none"}
            style={[
              styles.menuPanel,
              {
                opacity: menuPanelProgress,
                transform: [
                  {
                    translateX: menuPanelProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [36, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.menuPanelInner, { paddingTop: navTop }]}>
              <View style={styles.menuPanelHeader}>
                <Pressable onPress={() => setMenuOpen(false)} style={styles.hamburger}>
                  <Text style={styles.hamburgerText}>{"\u2715"}</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setSelectedStackIndex(null);
                  setSelectedProjects(null);
                  setGiftingProjects(null);
                  setRootScreen("all_tracks");
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>Home</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setSelectedStackIndex(null);
                  setSelectedProjects(null);
                  setGiftingProjects(null);
                  setRootScreen("my_tracks");
                }}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>My Tracks</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
        <View style={styles.detailCanvas}>
          {giftingProjects != null ? (
            giftMessageComposerOpen ? (
              <GiftMessageComposeScreen
                message={giftMessage}
                onChangeMessage={setGiftMessage}
                onDone={() => setGiftMessageComposerOpen(false)}
              />
            ) : (
              <GiftCreationPage
                giftMessage={giftMessage}
                onPressComposeMessage={() => setGiftMessageComposerOpen(true)}
                projects={giftingStack ?? []}
              />
            )
          ) : (
            <PlayScreen
              onPressGift={(project) => {
                setGiftMessage("");
                setGiftMessageComposerOpen(false);
                setGiftingProjects([project]);
              }}
              onPressRemove={handleConfirmRemoveProject}
              onPressSave={handleSaveProject}
              savedTrackIds={Object.keys(savedTracksSet).reduce<Record<string, boolean>>((acc, id) => {
                acc[id] = true;
                return acc;
              }, {})}
              projects={selectedStack}
            />
          )}
        </View>
        <Animated.View pointerEvents="none" style={[styles.transitionOverlay, { opacity: screenFade }]} />
      </View>
    );
  }

  if (!feedReady) {
    return (
      <View style={styles.bootPage}>
        <View style={styles.bootMarkWrap}>
          <Text style={styles.bootMark}>{"RECORDROOM\u00A9"}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pageRoot}>
      {rootScreen === "my_tracks" ? (
        <MyTracksScreen
          accountLabel={demoAccount ? `${demoAccount.displayName} · ${demoAccount.username}` : undefined}
          layout={layout}
          sections={myTrackSections}
          previewRevealPrimed={overviewPreviewPrimed}
          initialScrollOffset={myTracksScrollOffset}
          onBack={() => {
            setRootScreen("all_tracks");
          }}
          onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
          sortOptions={[
            {
              id: "sort-title",
              label: "Sort: Title",
              onPress: () => setMyTracksSortMode("title"),
            },
            {
              id: "sort-artist",
              label: "Sort: Artist",
              onPress: () => setMyTracksSortMode("artist"),
            },
            {
              id: "sort-color",
              label: "Sort: Color",
              onPress: () => setMyTracksSortMode("color"),
            },
          ]}
          onScrollOffsetChange={setMyTracksScrollOffset}
          onPressStack={async (sectionIndex, stackIndex) => {
            const savedStack = myTrackSections[sectionIndex]?.[stackIndex];
            if (!savedStack) return;
            void prefetchStackAssets(savedStack.projects);
            setSelectedProjects(savedStack.projects);
            setSelectedStackIndex(null);
          }}
        />
      ) : (
        <TracksOverviewScreen
          accountLabel={demoAccount ? `${demoAccount.displayName} · ${demoAccount.username}` : undefined}
          layout={layout}
          sections={allTrackSections}
          previewRevealPrimed={overviewPreviewPrimed}
          initialScrollOffset={overviewScrollOffset}
          onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
          onPressRefresh={() => {
            setOverviewStackShuffleVersion((current) => current + 1);
          }}
          onPressRefetch={() => {
            void refetchFromGenerated();
          }}
          onScrollOffsetChange={setOverviewScrollOffset}
          onPrepareStack={(sectionIndex, stackIndex) => {
            const selectedStack = allTrackSections[sectionIndex]?.[stackIndex];
            if (!selectedStack) return;
            void prefetchStackAssets(selectedStack.projects);
          }}
          onPressStack={async (sectionIndex, stackIndex) => {
            const selectedStack = allTrackSections[sectionIndex]?.[stackIndex];
            if (!selectedStack) return;
            setSelectedProjects(selectedStack.projects);
            setSelectedStackIndex(null);
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
      <Animated.View pointerEvents="none" style={[styles.transitionOverlay, { opacity: screenFade }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
  },
  bootPage: {
    flex: 1,
    backgroundColor: "#FEFEFE",
  },
  bootMarkWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bootMark: {
    color: "#111111",
    fontSize: 48,
    fontWeight: "600",
    letterSpacing: 1,
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
  playBackGestureEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
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
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FEFEFE",
    zIndex: 120,
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
