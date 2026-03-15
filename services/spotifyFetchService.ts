import type { Album } from "../data/albumsData";
import { config } from "./config";

type RandomAlbumsResponse = {
  genres: string[];
  allAlbums: Album[];
};

function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

export async function fetchRandomAlbumsByGenre() {
  const response = await fetch(
    getApiUrl(`/api/spotify/random-albums?market=${encodeURIComponent(config.spotify.market)}`)
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Random albums request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as RandomAlbumsResponse;
  const allAlbumsById = new Map(data.allAlbums.map((album) => [album.id, album]));

  return {
    genres: data.genres,
    allAlbums: data.allAlbums,
    allAlbumsById,
  };
}
