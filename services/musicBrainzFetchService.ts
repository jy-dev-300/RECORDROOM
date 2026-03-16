import type { Album } from "../data/albumsData";
import { config } from "./config";
import type { CountryAlbumSection } from "./musicBrainzRandomAlbums";
import {
  loadCachedDailyAlbums,
  prefetchAlbumCoverCache,
  saveDailyAlbumsPayload,
} from "./deviceAlbumCache";

type RandomAlbumsByCountryResponse = {
  countries: string[];
  countrySections: CountryAlbumSection[];
  allAlbums: Album[];
};

function assertCountryResponse(data: unknown): asserts data is RandomAlbumsByCountryResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Country albums response was not an object.");
  }

  const candidate = data as Partial<RandomAlbumsByCountryResponse>;
  if (!Array.isArray(candidate.countries)) {
    throw new Error("Country albums response is missing countries.");
  }
  if (!Array.isArray(candidate.countrySections)) {
    throw new Error("Country albums response is missing countrySections.");
  }
  if (!Array.isArray(candidate.allAlbums)) {
    throw new Error("Country albums response is missing allAlbums.");
  }
}

function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

export async function fetchRandomAlbumsByCountry() {
  const response = await fetch(getApiUrl("/api/musicbrainz/random-albums"));

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Random albums request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertCountryResponse(raw);
  const data = raw;
  const allAlbumsById = new Map(data.allAlbums.map((album) => [album.id, album]));

  return {
    countries: data.countries,
    countrySections: data.countrySections,
    allAlbums: data.allAlbums,
    allAlbumsById,
  };
}

export async function loadCachedRandomAlbumsByCountry() {
  const payload = await loadCachedDailyAlbums();
  if (!payload) {
    return null;
  }

  if (!Array.isArray(payload.countries) || !Array.isArray(payload.countrySections) || !Array.isArray(payload.allAlbums)) {
    return null;
  }

  const allAlbumsById = new Map(payload.allAlbums.map((album) => [album.id, album]));
  return {
    countries: payload.countries,
    countrySections: payload.countrySections,
    allAlbums: payload.allAlbums,
    allAlbumsById,
  };
}

export async function cacheRandomAlbumsByCountry(payload: {
  countries: string[];
  countrySections: CountryAlbumSection[];
  allAlbums: Album[];
}) {
  await saveDailyAlbumsPayload(payload);
  void prefetchAlbumCoverCache(payload);
}
