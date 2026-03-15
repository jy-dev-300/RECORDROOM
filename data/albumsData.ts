export type AlbumArtist = {
  name: string;
};

export type AlbumImage = {
  url: string;
  width: number;
  height: number;
};

export type Album = {
  id: string;
  name: string;
  artists: AlbumArtist[];
  images: AlbumImage[];
  release_date: string;
  total_tracks: number;
};

// This array is the UI-friendly source of truth for album data.
// Populate it from Spotify Web API album results as we wire the API in.
export const allAlbums: Album[] = [];

// Fast lookup table keyed by Spotify album id.
export const allAlbumsById: Map<string, Album> = new Map(
  allAlbums.map((album) => [album.id, album])
);
