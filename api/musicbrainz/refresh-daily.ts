import {
  acquireDailyTracksRefreshLock,
  getStoredDailyTracks,
  releaseDailyTracksRefreshLock,
} from "../../services/dailyTracksStore";
import type { FeedTrack } from "../../services/soundCloudRandomTracks";

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
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

function getHeader(headers: RequestLike["headers"], name: string) {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct;
}

function isAuthorizedCron(headers: RequestLike["headers"]) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  return getHeader(headers, "authorization") === `Bearer ${cronSecret}`;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAuthorizedCron(req.headers)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const hasLock = await acquireDailyTracksRefreshLock();
    if (!hasLock) {
      res.status(409).json({ error: "Track refresh already in progress" });
      return;
    }

    let freshCount = 0;
    let sourcePoolCount = 0;
    try {
      const payload = await getStoredDailyTracks();
      if (!payload) {
        res.status(503).json({
          error: "Track pool is not published yet. Run the publish pipeline first.",
        });
        return;
      }

      sourcePoolCount = payload.tracks.length;
      freshCount = sampleTracks(payload.tracks, RANDOM_TRACK_COUNT).length;
    } finally {
      await releaseDailyTracksRefreshLock();
    }

    res.status(200).json({
      ok: true,
      refreshed: true,
      generatedAt: new Date().toISOString(),
      trackCount: freshCount,
      sourcePoolCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz refresh failure";
    res.status(500).json({ error: message });
  }
}
