import type { PreviewLayerSnapshot } from "../components/TrackStackPreviewOnOverviewScreen";
import type { TrackStack } from "../data/trackStacks";
import type { TrackWorldLayout } from "../lib/trackWorldLayout";
import TracksOverviewScreen from "./TracksOverviewScreen";

type MyTracksScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  accountLabel?: string;
  previewRevealPrimed?: boolean;
  initialScrollOffset?: number;
  onBack: () => void;
  sortOptions?: Array<{
    id: string;
    label: string;
    onPress: () => void;
  }>;
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
  accountLabel,
  previewRevealPrimed = false,
  initialScrollOffset = 0,
  onBack,
  sortOptions,
  onPreviewRevealPrimed,
  onScrollOffsetChange,
  onPressStack,
}: MyTracksScreenProps) {
  return (
    <TracksOverviewScreen
      layout={layout}
      sections={sections}
      accountLabel={accountLabel}
      previewRevealPrimed={previewRevealPrimed}
      isMyTracksView
      onBack={onBack}
      initialScrollOffset={initialScrollOffset}
      sortOptions={sortOptions}
      onPreviewRevealPrimed={onPreviewRevealPrimed}
      onScrollOffsetChange={onScrollOffsetChange}
      onPressStack={onPressStack}
    />
  );
}
