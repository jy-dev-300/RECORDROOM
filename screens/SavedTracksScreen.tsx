import type { PreviewLayerSnapshot } from "../components/TrackStackPreviewOnOverviewScreen";
import type { TrackStack } from "../data/trackStacks";
import type { TrackWorldLayout } from "../lib/trackWorldLayout";
import TracksOverviewScreen from "./TracksOverviewScreen";

type SavedTracksScreenProps = {
  layout: TrackWorldLayout;
  sections: TrackStack[][];
  accountLabel?: string;
  previewRevealPrimed?: boolean;
  initialScrollOffset?: number;
  onBack: () => void;
  onPressAllTracks?: () => void;
  onPressLoadingDebug?: () => void;
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

export default function SavedTracksScreen({
  layout,
  sections,
  accountLabel,
  previewRevealPrimed = false,
  initialScrollOffset = 0,
  onBack,
  onPressAllTracks,
  onPressLoadingDebug,
  sortOptions,
  onPreviewRevealPrimed,
  onScrollOffsetChange,
  onPressStack,
}: SavedTracksScreenProps) {
  const extraContentTopPadding = Math.round(layout.viewportHeight * 0.03);

  return (
    <TracksOverviewScreen
      layout={layout}
      sections={sections}
      accountLabel={accountLabel}
      previewRevealPrimed={previewRevealPrimed}
      onBack={onBack}
      onPressAllTracks={onPressAllTracks}
      onPressLoadingDebug={onPressLoadingDebug}
      initialScrollOffset={initialScrollOffset}
      sortOptions={sortOptions}
      onPreviewRevealPrimed={onPreviewRevealPrimed}
      onScrollOffsetChange={onScrollOffsetChange}
      screenTitle="Saved Tracks"
      extraContentTopPadding={extraContentTopPadding}
      onPressStack={onPressStack}
    />
  );
}
