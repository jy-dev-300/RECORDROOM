import { Pressable, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { StackProject } from "./SingleTrackStackScreen";
import HorizontalOrbitCarouselRow from "../components/HorizontalOrbitCarouselRow";

type GiftCreationPageProps = {
  projects: StackProject[];
};

type GiftPlaceholderItem = {
  id: string;
  color: string;
};

const GIFT_ROW_GAP = 3;
const GIFT_ROW_VERTICAL_CURVE = 58;

function buildPlaceholderItems(projects: StackProject[], rowIndex: number): GiftPlaceholderItem[] {
  const palette =
    projects.length > 0
      ? projects.map((project, index) => ({
          id: `${project.id}-gift-${rowIndex}-${index}`,
          color: project.color,
        }))
      : [
          { id: `gift-${rowIndex}-0`, color: "#D94F3D" },
          { id: `gift-${rowIndex}-1`, color: "#E7A93C" },
          { id: `gift-${rowIndex}-2`, color: "#5E8B7E" },
          { id: `gift-${rowIndex}-3`, color: "#2D5B87" },
          { id: `gift-${rowIndex}-4`, color: "#A86B4C" },
        ];

  return palette.map((item, index) => ({
    ...item,
    id: `${item.id}-${index}`,
  }));
}

export default function GiftCreationPage({ projects }: GiftCreationPageProps) {
  const rows = [0, 1, 2];
  const giftLink = "https://recordroom.app/gift";
  const { height } = useWindowDimensions();
  const upwardShift = height * 0.08;

  const handleCopyLink = async () => {
    try {
      await Share.share({
        message: giftLink,
      });
    } catch {
      // Ignore dismissed or failed share attempts for now.
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: giftLink,
      });
    } catch {
      // Ignore dismissed or failed share attempts for now.
    }
  };

  return (
    <View style={styles.page}>
      <View style={[styles.content, { transform: [{ translateY: -upwardShift }] }]}>
        <View style={styles.rows}>
          {rows.map((rowIndex) => {
            const items = buildPlaceholderItems(projects, rowIndex);
            return (
              <HorizontalOrbitCarouselRow
              key={`gift-row-${rowIndex}`}
              data={items}
              initialIndex={rowIndex % Math.max(items.length, 1)}
              verticalDirection="up"
              verticalCurve={GIFT_ROW_VERTICAL_CURVE}
              itemWidth={184}
              itemHeight={118}
              itemSpacing={126}
                visibleSideCount={3}
                sideScale={0.4}
                sideOpacity={0.08}
                style={styles.row}
                renderItem={({ item }) => <View style={[styles.placeholderCard, { backgroundColor: item.color }]} />}
              />
            );
          })}
        </View>
      <View style={styles.actionRow}>
        <Pressable onPress={handleCopyLink} style={styles.iconButton}>
          <Text style={styles.iconGlyph}>{"\uD83D\uDD17"}</Text>
        </Pressable>
        <Pressable onPress={handleShare} style={styles.iconButton}>
          <Text style={styles.iconGlyph}>{"\u2934"}</Text>
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
    justifyContent: "flex-start",
  },
  content: {
    flex: 1,
  },
  rows: {
    width: "100%",
    gap: GIFT_ROW_GAP,
    paddingTop: 116,
    paddingBottom: 0,
  },
  row: {
    alignSelf: "center",
  },
  placeholderCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  actionRow: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 16,
    marginTop: GIFT_ROW_GAP + GIFT_ROW_VERTICAL_CURVE,
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
  iconGlyph: {
    color: "#111111",
    fontSize: 21,
    lineHeight: 24,
  },
});
