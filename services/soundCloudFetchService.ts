import { config } from "./config";
import type { FeedTrack } from "./soundCloudRandomTracks";
import {
  loadCachedDailyTracks,
  prefetchTrackArtworkCache,
  saveDailyTracksPayload,
} from "./deviceTrackCache";

type RandomTracksResponse = {
  tracks: FeedTrack[];
};

function assertTracksResponse(data: unknown): asserts data is RandomTracksResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Track response was not an object.");
  }

  const candidate = data as Partial<RandomTracksResponse>;
  if (!Array.isArray(candidate.tracks)) {
    throw new Error("Track response is missing tracks.");
  }
}

function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

export async function fetchRandomTracks() {
  const response = await fetch(getApiUrl("/api/soundcloud/random-tracks"));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Random tracks request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertTracksResponse(raw);

  return {
    tracks: raw.tracks,
    tracksById: new Map(raw.tracks.map((track) => [track.id, track])),
  };
}

export async function loadCachedRandomTracks() {
  const payload = await loadCachedDailyTracks();
  if (!payload || !Array.isArray(payload.tracks)) {
    return null;
  }

  return {
    tracks: payload.tracks,
    tracksById: new Map(payload.tracks.map((track) => [track.id, track])),
  };
}

export async function cacheRandomTracks(payload: { tracks: FeedTrack[] }) {
  await saveDailyTracksPayload(payload);
  void prefetchTrackArtworkCache(payload);
}
