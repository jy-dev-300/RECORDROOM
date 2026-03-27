import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import AppIcon from "./AppIcon";

type MenuToggleButtonProps = {
  open: boolean;
  onPress: PressableProps["onPress"];
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function MenuToggleButton({
  open,
  onPress,
  size = 24,
  style,
}: MenuToggleButtonProps) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const hamburgerStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "90deg"],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.82],
        }),
      },
    ],
  };

  const crossStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["-90deg", "0deg"],
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.82, 1],
        }),
      },
    ],
  };

  return (
    <Pressable hitSlop={20} onPress={onPress} style={style}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.iconLayer, hamburgerStyle]}>
          <AppIcon name="hamburger" size={size} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, crossStyle]}>
          <AppIcon name="cross" size={size - 1} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
