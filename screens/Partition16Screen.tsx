import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { AlbumStack } from "../data/albumStacks";
import {
  getPreviewPressableHeight,
  STACKS_PER_ROW,
  type AlbumWorldLayout,
} from "../lib/albumWorldLayout";
import AlbumStackPreviewOnOverviewScreen from "../components/AlbumStackPreviewOnOverviewScreen";

type StackFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Partition16ScreenProps = {
  layout: AlbumWorldLayout;
  section: AlbumStack[];
  progress: SharedValue<number>;
  isActive: boolean;
  onPressStack: (stackIndex: number) => void;
};

const FOCUSED_COLUMNS = 4;
const FOCUSED_ROWS = 4;
const FOCUSED_SECTION_SIDE_PADDING = 8;
const FOCUSED_SECTION_VERTICAL_PADDING = 16;
const FOCUSED_SECTION_UPWARD_SHIFT_RATIO = -0.04;
const FOCUSED_STACK_GAP_X = 28;
const FOCUSED_STACK_GAP_Y = 56;
const FOCUSED_SECTION_PADDING = 2;

function getDefaultStackFrame(layout: AlbumWorldLayout, stackIndex: number): StackFrame {
  const row = Math.floor(stackIndex / STACKS_PER_ROW);
  const col = stackIndex % STACKS_PER_ROW;
  const previewHeight = getPreviewPressableHeight(layout.previewSize);
  return {
    left: layout.sectionInnerPadding + col * (layout.previewSize + layout.stackGapX),
    top: layout.sectionInnerPadding + row * (layout.rowHeight + layout.internalRowGapY),
    width: layout.previewSize,
    height: previewHeight,
  };
}

function getFocusedStackMetrics(layout: AlbumWorldLayout) {
  const width = layout.viewportWidth - FOCUSED_SECTION_SIDE_PADDING * 2;
  const height = layout.viewportHeight - FOCUSED_SECTION_VERTICAL_PADDING * 2;
  const usableWidth = width - FOCUSED_SECTION_PADDING * 2 - FOCUSED_STACK_GAP_X * (FOCUSED_COLUMNS - 1);
  const usableHeight = height - FOCUSED_SECTION_PADDING * 2 - FOCUSED_STACK_GAP_Y * (FOCUSED_ROWS - 1);
  const widthBound = usableWidth / FOCUSED_COLUMNS;
  const heightBound = usableHeight / FOCUSED_ROWS;

  let size = Math.floor(Math.min(widthBound, heightBound));
  while (size > layout.previewSize && getPreviewPressableHeight(size) * FOCUSED_ROWS > usableHeight) {
    size -= 1;
  }

  const previewHeight = getPreviewPressableHeight(size);
  const contentWidth = size * FOCUSED_COLUMNS + FOCUSED_STACK_GAP_X * (FOCUSED_COLUMNS - 1);
  const contentHeight = previewHeight * FOCUSED_ROWS + FOCUSED_STACK_GAP_Y * (FOCUSED_ROWS - 1);

  return {
    previewSize: size,
    previewHeight,
    leftInset: FOCUSED_SECTION_PADDING + Math.max(0, (usableWidth - contentWidth) / 2),
    topInset: FOCUSED_SECTION_PADDING + Math.max(0, (usableHeight - contentHeight) / 2),
  };
}

function getFocusedStackFrame(layout: AlbumWorldLayout, stackIndex: number): StackFrame {
  const metrics = getFocusedStackMetrics(layout);
  const row = Math.floor(stackIndex / FOCUSED_COLUMNS);
  const col = stackIndex % FOCUSED_COLUMNS;
  return {
    left: metrics.leftInset + col * (metrics.previewSize + FOCUSED_STACK_GAP_X),
    top: metrics.topInset + row * (metrics.previewHeight + FOCUSED_STACK_GAP_Y),
    width: metrics.previewSize,
    height: metrics.previewHeight,
  };
}

function PartitionStackPreview({
  layout,
  stack,
  stackIndex,
  progress,
  isActive,
  onPress,
}: {
  layout: AlbumWorldLayout;
  stack: AlbumStack;
  stackIndex: number;
  progress: SharedValue<number>;
  isActive: boolean;
  onPress: () => void;
}) {
  const baseFrame = useMemo(() => getDefaultStackFrame(layout, stackIndex), [layout, stackIndex]);
  const focusedFrame = useMemo(() => getFocusedStackFrame(layout, stackIndex), [layout, stackIndex]);

  const animatedStyle = useAnimatedStyle(() => {
    const activeProgress = isActive ? progress.value : 0;
    return {
      position: "absolute",
      left: interpolate(activeProgress, [0, 1], [baseFrame.left, focusedFrame.left]),
      top: interpolate(activeProgress, [0, 1], [baseFrame.top, focusedFrame.top]),
      width: interpolate(activeProgress, [0, 1], [baseFrame.width, focusedFrame.width]),
      height: interpolate(activeProgress, [0, 1], [baseFrame.height, focusedFrame.height]),
      zIndex: isActive ? 20 : 1,
    };
  });

  const previewScaleStyle = useAnimatedStyle(() => {
    const activeProgress = isActive ? progress.value : 0;
    const focusedScale = focusedFrame.width / Math.max(1, baseFrame.width);
    return {
      transform: [
        {
          scale: interpolate(activeProgress, [0, 1], [1, focusedScale]),
        },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable disabled={!isActive} onPress={onPress} style={styles.stackPressable}>
        <Animated.View style={previewScaleStyle}>
          <AlbumStackPreviewOnOverviewScreen stack={stack} size={baseFrame.width} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function Partition16Screen({
  layout,
  section,
  progress,
  isActive,
  onPressStack,
}: Partition16ScreenProps) {
  return (
    <>
      {section.map((stack, stackIndex) => (
        <PartitionStackPreview
          key={stack.id}
          layout={layout}
          stack={stack}
          stackIndex={stackIndex}
          progress={progress}
          isActive={isActive}
          onPress={() => onPressStack(stackIndex)}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  stackPressable: {
    alignItems: "center",
    justifyContent: "flex-end",
    width: "100%",
    height: "100%",
  },
});
