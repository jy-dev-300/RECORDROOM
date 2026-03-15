import type { Album } from "../data/albumsData";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const RANDOM_GENRE_COUNT = 8;
const ALBUMS_PER_GENRE = 16;
const SEARCH_PAGE_SIZE = 50;
const MAX_SEARCH_OFFSET = 950;

export type GenreAlbumSection = {
  genre: string;
  albums: Album[];
};

type SpotifyImage = {
  url: string;
  width: number | null;
  height: number | null;
};

type SpotifyArtist = {
  name: string;
};

type SpotifyAlbum = {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  images: SpotifyImage[];
  release_date: string;
  total_tracks: number;
};

type SpotifyTrack = {
  album: SpotifyAlbum;
};

type SpotifySearchResponse = {
  tracks?: {
    items: SpotifyTrack[];
    total: number;
  };
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

function toAlbum(album: SpotifyAlbum): Album {
  return {
    id: album.id,
    name: album.name,
    artists: album.artists.map((artist) => ({ name: artist.name })),
    images: album.images
      .filter((image) => image.width != null && image.height != null)
      .map((image) => ({
        url: image.url,
        width: image.width ?? 0,
        height: image.height ?? 0,
      })),
    release_date: album.release_date,
    total_tracks: album.total_tracks,
  };
}

async function spotifyFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function fetchAvailableGenreSeeds(accessToken: string) {
  const response = await spotifyFetch<{ genres: string[] }>("/recommendations/available-genre-seeds", accessToken);
  return response.genres;
}

async function fetchGenreAlbums(
  accessToken: string,
  genre: string,
  market: string,
  excludedAlbumIds = new Set<string>()
) {
  const collected = new Map<string, Album>();
  const attemptedOffsets = new Set<number>();
  let totalTracks = Number.POSITIVE_INFINITY;

  while (
    collected.size < ALBUMS_PER_GENRE &&
    attemptedOffsets.size < 8 &&
    attemptedOffsets.size * SEARCH_PAGE_SIZE < totalTracks
  ) {
    const randomOffset = Math.max(
      0,
      Math.floor(Math.random() * Math.max(1, MAX_SEARCH_OFFSET / SEARCH_PAGE_SIZE)) * SEARCH_PAGE_SIZE
    );

    if (attemptedOffsets.has(randomOffset)) {
      continue;
    }
    attemptedOffsets.add(randomOffset);

    const query = encodeURIComponent(`genre:"${genre}"`);
    const search = await spotifyFetch<SpotifySearchResponse>(
      `/search?q=${query}&type=track&limit=${SEARCH_PAGE_SIZE}&offset=${randomOffset}&market=${market}`,
      accessToken
    );

    const trackPage = search.tracks;
    if (!trackPage) {
      break;
    }

    totalTracks = trackPage.total;

    for (const track of shuffle(trackPage.items)) {
      const album = track.album;
      if (!album?.id) continue;
      if (excludedAlbumIds.has(album.id) || collected.has(album.id)) continue;

      collected.set(album.id, toAlbum(album));
      if (collected.size >= ALBUMS_PER_GENRE) {
        break;
      }
    }
  }

  return [...collected.values()];
}

export async function fetchRandomAlbumsByGenre(accessToken: string, market: string) {
  const allGenres = await fetchAvailableGenreSeeds(accessToken);
  const selectedGenres = sampleSize(allGenres, RANDOM_GENRE_COUNT);
  const albumMap = new Map<string, Album>();
  const genreSections: GenreAlbumSection[] = [];

  for (const genre of selectedGenres) {
    const genreAlbums = await fetchGenreAlbums(accessToken, genre, market, new Set(albumMap.keys()));
    genreSections.push({ genre, albums: genreAlbums });
    genreAlbums.forEach((album) => {
      albumMap.set(album.id, album);
    });
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
