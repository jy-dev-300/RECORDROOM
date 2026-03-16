import { fetchRandomAlbumsByCountry } from "../../services/musicBrainzRandomAlbums";
import {
  acquireDailyAlbumsRefreshLock,
  getStoredDailyAlbums,
  releaseDailyAlbumsRefreshLock,
  setStoredDailyAlbums,
} from "../../services/dailyAlbumsStore";

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

  const hasLock = await acquireDailyAlbumsRefreshLock();
  if (!hasLock) {
    const payload = await getStoredDailyAlbums();
    res.status(200).json({
      ok: true,
      refreshed: false,
      reason: "refresh-already-in-progress",
      generatedAt: payload?.generatedAt ?? null,
    });
    return;
  }

  try {
    const fresh = await fetchRandomAlbumsByCountry();
    const payload = {
      countries: fresh.countries,
      countrySections: fresh.countrySections,
      allAlbums: fresh.allAlbums,
      generatedAt: new Date().toISOString(),
    };

    await setStoredDailyAlbums(payload);

    res.status(200).json({
      ok: true,
      refreshed: true,
      generatedAt: payload.generatedAt,
      albumCount: payload.allAlbums.length,
      countryCount: payload.countrySections.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz refresh failure";
    res.status(500).json({ error: message });
  } finally {
    await releaseDailyAlbumsRefreshLock();
  }
}
