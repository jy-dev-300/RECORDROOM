import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
const PLAYBACK_DURATION_SECONDS = 60;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const playbackSecondsRef = useRef(0);
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

  const setDiscRotation = (degrees: number) => {
    discRotationRef.current = degrees;
    discRotationValue.setValue(degrees);
  };

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      const currentSeconds = playbackSecondsRef.current;
      const nextSeconds = Math.min(PLAYBACK_DURATION_SECONDS, currentSeconds + 0.05);
      applyPlaybackSeconds(nextSeconds);
      setDiscRotation(discRotationRef.current + 0.05 * DISC_DEGREES_PER_SECOND);

      if (nextSeconds >= PLAYBACK_DURATION_SECONDS) {
        setIsPlaying(false);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying]);

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
    setIsPlaying(false);
    applyPlaybackSeconds(0);
    setDiscRotation(0);
  }, [activeProject?.id]);

  const handleTogglePlayback = async () => {
    if (playbackSecondsRef.current >= PLAYBACK_DURATION_SECONDS) {
      applyPlaybackSeconds(0);
      setDiscRotation(0);
    }

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (!activeProject?.title) {
      setIsPlaying(true);
      return;
    }

    if (spotifyMatchProjectId === activeProject.id) {
      setIsPlaying(Boolean(spotifyMatch?.uri));
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
      setIsPlaying(Boolean(match?.uri));
    } catch {
      setSpotifyMatch(null);
      setSpotifyMatchProjectId(activeProject.id);
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
        debugVisible
        shouldPlay={isPlaying && Boolean(spotifyMatch?.uri)}
        spotifyUri={spotifyMatch?.uri ?? null}
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
              currentSeconds={playbackSeconds}
              isPlaying={isPlaying}
              onSeekChange={(nextSeconds) => {
                const delta = nextSeconds - playbackSecondsRef.current;
                applyPlaybackSeconds(nextSeconds);
                setDiscRotation(discRotationRef.current + delta * DISC_DEGREES_PER_SECOND);
              }}
              onTogglePlay={() => {
                void handleTogglePlayback();
              }}
              showPlayButton={false}
              totalSeconds={PLAYBACK_DURATION_SECONDS}
            />
            <View style={styles.actionRow}>
              <Text
                onPress={() => {
                  if (activeProject) {
                    if (activeProjectIsSaved) {
                      onPressRemove?.(activeProject);
                    } else {
                      onPressSave?.(activeProject);
                    }
                  }
                }}
                style={styles.transportActionText}
              >
                {activeProjectIsSaved ? "-" : "+"}
              </Text>
              <Text
                onPress={() => {
                  void handleTogglePlayback();
                }}
                style={styles.transportActionText}
              >
                {isPlaying ? "II" : "\u25B6"}
              </Text>
              <Text
                onPress={() => {
                  if (activeProject) {
                    onPressGift?.(activeProject);
                  }
                }}
                style={styles.transportActionText}
              >
                {"\uD83C\uDF81"}
              </Text>
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
    fontSize: 22,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: "100%",
  },
  trackMeta: {
    marginTop: 4,
    color: "rgba(17,17,17,0.72)",
    fontSize: 14,
    fontWeight: "500",
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
    marginTop: 12,
    width: 164,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  transportActionText: {
    minWidth: 32,
    color: "#111111",
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
  },
});
