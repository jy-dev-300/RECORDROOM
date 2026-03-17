import {
  getStoredDailyTracks,
} from "../../services/dailyTracksStore";
import type { FeedTrack } from "../../services/soundCloudRandomTracks";

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

const RANDOM_TRACK_COUNT = 128;

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function sampleTracks(tracks: FeedTrack[], count: number) {
  if (tracks.length <= count) {
    return tracks;
  }

  return shuffle(tracks).slice(0, count);
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  // This endpoint is read-only; reject everything except GET.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Read the already-published payload from Redis instead of rebuilding anything live.
    const payload = await getStoredDailyTracks();
    if (!payload) {
      res.status(503).json({
        error: "Daily track payload is not published yet. Run the publish pipeline first.",
      });
      return;
    }

    const sampledTracks = sampleTracks(payload.tracks, RANDOM_TRACK_COUNT);

    // We want the app to decide when to reuse device cache, not an HTTP intermediary.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Recordroom-Cache", "HIT");
    res.status(200).json({
      tracks: sampledTracks,
      generatedAt: payload.generatedAt,
      totalPoolCount: payload.tracks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz track fetch failure";
    res.status(500).json({ error: message });
  }
}
