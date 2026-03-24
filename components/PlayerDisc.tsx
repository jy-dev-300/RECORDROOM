import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image as ExpoImage, type ImageSource } from "expo-image";
import {
  DISC_LABEL_SIZE_RATIO,
  DISC_VERTICAL_SQUASH_RATIO,
  DISC_VERTICAL_TILT_DEG,
} from "./disc";

const VINYL_DISC_SOURCE = require("../assets/vinyl2.png");

type PlayerDiscProps = {
  size: number;
  artworkSource?: ImageSource | null;
  style?: StyleProp<ViewStyle>;
  spinStyle?: StyleProp<ViewStyle>;
  tiltDeg?: string;
  squashRatio?: number;
};

export default function PlayerDisc({
  size,
  artworkSource,
  style,
  spinStyle,
  tiltDeg = DISC_VERTICAL_TILT_DEG,
  squashRatio = DISC_VERTICAL_SQUASH_RATIO,
}: PlayerDiscProps) {
  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        {
          width: size,
          height: size,
          transform: [
            { perspective: 1600 },
            { rotateX: tiltDeg },
            { scaleY: squashRatio },
          ],
        },
        spinStyle,
      ]}
    >
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit="contain"
        source={VINYL_DISC_SOURCE}
        style={styles.discImage}
        transition={0}
      />
      {artworkSource ? (
        <View
          pointerEvents="none"
          style={[
            styles.labelWrap,
            {
              width: size * DISC_LABEL_SIZE_RATIO,
              height: size * DISC_LABEL_SIZE_RATIO,
              borderRadius: (size * DISC_LABEL_SIZE_RATIO) / 2,
            },
          ]}
        >
          <ExpoImage
            cachePolicy="memory-disk"
            contentFit="cover"
            source={artworkSource}
            style={styles.labelArt}
            transition={0}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  discImage: {
    width: "100%",
    height: "100%",
  },
  labelWrap: {
    position: "absolute",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  labelArt: {
    width: "101.5%",
    height: "101.5%",
  },
});
