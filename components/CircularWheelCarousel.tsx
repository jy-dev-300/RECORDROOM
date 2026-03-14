import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type RenderItemInfo<T> = {
  item: T;
  index: number;
  isActive: boolean;
};

type HorizontalDirection = "left" | "right";

type CircularWheelCarouselProps<T> = {
  data: T[];
  renderItem: (info: RenderItemInfo<T>) => React.ReactNode;

  /**
   * Called when the centered/front item changes.
   */
  onIndexChange?: (index: number) => void;

  /**
   * Called when user taps the active/front item.
   */
  onActivePress?: (item: T, index: number) => void;

  /**
   * Starting item.
   */
  initialIndex?: number;

  /**
   * Vertical size of the carousel.
   */
  height?: number;

  /**
   * Width of each card wrapper.
   */
  itemWidth?: number | string;

  /**
   * Layout height for each card wrapper.
   */
  itemHeight?: number;

  /**
   * How far apart neighboring items feel.
   */
  itemSpacing?: number;

  /**
   * Number of visible neighbors on each side.
   */
  visibleSideCount?: number;

  /**
   * How much items shrink as they recede.
   */
  sideScale?: number;

  /**
   * How much side items fade.
   */
  sideOpacity?: number;

  /**
   * Optional style for outer container.
   */
  style?: ViewStyle;

  /**
   * Disable swipe / tap interaction.
   */
  disabled?: boolean;

  /**
   * Reverses the vertical arc ordering.
   * Useful when you want a mirrored wheel feel.
   */
  flipVertical?: boolean;

  /**
   * Controls which horizontal side the wheel bows toward.
   * "left"  => side items nudge toward the left
   * "right" => side items nudge toward the right
   */
  horizontalDirection?: HorizontalDirection;

  /**
   * Strength of the horizontal bow / cylinder feel.
   */
  horizontalCurve?: number;
};

function wrapIndex(index: number, size: number) {
  return ((index % size) + size) % size;
}

function circularDistance(target: number, active: number, size: number) {
  let diff = target - active;
  while (diff > size / 2) diff -= size;
  while (diff < -size / 2) diff += size;
  return diff;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function CircularWheelCarousel<T>({
  data,
  renderItem,
  onIndexChange,
  onActivePress,
  initialIndex = 0,
  height = Math.min(520, SCREEN_HEIGHT * 0.62),
  itemWidth = "82%",
  itemHeight = 220,
  itemSpacing = 100,
  visibleSideCount = 3,
  sideScale = 0.72,
  sideOpacity = 0.42,
  style,
  disabled = false,
  flipVertical = false,
  horizontalDirection = "right",
  horizontalCurve = 10,
}: CircularWheelCarouselProps<T>) {
  const count = data.length;
  const position = useRef(new Animated.Value(initialIndex)).current;
  const positionRef = useRef(initialIndex);
  const dragStartRef = useRef(initialIndex);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const id = position.addListener(({ value }) => {
      positionRef.current = value;
      forceRender((v) => v + 1);
    });

    return () => {
      position.removeListener(id);
    };
  }, [position]);

  const activeIndex =
    count > 0 ? wrapIndex(Math.round(positionRef.current), count) : 0;

  useEffect(() => {
    if (count > 0) {
      onIndexChange?.(activeIndex);
    }
  }, [activeIndex, count, onIndexChange]);

  const snapToRaw = (rawIndex: number) => {
    Animated.spring(position, {
      toValue: rawIndex,
      useNativeDriver: true,
      tension: 90,
      friction: 11,
    }).start();
  };

  const snapToIndexShortestPath = (targetIndex: number) => {
    if (count <= 0) return;

    const current = positionRef.current;
    const currentWrapped = wrapIndex(Math.round(current), count);

    let diff = targetIndex - currentWrapped;
    while (diff > count / 2) diff -= count;
    while (diff < -count / 2) diff += count;

    snapToRaw(Math.round(current) + diff);
  };

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (disabled || count <= 1) return false;
        return Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx);
      },

      onPanResponderGrant: () => {
        position.stopAnimation((value) => {
          positionRef.current = value;
          dragStartRef.current = value;
        });
      },

      onPanResponderMove: (_, gesture) => {
        const deltaItems = -gesture.dy / itemSpacing;
        position.setValue(dragStartRef.current + deltaItems);
      },

      onPanResponderRelease: (_, gesture) => {
        const deltaItems = -gesture.dy / itemSpacing;
        const velocityContribution = -gesture.vy * 0.22;
        const projected = dragStartRef.current + deltaItems + velocityContribution;
        const snapped = Math.round(projected);
        snapToRaw(snapped);
      },

      onPanResponderTerminate: () => {
        snapToRaw(Math.round(positionRef.current));
      },
    });
  }, [count, disabled, itemSpacing, position]);

  if (count === 0) return null;

  const centerY = height / 2;
  const maxAngle = Math.PI / 2;
  const angleStep = maxAngle / Math.max(visibleSideCount, 1);
  const horizontalSign = horizontalDirection === "left" ? -1 : 1;

  return (
    <View
      style={[styles.container, { height }, style]}
      {...(disabled ? {} : panResponder.panHandlers)}
    >
      {data.map((item, index) => {
        const diff = circularDistance(index, positionRef.current, count);
        const absDiff = Math.abs(diff);

        if (absDiff > visibleSideCount + 1.2) return null;

        const clampedDiff = clamp(
          diff,
          -(visibleSideCount + 1),
          visibleSideCount + 1
        );
        const angle = clampedDiff * angleStep;

        /**
         * Half-merry-go-round geometry:
         * - y follows a sine curve
         * - depth follows cosine
         * front item => depth = 1
         * side items => depth -> 0
         */
        const arcY = Math.sin(angle) * itemSpacing * visibleSideCount * 0.92;
        const depth = Math.cos(angle);

        /**
         * depth:
         * 1 at center/front
         * 0 near the side limits
         */
        const normalizedDepth = clamp(depth, 0, 1);

        const scale = sideScale + (1 - sideScale) * normalizedDepth;
        const opacity = sideOpacity + (1 - sideOpacity) * normalizedDepth;
        const zIndex = Math.round(normalizedDepth * 1000);

        /**
         * Vertical flip:
         * mirror the arc ordering top/bottom.
         */
        const translateY = flipVertical ? -arcY : arcY;

        /**
         * Horizontal direction:
         * bow the wheel toward either the left or right edge.
         * Front item stays closest to x=0, side items curve outward.
         */
        const translateX =
          horizontalSign * (1 - normalizedDepth) * horizontalCurve;

        const isActive =
          wrapIndex(Math.round(positionRef.current), count) === index;

        return (
          <Animated.View
            key={index}
            pointerEvents="box-none"
            style={[
              styles.itemSlot,
              {
                width: itemWidth as any,
                height: itemHeight,
                top: centerY - itemHeight / 2,
                zIndex,
                opacity,
                transform: [{ translateY }, { translateX }, { scale }],
              },
            ]}
          >
            <Pressable
              style={styles.pressable}
              onPress={() => {
                if (disabled) return;

                if (isActive) {
                  onActivePress?.(item, index);
                } else {
                  snapToIndexShortestPath(index);
                }
              }}
            >
              {renderItem({ item, index, isActive })}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  itemSlot: {
    position: "absolute",
    alignSelf: "center",
  },
  pressable: {
    flex: 1,
  },
});