import type { Album } from "./albumsData";
import type { StackProject } from "../screens/SingleAlbumStackScreen";

export type AlbumStack = {
  id: string;
  projects: StackProject[];
};

export type CountryAlbumSection = {
  country: string;
  albums: Album[];
};

const STACKS_PER_GENRE_SECTION = 16;
const ALBUMS_PER_STACK = 5;

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function getCardColor(stackIndex: number, cardIndex: number) {
  const topHue = (stackIndex * 137) % 360;
  const hue = (topHue + 72 + cardIndex * 83) % 360;
  const saturation = [88, 82, 90, 78, 86][cardIndex] ?? 84;
  const lightness = [52, 64, 42, 70, 34][cardIndex] ?? 56;
  return hslToHex(hue, saturation, lightness);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAlbumArt(album: Album) {
  return album.images[0]?.url ?? "";
}

function getAlbumDetailArt(album: Album) {
  const primary = getAlbumArt(album);
  if (/coverartarchive\.org\/release-group\/.+\/front-\d+$/i.test(primary)) {
    return primary.replace(/\/front-\d+$/i, "/front-500");
  }
  return primary;
}

function getAlbumTitle(album: Album) {
  const artistLabel = album.artists.map((artist) => artist.name).join(", ");
  return artistLabel ? `${album.name} - ${artistLabel}` : album.name;
}

function getAlbumColor(albumId: string, layerIndex: number) {
  const seed = Array.from(albumId).reduce((total, char) => total + char.charCodeAt(0), 0);
  const hue = (seed * 19 + layerIndex * 37) % 360;
  const saturation = clamp(68 + layerIndex * 4, 0, 100);
  const lightness = clamp(54 - layerIndex * 4, 0, 100);
  return hslToHex(hue, saturation, lightness);
}

function buildAlbumGroupsForSection(albums: Album[]) {
  if (albums.length === 0) {
    return [];
  }

  const groups: Album[][] = [];
  const maxAlbumsPerStack = Math.min(ALBUMS_PER_STACK, albums.length);
  const groupCount = Math.min(STACKS_PER_GENRE_SECTION, Math.ceil(albums.length / maxAlbumsPerStack));

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const start = groupIndex * maxAlbumsPerStack;
    const group = albums.slice(start, start + maxAlbumsPerStack);
    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

export function createAlbumStackFromAlbums(albums: Album[], stackIndex: number): AlbumStack {
  return {
    id: `musicbrainz-stack-${albums.map((album) => album.id).join("-")}`,
    projects: albums.map((album, cardIndex) => ({
      id: `${album.id}-card-${cardIndex + 1}`,
      title: getAlbumTitle(album),
      media: getAlbumDetailArt(album),
      thumbnail: getAlbumArt(album),
      type: "image" as const,
      color: getAlbumColor(album.id, cardIndex),
    })),
  };
}

export function createAlbumStacksFromCountrySections(countrySections: CountryAlbumSection[]) {
  return countrySections.flatMap((section, sectionIndex) =>
    buildAlbumGroupsForSection(section.albums).map((albumGroup, stackIndex) =>
      createAlbumStackFromAlbums(albumGroup, sectionIndex * 16 + stackIndex)
    )
  );
}

export function createAlbumStackSectionsFromCountrySections(countrySections: CountryAlbumSection[]) {
  return countrySections.map((section, sectionIndex) =>
    buildAlbumGroupsForSection(section.albums).map((albumGroup, stackIndex) =>
      createAlbumStackFromAlbums(albumGroup, sectionIndex * 16 + stackIndex)
    )
  );
}

export const albumStacks: AlbumStack[] = Array.from({ length: 128 }, (_, stackIndex) => ({
  id: `stack-${stackIndex + 1}`,
  projects: Array.from({ length: 5 }, (_, cardIndex) => {
    const topHue = (stackIndex * 137) % 360;
    return {
      id: `stack-${stackIndex + 1}-card-${cardIndex + 1}`,
      title: `Stack ${stackIndex + 1} Card ${cardIndex + 1}`,
      media: "",
      type: "image" as const,
      color:
        cardIndex === 0
          ? hslToHex(topHue, 92, 52)
          : getCardColor(stackIndex, cardIndex),
    };
  }),
}));

