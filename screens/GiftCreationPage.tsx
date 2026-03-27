import { useEffect, useMemo, useRef } from "react";
import { Alert, Animated, Easing, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import ReanimatedAnimated, {
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import AppIcon from "../components/AppIcon";
import type { Stack } from "../components/Stack";
import PlayerDisc from "../components/PlayerDisc";

type GiftCreationPageProps = {
  projects: Stack[];
  giftMessage: string;
  onPressComposeMessage: () => void;
  startIntro?: boolean;
};

const PLASTIC_WRAP_SOURCE = require("../assets/bestplastic.png");
export default function GiftCreationPage({
  projects,
  giftMessage,
  onPressComposeMessage,
  startIntro = true,
}: GiftCreationPageProps) {
  const giftLink = "https://recordroom.app/gift";
  const { width, height } = useWindowDimensions();
  const activeProject = projects[0] ?? null;
  const artworkSource = activeProject?.media ? { uri: activeProject.media } : null;
  const discProgress = useRef(new Animated.Value(0)).current;
  const wrapProgress = useRef(new Animated.Value(0)).current;
  const idleFloat = useRef(new Animated.Value(0)).current;
  const idleDrift = useRef(new Animated.Value(0)).current;
  const previewDidScrollRef = useRef(false);
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 20 });
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  useEffect(() => {
    discProgress.setValue(0);
    wrapProgress.setValue(0);
    idleFloat.setValue(0);
    idleDrift.setValue(0);

    if (!startIntro) {
      return () => {
        discProgress.stopAnimation();
        wrapProgress.stopAnimation();
        idleFloat.stopAnimation();
        idleDrift.stopAnimation();
      };
    }

    const startTimeout = setTimeout(() => {
      Animated.sequence([
        Animated.timing(discProgress, {
          toValue: 1,
          duration: 1180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(wrapProgress, {
          toValue: 1,
          duration: 920,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start(() => {
        Animated.parallel([
          Animated.loop(
            Animated.sequence([
              Animated.timing(idleFloat, {
                toValue: 1,
                duration: 2200,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(idleFloat, {
                toValue: 0,
                duration: 2400,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ])
          ),
          Animated.loop(
            Animated.sequence([
              Animated.timing(idleDrift, {
                toValue: 1,
                duration: 2900,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(idleDrift, {
                toValue: 0,
                duration: 2700,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
            ])
          ),
        ]).start();
      });
    }, 0);

    return () => {
      clearTimeout(startTimeout);
      discProgress.stopAnimation();
      wrapProgress.stopAnimation();
      idleFloat.stopAnimation();
      idleDrift.stopAnimation();
    };
  }, [discProgress, wrapProgress, idleDrift, idleFloat, activeProject?.id, startIntro]);

  const sleeveSize = Math.min(width * 0.5566, 319);
  const discSize = sleeveSize * 0.99;
  const sceneHeight = sleeveSize * 1.18;
  const upwardShift = height * -0.015;

  const discTranslateX = useMemo(
    () =>
      discProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [sleeveSize * 0.63, 0],
      }),
    [discProgress, sleeveSize]
  );

  const sleeveTranslateX = useMemo(
    () =>
      discProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [-sleeveSize * 0.31, 0],
      }),
    [discProgress, sleeveSize]
  );

  const wrapWidth = useMemo(
    () =>
      wrapProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, sleeveSize],
      }),
    [sleeveSize, wrapProgress]
  );

  const idleSceneStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: idleFloat.interpolate({
            inputRange: [0, 1],
            outputRange: [0.5, -3],
          }),
        },
        {
          translateX: idleDrift.interpolate({
            inputRange: [0, 1],
            outputRange: [-1.5, 2],
          }),
        },
        {
          rotate: idleFloat.interpolate({
            inputRange: [0, 1],
            outputRange: ["-0.35deg", "0.35deg"],
          }),
        },
        {
          rotate: idleDrift.interpolate({
            inputRange: [0, 1],
            outputRange: ["0.08deg", "-0.12deg"],
          }),
        },
      ],
    }),
    [idleDrift, idleFloat]
  );

  useAnimatedReaction(
    () => ({
      x: gravity.sensor.value.x ?? 0,
      y: gravity.sensor.value.y ?? 0,
    }),
    (value) => {
      const clampedX = Math.max(-7, Math.min(7, value.x));
      const clampedY = Math.max(-7, Math.min(7, value.y));
      tiltX.value = clampedX * 4.8;
      const verticalStrength = clampedY > 0 ? 7.8 : 3.2;
      tiltY.value = clampedY * -verticalStrength;
    },
    [gravity, tiltX, tiltY]
  );

  const tiltSceneStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tiltX.value },
      { translateY: tiltY.value },
    ],
  }));

  const handleCopyLink = () => {
    Alert.alert("Gift link copied \u2713 \uD83E\uDD1D");
  };

  const handleShare = async () => {
    const trimmedMessage = giftMessage.trim();
    const shareMessage = trimmedMessage ? `${trimmedMessage}\n\n${giftLink}` : giftLink;

    try {
      await Share.share({
        message: shareMessage,
      });
    } catch {
      // Ignore dismissed or failed share attempts for now.
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.content, { transform: [{ translateY: -upwardShift }] }]}>
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
        <ReanimatedAnimated.View style={tiltSceneStyle}>
          <Animated.View style={[styles.scene, { width: sleeveSize * 1.52, height: sceneHeight }, idleSceneStyle]}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.discStage,
                {
                  width: discSize,
                  height: discSize,
                  transform: [{ translateX: discTranslateX }],
                },
              ]}
            >
              <PlayerDisc
                artworkSource={artworkSource}
                size={discSize}
                squashRatio={1}
                style={styles.discWrap}
                tiltDeg="0deg"
              />
            </Animated.View>

            <Animated.View
              style={[
                styles.sleeveStage,
                {
                  width: sleeveSize,
                  height: sleeveSize,
                  borderRadius: Math.round(sleeveSize * 0.02),
                  transform: [{ translateX: sleeveTranslateX }],
                },
              ]}
            >
              {artworkSource ? (
                <ExpoImage
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  source={artworkSource}
                  style={styles.sleeveArt}
                  transition={0}
                />
              ) : (
                <View
                  style={[
                    styles.sleeveFallback,
                    { backgroundColor: activeProject?.color ?? "#E7E7E7" },
                  ]}
                />
              )}
              <Animated.View style={[styles.plasticReveal, { width: wrapWidth }]}>
                <ExpoImage
                  contentFit="cover"
                  source={PLASTIC_WRAP_SOURCE}
                  style={styles.plasticWrap}
                  transition={0}
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </ReanimatedAnimated.View>

        <View style={styles.messageDock}>
          <View style={styles.messageCard}>
            <ScrollView
              nestedScrollEnabled
              onScrollBeginDrag={() => {
                previewDidScrollRef.current = true;
              }}
              onTouchEnd={() => {
                if (!previewDidScrollRef.current) {
                  onPressComposeMessage();
                }
              }}
              onTouchStart={() => {
                previewDidScrollRef.current = false;
              }}
              showsVerticalScrollIndicator={giftMessage.trim().length > 0}
              style={styles.messagePreviewScroll}
            >
              <Text
                style={[
                  styles.messagePreview,
                  !giftMessage.trim() ? styles.messagePreviewPlaceholder : null,
                ]}
              >
                {giftMessage.trim() || "Write a message to send along with this track."}
              </Text>
            </ScrollView>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={handleCopyLink} style={styles.iconButton}>
            <AppIcon name="link-alt" size={20} />
          </Pressable>
          <Pressable onPress={handleShare} style={styles.iconButton}>
            <AppIcon name="share" size={20} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#FEFEFE",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  infoDock: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    marginBottom: -12,
    alignItems: "center",
  },
  scene: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  messageDock: {
    width: "100%",
    maxWidth: 320,
    marginTop: 33,
  },
  messageCard: {
    minHeight: 92,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.12)",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    color: "#111111",
  },
  messagePreviewScroll: {
    maxHeight: 72,
  },
  messagePreview: {
    fontSize: 15,
    lineHeight: 21,
  },
  messagePreviewPlaceholder: {
    color: "rgba(17,17,17,0.42)",
  },
  discStage: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 11,
  },
  discWrap: {},
  sleeveStage: {
    overflow: "hidden",
    backgroundColor: "#F6F6F6",
    borderWidth: 1,
    borderColor: "rgba(17,17,17,0.08)",
    zIndex: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  sleeveArt: {
    position: "absolute",
    top: -1,
    right: -1,
    bottom: -1,
    left: -1,
  },
  sleeveFallback: {
    width: "100%",
    height: "100%",
  },
  plasticReveal: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  plasticWrap: {
    width: "100%",
    height: "100%",
    opacity: 0.9,
  },
  actionRow: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 16,
    marginTop: 40,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#111111",
    justifyContent: "center",
    alignItems: "center",
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
});
