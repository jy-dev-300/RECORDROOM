import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { TrackStack } from "../data/trackStacks";
import { getPreviewPressableHeight, getPreviewStackOffset } from "../lib/trackWorldLayout";

const PARALLAX_MAX_SHIFT = 48;
const PARALLAX_MAX_ROTATION = 3;
const PARALLAX_MAX_SHIFT_X = 7;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: number) {
  return (seed % 10000) / 10000;
}

export function getPreviewJitter(stackId: string, layerIndex: number, size: number) {
  const seedBase = hashString(`${stackId}-${layerIndex}`);
  const x = (randomFromSeed(seedBase) - 0.5) * size * 0.12;
  const y = (randomFromSeed(seedBase * 3) - 0.5) * size * 0.05;
  const rotate = (randomFromSeed(seedBase * 7) - 0.5) * 6;
  return { x, y, rotate };
}

export function getPreviewParallaxRotation(stackLeft: number, viewportWidth: number) {
  const viewportCenterX = viewportWidth / 2;
  const horizontalDistance = stackLeft - viewportCenterX;
  const normalizedHorizontalDistance = horizontalDistance / Math.max(1, viewportWidth / 2);
  return Math.max(
    -PARALLAX_MAX_ROTATION,
    Math.min(PARALLAX_MAX_ROTATION, normalizedHorizontalDistance * PARALLAX_MAX_ROTATION)
  );
}

function getStackParallaxVariance(stackId: string) {
  const seed = hashString(`${stackId}-parallax-variance`);
  return 0.9 + randomFromSeed(seed) * 0.24;
}

function getStackParallaxXBias(stackId: string) {
  const seed = hashString(`${stackId}-parallax-x-bias`);
  return randomFromSeed(seed) * 2 - 1;
}

function getLayerParallaxVariance(stackId: string, layerIndex: number) {
  const seed = hashString(`${stackId}-${layerIndex}-parallax-variance`);
  return 0.94 + randomFromSeed(seed) * 0.18;
}

function getLayerParallaxXBias(stackId: string, layerIndex: number) {
  const seed = hashString(`${stackId}-${layerIndex}-parallax-x-bias`);
  return (randomFromSeed(seed) * 2 - 1) * 0.65;
}

function getLayerParallaxRotationBias(stackId: string, layerIndex: number) {
  const seed = hashString(`${stackId}-${layerIndex}-parallax-rotation-bias`);
  return (randomFromSeed(seed) - 0.5) * 0.9;
}

function getDirectionalParallaxResponse(stackId: string, layerIndex: number, axis: "x" | "y" | "rotate") {
  const negativeSeed = hashString(`${stackId}-${layerIndex}-${axis}-negative-response`);
  const positiveSeed = hashString(`${stackId}-${layerIndex}-${axis}-positive-response`);

  return {
    negative: 0.88 + randomFromSeed(negativeSeed) * 0.24,
    positive: 0.88 + randomFromSeed(positiveSeed) * 0.24,
  };
}

export type PreviewLayerSnapshot = {
  translateX: number;
  translateY: number;
  rotateDeg: number;
};

type PreviewLayerSnapshotInput = {
  stackId: string;
  layerIndex: number;
  size: number;
  stackTop: number;
  stackLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollY: number;
};

export function getPreviewLayerSnapshot({
  stackId,
  layerIndex,
  size,
  stackTop,
  stackLeft,
  viewportWidth,
  viewportHeight,
  scrollY,
}: PreviewLayerSnapshotInput): PreviewLayerSnapshot {
  const baseTranslateY = -getPreviewStackOffset(size, layerIndex);
  const jitter = getPreviewJitter(stackId, layerIndex, size);
  const layerParallaxVariance = getLayerParallaxVariance(stackId, layerIndex);
  const layerParallaxXBias = getLayerParallaxXBias(stackId, layerIndex);
  const layerRotationBias = getLayerParallaxRotationBias(stackId, layerIndex);
  const xDirectionalResponse = getDirectionalParallaxResponse(stackId, layerIndex, "x");
  const yDirectionalResponse = getDirectionalParallaxResponse(stackId, layerIndex, "y");
  const rotationDirectionalResponse = getDirectionalParallaxResponse(stackId, layerIndex, "rotate");
  const stackParallaxVariance = getStackParallaxVariance(stackId);
  const stackParallaxXBias = getStackParallaxXBias(stackId);
  const cardCenterY = stackTop + baseTranslateY + jitter.y + size / 2 - scrollY;
  const cardCenterX = stackLeft + jitter.x + size / 2;
  const viewportCenterY = viewportHeight / 2;
  const viewportCenterX = viewportWidth / 2;
  const distanceFromCenter = cardCenterY - viewportCenterY;
  const horizontalDistance = cardCenterX - viewportCenterX;
  const normalizedDistance = distanceFromCenter / Math.max(1, viewportHeight / 2);
  const normalizedHorizontalDistance = horizontalDistance / Math.max(1, viewportWidth / 2);
  const depthFactor = Math.max(0.4, 1 - layerIndex * 0.18);
  const columnFactor = 1 + normalizedHorizontalDistance * 0.32;
  const xDirectionFactor = normalizedDistance < 0 ? xDirectionalResponse.negative : xDirectionalResponse.positive;
  const yDirectionFactor = normalizedDistance < 0 ? yDirectionalResponse.negative : yDirectionalResponse.positive;
  const rotationDirectionFactor =
    normalizedDistance < 0 ? rotationDirectionalResponse.negative : rotationDirectionalResponse.positive;
  const xBias = stackParallaxXBias + layerParallaxXBias;
  const parallaxX = Math.max(
    -PARALLAX_MAX_SHIFT_X,
    Math.min(
      PARALLAX_MAX_SHIFT_X,
      normalizedDistance
        * PARALLAX_MAX_SHIFT_X
        * depthFactor
        * stackParallaxVariance
        * layerParallaxVariance
        * xBias
        * xDirectionFactor
    )
  );
  const parallaxY = Math.max(
    -PARALLAX_MAX_SHIFT,
    Math.min(
      PARALLAX_MAX_SHIFT,
      normalizedDistance
        * PARALLAX_MAX_SHIFT
        * depthFactor
        * columnFactor
        * stackParallaxVariance
        * layerParallaxVariance
        * yDirectionFactor
    )
  );
  const parallaxRotate = Math.max(
    -PARALLAX_MAX_ROTATION,
    Math.min(
      PARALLAX_MAX_ROTATION,
      normalizedHorizontalDistance * PARALLAX_MAX_ROTATION * rotationDirectionFactor + layerRotationBias
    )
  );

  return {
    translateX: jitter.x + parallaxX,
    translateY: baseTranslateY + jitter.y + parallaxY,
    rotateDeg: jitter.rotate + parallaxRotate,
  };
}

type TrackStackPreviewOnOverviewScreenProps = {
  stack: TrackStack;
  size: number;
  stackTop: number;
  stackLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollY: SharedValue<number>;
  straightenProgress?: SharedValue<number>;
  revealFrontLayers?: boolean;
  showDeferredLayers?: boolean;
  onFrontLayerReady?: (stackId: string) => void;
};

function PreviewLayerShell({
  size,
  rel,
  jitter,
  zIndex,
  straightenProgress,
  children,
}: {
  size: number;
  rel: number;
  jitter: { x: number; y: number; rotate: number };
  zIndex: number;
  straightenProgress?: SharedValue<number>;
  children: React.ReactNode;
}) {
  const baseTranslateY = -getPreviewStackOffset(size, rel);
  const layerStyle = useAnimatedStyle(() => {
    const progress = straightenProgress?.value ?? 0;
    const remaining = 1 - progress;

    return {
      transform: [
        { translateX: jitter.x * remaining },
        { translateY: baseTranslateY + jitter.y },
        { rotate: `${jitter.rotate * remaining}deg` },
      ],
    };
  }, [baseTranslateY, jitter, straightenProgress]);

  return (
    <Animated.View
      style={[
        styles.previewLayer,
        {
          width: size,
          height: size,
          bottom: 0,
          left: 0,
          zIndex,
        },
        layerStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function PreviewImageLayer({
  rel,
  stackTop,
  stackLeft,
  viewportWidth,
  viewportHeight,
  scrollY,
  straightenProgress,
  source,
  fallbackSource,
  hidden,
  stackParallaxVariance,
  stackParallaxXBias,
  layerParallaxVariance,
  layerParallaxXBias,
  layerRotationBias,
  xDirectionalResponse,
  yDirectionalResponse,
  rotationDirectionalResponse,
  onLoadEnd,
}: {
  rel: number;
  stackTop: number;
  stackLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollY: SharedValue<number>;
  straightenProgress?: SharedValue<number>;
  source: string;
  fallbackSource?: string;
  hidden: boolean;
  stackParallaxVariance: number;
  stackParallaxXBias: number;
  layerParallaxVariance: number;
  layerParallaxXBias: number;
  layerRotationBias: number;
  xDirectionalResponse: { negative: number; positive: number };
  yDirectionalResponse: { negative: number; positive: number };
  rotationDirectionalResponse: { negative: number; positive: number };
  onLoadEnd: () => void;
}) {
  const [useFallbackSource, setUseFallbackSource] = useState(false);

  useEffect(() => {
    setUseFallbackSource(false);
  }, [fallbackSource, source]);

  const imageParallaxStyle = useAnimatedStyle(() => {
    const straighten = straightenProgress?.value ?? 0;
    const remaining = 1 - straighten;
    const viewportCenterY = viewportHeight / 2;
    const viewportCenterX = viewportWidth / 2;
    const cardCenterY = stackTop - scrollY.value;
    const cardCenterX = stackLeft;
    const distanceFromCenter = cardCenterY - viewportCenterY;
    const horizontalDistance = cardCenterX - viewportCenterX;
    const normalizedDistance = distanceFromCenter / Math.max(1, viewportHeight / 2);
    const normalizedHorizontalDistance = horizontalDistance / Math.max(1, viewportWidth / 2);
    const depthFactor = Math.max(0.4, 1 - rel * 0.18);
    const columnFactor = 1 + normalizedHorizontalDistance * 0.32;
    const xDirectionFactor = normalizedDistance < 0 ? xDirectionalResponse.negative : xDirectionalResponse.positive;
    const yDirectionFactor = normalizedDistance < 0 ? yDirectionalResponse.negative : yDirectionalResponse.positive;
    const rotationDirectionFactor =
      normalizedDistance < 0 ? rotationDirectionalResponse.negative : rotationDirectionalResponse.positive;
    const xBias = stackParallaxXBias + layerParallaxXBias;
    const translateImageX = Math.max(
      -PARALLAX_MAX_SHIFT_X,
      Math.min(
        PARALLAX_MAX_SHIFT_X,
        normalizedDistance
          * PARALLAX_MAX_SHIFT_X
          * depthFactor
          * stackParallaxVariance
          * layerParallaxVariance
          * xBias
          * xDirectionFactor
      )
    );
    const translateImageY = Math.max(
      -PARALLAX_MAX_SHIFT,
      Math.min(
        PARALLAX_MAX_SHIFT,
        normalizedDistance
          * PARALLAX_MAX_SHIFT
          * depthFactor
          * columnFactor
          * stackParallaxVariance
          * layerParallaxVariance
          * yDirectionFactor
      )
    );
    const rotateZ = Math.max(
      -PARALLAX_MAX_ROTATION,
      Math.min(
        PARALLAX_MAX_ROTATION,
        normalizedHorizontalDistance * PARALLAX_MAX_ROTATION * rotationDirectionFactor + layerRotationBias
      )
    );

    return {
      transform: [
        { translateX: translateImageX * remaining },
        { translateY: translateImageY },
        { rotate: `${rotateZ * remaining}deg` },
      ],
    };
  }, [
    layerParallaxVariance,
    layerParallaxXBias,
    layerRotationBias,
    rel,
    scrollY,
    stackLeft,
    stackParallaxVariance,
    stackParallaxXBias,
    stackTop,
    straightenProgress,
    viewportHeight,
    viewportWidth,
    rotationDirectionalResponse,
    xDirectionalResponse,
    yDirectionalResponse,
  ]);

  return (
    <Animated.View style={[styles.previewImageMotion, imageParallaxStyle]}>
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit="cover"
        onError={() => {
          if (!useFallbackSource && fallbackSource && fallbackSource !== source) {
            setUseFallbackSource(true);
            return;
          }

          onLoadEnd();
        }}
        onLoadEnd={onLoadEnd}
        source={{ uri: useFallbackSource ? fallbackSource ?? source : source }}
        style={[styles.previewImage, hidden ? styles.hiddenFrontImage : null]}
        transition={0}
      />
    </Animated.View>
  );
}

function TrackStackPreviewOnOverviewScreen({
  stack,
  size,
  stackTop,
  stackLeft,
  viewportWidth,
  viewportHeight,
  scrollY,
  straightenProgress,
  revealFrontLayers = true,
  showDeferredLayers = true,
  onFrontLayerReady,
}: TrackStackPreviewOnOverviewScreenProps) {
  const layers = stack.projects.slice(0, 4);
  const stackHeight = getPreviewPressableHeight(size);
  const visibleLayers = showDeferredLayers ? layers : layers.slice(0, 1);
  const frontLayerReportedRef = useRef(false);
  const stackParallaxVariance = useRef(getStackParallaxVariance(stack.id)).current;
  const stackParallaxXBias = useRef(getStackParallaxXBias(stack.id)).current;

  useEffect(() => {
    frontLayerReportedRef.current = false;
  }, [stack.id]);

  useEffect(() => {
    const frontProject = layers[0];
    if (!frontProject || frontProject.thumbnail || frontProject.media) {
      return;
    }

    if (!frontLayerReportedRef.current) {
      frontLayerReportedRef.current = true;
      onFrontLayerReady?.(stack.id);
    }
  }, [layers, onFrontLayerReady, stack.id]);

  return (
    <View style={[styles.stackPreview, { width: size, height: stackHeight }]}>
      {visibleLayers
        .slice()
        .reverse()
        .map((project, reverseIndex) => {
          const rel = visibleLayers.length - 1 - reverseIndex;
          const jitter = getPreviewJitter(stack.id, rel, size);
          const layerParallaxVariance = getLayerParallaxVariance(stack.id, rel);
          const layerParallaxXBias = getLayerParallaxXBias(stack.id, rel);
          const layerRotationBias = getLayerParallaxRotationBias(stack.id, rel);
          const xDirectionalResponse = getDirectionalParallaxResponse(stack.id, rel, "x");
          const yDirectionalResponse = getDirectionalParallaxResponse(stack.id, rel, "y");
          const rotationDirectionalResponse = getDirectionalParallaxResponse(stack.id, rel, "rotate");

          return (
            <PreviewLayerShell
              key={project.id}
              size={size}
              rel={rel}
              jitter={jitter}
              zIndex={10 - rel}
              straightenProgress={straightenProgress}
            >
              {project.thumbnail || project.media ? (
                <PreviewImageLayer
                  rel={rel}
                  stackTop={stackTop - getPreviewStackOffset(size, rel) + jitter.y + size / 2}
                  stackLeft={stackLeft + jitter.x + size / 2}
                  viewportWidth={viewportWidth}
                  viewportHeight={viewportHeight}
                  scrollY={scrollY}
                  straightenProgress={straightenProgress}
                  source={project.thumbnail || project.media}
                  fallbackSource={project.previewFallback || project.media}
                  hidden={rel === 0 && !revealFrontLayers}
                  stackParallaxVariance={stackParallaxVariance}
                  stackParallaxXBias={stackParallaxXBias}
                  layerParallaxVariance={layerParallaxVariance}
                  layerParallaxXBias={layerParallaxXBias}
                  layerRotationBias={layerRotationBias}
                  xDirectionalResponse={xDirectionalResponse}
                  yDirectionalResponse={yDirectionalResponse}
                  rotationDirectionalResponse={rotationDirectionalResponse}
                  onLoadEnd={() => {
                    if (rel === 0 && !frontLayerReportedRef.current) {
                      frontLayerReportedRef.current = true;
                      onFrontLayerReady?.(stack.id);
                    }
                  }}
                />
              ) : null}
            </PreviewLayerShell>
          );
        })}
    </View>
  );
}

export default memo(TrackStackPreviewOnOverviewScreen);

const styles = StyleSheet.create({
  stackPreview: {
    position: "relative",
  },
  previewLayer: {
    position: "absolute",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
  },
  previewImageMotion: {
    ...StyleSheet.absoluteFillObject,
  },
  hiddenFrontImage: {
    opacity: 0,
  },
});
