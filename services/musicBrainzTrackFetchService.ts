import { config } from "./config";
import {
  clearTrackCache,
  loadCachedDailyTracks,
  prefetchTrackArtworkCache,
  saveDailyTracksPayload,
} from "./deviceTrackCache";
import type { FeedTrack } from "./soundCloudRandomTracks";
type GeneratedFeedTrack = FeedTrack & {
  source_artwork_url?: string | null;
};

const generatedTrackPool = require("../generated/musicbrainz-track-pool-2026.json") as {
  tracks?: GeneratedFeedTrack[];
};

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

function getGeneratedArtworkUrl(track: GeneratedFeedTrack) {
  const localMediaBaseUrl = config.api.localMediaBaseUrl.trim();
  const rawArtwork = typeof track.artwork_url === "string" ? track.artwork_url.trim() : "";
  const filename = rawArtwork.split("/").pop();

  if (localMediaBaseUrl && filename) {
    return `${localMediaBaseUrl.replace(/\/$/, "")}/generated/track-artwork/${filename}`;
  }

  if (typeof track.source_artwork_url === "string" && track.source_artwork_url.trim().length > 0) {
    return track.source_artwork_url;
  }

  return track.artwork_url;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
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

export async function fetchGeneratedTracks() {
  await clearTrackCache();
  const localTracks = Array.isArray(generatedTrackPool.tracks) ? generatedTrackPool.tracks : [];
  if (localTracks.length === 0) {
    throw new Error("Generated track pool is empty or missing.");
  }

  const tracks = shuffle(localTracks)
    .slice(0, 128)
    .map<FeedTrack>((track) => ({
      ...track,
      artwork_url: getGeneratedArtworkUrl(track),
    }))
    .filter(hasArtwork);

  return {
    tracks,
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
