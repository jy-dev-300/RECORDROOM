import * as FileSystem from "../node_modules/expo/node_modules/expo-file-system/legacy";
import type { Album } from "../data/albumsData";
import type { CountryAlbumSection } from "./musicBrainzRandomAlbums";

type CachedAlbumsPayload = {
  countries: string[];
  countrySections: CountryAlbumSection[];
  allAlbums: Album[];
};

const CACHE_ROOT = `${FileSystem.documentDirectory ?? ""}recordroom-cache-country-v2/`;
const PAYLOAD_PATH = `${CACHE_ROOT}daily-albums.json`;
const IMAGE_CACHE_DIR = `${CACHE_ROOT}album-covers/`;
const PRIORITY_COVER_COUNT = 48;

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_");
}

async function ensureCacheDirectories() {
  await FileSystem.makeDirectoryAsync(CACHE_ROOT, { intermediates: true });
  await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
}

function getCachedImagePath(albumId: string) {
  return `${IMAGE_CACHE_DIR}${sanitizeFileName(albumId)}.jpg`;
}

function withCachedAlbumImages(payload: CachedAlbumsPayload) {
  const rewriteAlbum = (album: Album): Album => {
    const cachedPath = getCachedImagePath(album.id);
    return {
      ...album,
      images: album.images.map((image, index) =>
        index === 0
          ? {
              ...image,
              url: cachedPath,
            }
          : image
      ),
    };
  };

  return {
    countries: payload.countries,
    countrySections: payload.countrySections.map((section) => ({
      ...section,
      albums: section.albums.map(rewriteAlbum),
    })),
    allAlbums: payload.allAlbums.map(rewriteAlbum),
  };
}

async function fileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

export async function loadCachedDailyAlbums() {
  try {
    const exists = await fileExists(PAYLOAD_PATH);
    if (!exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(PAYLOAD_PATH);
    const payload = JSON.parse(raw) as CachedAlbumsPayload;
    return withCachedAlbumImages(payload);
  } catch {
    return null;
  }
}

export async function saveDailyAlbumsPayload(payload: CachedAlbumsPayload) {
  await ensureCacheDirectories();
  await FileSystem.writeAsStringAsync(PAYLOAD_PATH, JSON.stringify(payload));
}

async function downloadAlbumCover(album: Album) {
  const sourceUrl = album.images[0]?.url;
  if (!sourceUrl) return;

  const destination = getCachedImagePath(album.id);
  if (await fileExists(destination)) {
    return;
  }

  try {
    await FileSystem.downloadAsync(sourceUrl, destination);
  } catch {
    // Ignore cache download failures and keep remote URLs as fallback.
  }
}

export async function prefetchAlbumCoverCache(payload: CachedAlbumsPayload) {
  await ensureCacheDirectories();

  const seen = new Set<string>();
  const orderedAlbums = payload.allAlbums.filter((album) => {
    if (seen.has(album.id)) return false;
    seen.add(album.id);
    return true;
  });

  const priorityAlbums = orderedAlbums.slice(0, PRIORITY_COVER_COUNT);
  const remainingAlbums = orderedAlbums.slice(PRIORITY_COVER_COUNT);

  for (const album of priorityAlbums) {
    await downloadAlbumCover(album);
  }

  for (const album of remainingAlbums) {
    void downloadAlbumCover(album);
  }
}
