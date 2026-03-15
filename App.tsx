import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import ScreenFlowControl from "./services/ScreenFlowControl";
import { handleSpotifyAuthRedirect } from "./services/spotifyAuthService";

export default function App() {
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleSpotifyAuthRedirect(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleSpotifyAuthRedirect(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <ScreenFlowControl />
        </SafeAreaView>
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
});


