import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import ReanimatedAnimated, {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import StackComponent, {
  getVisibleDepth,
  STACK_LAYER_OFFSET,
  type Stack,
} from "../components/Stack";
import AppIcon from "../components/AppIcon";
import SpotifyEmbedBridge from "../components/SpotifyEmbedBridge";
import {
  DISC_LABEL_SIZE_RATIO,
  DISC_SIZE_RATIO,
  DISC_VERTICAL_TILT_DEG,
  DISC_VERTICAL_SQUASH_RATIO,
} from "../components/disc";
import MusicPlayControlBar from "../components/MusicPlayControlBar";
import Tonearm from "../components/Tonearm";
import {
  fetchSpotifyTrackMatch,
  type SpotifyTrackMatch,
} from "../services/spotifyTrackPreviewService";

type PlayScreenProps = {
  projects: Stack[];
  initialProjectIndex?: number;
  onPressGift?: (project: Stack) => void;
  onPressSave?: (project: Stack) => void;
  onPressRemove?: (project: Stack) => void;
  savedTrackIds?: Record<string, boolean>;
};

const PLAYER_SIZE = 360;
const PLAYER_MENU_ITEM_WIDTH = PLAYER_SIZE + 72;
const FALLBACK_PLAYBACK_DURATION_SECONDS = 60;
const DISC_DEGREES_PER_SECOND = 720;
const CUSTOM_PLAYER_SOURCE = require("../assets/player.jpeg");
const VINYL_DISC_SOURCE = require("../assets/vinyl2.png");
const TOP_STYLE_PLAY = { top: "59.5%", right: "4.9%", transform: [{ rotate: "-5deg" }] } as const;
const TOP_STYLE_PAUSE = { top: "50%", right: "8%", transform: [{ rotate: "10deg" }] } as const;
const STACK_REST_TRANSLATE_Y = -19.5;
const FULL_FOUR_TRACK_STACK_DEPTH = 3;

export default function PlayScreen({
  projects,
  initialProjectIndex = 0,
  onPressGift,
  onPressSave,
  onPressRemove,
  savedTrackIds,
}: PlayScreenProps) {
  const { height } = useWindowDimensions();
  const playableProjects = useMemo(
    () => projects.filter((project) => project.type !== "image" || project.media.trim().length > 0),
    [projects]
  );
  const [activeIndex, setActiveIndex] = useState(initialProjectIndex);
  const activeProject =
    playableProjects[activeIndex] ?? playableProjects[initialProjectIndex] ?? null;
  const activeProjectIsSaved = activeProject ? savedTrackIds?.[activeProject.id] === true : false;
  const artworkSource = activeProject?.media ? { uri: activeProject.media } : null;
  const [spotifyMatch, setSpotifyMatch] = useState<SpotifyTrackMatch | null>(null);
  const [spotifyMatchProjectId, setSpotifyMatchProjectId] = useState<string | null>(null);
  const [spotifyDurationSeconds, setSpotifyDurationSeconds] = useState<number | null>(null);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);
  const [spotifyPlaybackCommand, setSpotifyPlaybackCommand] = useState<{
    id: number;
    type: "play" | "pause" | "resume";
  } | null>(null);
  const [pendingAutoPlayProjectId, setPendingAutoPlayProjectId] = useState<string | null>(null);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const playbackSecondsRef = useRef(0);
  const isPlayingRef = useRef(false);
  const spotifyPositionSecondsRef = useRef(0);
  const spotifyPositionTimestampRef = useRef(0);
  const discRotationRef = useRef(0);
  const discRotationValue = useRef(new Animated.Value(0)).current;
  const tonearmTopProgress = useRef(new Animated.Value(0)).current;
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 20 });
  const stackTiltX = useSharedValue(0);
  const stackTiltY = useSharedValue(0);
  const stackMessX = useSharedValue(0);
  const stackMessY = useSharedValue(0);

  const applyPlaybackSeconds = (seconds: number) => {
    playbackSecondsRef.current = seconds;
    setPlaybackSeconds(seconds);
  };

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const setDiscRotation = (degrees: number) => {
    discRotationRef.current = degrees;
    discRotationValue.setValue(degrees);
  };

  const effectiveTotalSeconds =
    spotifyDurationSeconds ?? FALLBACK_PLAYBACK_DURATION_SECONDS;
  const isWaitingForSpotifyDuration = Boolean(spotifyMatch?.uri) && spotifyDurationSeconds == null;
  const isWaitingForSpotifySeek = Boolean(spotifyMatch?.uri) && pendingSeekSeconds != null;
  const isPreviewUnavailable =
    Boolean(activeProject?.title) &&
    spotifyMatchProjectId === activeProject?.id &&
    spotifyMatch == null;
  const displayedTotalSeconds =
    isWaitingForSpotifyDuration || isPreviewUnavailable ? 0 : effectiveTotalSeconds;
  const shouldShowEmptyTime =
    !hasPlaybackStarted || isWaitingForSpotifyDuration || isPreviewUnavailable;
  const emptyTimeMode =
    isPreviewUnavailable || !activeProject?.title ? "both" : "right-only";

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      if (isWaitingForSpotifySeek) {
        return;
      }

      const nextSeconds = spotifyMatch?.uri
        ? Math.min(
            effectiveTotalSeconds,
            spotifyPositionSecondsRef.current +
              Math.max(0, (Date.now() - spotifyPositionTimestampRef.current) / 1000)
          )
        : Math.min(effectiveTotalSeconds, playbackSecondsRef.current + 0.05);
      applyPlaybackSeconds(nextSeconds);

      if (!spotifyMatch?.uri && nextSeconds >= effectiveTotalSeconds) {
        setIsPlaying(false);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [effectiveTotalSeconds, isPlaying, isWaitingForSpotifySeek, spotifyMatch?.uri]);

  useEffect(() => {
    if (!isPlaying || isWaitingForSpotifySeek) {
      return;
    }

    const interval = setInterval(() => {
      setDiscRotation(discRotationRef.current + 0.05 * DISC_DEGREES_PER_SECOND);
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, isWaitingForSpotifySeek]);

  useEffect(() => {
    Animated.timing(tonearmTopProgress, {
      toValue: isPlaying ? 1 : 0,
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isPlaying, tonearmTopProgress]);

  useEffect(() => {
    setActiveIndex(initialProjectIndex);
  }, [initialProjectIndex]);

  useEffect(() => {
    const shouldContinuePlayback = isPlayingRef.current;

    queueSpotifyPlaybackCommand("pause");
    setIsPlaying(false);
    applyPlaybackSeconds(0);
    setDiscRotation(0);
    setSpotifyMatch(null);
    setSpotifyMatchProjectId(null);
    setSpotifyDurationSeconds(null);
    setPendingSeekSeconds(null);
    setHasPlaybackStarted(false);
    setPendingAutoPlayProjectId(shouldContinuePlayback ? activeProject?.id ?? null : null);
    spotifyPositionSecondsRef.current = 0;
    spotifyPositionTimestampRef.current = 0;
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id || !activeProject.title) {
      setSpotifyMatch(null);
      setSpotifyMatchProjectId(activeProject?.id ?? null);
      return;
    }

    if (spotifyMatchProjectId === activeProject.id) {
      return;
    }

    let isCancelled = false;

    void fetchSpotifyTrackMatch({
      title: activeProject.title,
      artistName: activeProject.artistName,
      releaseYear: activeProject.releaseYear,
    })
      .then((match) => {
        if (isCancelled) {
          return;
        }

        setSpotifyMatch(match);
        setSpotifyMatchProjectId(activeProject.id);
        if (pendingAutoPlayProjectId === activeProject.id) {
          setPendingAutoPlayProjectId(null);
          if (match?.uri) {
            spotifyPositionSecondsRef.current = 0;
            spotifyPositionTimestampRef.current = Date.now();
            setHasPlaybackStarted(true);
            setIsPlaying(true);
            queueSpotifyPlaybackCommand("play");
          }
        }
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setSpotifyMatch(null);
        setSpotifyMatchProjectId(activeProject.id);
        if (pendingAutoPlayProjectId === activeProject.id) {
          setPendingAutoPlayProjectId(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    activeProject?.artistName,
    activeProject?.id,
    activeProject?.releaseYear,
    activeProject?.title,
    pendingAutoPlayProjectId,
    spotifyMatchProjectId,
  ]);

  const queueSpotifyPlaybackCommand = (type: "play" | "pause" | "resume") => {
    setSpotifyPlaybackCommand((current) => ({
      id: (current?.id ?? 0) + 1,
      type,
    }));
  };

  const showUnavailablePreviewAlert = () => {
    Alert.alert("Preview unavailable", "This song is currently unavailable for preview.");
  };

  const handleTogglePlayback = async () => {
    if (playbackSecondsRef.current >= effectiveTotalSeconds) {
      applyPlaybackSeconds(0);
      spotifyPositionSecondsRef.current = 0;
      spotifyPositionTimestampRef.current = Date.now();
      if (spotifyMatch?.uri) {
        setPendingSeekSeconds(0);
      }
    }

    if (isPlaying) {
      setIsPlaying(false);
      queueSpotifyPlaybackCommand("pause");
      return;
    }

    if (!activeProject?.title) {
      setHasPlaybackStarted(true);
      setIsPlaying(true);
      return;
    }

    if (spotifyMatchProjectId === activeProject.id) {
      setHasPlaybackStarted(true);
      if (spotifyMatch?.uri) {
        spotifyPositionTimestampRef.current = Date.now();
        setIsPlaying(true);
        queueSpotifyPlaybackCommand(
          playbackSecondsRef.current > 0 &&
            playbackSecondsRef.current < effectiveTotalSeconds
            ? "resume"
            : "play"
        );
      } else {
        showUnavailablePreviewAlert();
      }
      return;
    }

    try {
      const match = await fetchSpotifyTrackMatch({
        title: activeProject.title,
        artistName: activeProject.artistName,
        releaseYear: activeProject.releaseYear,
      });
      setSpotifyMatch(match);
      setSpotifyMatchProjectId(activeProject.id);
      setSpotifyDurationSeconds(null);
      setHasPlaybackStarted(true);
      if (match?.uri) {
        spotifyPositionSecondsRef.current = playbackSecondsRef.current;
        spotifyPositionTimestampRef.current = Date.now();
        setIsPlaying(true);
        setSpotifyPlaybackCommand((current) => ({
          id: (current?.id ?? 0) + 1,
          type: "play",
        }));
      } else {
        setIsPlaying(false);
        showUnavailablePreviewAlert();
      }
    } catch {
      setSpotifyMatch(null);
      setSpotifyMatchProjectId(activeProject.id);
      setSpotifyDurationSeconds(null);
      setIsPlaying(false);
    }
  };

  const discSpinStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: discRotationValue.interpolate({
            inputRange: [-200000, 200000],
            outputRange: ["-200000deg", "200000deg"],
          }),
        },
      ],
    }),
    [discRotationValue]
  );

  const tonearmTopStyle = useMemo(
    () => ({
      top: tonearmTopProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [TOP_STYLE_PAUSE.top, TOP_STYLE_PLAY.top],
      }),
      right: tonearmTopProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [TOP_STYLE_PAUSE.right, TOP_STYLE_PLAY.right],
      }),
      transform: [
        {
          rotate: tonearmTopProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [
              TOP_STYLE_PAUSE.transform[0].rotate,
              TOP_STYLE_PLAY.transform[0].rotate,
            ],
          }),
        },
      ],
    }),
    [tonearmTopProgress]
  );

  const stackVisibleDepth = getVisibleDepth(playableProjects.length);
  const shallowStackLift =
    Math.max(0, FULL_FOUR_TRACK_STACK_DEPTH - stackVisibleDepth) * STACK_LAYER_OFFSET;

  const contentShiftStyle = useMemo(
    () => ({
      transform: [{ translateY: height * 0.05 }],
    }),
    [height]
  );

  useAnimatedReaction(
    () => ({
      x: gravity.sensor.value.x ?? 0,
      y: gravity.sensor.value.y ?? 0,
    }),
    (value) => {
      const clampedX = Math.max(-7, Math.min(7, value.x));
      const clampedY = Math.max(-7, Math.min(7, value.y));
      const uprightDeadZone = 1.1;
      const upsideDownAmount = Math.max(0, clampedY - uprightDeadZone);
      const horizontalStrength = 1.35 + upsideDownAmount * 0.1;

      stackTiltX.value = clampedX * horizontalStrength;
      stackTiltY.value = upsideDownAmount * -2.7;
      stackMessX.value = clampedX * upsideDownAmount * 0.55;
      stackMessY.value = upsideDownAmount * -5.2;
    },
    [gravity, stackMessX, stackMessY, stackTiltX, stackTiltY]
  );

  const stackTiltStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: stackTiltX.value },
      { translateY: STACK_REST_TRANSLATE_Y + stackTiltY.value },
    ],
  }));

  return (
    <View style={styles.page}>
      <SpotifyEmbedBridge
        key={activeProject?.id ?? "no-active-project"}
        loadIdentity={activeProject?.id ?? null}
        playbackCommand={spotifyPlaybackCommand}
        seekToSeconds={pendingSeekSeconds}
        spotifyUri={spotifyMatch?.uri ?? null}
        onPlaybackUpdate={({ durationSeconds, positionSeconds, isPaused }) => {
          if (
            !isPlaying &&
            !hasPlaybackStarted &&
            pendingSeekSeconds == null &&
            positionSeconds > 0
          ) {
            return;
          }

          if (durationSeconds > 0) {
            setSpotifyDurationSeconds(durationSeconds);
          }
          const resolvedDuration =
            durationSeconds > 0 ? durationSeconds : effectiveTotalSeconds;
          const clampedPosition = Math.max(
            0,
            Math.min(resolvedDuration, positionSeconds)
          );
          if (pendingSeekSeconds != null) {
            const seekDelta = Math.abs(clampedPosition - pendingSeekSeconds);
            if (seekDelta > 0.35) {
              return;
            }
          }
          if (clampedPosition > 0 || !isPaused) {
            setHasPlaybackStarted(true);
          }
          spotifyPositionSecondsRef.current = clampedPosition;
          spotifyPositionTimestampRef.current = Date.now();
          applyPlaybackSeconds(clampedPosition);
          if (pendingSeekSeconds != null) {
            const seekDelta = Math.abs(clampedPosition - pendingSeekSeconds);
            if (seekDelta <= 0.35) {
              setPendingSeekSeconds(null);
            }
          }
          if (isPaused && resolvedDuration > 0 && clampedPosition >= resolvedDuration - 0.15) {
            setIsPlaying(false);
          }
        }}
      />
      <View style={[styles.contentShiftWrap, contentShiftStyle]}>
        <View style={styles.infoDock}>
          <Text numberOfLines={1} style={styles.trackTitle}>
            {activeProject?.title ?? "Track"}
          </Text>
          <Text numberOfLines={1} style={styles.trackMeta}>
            <Text style={styles.metaLabel}>by </Text>
            {activeProject?.artistName ?? "Unknown Artist"}
          </Text>
          {activeProject?.releaseYear != null ? (
            <Text style={styles.trackMeta}>{String(activeProject.releaseYear)}</Text>
          ) : null}
        </View>
        <View style={[styles.heroStage, { transform: [{ translateY: -shallowStackLift }] }]}>
          <ReanimatedAnimated.View style={[styles.stackDock, stackTiltStyle]}>
            <StackComponent
              projects={playableProjects}
              focusIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              stackWidthOverride={236}
              tiltX={stackMessX}
              tiltY={stackMessY}
            />
          </ReanimatedAnimated.View>

          <View style={styles.playerDock}>
            <View style={styles.playerTiltWrap}>
              <View style={styles.playerMenu}>
                <View style={styles.playerMenuContent}>
                  <View style={styles.playerMenuItem}>
                    <View style={styles.playerVisualTilt}>
                      <View style={styles.customPlayerWrap}>
                        <ExpoImage
                          cachePolicy="memory-disk"
                          contentFit="contain"
                          source={CUSTOM_PLAYER_SOURCE}
                          style={styles.customPlayerImage}
                          transition={0}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View pointerEvents="none" style={styles.discDock}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.customDiscWrap,
                {
                  transform: [
                    { perspective: 1600 },
                    { rotateX: DISC_VERTICAL_TILT_DEG },
                    { scaleY: DISC_VERTICAL_SQUASH_RATIO },
                    ...discSpinStyle.transform,
                  ],
                },
              ]}
            >
              <ExpoImage
                cachePolicy="memory-disk"
                contentFit="contain"
                source={VINYL_DISC_SOURCE}
                style={styles.customDiscImage}
                transition={0}
              />
              {artworkSource ? (
                <View pointerEvents="none" style={styles.customDiscLabelWrap}>
                  <ExpoImage
                    cachePolicy="memory-disk"
                    contentFit="contain"
                    source={artworkSource}
                    style={styles.customDiscLabelArtwork}
                    transition={0}
                  />
                </View>
              ) : null}
            </Animated.View>
          </View>

          <View pointerEvents="none" style={styles.tonearmDock}>
            <View pointerEvents="none" style={styles.tonearmWrap}>
              <Tonearm
                topStyle={tonearmTopStyle}
                bottomStyle={{ top: "67%", right: -1 }}
              />
            </View>
          </View>
        </View>

        <View style={[styles.transportDock, { transform: [{ translateY: -140 - shallowStackLift }] }]}>
          <View style={styles.transportWrap}>
            <MusicPlayControlBar
              currentSeconds={hasPlaybackStarted ? playbackSeconds : 0}
              isPlaying={isPlaying}
              onSeekChange={(nextSeconds) => {
                const seekDeltaSeconds = nextSeconds - playbackSecondsRef.current;
                setHasPlaybackStarted(true);
                applyPlaybackSeconds(nextSeconds);
                setDiscRotation(
                  discRotationRef.current + seekDeltaSeconds * DISC_DEGREES_PER_SECOND
                );
                spotifyPositionSecondsRef.current = nextSeconds;
                spotifyPositionTimestampRef.current = Date.now();
                if (spotifyMatch?.uri) {
                  setPendingSeekSeconds(nextSeconds);
                }
              }}
              onTogglePlay={() => {
                void handleTogglePlayback();
              }}
              emptyTimeMode={emptyTimeMode}
              showEmptyTime={shouldShowEmptyTime}
              showPlayButton={false}
              totalSeconds={displayedTotalSeconds}
            />
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => {
                  if (activeProject) {
                    if (activeProjectIsSaved) {
                      onPressRemove?.(activeProject);
                    } else {
                      onPressSave?.(activeProject);
                    }
                  }
                }}
                hitSlop={12}
                style={styles.transportActionButton}
              >
                <AppIcon name={activeProjectIsSaved ? "minus" : "plus"} size={18} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void handleTogglePlayback();
                }}
                hitSlop={12}
                style={styles.transportActionButton}
              >
                <AppIcon
                  name={isPreviewUnavailable ? "disable" : isPlaying ? "pause" : "play"}
                  size={18}
                  color={isPreviewUnavailable ? "#C62828" : "#111111"}
                />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (activeProject) {
                    onPressGift?.(activeProject);
                  }
                }}
                hitSlop={12}
                style={styles.transportActionButton}
              >
                <AppIcon name="gift" size={18} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#FEFEFE",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    overflow: "visible",
  },
  contentShiftWrap: {
    flex: 1,
    overflow: "visible",
  },
  infoDock: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: -16,
    alignItems: "center",
    zIndex: 3,
    transform: [{ translateY: 90 }],
  },
  heroStage: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 20,
    overflow: "visible",
  },
  playerDock: {
    width: "100%",
    maxWidth: 420,
    height: 400,
    justifyContent: "flex-end",
    alignItems: "center",
    overflow: "visible",
    zIndex: 1,
  },
  discDock: {
    position: "absolute",
    bottom: 20,
    width: "100%",
    maxWidth: 420,
    height: 400,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    zIndex: 999,
    elevation: 999,
  },
  tonearmDock: {
    position: "absolute",
    bottom: -14,
    width: "100%",
    maxWidth: 420,
    height: 400,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    zIndex: 1200,
    elevation: 1200,
  },
  playerMenu: {
    overflow: "visible",
    width: PLAYER_MENU_ITEM_WIDTH,
  },
  playerMenuContent: {
    alignItems: "flex-end",
    paddingVertical: 24,
  },
  playerMenuItem: {
    width: PLAYER_MENU_ITEM_WIDTH,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  customPlayerImage: {
    position: "absolute",
    bottom: 0,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    zIndex: 1,
  },
  customPlayerWrap: {
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    position: "relative",
  },
  customDiscWrap: {
    position: "absolute",
    width: PLAYER_SIZE * DISC_SIZE_RATIO,
    height: PLAYER_SIZE * DISC_SIZE_RATIO,
    top: PLAYER_SIZE * 0.2875,
    right: PLAYER_SIZE * 0.2475,
    zIndex: 999,
    elevation: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tonearmWrap: {
    position: "absolute",
    top: PLAYER_SIZE * 0.16,
    right: PLAYER_SIZE * 0.11,
    zIndex: 1200,
    elevation: 1200,
  },
  customDiscImage: {
    width: "100%",
    height: "100%",
  },
  customDiscLabelWrap: {
    position: "absolute",
    width: `${DISC_LABEL_SIZE_RATIO * 100}%`,
    height: `${DISC_LABEL_SIZE_RATIO * 100}%`,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  customDiscLabelArtwork: {
    width: "101.5%",
    height: "101.5%",
  },
  stackDock: {
    position: "absolute",
    bottom: 168,
    width: 272,
    height: 300,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 12,
    overflow: "visible",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  playerTiltWrap: {
    width: 420,
    height: 400,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    backfaceVisibility: "visible",
  },
  playerVisualTilt: {
    width: PLAYER_SIZE,
    height: 376,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
    backfaceVisibility: "visible",
    transform: [{ perspective: 1600 }, { rotateX: "30deg" }, { translateY: 32 }],
  },
  transportDock: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    marginTop: -8,
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
    transform: [{ translateY: -140 }],
  },
  trackTitle: {
    color: "#111111",
    fontFamily: "Eurostile",
    fontSize: 22,
    textAlign: "center",
    maxWidth: "100%",
  },
  trackMeta: {
    marginTop: 4,
    color: "rgba(17,17,17,0.72)",
    fontFamily: "Eurostile",
    fontSize: 14,
    textAlign: "center",
  },
  metaLabel: {
    fontStyle: "italic",
  },
  transportWrap: {
    width: "100%",
    alignItems: "center",
    zIndex: 20,
  },
  actionRow: {
    marginTop: 20,
    width: 164,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  transportActionButton: {
    minWidth: 32,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
