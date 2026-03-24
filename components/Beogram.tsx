import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import { Animated, Image, StyleSheet, View } from "react-native";

const BEOGRAM_SOURCE = require("../assets/silverturntable_noarm.png");
const BEOGRAM_TONEARM_SOURCE = require("../assets/silver_turntable_arm.png");
const VINYL_DISC_SOURCE = require("../assets/vinyl-record-isolated.png");

const DISC_SIZE_RATIO = 0.44;
const DISC_LEFT_RATIO = 0.073;
const DISC_TOP_RATIO = 0.29;

const TONEARM_PLAY_POSE = {
  left: 29,
  top: -11,
  scale: 0.58,
  rotationDeg: -44,
};

const TONEARM_PAUSE_POSE = {
  left: 38,
  top: -5,
  scale: 0.58,
  rotationDeg: -55,
};

type BeogramProps = {
  size?: number;
  artworkSource?: ImageSourcePropType | null;
  isPlaying?: boolean;
  discAnimatedStyle?: StyleProp<ViewStyle>;
};

export default function Beogram({
  size = 320,
  artworkSource = null,
  isPlaying = false,
  discAnimatedStyle,
}: BeogramProps) {
  const tonearmPose = isPlaying ? TONEARM_PLAY_POSE : TONEARM_PAUSE_POSE;

  return (
    <View style={[styles.hero, { width: size, height: size }]}>
      <Image source={BEOGRAM_SOURCE} style={styles.playerImage} resizeMode="contain" />
      {artworkSource ? (
        <Animated.View
          style={[
            styles.discWrap,
            {
              left: `${DISC_LEFT_RATIO * 100}%`,
              top: `${DISC_TOP_RATIO * 100}%`,
              width: `${DISC_SIZE_RATIO * 100}%`,
            },
            discAnimatedStyle,
          ]}
        >
          <Image source={VINYL_DISC_SOURCE} style={styles.vinylDiscImage} resizeMode="contain" />
          <View pointerEvents="none" style={styles.discLabelWrap}>
            <Image source={artworkSource} style={styles.discLabelArtwork} resizeMode="contain" />
            <View style={styles.discCenterHole} />
          </View>
        </Animated.View>
      ) : null}
      <View pointerEvents="none" style={styles.playerTonearmOverlayWrap}>
        <Image
          source={BEOGRAM_TONEARM_SOURCE}
          style={[
            styles.playerTonearmOverlay,
            {
              left: tonearmPose.left,
              top: tonearmPose.top,
              transform: [{ rotate: `${tonearmPose.rotationDeg}deg` }, { scale: tonearmPose.scale }],
            },
          ]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: -28,
    marginBottom: 6,
    position: "relative",
  },
  playerImage: {
    width: "100%",
    height: "100%",
  },
  playerTonearmOverlayWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  playerTonearmOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  discWrap: {
    position: "absolute",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  vinylDiscImage: {
    width: "100%",
    height: "100%",
  },
  discLabelWrap: {
    position: "absolute",
    width: "58%",
    height: "58%",
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  discLabelArtwork: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  discCenterHole: {
    position: "absolute",
    width: "24%",
    height: "24%",
    borderRadius: 999,
    backgroundColor: "transparent",
  },
});
