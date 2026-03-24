import { config } from "./config";
import {
  loadSpotifyPreviewCache,
  saveSpotifyPreviewCache,
} from "./deviceSpotifyPreviewCache";

export type SpotifyTrackMatch = {
  id: string;
  name: string;
  uri: string;
  externalUrl: string;
  embedUrl: string;
  artistNames: string[];
  albumName: string | null;
  releaseDate: string | null;
};

type SpotifyTrackMatchResponse = {
  track: SpotifyTrackMatch;
};

const spotifyTrackMatchCache = new Map<string, SpotifyTrackMatch | null>();
const spotifyTrackMatchRequests = new Map<string, Promise<SpotifyTrackMatch | null>>();
let spotifyTrackMatchCacheHydrated = false;
let spotifyTrackMatchCacheHydrationPromise: Promise<void> | null = null;

function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

function assertSpotifyTrackMatchResponse(data: unknown): asserts data is SpotifyTrackMatchResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Spotify match response was not an object.");
  }

  const candidate = data as Partial<SpotifyTrackMatchResponse>;
  if (!candidate.track || typeof candidate.track !== "object") {
    throw new Error("Spotify match response is missing track.");
  }
}

function buildSpotifyTrackMatchCacheKey(params: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
}) {
  return JSON.stringify({
    title: params.title.trim().toLowerCase(),
    artistName: params.artistName?.trim().toLowerCase() ?? "",
    releaseYear: typeof params.releaseYear === "number" ? params.releaseYear : "",
  });
}

async function hydrateSpotifyTrackMatchCache() {
  if (spotifyTrackMatchCacheHydrated) {
    return;
  }

  if (!spotifyTrackMatchCacheHydrationPromise) {
    spotifyTrackMatchCacheHydrationPromise = loadSpotifyPreviewCache()
      .then((storedMatches) => {
        Object.entries(storedMatches).forEach(([cacheKey, match]) => {
          spotifyTrackMatchCache.set(cacheKey, match);
        });
        spotifyTrackMatchCacheHydrated = true;
      })
      .finally(() => {
        spotifyTrackMatchCacheHydrationPromise = null;
      });
  }

  await spotifyTrackMatchCacheHydrationPromise;
}

function persistSpotifyTrackMatchCache() {
  const payload = Object.fromEntries(spotifyTrackMatchCache.entries());
  void saveSpotifyPreviewCache(payload);
}

async function loadSpotifyTrackMatch(params: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
}) {
  const url = new URL(getApiUrl("/api/spotify/search-track"));
  url.searchParams.set("title", params.title);
  if (params.artistName?.trim()) {
    url.searchParams.set("artistName", params.artistName.trim());
  }
  if (typeof params.releaseYear === "number") {
    url.searchParams.set("releaseYear", String(params.releaseYear));
  }

  const response = await fetch(url.toString());

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify match request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertSpotifyTrackMatchResponse(raw);
  return raw.track;
}

export async function fetchSpotifyTrackMatch(params: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
}) {
  await hydrateSpotifyTrackMatchCache();
  const cacheKey = buildSpotifyTrackMatchCacheKey(params);

  if (spotifyTrackMatchCache.has(cacheKey)) {
    return spotifyTrackMatchCache.get(cacheKey) ?? null;
  }

  const inFlightRequest = spotifyTrackMatchRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = loadSpotifyTrackMatch(params)
    .then((match) => {
      spotifyTrackMatchCache.set(cacheKey, match);
      persistSpotifyTrackMatchCache();
      spotifyTrackMatchRequests.delete(cacheKey);
      return match;
    })
    .catch((error) => {
      spotifyTrackMatchRequests.delete(cacheKey);
      throw error;
    });

  spotifyTrackMatchRequests.set(cacheKey, request);
  return request;
}

export function prefetchSpotifyTrackMatch(params: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
}) {
  void fetchSpotifyTrackMatch(params).catch(() => {});
}
