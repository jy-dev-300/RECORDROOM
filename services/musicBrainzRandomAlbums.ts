import type { Album } from "../data/albumsData";
import { musicBrainzGenres } from "../data/musicBrainzGenres";

const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";
const RANDOM_GENRE_COUNT = 8;
const ALBUMS_PER_GENRE = 16;
const SEARCH_PAGE_SIZE = 50;
const MAX_OFFSET_STEPS = 3;
const REQUEST_DELAY_MS = 1100;
const COVER_ART_SIZE = 250;
const USER_AGENT = "RECORDROOM/1.0.0 ( https://recordroom.vercel.app )";

export type GenreAlbumSection = {
  genre: string;
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

type MusicBrainzReleaseGroupSearchResponse = {
  count: number;
  "release-groups": MusicBrainzReleaseGroup[];
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

function buildCoverArtUrl(releaseGroupId: string) {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-${COVER_ART_SIZE}`;
}

function toAlbum(releaseGroup: MusicBrainzReleaseGroup): Album {
  return {
    id: releaseGroup.id,
    name: releaseGroup.title,
    artists:
      releaseGroup["artist-credit"]?.map((credit) => ({
        name: credit.artist?.name || credit.name || "Unknown Artist",
      })) ?? [],
    images: [
      {
        url: buildCoverArtUrl(releaseGroup.id),
        width: COVER_ART_SIZE,
        height: COVER_ART_SIZE,
      },
    ],
    release_date: releaseGroup["first-release-date"] || "",
    total_tracks: 0,
  };
}

async function musicBrainzFetch<T>(path: string): Promise<T> {
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

async function fetchGenreAlbums(genre: string, excludedAlbumIds = new Set<string>()) {
  const collected = new Map<string, Album>();
  let totalCount = Number.POSITIVE_INFINITY;

  for (let step = 0; step < MAX_OFFSET_STEPS && collected.size < ALBUMS_PER_GENRE; step += 1) {
    const offsetBase = step * SEARCH_PAGE_SIZE;
    const randomOffset = offsetBase === 0 ? 0 : offsetBase + Math.floor(Math.random() * SEARCH_PAGE_SIZE);
    const query = encodeURIComponent(`primarytype:album AND tag:"${genre}"`);
    const response = await musicBrainzFetch<MusicBrainzReleaseGroupSearchResponse>(
      `/release-group?query=${query}&fmt=json&limit=${SEARCH_PAGE_SIZE}&offset=${randomOffset}`
    );

    totalCount = response.count;

    for (const releaseGroup of shuffle(response["release-groups"] ?? [])) {
      if (!releaseGroup?.id) continue;
      if (excludedAlbumIds.has(releaseGroup.id) || collected.has(releaseGroup.id)) continue;

      collected.set(releaseGroup.id, toAlbum(releaseGroup));
      if (collected.size >= ALBUMS_PER_GENRE) {
        break;
      }
    }

    if (offsetBase + SEARCH_PAGE_SIZE >= totalCount) {
      break;
    }

    await delay(REQUEST_DELAY_MS);
  }

  return [...collected.values()];
}

export async function fetchRandomAlbumsByGenre() {
  const selectedGenres = sampleSize([...musicBrainzGenres], RANDOM_GENRE_COUNT);
  const albumMap = new Map<string, Album>();
  const genreSections: GenreAlbumSection[] = [];

  for (let index = 0; index < selectedGenres.length; index += 1) {
    const genre = selectedGenres[index];
    const genreAlbums = await fetchGenreAlbums(genre, new Set(albumMap.keys()));
    genreSections.push({ genre, albums: genreAlbums });
    genreAlbums.forEach((album) => {
      albumMap.set(album.id, album);
    });

    if (index < selectedGenres.length - 1) {
      await delay(REQUEST_DELAY_MS);
    }
  }

  const allAlbums = [...albumMap.values()].slice(0, RANDOM_GENRE_COUNT * ALBUMS_PER_GENRE);
  const allAlbumsById = new Map(allAlbums.map((album) => [album.id, album]));

  return {
    genres: selectedGenres,
    genreSections,
    allAlbums,
    allAlbumsById,
  };
}
