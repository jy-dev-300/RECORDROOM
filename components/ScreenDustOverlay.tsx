import { memo } from "react";
import { StyleSheet, View } from "react-native";

type Percent = `${number}%`;

const SCREEN_DUST_SPECKS: ReadonlyArray<{
  left: Percent;
  top: Percent;
  size: number;
  opacity: number;
}> = [
  { left: "6%", top: "11%", size: 3, opacity: 0.11 },
  { left: "14%", top: "24%", size: 2, opacity: 0.1 },
  { left: "23%", top: "8%", size: 3, opacity: 0.08 },
  { left: "31%", top: "33%", size: 4, opacity: 0.12 },
  { left: "42%", top: "15%", size: 2, opacity: 0.09 },
  { left: "53%", top: "27%", size: 3, opacity: 0.1 },
  { left: "64%", top: "12%", size: 2, opacity: 0.08 },
  { left: "76%", top: "21%", size: 3, opacity: 0.11 },
  { left: "87%", top: "30%", size: 2, opacity: 0.09 },
  { left: "9%", top: "58%", size: 3, opacity: 0.09 },
  { left: "18%", top: "73%", size: 2, opacity: 0.08 },
  { left: "29%", top: "64%", size: 4, opacity: 0.12 },
  { left: "38%", top: "82%", size: 2, opacity: 0.08 },
  { left: "49%", top: "68%", size: 3, opacity: 0.1 },
  { left: "57%", top: "88%", size: 2, opacity: 0.08 },
  { left: "71%", top: "61%", size: 3, opacity: 0.11 },
  { left: "81%", top: "76%", size: 2, opacity: 0.08 },
  { left: "91%", top: "67%", size: 3, opacity: 0.1 },
];

function ScreenDustOverlay() {
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <View style={styles.haze} />
      {SCREEN_DUST_SPECKS.map((speck, index) => (
        <View
          key={index}
          style={[
            styles.speck,
            {
              left: speck.left,
              top: speck.top,
              width: speck.size,
              height: speck.size,
              opacity: speck.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

export default memo(ScreenDustOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  haze: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FBF8F1",
    opacity: 0.032,
  },
  speck: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FBF8F1",
    opacity: 0.85,
  },
});
