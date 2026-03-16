import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ScreenFlowControl from "./services/ScreenFlowControl";

export default function App() {
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
});


