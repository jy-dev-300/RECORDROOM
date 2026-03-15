import { StyleSheet, View } from "react-native";
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
};

export default function AlbumStackPreviewOnOverviewScreen({ stack, size }: AlbumStackPreviewOnOverviewScreenProps) {
  const layers = stack.projects.slice(0, 5);
  const stackHeight = getPreviewPressableHeight(size);

  return (
    <View style={[styles.stackPreview, { width: size, height: stackHeight }]}>
      {layers
        .slice()
        .reverse()
        .map((project, reverseIndex) => {
          const rel = layers.length - 1 - reverseIndex;
          const translateY = -getPreviewStackOffset(size, rel);
          const jitter = getPreviewJitter(stack.id, rel, size);

          return (
            <View
              key={project.id}
              style={[
                styles.previewLayer,
                {
                  backgroundColor: project.color,
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
            />
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  stackPreview: {
    position: "relative",
  },
  previewLayer: {
    position: "absolute",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
});

