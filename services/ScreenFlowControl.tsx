import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  albumStacks,
  createAlbumStackSectionsFromCountrySections,
  createAlbumStacksFromCountrySections,
  type CountryAlbumSection,
} from "../data/albumStacks";
import {
  buildAlbumWorldLayout,
  chunkItems,
  EDGE_BACK_TRIGGER,
  EDGE_BACK_ZONE,
  STACKS_PER_SECTION,
} from "../lib/albumWorldLayout";
import {
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_LEFT_INSET,
  NAV_RIGHT_INSET,
  NAV_TOP_PADDING,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import AlbumsOverviewScreen from "../screens/AlbumsOverviewScreen";
import GiftCreationPage from "../screens/GiftCreationPage";
import PlayOptionsScreen from "../screens/PlayOptionsScreen";
import SingleAlbumStackScreen, { type StackProject } from "../screens/SingleAlbumStackScreen";
import {
  cacheRandomAlbumsByCountry,
  fetchRandomAlbumsByCountry,
  loadCachedRandomAlbumsByCountry,
} from "./musicBrainzFetchService";

type OverviewMode = "all" | "my_albums";
type SavedAlbumDictionary = {
  album_id: string;
  album_cover_art: string;
};

const PARTITION_EDGE_BACK_ZONE = 14;

export default function ScreenFlowControl() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedStackIndex, setSelectedStackIndex] = useState<number | null>(null);
  const [shouldAnimateDetailIntro, setShouldAnimateDetailIntro] = useState(false);
  const [returningFromPlayOptions, setReturningFromPlayOptions] = useState(false);
  const [playingProject, setPlayingProject] = useState<{ stackIndex: number; projectIndex: number } | null>(null);
  const [giftingStackIndex, setGiftingStackIndex] = useState<number | null>(null);
  const [overviewMode, setOverviewMode] = useState<OverviewMode>("all");
  const [focusedSectionIndex, setFocusedSectionIndex] = useState<number | null>(null);
  const [savedAlbumsSet, setSavedAlbumsSet] = useState<Record<string, SavedAlbumDictionary>>({});
  const [musicBrainzSections, setMusicBrainzSections] = useState<CountryAlbumSection[]>([]);
  const [overviewPreviewPrimed, setOverviewPreviewPrimed] = useState(false);

  const focusedSectionRef = useRef<number | null>(null);
  const backGestureTriggered = useSharedValue(false);

  const layout = useMemo(() => buildAlbumWorldLayout(width, height), [height, width]);
  const activeAlbumStacks = useMemo(
    () =>
      musicBrainzSections.length > 0
        ? createAlbumStacksFromCountrySections(musicBrainzSections)
        : albumStacks,
    [musicBrainzSections]
  );
  const sectionCountries = useMemo(
    () => musicBrainzSections.map((section) => section.country),
    [musicBrainzSections]
  );
  const allAlbumSections = useMemo(
    () =>
      musicBrainzSections.length > 0
        ? createAlbumStackSectionsFromCountrySections(musicBrainzSections)
        : chunkItems(activeAlbumStacks, STACKS_PER_SECTION),
    [activeAlbumStacks, musicBrainzSections]
  );

  useEffect(() => {
    let cancelled = false;

    loadCachedRandomAlbumsByCountry()
      .then((cached) => {
        if (!cancelled && cached) {
          setMusicBrainzSections(cached.countrySections);
        }
      })
      .catch(() => {
        // Ignore cache read failures and continue to network.
      })
      .finally(() => {
        fetchRandomAlbumsByCountry()
          .then((result) => {
            if (!cancelled) {
              setMusicBrainzSections(result.countrySections);
            }
            void cacheRandomAlbumsByCountry(result);
          })
          .catch((error) => {
            console.warn("MusicBrainz album fetch failed; using fallback album stacks.", error);
          });
      })

    return () => {
      cancelled = true;
    };
  }, []);

  const projectLookup = useMemo(() => {
    const map = new Map<string, { project: StackProject; stackIndex: number }>();
    activeAlbumStacks.forEach((stack, stackIndex) => {
      stack.projects.forEach((project) => {
        map.set(project.id, { project, stackIndex });
      });
    });
    return map;
  }, [activeAlbumStacks]);

  const overviewStacks = useMemo(() => {
    if (overviewMode === "all") {
      return activeAlbumStacks;
    }

    return Object.keys(savedAlbumsSet)
      .map((albumId) => {
        const found = projectLookup.get(albumId);
        if (!found) return null;
        return {
          id: `saved-${albumId}`,
          projects: [found.project],
        };
      })
      .filter((value): value is (typeof activeAlbumStacks)[number] => value != null);
  }, [activeAlbumStacks, overviewMode, projectLookup, savedAlbumsSet]);

  const overviewSourceStackIndexes = useMemo(() => {
    if (overviewMode === "all") {
      return activeAlbumStacks.map((_, index) => index);
    }
    return Object.keys(savedAlbumsSet)
      .map((albumId) => projectLookup.get(albumId)?.stackIndex ?? -1)
      .filter((index) => index >= 0);
  }, [activeAlbumStacks, overviewMode, projectLookup, savedAlbumsSet]);

  const sections = useMemo(() => {
    if (overviewMode === "all") {
      return allAlbumSections;
    }

    return chunkItems(overviewStacks, STACKS_PER_SECTION);
  }, [allAlbumSections, overviewMode, overviewStacks]);
  const overviewSourceSections = useMemo(() => {
    if (overviewMode === "all") {
      return allAlbumSections.map((section) =>
        section.map((stack) => activeAlbumStacks.findIndex((candidate) => candidate.id === stack.id))
      );
    }

    return chunkItems(overviewSourceStackIndexes, STACKS_PER_SECTION);
  }, [activeAlbumStacks, allAlbumSections, overviewMode, overviewSourceStackIndexes]);
  const overviewShift = layout.viewportHeight * 0.05;
  const navTop = insets.top + NAV_TOP_PADDING - overviewShift;

  const resetSectionFocus = () => {
    focusedSectionRef.current = null;
    setFocusedSectionIndex(null);
  };

  const focusSection = (sectionIndex: number) => {
    focusedSectionRef.current = sectionIndex;
    setFocusedSectionIndex(sectionIndex);
  };

  const handleSaveProject = (project: StackProject) => {
    setSavedAlbumsSet((current) => {
      if (current[project.id]) return current;
      return {
        ...current,
        [project.id]: {
          album_id: project.id,
          album_cover_art: project.media || project.color,
        },
      };
    });
  };

  const handleRemoveProject = (project: StackProject) => {
    setSavedAlbumsSet((current) => {
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

    if (focusedSectionIndex != null) {
      setMenuOpen(false);
      resetSectionFocus();
      return;
    }

    if (overviewMode === "my_albums") {
      setMenuOpen(false);
      setOverviewMode("all");
    }
  };

  const canGoBack =
    playingProject != null ||
    giftingStackIndex != null ||
    selectedStackIndex != null ||
    focusedSectionIndex != null ||
    overviewMode === "my_albums";
  const overviewBackEdgeWidth =
    selectedStackIndex == null && focusedSectionIndex != null ? PARTITION_EDGE_BACK_ZONE : EDGE_BACK_ZONE;

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
    const projects = activeAlbumStacks[playingProject.stackIndex]?.projects ?? [];
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
                {overviewMode === "my_albums" ? (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setSelectedStackIndex(null);
                      resetSectionFocus();
                      setOverviewMode("all");
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={styles.menuItemText}>All Albums</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => {
                      setMenuOpen(false);
                      setSelectedStackIndex(null);
                      resetSectionFocus();
                      setOverviewMode("my_albums");
                    }}
                    style={styles.menuItem}
                  >
                    <Text style={styles.menuItemText}>My Albums</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.detailCanvas}>
          {giftingStackIndex != null ? (
            <GiftCreationPage projects={activeAlbumStacks[giftingStackIndex]?.projects ?? []} />
          ) : (
            <SingleAlbumStackScreen
              projects={activeAlbumStacks[selectedStackIndex].projects}
              enableIntroAnimation={shouldAnimateDetailIntro && !returningFromPlayOptions}
              onPlayPress={(_, index) => setPlayingProject({ stackIndex: selectedStackIndex, projectIndex: index })}
              onGiftPress={() => setGiftingStackIndex(selectedStackIndex)}
              isProjectSaved={(project) => savedAlbumsSet[project.id] != null}
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
      <AlbumsOverviewScreen
        layout={layout}
        sections={sections}
        sectionCountries={overviewMode === "all" ? sectionCountries : []}
        focusedSectionIndex={focusedSectionIndex}
        previewRevealPrimed={overviewPreviewPrimed}
        isMyAlbumsView={overviewMode === "my_albums"}
        onPreviewRevealPrimed={() => setOverviewPreviewPrimed(true)}
        onPressSection={focusSection}
        onPressStack={(sectionIndex, stackIndex) => {
          if (focusedSectionIndex == null || sectionIndex !== focusedSectionIndex) return;
          const sourceStackIndex = overviewSourceSections[sectionIndex]?.[stackIndex];
          if (sourceStackIndex == null) return;
          setShouldAnimateDetailIntro(true);
          setReturningFromPlayOptions(false);
          setSelectedStackIndex(sourceStackIndex);
        }}
        onPressMyAlbums={() => {
          setMenuOpen(false);
          resetSectionFocus();
          setOverviewMode("my_albums");
        }}
        onPressAllAlbums={() => {
          setMenuOpen(false);
          resetSectionFocus();
          setOverviewMode("all");
        }}
      />
      {focusedSectionIndex != null ? (
        <Pressable hitSlop={20} onPress={resetSectionFocus} style={[styles.backButton, { top: navTop }]}>
          <Text style={styles.backArrow}>{"\u2190"}</Text>
        </Pressable>
      ) : null}
      <GestureDetector gesture={globalBackGesture}>
        <View style={[styles.globalBackEdge, { width: overviewBackEdgeWidth }]} />
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
