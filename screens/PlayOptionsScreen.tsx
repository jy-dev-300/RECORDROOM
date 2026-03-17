import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  NAV_BUTTON_SIZE,
  NAV_ICON_SIZE,
  NAV_LEFT_INSET,
  NAV_Z_INDEX,
} from "../lib/navigationChrome";
import type { StackProject } from "./SingleTrackStackScreen";
import { fetchSpotifyTrackMatch, type SpotifyTrackMatch } from "../services/spotifyTrackPreviewService";
import { WebView } from "react-native-webview";

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
  const activeProject = projects[initialProjectIndex] ?? null;
  const [match, setMatch] = useState<SpotifyTrackMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadMatch = async () => {
      if (!activeProject) {
        setMatch(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const nextMatch = await fetchSpotifyTrackMatch({
          title: activeProject.title,
          artistName: activeProject.artistName,
          releaseYear: activeProject.releaseYear,
        });

        if (!cancelled) {
          setMatch(nextMatch);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setErrorMessage(error instanceof Error ? error.message : "Unable to load Spotify preview.");
        }
      }
    };

    void loadMatch();

    return () => {
      cancelled = true;
    };
  }, [activeProject]);

  const playerHtml = useMemo(() => {
    if (!match) {
      return "";
    }

    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #fefefe;
        overflow: hidden;
      }
      #embed-root {
        width: 100%;
        height: 100%;
      }
      iframe {
        border: 0;
      }
    </style>
  </head>
  <body>
    <div id="embed-root"></div>
    <script src="https://open.spotify.com/embed/iframe-api/v1" async></script>
    <script>
      window.onSpotifyIframeApiReady = function(IFrameAPI) {
        var element = document.getElementById('embed-root');
        var options = {
          width: '100%',
          height: 152,
          uri: ${JSON.stringify(match.uri)},
        };
        IFrameAPI.createController(element, options, function(EmbedController) {
          window.spotifyEmbedController = EmbedController;
          try {
            EmbedController.play();
          } catch (error) {}
        });
      };
    </script>
  </body>
</html>`;
  }, [match]);

  return (
    <View style={styles.page}>
      <Pressable hitSlop={20} onPress={onBack} style={[styles.backButton, { top: navTop }]}>
        <Text style={styles.backArrow}>{"\u2190"}</Text>
      </Pressable>
      <View style={styles.content}>
        <View style={styles.infoBlock}>
          <Text numberOfLines={1} style={styles.trackTitle}>
            {activeProject?.title ?? "Track"}
          </Text>
          {activeProject?.artistName ? (
            <Text numberOfLines={1} style={styles.trackMeta}>
              <Text style={styles.metaLabel}>by </Text>
              {activeProject.artistName}
            </Text>
          ) : null}
        </View>
        <View style={styles.playerCard}>
          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color="#111111" />
              <Text style={styles.stateText}>Loading Spotify preview…</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>Spotify preview unavailable</Text>
              <Text style={styles.stateText}>{errorMessage}</Text>
            </View>
          ) : match ? (
            <WebView
              originWhitelist={["*"]}
              source={{ html: playerHtml, baseUrl: "https://open.spotify.com" }}
              javaScriptEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              scrollEnabled={false}
              style={styles.webview}
            />
          ) : (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>No Spotify match found</Text>
              <Text style={styles.stateText}>
                This track could not be matched cleanly on Spotify yet.
              </Text>
            </View>
          )}
        </View>
        {match?.externalUrl ? (
          <Pressable onPress={() => void Linking.openURL(match.externalUrl)} style={styles.spotifyButton}>
            <Text style={styles.spotifyButtonText}>Open In Spotify</Text>
          </Pressable>
        ) : null}
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
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 110,
    paddingBottom: 40,
  },
  infoBlock: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  trackTitle: {
    color: "#111111",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: "100%",
  },
  trackMeta: {
    marginTop: 4,
    color: "rgba(17,17,17,0.72)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  metaLabel: {
    fontStyle: "italic",
  },
  playerCard: {
    width: "100%",
    maxWidth: 320,
    height: 152,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F3F3F3",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  stateTitle: {
    color: "#111111",
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  stateText: {
    color: "rgba(17,17,17,0.68)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  spotifyButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#111111",
  },
  spotifyButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});

