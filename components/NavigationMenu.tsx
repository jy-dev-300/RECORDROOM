import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { NAV_Z_INDEX } from "../lib/navigationChrome";

type NavigationMenuItem = {
  key: string;
  label: string;
  onPress: () => void;
};

type NavigationMenuProps = {
  open: boolean;
  navTop: number;
  onClose: () => void;
  animatedStyle?: StyleProp<ViewStyle>;
  accountLabel?: string;
  items: NavigationMenuItem[];
};

export default function NavigationMenu({
  open,
  navTop,
  onClose,
  animatedStyle,
  accountLabel,
  items,
}: NavigationMenuProps) {
  return (
    <>
      {open ? <Pressable style={styles.menuBackdrop} onPress={onClose} /> : null}
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[styles.menuPanel, animatedStyle]}>
        <View style={[styles.menuPanelInner, { paddingTop: navTop }]}>
          <View style={styles.menuPanelHeader} />
          {accountLabel ? (
            <View style={styles.menuHeader}>
              <Text numberOfLines={1} style={styles.menuHeaderText}>
                {accountLabel}
              </Text>
            </View>
          ) : null}
          {items.map((item) => (
            <Pressable key={item.key} onPress={item.onPress} style={styles.menuItem}>
              <Text style={styles.menuItemText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  menuPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "50%",
    zIndex: NAV_Z_INDEX + 2,
    backgroundColor: "rgba(182, 222, 250, 0.95)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(17,17,17,0.08)",
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: NAV_Z_INDEX + 1,
    backgroundColor: "transparent",
  },
  menuPanelInner: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  menuPanelHeader: {
    alignItems: "flex-end",
    marginBottom: 38,
  },
  menuHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  menuHeaderText: {
    color: "rgba(17,17,17,0.56)",
    fontFamily: "Eurostile",
    fontSize: 14,
    lineHeight: 14,
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemText: {
    color: "#111111",
    fontFamily: "Eurostile",
    fontSize: 22,
    lineHeight: 22,
  },
});
