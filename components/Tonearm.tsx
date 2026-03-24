import { Animated, Image, StyleSheet, type ImageStyle, type StyleProp, View, type ViewStyle } from "react-native";

const TONEARM_BOTTOM_SOURCE = require("../assets/tonearm_bottom.png");
const TONEARM_TOP_SOURCE = require("../assets/tonearmtop.png");
const TONEARM_CONTAINER_ASPECT_RATIO = 1.36;
const AnimatedImage = Animated.createAnimatedComponent(Image);

type TonearmProps = {
  height?: number;
  style?: StyleProp<ViewStyle>;
  topStyle?: StyleProp<ImageStyle>;
  bottomStyle?: StyleProp<ImageStyle>;
};

export default function Tonearm({
  height = 86,
  style,
  topStyle,
  bottomStyle,
}: TonearmProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          height,
          width: height * TONEARM_CONTAINER_ASPECT_RATIO,
        },
        style,
      ]}
    >
      <AnimatedImage source={TONEARM_BOTTOM_SOURCE} resizeMode="contain" style={[styles.bottom, bottomStyle]} />
      <AnimatedImage source={TONEARM_TOP_SOURCE} resizeMode="contain" style={[styles.top, topStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "visible",
  },
  bottom: {
    position: "absolute",
    width: "58%",
    height: "58%",
    right: 0,
    top: "26%",
  },
  top: {
    position: "absolute",
    width: "100%",
    height: "100%",
    right: "-2%",
    top: "-6%",
  },
});
