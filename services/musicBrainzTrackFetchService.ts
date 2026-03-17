import { config } from "./config";
import {
  clearTrackCache,
  loadCachedDailyTracks,
  prefetchTrackArtworkCache,
  saveDailyTracksPayload,
} from "./deviceTrackCache";
import type { FeedTrack } from "./soundCloudRandomTracks";

type RandomTracksResponse = {
  tracks: FeedTrack[];
};

function hasArtwork(track: FeedTrack) {
  return typeof track.artwork_url === "string" && track.artwork_url.trim().length > 0;
}

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
  await clearTrackCache();

  const response = await fetch(getApiUrl("/api/musicbrainz/random-tracks"));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Random tracks request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertTracksResponse(raw);

  const tracks = raw.tracks.filter(hasArtwork);

  return {
    tracks,
    tracksById: new Map(tracks.map((track) => [track.id, track])),
  };
}

export async function loadCachedRandomTracks() {
  const payload = await loadCachedDailyTracks();
  if (!payload || !Array.isArray(payload.tracks)) {
    return null;
  }

  const tracks = payload.tracks.filter(hasArtwork);

  return {
    tracks,
    tracksById: new Map(tracks.map((track) => [track.id, track])),
  };
}

export async function cacheRandomTracks(payload: { tracks: FeedTrack[] }) {
  await clearTrackCache();
  await saveDailyTracksPayload(payload);
  void prefetchTrackArtworkCache(payload);
}
