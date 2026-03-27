import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type SpotifyEmbedBridgeProps = {
  spotifyUri?: string | null;
  loadIdentity?: string | null;
  playbackCommand?: {
    id: number;
    type: "play" | "pause" | "resume";
  } | null;
  debugVisible?: boolean;
  seekToSeconds?: number | null;
  onPlaybackUpdate?: (payload: {
    durationSeconds: number;
    positionSeconds: number;
    isPaused: boolean;
  }) => void;
};

function buildInjectedCommand(command: string, value?: string | number) {
  const serializedValue =
    typeof value === "string"
      ? JSON.stringify(value)
      : typeof value === "number"
        ? String(value)
        : "undefined";
  return `
    (function() {
      if (window.spotifyBridge && typeof window.spotifyBridge.${command} === "function") {
        window.spotifyBridge.${command}(${serializedValue});
      }
    })();
    true;
  `;
}

export default function SpotifyEmbedBridge({
  spotifyUri,
  loadIdentity,
  playbackCommand,
  debugVisible = false,
  seekToSeconds,
  onPlaybackUpdate,
}: SpotifyEmbedBridgeProps) {
  const webViewRef = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);

  const html = useMemo(
    () => `<!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: transparent;
            }
            #embed-iframe {
              width: 100%;
              height: 100%;
              opacity: 1;
            }
          </style>
        </head>
        <body>
          <div id="embed-iframe"></div>
          <script src="https://open.spotify.com/embed/iframe-api/v1" async></script>
          <script>
            window.spotifyController = null;
            window.pendingUri = null;
            window.spotifyBridge = {
              loadUri: function(uri) {
                window.pendingUri = uri;
                if (window.spotifyController) {
                  window.spotifyController.loadUri(uri);
                }
              },
              play: function() {
                window.spotifyController && window.spotifyController.play();
              },
              pause: function() {
                window.spotifyController && window.spotifyController.pause();
              },
              resume: function() {
                window.spotifyController && window.spotifyController.resume();
              },
              togglePlay: function() {
                window.spotifyController && window.spotifyController.togglePlay();
              },
              seek: function(seconds) {
                window.spotifyController && window.spotifyController.seek(seconds);
              }
            };

            window.onSpotifyIframeApiReady = function(IFrameAPI) {
              var element = document.getElementById("embed-iframe");
              IFrameAPI.createController(
                element,
                {
                  uri: "spotify:track:11dFghVXANMlKmJXsNCbNl",
                  width: "100%",
                  height: "80"
                },
                function(EmbedController) {
                  window.spotifyController = EmbedController;
                  window.spotifyController.addListener("playback_update", function(event) {
                    if (!window.ReactNativeWebView || !event || !event.data) {
                      return;
                    }

                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: "playback_update",
                      payload: {
                        durationMs: Number(event.data.duration || 0),
                        positionMs: Number(event.data.position || 0),
                        isPaused: Boolean(event.data.isPaused),
                      }
                    }));
                  });
                  if (window.pendingUri) {
                    window.spotifyController.loadUri(window.pendingUri);
                  }
                }
              );
            };
          </script>
        </body>
      </html>`,
    []
  );

  useEffect(() => {
    if (!spotifyUri || !bridgeReady) {
      return;
    }

    webViewRef.current?.injectJavaScript(buildInjectedCommand("loadUri", spotifyUri));
  }, [bridgeReady, loadIdentity, spotifyUri]);

  useEffect(() => {
    if (!playbackCommand) {
      return;
    }

    webViewRef.current?.injectJavaScript(
      buildInjectedCommand(playbackCommand.type)
    );
  }, [playbackCommand]);

  useEffect(() => {
    if (typeof seekToSeconds !== "number") {
      return;
    }

    webViewRef.current?.injectJavaScript(
      buildInjectedCommand("seek", seekToSeconds)
    );
  }, [seekToSeconds]);

  return (
    <View
      pointerEvents={debugVisible ? "auto" : "none"}
      style={[styles.hiddenWrap, debugVisible ? styles.debugWrap : null]}
    >
      <WebView
        ref={webViewRef}
        allowsInlineMediaPlayback
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onLoadStart={() => {
          setBridgeReady(false);
        }}
        onLoadEnd={() => {
          setBridgeReady(true);
        }}
        onMessage={(event) => {
          try {
            const parsed = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              payload?: {
                durationMs?: number;
                positionMs?: number;
                isPaused?: boolean;
              };
            };
            if (parsed.type === "playback_update" && parsed.payload) {
              onPlaybackUpdate?.({
                durationSeconds: (parsed.payload.durationMs ?? 0) / 1000,
                positionSeconds: (parsed.payload.positionMs ?? 0) / 1000,
                isPaused: parsed.payload.isPaused ?? true,
              });
            }
          } catch {
            // Ignore malformed bridge messages.
          }
        }}
        originWhitelist={["*"]}
        source={{ html }}
        style={[styles.hiddenWebView, debugVisible ? styles.debugWebView : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  debugWrap: {
    width: "100%",
    height: 80,
    opacity: 1,
    top: 88,
    left: 0,
    right: 0,
    zIndex: 2000,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    backgroundColor: "transparent",
  },
  debugWebView: {
    width: "100%",
    height: 80,
  },
});
