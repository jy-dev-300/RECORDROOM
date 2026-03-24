import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type SpotifyEmbedBridgeProps = {
  spotifyUri?: string | null;
  shouldPlay: boolean;
  debugVisible?: boolean;
};

function buildInjectedCommand(command: string, value?: string) {
  const serializedValue =
    typeof value === "string" ? JSON.stringify(value) : "undefined";
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
  shouldPlay,
  debugVisible = false,
}: SpotifyEmbedBridgeProps) {
  const webViewRef = useRef<WebView>(null);

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
    if (!spotifyUri) {
      return;
    }

    webViewRef.current?.injectJavaScript(buildInjectedCommand("loadUri", spotifyUri));
  }, [spotifyUri]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      buildInjectedCommand(shouldPlay ? "play" : "pause")
    );
  }, [shouldPlay]);

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
