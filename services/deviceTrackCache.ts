import * as FileSystem from "../node_modules/expo/node_modules/expo-file-system/legacy";
import type { FeedTrack } from "./soundCloudRandomTracks";

type CachedTracksPayload = {
  tracks: FeedTrack[];
};

const CACHE_ROOT = `${FileSystem.documentDirectory ?? ""}recordroom-cache-tracks-v1/`;
const PAYLOAD_PATH = `${CACHE_ROOT}daily-tracks.json`;
const IMAGE_CACHE_DIR = `${CACHE_ROOT}track-artwork/`;
const PRIORITY_ARTWORK_COUNT = 48;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function ensureCacheDirectories() {
  await FileSystem.makeDirectoryAsync(CACHE_ROOT, { intermediates: true });
  await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
}

function getCachedImagePath(trackId: number) {
  return `${IMAGE_CACHE_DIR}${sanitizeFileName(String(trackId))}.jpg`;
}

function withCachedTrackArtwork(payload: CachedTracksPayload): CachedTracksPayload {
  return {
    tracks: payload.tracks.map((track) => ({
      ...track,
      artwork_url: track.artwork_url ? getCachedImagePath(track.id) : null,
    })),
  };
}

async function fileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

export async function loadCachedDailyTracks() {
  try {
    const exists = await fileExists(PAYLOAD_PATH);
    if (!exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(PAYLOAD_PATH);
    const payload = JSON.parse(raw) as CachedTracksPayload;
    return withCachedTrackArtwork(payload);
  } catch {
    return null;
  }
}

export async function saveDailyTracksPayload(payload: CachedTracksPayload) {
  await ensureCacheDirectories();
  await FileSystem.writeAsStringAsync(PAYLOAD_PATH, JSON.stringify(payload));
}

async function downloadTrackArtwork(track: FeedTrack) {
  const sourceUrl = track.artwork_url;
  if (!sourceUrl) return;

  const destination = getCachedImagePath(track.id);
  if (await fileExists(destination)) {
    return;
  }

  try {
    await FileSystem.downloadAsync(sourceUrl, destination);
  } catch {
    // Ignore cache download failures and keep remote URLs as fallback.
  }
}

export async function prefetchTrackArtworkCache(payload: CachedTracksPayload) {
  await ensureCacheDirectories();

  const priorityTracks = payload.tracks.slice(0, PRIORITY_ARTWORK_COUNT);
  const remainingTracks = payload.tracks.slice(PRIORITY_ARTWORK_COUNT);

  for (const track of priorityTracks) {
    await downloadTrackArtwork(track);
  }

  for (const track of remainingTracks) {
    void downloadTrackArtwork(track);
  }
}
