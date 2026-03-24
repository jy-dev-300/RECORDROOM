import { useEffect, useMemo, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

type MusicPlayControlBarProps = {
  totalSeconds?: number;
  currentSeconds?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeekChange?: (seconds: number) => void;
  showPlayButton?: boolean;
};

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function MusicPlayControlBar({
  totalSeconds = 60,
  currentSeconds,
  isPlaying,
  onTogglePlay,
  onSeekChange,
  showPlayButton = true,
}: MusicPlayControlBarProps) {
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalProgressSeconds, setInternalProgressSeconds] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const resolvedIsPlaying = isPlaying ?? internalIsPlaying;
  const progressSeconds = currentSeconds ?? internalProgressSeconds;

  useEffect(() => {
    if (typeof currentSeconds === "number" || typeof isPlaying === "boolean") {
      return;
    }

    if (!internalIsPlaying) return;

    const interval = setInterval(() => {
      setInternalProgressSeconds((current) => {
        const next = current + 0.25;
        if (next >= totalSeconds) {
          setInternalIsPlaying(false);
          return totalSeconds;
        }
        return next;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [currentSeconds, internalIsPlaying, isPlaying, totalSeconds]);

  const progressRatio = totalSeconds <= 0 ? 0 : clamp(progressSeconds / totalSeconds, 0, 1);
  const elapsedLabel = useMemo(() => formatTime(progressSeconds), [progressSeconds]);
  const totalLabel = useMemo(() => formatTime(totalSeconds), [totalSeconds]);

  const updateProgressFromOffset = (offsetX: number) => {
    if (trackWidth <= 0) return;
    const ratio = clamp(offsetX / trackWidth, 0, 1);
    const nextSeconds = ratio * totalSeconds;
    if (typeof currentSeconds === "number") {
      onSeekChange?.(nextSeconds);
    } else {
      setInternalProgressSeconds(nextSeconds);
      onSeekChange?.(nextSeconds);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          updateProgressFromOffset(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateProgressFromOffset(event.nativeEvent.locationX);
        },
      }),
    [totalSeconds, trackWidth]
  );

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const handleTogglePlay = () => {
    if (progressSeconds >= totalSeconds) {
      if (typeof currentSeconds === "number") {
        onSeekChange?.(0);
      } else {
        setInternalProgressSeconds(0);
      }
    }
    if (typeof isPlaying === "boolean") {
      onTogglePlay?.();
      return;
    }

    setInternalIsPlaying((current) => !current);
    onTogglePlay?.();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.seekArea}>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{elapsedLabel}</Text>
          <View style={styles.timeDivider} />
          <Text style={styles.timeText}>{totalLabel}</Text>
        </View>
        <View onLayout={handleTrackLayout} style={styles.seekTrack} {...panResponder.panHandlers}>
          <View style={styles.seekTrackBase} />
          <View style={[styles.seekFill, { width: `${progressRatio * 100}%` }]} />
          <View style={[styles.seekThumb, { left: `${progressRatio * 100}%` }]} />
        </View>
      </View>

      {showPlayButton ? (
        <View style={styles.buttonRow}>
          <Pressable onPress={handleTogglePlay} style={styles.playButton}>
            <View style={styles.playButtonInner}>
              {resolvedIsPlaying ? (
                <>
                  <View style={[styles.pauseBar, styles.pauseBarLeft]} />
                  <View style={[styles.pauseBar, styles.pauseBarRight]} />
                </>
              ) : (
                <View style={styles.playTriangle} />
              )}
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 286,
    marginTop: 18,
    alignItems: "stretch",
  },
  seekArea: {
    width: "100%",
  },
  timeRow: {
    width: 88,
    marginBottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    color: "rgba(17,17,17,0.72)",
    fontSize: 12,
    fontWeight: "500",
  },
  timeDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(17,17,17,0.22)",
  },
  seekTrack: {
    height: 28,
    justifyContent: "center",
    width: "100%",
  },
  seekTrackBase: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(17,17,17,0.18)",
  },
  seekFill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#111111",
  },
  seekThumb: {
    position: "absolute",
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#111111",
  },
  buttonRow: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  playButtonInner: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#111111",
  },
  pauseBar: {
    position: "absolute",
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#111111",
  },
  pauseBarLeft: {
    left: 3,
  },
  pauseBarRight: {
    right: 3,
  },
});
