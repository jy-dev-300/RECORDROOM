import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ScreenFlowControl from "./services/ScreenFlowControl";

export default function App() {
  const TextComponent = Text as typeof Text & { defaultProps?: { style?: unknown } };
  const TextInputComponent = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };
  const [fontsLoaded] = useFonts({
    Eurostile: require("./assets/fonts/Eurostile.otf"),
    EurostileBold: require("./assets/fonts/Eurostile_Bold.otf"),
  });

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }

    TextComponent.defaultProps = {
      ...TextComponent.defaultProps,
      style: styles.defaultText,
    };
    TextInputComponent.defaultProps = {
      ...TextInputComponent.defaultProps,
      style: styles.defaultText,
    };
  }, [TextComponent, TextInputComponent, fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <View style={styles.safeArea}>
          <StatusBar style="dark" />
          <ScreenFlowControl />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#FEFEFE",
  },
  defaultText: {
    fontFamily: "Eurostile",
  },
});


