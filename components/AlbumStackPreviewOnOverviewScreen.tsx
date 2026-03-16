import { memo, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import type { AlbumStack } from "../data/albumStacks";
import { getPreviewPressableHeight, getPreviewStackOffset } from "../lib/albumWorldLayout";

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

function getPreviewJitter(stackId: string, layerIndex: number, size: number) {
  const seedBase = hashString(`${stackId}-${layerIndex}`);
  const x = (randomFromSeed(seedBase) - 0.5) * size * 0.12;
  const y = (randomFromSeed(seedBase * 3) - 0.5) * size * 0.05;
  const rotate = (randomFromSeed(seedBase * 7) - 0.5) * 6;
  return { x, y, rotate };
}

type AlbumStackPreviewOnOverviewScreenProps = {
  stack: AlbumStack;
  size: number;
  revealFrontLayers?: boolean;
  showDeferredLayers?: boolean;
  onFrontLayerReady?: (stackId: string) => void;
};

function AlbumStackPreviewOnOverviewScreen({
  stack,
  size,
  revealFrontLayers = true,
  showDeferredLayers = true,
  onFrontLayerReady,
}: AlbumStackPreviewOnOverviewScreenProps) {
  const layers = stack.projects.slice(0, 5);
  const stackHeight = getPreviewPressableHeight(size);
  const visibleLayers = showDeferredLayers ? layers : layers.slice(0, 1);
  const frontLayerReportedRef = useRef(false);

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
          const translateY = -getPreviewStackOffset(size, rel);
          const jitter = getPreviewJitter(stack.id, rel, size);

          return (
            <View
              key={project.id}
              style={[
                styles.previewLayer,
                {
                  width: size,
                  height: size,
                  bottom: 0,
                  left: 0,
                  zIndex: 10 - rel,
                  transform: [
                    { translateX: jitter.x },
                    { translateY: translateY + jitter.y },
                    { rotate: `${jitter.rotate}deg` },
                  ],
                },
              ]}
            >
              {project.thumbnail || project.media ? (
                <ExpoImage
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  onLoadEnd={() => {
                    if (rel === 0 && !frontLayerReportedRef.current) {
                      frontLayerReportedRef.current = true;
                      onFrontLayerReady?.(stack.id);
                    }
                  }}
                  source={{ uri: project.thumbnail || project.media }}
                  style={[
                    styles.previewImage,
                    rel === 0 && !revealFrontLayers ? styles.hiddenFrontImage : null,
                  ]}
                  transition={0}
                />
              ) : null}
            </View>
          );
        })}
    </View>
  );
}

export default memo(AlbumStackPreviewOnOverviewScreen);

const styles = StyleSheet.create({
  stackPreview: {
    position: "relative",
  },
  previewLayer: {
    position: "absolute",
    overflow: "hidden",
  },
  previewImage: {
    flex: 1,
  },
  hiddenFrontImage: {
    opacity: 0,
  },
});

