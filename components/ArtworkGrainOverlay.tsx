import { memo } from "react";
import { StyleSheet, View } from "react-native";

type ArtworkGrainOverlayProps = {
  opacity?: number;
};

type Percent = `${number}%`;

const GRAIN_SPECKS: ReadonlyArray<{
  left: Percent;
  top: Percent;
  size: Percent;
  opacity: number;
}> = [
  { left: "4%", top: "8%", size: "1.8%", opacity: 0.2 },
  { left: "13%", top: "26%", size: "1.4%", opacity: 0.17 },
  { left: "22%", top: "14%", size: "1.2%", opacity: 0.14 },
  { left: "31%", top: "34%", size: "1.6%", opacity: 0.19 },
  { left: "42%", top: "11%", size: "1.4%", opacity: 0.18 },
  { left: "49%", top: "48%", size: "1.3%", opacity: 0.16 },
  { left: "58%", top: "21%", size: "1.5%", opacity: 0.2 },
  { left: "67%", top: "39%", size: "1.1%", opacity: 0.15 },
  { left: "76%", top: "17%", size: "1.7%", opacity: 0.18 },
  { left: "84%", top: "31%", size: "1.4%", opacity: 0.17 },
  { left: "9%", top: "62%", size: "1.5%", opacity: 0.18 },
  { left: "19%", top: "79%", size: "1.2%", opacity: 0.13 },
  { left: "29%", top: "68%", size: "1.7%", opacity: 0.19 },
  { left: "39%", top: "87%", size: "1.4%", opacity: 0.16 },
  { left: "53%", top: "71%", size: "1.3%", opacity: 0.18 },
  { left: "61%", top: "84%", size: "1.5%", opacity: 0.16 },
  { left: "74%", top: "63%", size: "1.2%", opacity: 0.15 },
  { left: "86%", top: "78%", size: "1.6%", opacity: 0.19 },
];

function ArtworkGrainOverlay({ opacity = 1 }: ArtworkGrainOverlayProps) {
  return (
    <View pointerEvents="none" style={[styles.overlay, { opacity }]}>
      <View style={styles.softWash} />
      <View style={styles.shadowWash} />
      {GRAIN_SPECKS.map((speck, index) => (
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

export default memo(ArtworkGrainOverlay);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  softWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(126, 104, 74, 0.035)",
  },
  shadowWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 12, 8, 0.03)",
  },
  speck: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#17120C",
  },
});
