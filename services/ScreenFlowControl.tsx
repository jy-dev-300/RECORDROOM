import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
import SavedTracksScreen from "../screens/SavedTracksScreen";
import type { Stack } from "../components/Stack";
import PlayScreen from "../screens/PlayScreen";
import TracksOverviewScreen from "../screens/TracksOverviewScreen";
import RecordroomLogo from "../components/RecordroomLogo";
import AppIcon from "../components/AppIcon";
import MenuToggleButton from "../components/MenuToggleButton";
import NavigationMenu from "../components/NavigationMenu";
import ScreenDustOverlay from "../components/ScreenDustOverlay";
import { loadDemoAccount, type DemoAccount } from "./demoAccountService";
import {
  cacheRandomTracks,
  fetchGeneratedTracks,
  fetchRandomTracks,
  loadCachedRandomTracks,
} from "./musicBrainzTrackFetchService";
import { loadSavedTracks, saveSavedTracks, type SavedTrackRecord } from "./deviceSavedTracks";
import type { FeedTrack } from "./soundCloudRandomTracks";

type RootScreen = "all_tracks" | "saved_tracks" | "loading_debug";
type SavedTracksSortMode = "title" | "artist" | "color";
type TransitionDirection = "forward" | "back";
type RouteSnapshot = {
  rootScreen: RootScreen;
  selectedStackIndex: number | null;
  selectedProjects: Stack[] | null;
  giftingProjects: Stack[] | null;
  giftMessageComposerOpen: boolean;
};

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

function SlideInScene({
  sceneKey,
  width,
  direction,
  onTransitionComplete,
  children,
}: {
  sceneKey: string;
  width: number;
  direction: TransitionDirection;
  onTransitionComplete?: () => void;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(width);
  const opacity = useSharedValue(0.98);
  const onTransitionCompleteRef = useRef(onTransitionComplete);

  useEffect(() => {
    onTransitionCompleteRef.current = onTransitionComplete;
  }, [onTransitionComplete]);

  useEffect(() => {
    translateX.value = direction === "back" ? -width : width;
    opacity.value = 0.98;
    translateX.value = withTiming(0, {
      duration: direction === "back" ? 100 : 250,
      easing: Easing.out(Easing.cubic),
    }, (finished) => {
      if (finished && onTransitionCompleteRef.current) {
        runOnJS(onTransitionCompleteRef.current)();
      }
    });
    opacity.value = withTiming(1, {
      duration: direction === "back" ? 100 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [direction, opacity, sceneKey, translateX, width]);

  const sceneStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return <Animated.View style={[styles.sceneRoot, sceneStyle]}>{children}</Animated.View>;
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
  const [bootAnimationComplete, setBootAnimationComplete] = useState(false);
  const [overviewScrollOffset, setOverviewScrollOffset] = useState(0);
  const [savedTracksScrollOffset, setSavedTracksScrollOffset] = useState(0);
  const [overviewStackShuffleVersion, setOverviewStackShuffleVersion] = useState(0);
  const [savedTracksSortMode, setSavedTracksSortMode] = useState<SavedTracksSortMode>("title");
  const [loadingDebugSpinEnabled, setLoadingDebugSpinEnabled] = useState(true);
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>("forward");
  const [giftIntroReadyRouteKey, setGiftIntroReadyRouteKey] = useState<string | null>(null);
  const menuPanelProgress = useSharedValue(0);
  const routeHistoryRef = useRef<RouteSnapshot[]>([]);

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

    if (savedTracksSortMode === "artist") {
      return [...stacks].sort((left, right) =>
        compareAlpha(left.projects[0]?.artistName, right.projects[0]?.artistName) ||
        compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
      );
    }

    if (savedTracksSortMode === "color") {
      return [...stacks].sort((left, right) =>
        compareAlpha(left.projects[0]?.color, right.projects[0]?.color) ||
        compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
      );
    }

    return [...stacks].sort((left, right) =>
      compareAlpha(left.projects[0]?.title, right.projects[0]?.title)
    );
  }, [savedTracksSortMode, savedTracksSet]);

  const myTrackSections = useMemo(
    () => chunkItems(savedTrackStacks, STACKS_PER_SECTION),
    [savedTrackStacks]
  );

  const overviewShift = 0;
  const navTop = insets.top;
  const selectedStack = selectedProjects ?? (selectedStackIndex != null ? activeTrackStacks[selectedStackIndex] ?? null : null)?.projects ?? null;
  const giftingStack = giftingProjects;
  const activeRouteKey = `${rootScreen}:${selectedStack?.[0]?.id ?? "none"}:${giftingProjects?.[0]?.id ?? "none"}:${giftMessageComposerOpen ? "composer" : "base"}`;

  const captureRouteSnapshot = (): RouteSnapshot => ({
    rootScreen,
    selectedStackIndex,
    selectedProjects,
    giftingProjects,
    giftMessageComposerOpen,
  });

  const applyRouteSnapshot = (snapshot: RouteSnapshot) => {
    setMenuOpen(false);
    setRootScreen(snapshot.rootScreen);
    setSelectedStackIndex(snapshot.selectedStackIndex);
    setSelectedProjects(snapshot.selectedProjects);
    setGiftingProjects(snapshot.giftingProjects);
    setGiftMessageComposerOpen(snapshot.giftMessageComposerOpen);
  };

  const navigateToSnapshot = (snapshot: RouteSnapshot) => {
    setTransitionDirection("forward");
    routeHistoryRef.current.push(captureRouteSnapshot());
    applyRouteSnapshot(snapshot);
  };

  useEffect(() => {
    menuPanelProgress.value = withTiming(menuOpen ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [menuOpen, menuPanelProgress]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeRouteKey]);

  useEffect(() => {
    setGiftIntroReadyRouteKey(null);
  }, [activeRouteKey]);

  const menuPanelStyle = useAnimatedStyle(() => ({
    opacity: menuPanelProgress.value,
    transform: [
      {
        translateX: 36 * (1 - menuPanelProgress.value),
      },
    ],
  }));

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

  const handleGlobalBack = () => {
    // Back behavior restores the last visited route instead of a fixed destination.
    const previousRoute = routeHistoryRef.current.pop();
    if (previousRoute) {
      setTransitionDirection("back");
      applyRouteSnapshot(previousRoute);
    }
  };

  const canGoBack =
    giftingProjects != null ||
    selectedStack != null ||
    rootScreen === "saved_tracks" ||
    rootScreen === "loading_debug";

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
      <SlideInScene
        key={`${activeRouteKey}:${transitionDirection}`}
        sceneKey={activeRouteKey}
        width={width}
        direction={transitionDirection}
        onTransitionComplete={() => {
          if (giftingProjects != null && !giftMessageComposerOpen) {
            setTimeout(() => {
              setGiftIntroReadyRouteKey(activeRouteKey);
            }, 200);
          }
        }}
      >
      <View style={styles.detailPage}>
        <ScreenDustOverlay />
        <View pointerEvents="box-none" style={styles.detailNavLayer}>
          <GestureDetector gesture={globalBackGesture}>
            <View style={styles.detailBackGestureEdge} />
          </GestureDetector>
          <Pressable
            hitSlop={20}
            onPress={handleGlobalBack}
            style={[styles.backButton, { top: navTop }]}
          >
            <AppIcon name="angle-left" size={NAV_ICON_SIZE} />
          </Pressable>
          <View style={[styles.topRightMenuWrap, { top: navTop }]}>
            <MenuToggleButton open={menuOpen} onPress={() => setMenuOpen((current) => !current)} size={NAV_ICON_SIZE} style={styles.hamburger} />
          </View>
          <NavigationMenu
            open={menuOpen}
            navTop={navTop}
            onClose={() => setMenuOpen(false)}
            animatedStyle={menuPanelStyle}
            items={[
              {
                key: "home",
                label: "Home",
                onPress: () => {
                  routeHistoryRef.current = [];
                  applyRouteSnapshot({
                    rootScreen: "all_tracks",
                    selectedStackIndex: null,
                    selectedProjects: null,
                    giftingProjects: null,
                    giftMessageComposerOpen: false,
                  });
                },
              },
              {
                key: "saved-tracks",
                label: "Saved Tracks",
                onPress: () => {
                  navigateToSnapshot({
                    rootScreen: "saved_tracks",
                    selectedStackIndex: null,
                    selectedProjects: null,
                    giftingProjects: null,
                    giftMessageComposerOpen: false,
                  });
                },
              },
              {
                key: "loading-screen",
                label: "Loading Screen",
                onPress: () => {
                  navigateToSnapshot({
                    rootScreen: "loading_debug",
                    selectedStackIndex: null,
                    selectedProjects: null,
                    giftingProjects: null,
                    giftMessageComposerOpen: false,
                  });
                },
              },
            ]}
          />
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
                startIntro={giftIntroReadyRouteKey === activeRouteKey}
                onPressComposeMessage={() =>
                  navigateToSnapshot({
                    rootScreen,
                    selectedStackIndex,
                    selectedProjects,
                    giftingProjects,
                    giftMessageComposerOpen: true,
                  })
                }
                projects={giftingStack ?? []}
              />
            )
          ) : (
            <PlayScreen
              onPressGift={async (project) => {
                setGiftMessage("");
                await prefetchStackAssets([project]);
                navigateToSnapshot({
                  rootScreen,
                  selectedStackIndex,
                  selectedProjects,
                  giftingProjects: [project],
                  giftMessageComposerOpen: false,
                });
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
      </View>
      </SlideInScene>
    );
  }

  if (!feedReady || !bootAnimationComplete) {
    return (
      <View style={styles.bootPage}>
        <ScreenDustOverlay />
        <View style={styles.bootMarkWrap}>
          <RecordroomLogo
            animateRecordOnMount
            onFirstCycleComplete={() => setBootAnimationComplete(true)}
          />
        </View>
        <View style={styles.loadingLabelWrap}>
          <Text style={styles.loadingLabelText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (rootScreen === "loading_debug") {
    return (
      <View style={styles.bootPage}>
        <ScreenDustOverlay />
        <Pressable hitSlop={20} onPress={handleGlobalBack} style={[styles.backButton, { top: navTop }]}>
          <AppIcon name="angle-left" size={NAV_ICON_SIZE} />
        </Pressable>
        <View style={styles.bootMarkWrap}>
          <RecordroomLogo animateRecordOnMount={loadingDebugSpinEnabled} />
          <Pressable
            onPress={() => setLoadingDebugSpinEnabled((current) => !current)}
            style={styles.loadingDebugButton}
          >
            <Text style={styles.loadingDebugButtonText}>
              {loadingDebugSpinEnabled ? "Stop Spin" : "Start Spin"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SlideInScene
      key={`${activeRouteKey}:${transitionDirection}`}
      sceneKey={activeRouteKey}
      width={width}
      direction={transitionDirection}
    >
    <View style={styles.pageRoot}>
      {rootScreen === "saved_tracks" ? (
        <SavedTracksScreen
          accountLabel={demoAccount ? `${demoAccount.displayName} · ${demoAccount.username}` : undefined}
          layout={layout}
          sections={myTrackSections}
          previewRevealPrimed={overviewPreviewPrimed}
          initialScrollOffset={savedTracksScrollOffset}
          onBack={handleGlobalBack}
          onPressAllTracks={() => {
            routeHistoryRef.current = [];
            applyRouteSnapshot({
              rootScreen: "all_tracks",
              selectedStackIndex: null,
              selectedProjects: null,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
          onPressLoadingDebug={() => {
            navigateToSnapshot({
              rootScreen: "loading_debug",
              selectedStackIndex: null,
              selectedProjects: null,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
          onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
          sortOptions={[
            {
              id: "sort-title",
              label: "Sort: Title",
              onPress: () => setSavedTracksSortMode("title"),
            },
            {
              id: "sort-artist",
              label: "Sort: Artist",
              onPress: () => setSavedTracksSortMode("artist"),
            },
            {
              id: "sort-color",
              label: "Sort: Color",
              onPress: () => setSavedTracksSortMode("color"),
            },
          ]}
          onScrollOffsetChange={setSavedTracksScrollOffset}
          onPressStack={async (sectionIndex, stackIndex) => {
            const savedStack = myTrackSections[sectionIndex]?.[stackIndex];
            if (!savedStack) return;
            void prefetchStackAssets(savedStack.projects);
            navigateToSnapshot({
              rootScreen,
              selectedStackIndex: null,
              selectedProjects: savedStack.projects,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
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
            navigateToSnapshot({
              rootScreen,
              selectedStackIndex: null,
              selectedProjects: selectedStack.projects,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
          onPressSavedTracks={() => {
            navigateToSnapshot({
              rootScreen: "saved_tracks",
              selectedStackIndex: null,
              selectedProjects: null,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
          onPressLoadingDebug={() => {
            navigateToSnapshot({
              rootScreen: "loading_debug",
              selectedStackIndex: null,
              selectedProjects: null,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
          onPressAllTracks={() => {
            routeHistoryRef.current = [];
            applyRouteSnapshot({
              rootScreen: "all_tracks",
              selectedStackIndex: null,
              selectedProjects: null,
              giftingProjects: null,
              giftMessageComposerOpen: false,
            });
          }}
        />
      )}
      <GestureDetector gesture={globalBackGesture}>
        <View style={styles.globalBackEdge} />
      </GestureDetector>
    </View>
    </SlideInScene>
  );
}

const styles = StyleSheet.create({
  sceneRoot: {
    flex: 1,
  },
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
  loadingLabelWrap: {
    position: "absolute",
    left: 18,
    bottom: 22,
  },
  loadingLabelText: {
    color: "rgba(17,17,17,0.56)",
    fontFamily: "Eurostile",
    fontSize: 14,
    lineHeight: 14,
  },
  loadingDebugButton: {
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.16)",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  loadingDebugButtonText: {
    color: "#111111",
    fontFamily: "Eurostile",
    fontSize: 13,
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
  detailCanvas: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  topRightMenuWrap: {
    position: "absolute",
    right: NAV_RIGHT_INSET,
    zIndex: NAV_Z_INDEX + 3,
    alignItems: "flex-end",
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
});
