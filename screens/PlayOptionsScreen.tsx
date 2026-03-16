import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import {
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_LEFT_INSET,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import type { StackProject } from "./SingleAlbumStackScreen";
import CircularOrbitCarousel from "../components/CircularOrbitCarousel";

type PlayOptionsScreenProps = {
  projects: StackProject[];
  initialProjectIndex: number;
  onBack: () => void;
  navTop: number;
};

export default function PlayOptionsScreen({
  projects,
  initialProjectIndex,
  onBack,
  navTop,
}: PlayOptionsScreenProps) {
  return (
    <View style={styles.page}>
      <Pressable hitSlop={20} onPress={onBack} style={[styles.backButton, { top: navTop }]}>
        <Text style={styles.backArrow}>{"\u2190"}</Text>
      </Pressable>
      <View style={styles.playColumns}>
        <View style={styles.playColumn}>
          <CircularOrbitCarousel
            data={projects}
            initialIndex={initialProjectIndex}
            introFromOffset={2}
            style={styles.playOrbit}
            itemWidth="107.4%"
            itemHeight={206}
            itemSpacing={126}
            visibleSideCount={4}
            sideScale={0.42}
            sideOpacity={0.08}
            horizontalDirection="left"
            horizontalCurve={900}
            renderItem={({ item }) => (
              <View style={styles.playWheelCard}>
                {item.thumbnail || item.media ? (
                  <ExpoImage
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{ uri: item.thumbnail || item.media }}
                    style={styles.playWheelImage}
                    transition={0}
                  />
                ) : null}
              </View>
            )}
          />
        </View>
        <View style={styles.playColumn}>
          <CircularOrbitCarousel
            data={projects}
            initialIndex={initialProjectIndex}
            introFromOffset={2}
            style={styles.playOrbit}
            itemWidth="107.4%"
            itemHeight={206}
            itemSpacing={126}
            visibleSideCount={4}
            sideScale={0.42}
            sideOpacity={0.08}
            horizontalDirection="right"
            horizontalCurve={900}
            renderItem={({ item }) => (
              <View style={styles.playWheelCard}>
                {item.thumbnail || item.media ? (
                  <ExpoImage
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={{ uri: item.thumbnail || item.media }}
                    style={styles.playWheelImage}
                    transition={0}
                  />
                ) : null}
              </View>
            )}
          />
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
  playColumns: {
    flex: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 110,
    paddingBottom: 24,
  },
  playColumn: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#FFFFFF",
    overflow: "visible",
    justifyContent: "center",
  },
  playOrbit: {
    height: "100%",
  },
  playWheelCard: {
    flex: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  playWheelImage: {
    flex: 1,
  },
});

