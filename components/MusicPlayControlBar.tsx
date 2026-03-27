import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type View as ViewType,
  type LayoutChangeEvent,
} from "react-native";
import AppIcon from "./AppIcon";

type MusicPlayControlBarProps = {
  totalSeconds?: number;
  currentSeconds?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSeekChange?: (seconds: number) => void;
  showPlayButton?: boolean;
  showEmptyTime?: boolean;
  emptyTimeMode?: "both" | "right-only";
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
  showEmptyTime = false,
  emptyTimeMode = "both",
}: MusicPlayControlBarProps) {
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const [internalProgressSeconds, setInternalProgressSeconds] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragProgressSeconds, setDragProgressSeconds] = useState<number | null>(null);
  const progressAnimated = useRef(new Animated.Value(0)).current;
  const isScrubbingRef = useRef(false);
  const seekTrackRef = useRef<ViewType>(null);
  const trackPageXRef = useRef(0);
  const resolvedIsPlaying = isPlaying ?? internalIsPlaying;
  const baseProgressSeconds = currentSeconds ?? internalProgressSeconds;
  const progressSeconds = dragProgressSeconds ?? baseProgressSeconds;

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
  const shouldShowEmptyTime = showEmptyTime;
  const elapsedLabel = useMemo(
    () =>
      shouldShowEmptyTime
        ? emptyTimeMode === "right-only"
          ? "0:00"
          : "--:--"
        : formatTime(progressSeconds),
    [emptyTimeMode, progressSeconds, shouldShowEmptyTime]
  );
  const totalLabel = useMemo(
    () => (shouldShowEmptyTime ? "--:--" : formatTime(totalSeconds)),
    [shouldShowEmptyTime, totalSeconds]
  );

  useEffect(() => {
    if (dragProgressSeconds == null || isScrubbingRef.current) {
      return;
    }

    if (Math.abs(baseProgressSeconds - dragProgressSeconds) <= 0.35) {
      setDragProgressSeconds(null);
    }
  }, [baseProgressSeconds, dragProgressSeconds]);

  useEffect(() => {
    if (isScrubbingRef.current) {
      progressAnimated.setValue(shouldShowEmptyTime ? 0 : progressRatio);
      return;
    }

    progressAnimated.stopAnimation();
    Animated.timing(progressAnimated, {
      toValue: shouldShowEmptyTime ? 0 : progressRatio,
      duration: 45,
      useNativeDriver: false,
    }).start();
  }, [progressAnimated, progressRatio, shouldShowEmptyTime]);

  const animatedFillWidth = progressAnimated.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth],
  });
  const animatedThumbTranslateX = progressAnimated.interpolate({
    inputRange: [0, 1],
    outputRange: [-7, Math.max(-7, trackWidth - 7)],
  });

  const updateProgressFromOffset = (offsetX: number) => {
    if (trackWidth <= 0) return;
    const ratio = clamp(offsetX / trackWidth, 0, 1);
    const nextSeconds = ratio * totalSeconds;
    setDragProgressSeconds(nextSeconds);
    progressAnimated.setValue(ratio);
    if (typeof currentSeconds === "number") {
      onSeekChange?.(nextSeconds);
    } else {
      setInternalProgressSeconds(nextSeconds);
      onSeekChange?.(nextSeconds);
    }
  };

  const syncTrackPageX = () => {
    seekTrackRef.current?.measureInWindow((x) => {
      trackPageXRef.current = x;
    });
  };

  const updateProgressFromPageX = (pageX: number) => {
    updateProgressFromOffset(pageX - trackPageXRef.current);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          isScrubbingRef.current = true;
          syncTrackPageX();
          updateProgressFromPageX(event.nativeEvent.pageX);
        },
        onPanResponderMove: (_, gestureState) => {
          updateProgressFromPageX(gestureState.moveX);
        },
        onPanResponderRelease: () => {
          isScrubbingRef.current = false;
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
        },
      }),
    [totalSeconds, trackWidth]
  );

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
    syncTrackPageX();
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
          {shouldShowEmptyTime ? (
            <Text style={styles.timeText}> | </Text>
          ) : (
            <View style={styles.timeDivider} />
          )}
          <Text style={styles.timeText}>{totalLabel}</Text>
        </View>
        <View
          ref={seekTrackRef}
          onLayout={handleTrackLayout}
          style={styles.seekTrack}
          {...panResponder.panHandlers}
        >
          <View style={styles.seekTrackBase} />
          <Animated.View style={[styles.seekFill, { width: animatedFillWidth }]} />
          <Animated.View
            style={[styles.seekThumb, { transform: [{ translateX: animatedThumbTranslateX }] }]}
          />
        </View>
      </View>

      {showPlayButton ? (
        <View style={styles.buttonRow}>
          <Pressable onPress={handleTogglePlay} style={styles.playButton}>
            <View style={styles.playButtonInner}>
              <AppIcon name={resolvedIsPlaying ? "pause" : "play"} size={20} />
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
    fontFamily: "Eurostile",
    fontSize: 14,
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
    left: 0,
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
});
