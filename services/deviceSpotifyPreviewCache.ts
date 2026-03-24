import * as FileSystem from "../node_modules/expo/node_modules/expo-file-system/legacy";
import type { SpotifyTrackMatch } from "./spotifyTrackPreviewService";

type SpotifyPreviewCachePayload = {
  matches: Record<string, SpotifyTrackMatch | null>;
};

const SPOTIFY_PREVIEW_CACHE_ROOT = `${FileSystem.documentDirectory ?? ""}recordroom-spotify-preview-cache-v1/`;
const SPOTIFY_PREVIEW_CACHE_PATH = `${SPOTIFY_PREVIEW_CACHE_ROOT}spotify-preview-matches.json`;

async function ensureSpotifyPreviewCacheDirectory() {
  await FileSystem.makeDirectoryAsync(SPOTIFY_PREVIEW_CACHE_ROOT, { intermediates: true });
}

async function fileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

export async function loadSpotifyPreviewCache() {
  try {
    const exists = await fileExists(SPOTIFY_PREVIEW_CACHE_PATH);
    if (!exists) {
      return {};
    }

    const raw = await FileSystem.readAsStringAsync(SPOTIFY_PREVIEW_CACHE_PATH);
    const payload = JSON.parse(raw) as SpotifyPreviewCachePayload;
    return payload.matches ?? {};
  } catch {
    return {};
  }
}

export async function saveSpotifyPreviewCache(matches: Record<string, SpotifyTrackMatch | null>) {
  await ensureSpotifyPreviewCacheDirectory();
  await FileSystem.writeAsStringAsync(
    SPOTIFY_PREVIEW_CACHE_PATH,
    JSON.stringify({
      matches,
    })
  );
}
