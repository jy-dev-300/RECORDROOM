import type { PreviewLayerSnapshot } from "../components/TrackStackPreviewOnOverviewScreen";
import type { TrackStack } from "../data/trackStacks";
import type { TrackWorldLayout } from "../lib/trackWorldLayout";
import TracksOverviewScreen from "./TracksOverviewScreen";

type MyTracksScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  previewRevealPrimed?: boolean;
  initialScrollOffset?: number;
  onBack: () => void;
  onPreviewRevealPrimed?: () => void;
  onScrollOffsetChange?: (offset: number) => void;
  onPressStack: (
    sectionIndex: number,
    stackIndex: number,
    previewRotationDeg?: number,
    previewLayerSnapshots?: PreviewLayerSnapshot[]
  ) => void;
};

export default function MyTracksScreen({
  layout,
  sections,
  previewRevealPrimed = false,
  initialScrollOffset = 0,
  onBack,
  onPreviewRevealPrimed,
  onScrollOffsetChange,
  onPressStack,
}: MyTracksScreenProps) {
  return (
    <TracksOverviewScreen
      layout={layout}
      sections={sections}
      previewRevealPrimed={previewRevealPrimed}
      isMyTracksView
      onBack={onBack}
      initialScrollOffset={initialScrollOffset}
      onPreviewRevealPrimed={onPreviewRevealPrimed}
      onScrollOffsetChange={onScrollOffsetChange}
      onPressStack={onPressStack}
    />
  );
}
