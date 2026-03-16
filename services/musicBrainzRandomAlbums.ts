import type { Album } from "../data/albumsData";
import { musicBrainzCountries } from "../data/musicBrainzCountries";

const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";
const RANDOM_COUNTRY_COUNT = 8;
const ALBUMS_PER_COUNTRY = 16;
const SEARCH_PAGE_SIZE = 50;
const MAX_OFFSET_STEPS = 5;
const COVER_ART_SIZE = 140;
const USER_AGENT = "RECORDROOM/1.0.0 ( https://recordroom.vercel.app )";
const MIN_REQUEST_INTERVAL_MS = 1100;

export type CountryAlbumSection = {
  country: string;
  albums: Album[];
};

type MusicBrainzArtistCredit = {
  name?: string;
  artist?: {
    name?: string;
  };
};

type MusicBrainzReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
};

type MusicBrainzRelease = {
  id: string;
  title: string;
  date?: string;
  country?: string;
  "artist-credit"?: MusicBrainzArtistCredit[];
  "release-group"?: MusicBrainzReleaseGroup;
};

type MusicBrainzReleaseSearchResponse = {
  count: number;
  releases: MusicBrainzRelease[];
};

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function sampleSize<T>(items: T[], count: number) {
  return shuffle(items).slice(0, count);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastMusicBrainzRequestAt = 0;
let musicBrainzRequestQueue: Promise<void> = Promise.resolve();

async function waitForMusicBrainzRateLimit() {
  const previous = musicBrainzRequestQueue;
  let release!: () => void;
  musicBrainzRequestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  const now = Date.now();
  const elapsed = now - lastMusicBrainzRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  lastMusicBrainzRequestAt = Date.now();
  release();
}

function buildCoverArtUrl(releaseGroupId: string) {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-${COVER_ART_SIZE}`;
}

function toAlbum(release: MusicBrainzRelease): Album | null {
  const releaseGroup = release["release-group"];
  if (!releaseGroup?.id) {
    return null;
  }

  return {
    id: releaseGroup.id,
    name: releaseGroup.title || release.title,
    artists:
      (release["artist-credit"] ?? releaseGroup["artist-credit"])?.map((credit) => ({
        name: credit.artist?.name || credit.name || "Unknown Artist",
      })) ?? [],
    images: [
      {
        url: buildCoverArtUrl(releaseGroup.id),
        width: COVER_ART_SIZE,
        height: COVER_ART_SIZE,
      },
    ],
    release_date: release.date || releaseGroup["first-release-date"] || "",
    total_tracks: 0,
  };
}

async function musicBrainzFetch<T>(path: string): Promise<T> {
  await waitForMusicBrainzRateLimit();

  const response = await fetch(`${MUSICBRAINZ_API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MusicBrainz API request failed for ${path} (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

function getCurrentYearDateRange() {
  const year = new Date().getFullYear();
  return {
    year,
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

async function fetchCountryAlbums(
  countryCode: string,
  excludedAlbumIds = new Set<string>()
) {
  const collected = new Map<string, Album>();
  let totalCount = Number.POSITIVE_INFINITY;
  const { start, end } = getCurrentYearDateRange();

  for (let step = 0; step < MAX_OFFSET_STEPS && collected.size < ALBUMS_PER_COUNTRY; step += 1) {
    const offsetBase = step * SEARCH_PAGE_SIZE;
    const randomOffset = offsetBase === 0 ? 0 : offsetBase + Math.floor(Math.random() * SEARCH_PAGE_SIZE);
    const query = encodeURIComponent(
      `primarytype:album AND country:${countryCode} AND date:[${start} TO ${end}]`
    );
    const response = await musicBrainzFetch<MusicBrainzReleaseSearchResponse>(
      `/release?query=${query}&fmt=json&limit=${SEARCH_PAGE_SIZE}&offset=${randomOffset}`
    );

    totalCount = response.count;

    for (const release of shuffle(response.releases ?? [])) {
      const album = toAlbum(release);
      if (!album?.id) continue;
      if (excludedAlbumIds.has(album.id) || collected.has(album.id)) continue;

      collected.set(album.id, album);
      if (collected.size >= ALBUMS_PER_COUNTRY) {
        break;
      }
    }

    if (offsetBase + SEARCH_PAGE_SIZE >= totalCount) {
      break;
    }
  }

  return [...collected.values()];
}

export async function fetchRandomAlbumsByCountry() {
  const selectedCountries = sampleSize([...musicBrainzCountries], RANDOM_COUNTRY_COUNT);
  const albumMap = new Map<string, Album>();
  const countrySections: CountryAlbumSection[] = [];

  for (let index = 0; index < selectedCountries.length; index += 1) {
    const country = selectedCountries[index];
    const countryAlbums = await fetchCountryAlbums(country.code, new Set(albumMap.keys()));
    countrySections.push({ country: country.name, albums: countryAlbums });
    countryAlbums.forEach((album) => {
      albumMap.set(album.id, album);
    });
  }

  const allAlbums = [...albumMap.values()].slice(0, RANDOM_COUNTRY_COUNT * ALBUMS_PER_COUNTRY);
  const allAlbumsById = new Map(allAlbums.map((album) => [album.id, album]));

  return {
    countries: selectedCountries.map((country) => country.name),
    countrySections,
    allAlbums,
    allAlbumsById,
  };
}
