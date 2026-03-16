import { fetchRandomMusicBrainzTracks } from "../../services/musicBrainzRandomTracks";
import {
  acquireDailyTracksRefreshLock,
  getStoredDailyTracks,
  releaseDailyTracksRefreshLock,
  setStoredDailyTracks,
  type StoredTracksPayload,
} from "../../services/dailyTracksStore";

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

function toStoredPayload(tracks: Awaited<ReturnType<typeof fetchRandomMusicBrainzTracks>>): StoredTracksPayload {
  return {
    tracks,
    generatedAt: new Date().toISOString(),
  };
}

async function bootstrapIfMissing() {
  const existing = await getStoredDailyTracks();
  if (existing) {
    return { payload: existing, cacheStatus: "HIT" as const };
  }

  const hasLock = await acquireDailyTracksRefreshLock();
  if (hasLock) {
    try {
      const freshPayload = toStoredPayload(await fetchRandomMusicBrainzTracks());
      await setStoredDailyTracks(freshPayload);
      return { payload: freshPayload, cacheStatus: "MISS" as const };
    } finally {
      await releaseDailyTracksRefreshLock();
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const payload = await getStoredDailyTracks();
    if (payload) {
      return { payload, cacheStatus: "HIT" as const };
    }
  }

  throw new Error("Daily track payload is not ready yet.");
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { payload, cacheStatus } = await bootstrapIfMissing();

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Recordroom-Cache", cacheStatus);
    res.status(200).json({
      tracks: payload.tracks,
      generatedAt: payload.generatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz track fetch failure";
    res.status(500).json({ error: message });
  }
}
