import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type RenderItemInfo<T> = {
  item: T;
  index: number;
  isActive: boolean;
};

type VerticalDirection = "up" | "down";

type HorizontalOrbitCarouselRowProps<T> = {
  data: T[];
  renderItem: (info: RenderItemInfo<T>) => React.ReactNode;
  onIndexChange?: (index: number) => void;
  onActivePress?: (item: T, index: number) => void;
  initialIndex?: number;
  width?: number;
  itemWidth?: number;
  itemHeight?: number;
  itemSpacing?: number;
  visibleSideCount?: number;
  sideScale?: number;
  sideOpacity?: number;
  style?: ViewStyle;
  disabled?: boolean;
  verticalDirection?: VerticalDirection;
  verticalCurve?: number;
  gestureActivationDistance?: number;
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

export default function HorizontalOrbitCarouselRow<T>({
  data,
  renderItem,
  onIndexChange,
  onActivePress,
  initialIndex = 0,
  width = Math.min(920, SCREEN_WIDTH),
  itemWidth = 178,
  itemHeight = 118,
  itemSpacing = 128,
  visibleSideCount = 3,
  sideScale = 0.72,
  sideOpacity = 0.32,
  style,
  disabled = false,
  verticalDirection = "up",
  verticalCurve = 48,
  gestureActivationDistance = 6,
}: HorizontalOrbitCarouselRowProps<T>) {
  const count = data.length;
  const position = useRef(new Animated.Value(initialIndex)).current;
  const positionRef = useRef(initialIndex);
  const dragStartRef = useRef(initialIndex);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const id = position.addListener(({ value }) => {
      positionRef.current = value;
      forceRender((current) => current + 1);
    });
    return () => {
      position.removeListener(id);
    };
  }, [position]);

  const activeIndex = count > 0 ? wrapIndex(Math.round(positionRef.current), count) : 0;

  useEffect(() => {
    if (count > 0) {
      onIndexChange?.(activeIndex);
    }
  }, [activeIndex, count, onIndexChange]);

  useEffect(() => {
    position.stopAnimation();
    position.setValue(initialIndex);
    positionRef.current = initialIndex;
    dragStartRef.current = initialIndex;
  }, [initialIndex, position]);

  const snapToRaw = (rawIndex: number) => {
    Animated.spring(position, {
      toValue: rawIndex,
      useNativeDriver: true,
      tension: 88,
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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          if (disabled || count <= 1) return false;
          return (
            Math.abs(gesture.dx) > gestureActivationDistance &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy)
          );
        },
        onPanResponderGrant: () => {
          position.stopAnimation((value) => {
            positionRef.current = value;
            dragStartRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const deltaItems = -gesture.dx / itemSpacing;
          position.setValue(dragStartRef.current + deltaItems);
        },
        onPanResponderRelease: (_, gesture) => {
          const deltaItems = -gesture.dx / itemSpacing;
          const velocityContribution = -gesture.vx * 0.22;
          const projected = dragStartRef.current + deltaItems + velocityContribution;
          snapToRaw(Math.round(projected));
        },
        onPanResponderTerminate: () => {
          snapToRaw(Math.round(positionRef.current));
        },
      }),
    [count, disabled, gestureActivationDistance, itemSpacing, position]
  );

  if (count === 0) return null;

  const centerX = width / 2;
  const maxAngle = Math.PI / 2;
  const angleStep = maxAngle / Math.max(visibleSideCount, 1);
  const verticalSign = verticalDirection === "up" ? -1 : 1;
  const containerHeight = itemHeight + verticalCurve;
  const itemTop = verticalDirection === "up" ? verticalCurve : 0;

  return (
    <View style={[styles.container, { width, height: containerHeight }, style]} {...(disabled ? {} : panResponder.panHandlers)}>
      {data.map((item, index) => {
        const diff = circularDistance(index, positionRef.current, count);
        const absDiff = Math.abs(diff);

        if (absDiff > visibleSideCount + 1.2) return null;

        const clampedDiff = clamp(diff, -(visibleSideCount + 1), visibleSideCount + 1);
        const angle = clampedDiff * angleStep;
        const arcX = Math.sin(angle) * itemSpacing * visibleSideCount * 0.94;
        const depth = Math.cos(angle);
        const normalizedDepth = clamp(depth, 0, 1);
        const scale = sideScale + (1 - sideScale) * normalizedDepth;
        const opacity = sideOpacity + (1 - sideOpacity) * normalizedDepth;
        const zIndex = Math.round(normalizedDepth * 1000);
        const translateX = arcX;
        const translateY = verticalSign * (1 - normalizedDepth) * verticalCurve;
        const isActive = wrapIndex(Math.round(positionRef.current), count) === index;

        return (
          <Animated.View
            key={index}
            pointerEvents="box-none"
            style={[
              styles.itemSlot,
              {
                width: itemWidth,
                height: itemHeight,
                top: itemTop,
                left: centerX - itemWidth / 2,
                zIndex,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
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
    position: "relative",
    overflow: "visible",
    justifyContent: "center",
  },
  itemSlot: {
    position: "absolute",
  },
  pressable: {
    flex: 1,
  },
});
