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

// Keep only tracks that still point at a non-empty artwork URL.
function hasArtwork(track: FeedTrack) {
  return typeof track.artwork_url === "string" && track.artwork_url.trim().length > 0;
}

// Validate the backend response before we trust it inside the app.
function assertTracksResponse(data: unknown): asserts data is RandomTracksResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Track response was not an object.");
  }

  const candidate = data as Partial<RandomTracksResponse>;
  if (!Array.isArray(candidate.tracks)) {
    throw new Error("Track response is missing tracks.");
  }
}

// Build an absolute backend URL from EXPO_PUBLIC_API_BASE_URL.
function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

export async function fetchRandomTracks() {
  // A true refresh starts from a clean device cache so we never mix old and new payloads.
  await clearTrackCache();

  // Ask the deployed backend for the prepared Redis-backed track payload.
  const response = await fetch(getApiUrl("/api/musicbrainz/random-tracks"));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Random tracks request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertTracksResponse(raw);

  // Drop any malformed tracks that somehow reached the client without art.
  const tracks = raw.tracks.filter(hasArtwork);

  return {
    tracks,
    // Keep an id lookup around for downstream code that wants fast access.
    tracksById: new Map(tracks.map((track) => [track.id, track])),
  };
}

export async function loadCachedRandomTracks() {
  // Reuse the last accepted payload if it still exists on device.
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
  // Cache writes are also reset first so stale artwork files never linger behind a new payload.
  await clearTrackCache();
  await saveDailyTracksPayload(payload);
  // Artwork warming is intentionally fire-and-forget so UI is not blocked on every download.
  void prefetchTrackArtworkCache(payload);
}
