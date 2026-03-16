import {
  acquireDailyTracksRefreshLock,
  releaseDailyTracksRefreshLock,
  setStoredDailyTracks,
} from "../../services/dailyTracksStore";
import { fetchRandomMusicBrainzTracks } from "../../services/musicBrainzRandomTracks";

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
    try {
      const tracks = await fetchRandomMusicBrainzTracks();
      freshCount = tracks.length;
      await setStoredDailyTracks({
        tracks,
        generatedAt: new Date().toISOString(),
      });
    } finally {
      await releaseDailyTracksRefreshLock();
    }

    res.status(200).json({
      ok: true,
      refreshed: true,
      generatedAt: new Date().toISOString(),
      trackCount: freshCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz refresh failure";
    res.status(500).json({ error: message });
  }
}
