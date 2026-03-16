import { fetchRandomAlbumsByCountry } from "../../services/musicBrainzRandomAlbums";
import {
  acquireDailyAlbumsRefreshLock,
  getStoredDailyAlbums,
  releaseDailyAlbumsRefreshLock,
  setStoredDailyAlbums,
  type StoredAlbumsPayload,
} from "../../services/dailyAlbumsStore";

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

function toStoredPayload(payload: Awaited<ReturnType<typeof fetchRandomAlbumsByCountry>>): StoredAlbumsPayload {
  return {
    countries: payload.countries,
    countrySections: payload.countrySections,
    allAlbums: payload.allAlbums,
    generatedAt: new Date().toISOString(),
  };
}

async function bootstrapIfMissing() {
  const existing = await getStoredDailyAlbums();
  if (existing) {
    return { payload: existing, cacheStatus: "HIT" as const };
  }

  const hasLock = await acquireDailyAlbumsRefreshLock();
  if (hasLock) {
    try {
      const freshPayload = toStoredPayload(await fetchRandomAlbumsByCountry());
      await setStoredDailyAlbums(freshPayload);
      return { payload: freshPayload, cacheStatus: "MISS" as const };
    } finally {
      await releaseDailyAlbumsRefreshLock();
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const payload = await getStoredDailyAlbums();
    if (payload) {
      return { payload, cacheStatus: "HIT" as const };
    }
  }

  throw new Error("Daily album payload is not ready yet.");
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { payload, cacheStatus } = await bootstrapIfMissing();

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Recordroom-Cache", cacheStatus);
    res.status(200).json({
      countries: payload.countries,
      countrySections: payload.countrySections,
      allAlbums: payload.allAlbums,
      generatedAt: payload.generatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz fetch failure";
    res.status(500).json({ error: message });
  }
}
