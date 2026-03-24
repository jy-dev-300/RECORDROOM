import type { FeedTrack } from "../services/soundCloudRandomTracks";
import type { Stack as StackProject } from "../components/Stack";

export type TrackStack = {
  id: string;
  projects: StackProject[];
};

const STACK_COUNT = 32;
const TRACKS_PER_STACK = 4;
const STACKS_PER_SECTION = 1;

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

function hasArtwork(track: FeedTrack) {
  return typeof track.artwork_url === "string" && track.artwork_url.trim().length > 0;
}

function getReleaseYear(track: FeedTrack) {
  if (typeof track.release_year === "number") {
    return track.release_year;
  }

  const sourceYear = track.source?.year;
  if (typeof sourceYear === "number") {
    return sourceYear;
  }

  const releaseDate = track.source?.release_date;
  if (typeof releaseDate === "string") {
    const match = /^(\d{4})/.exec(releaseDate);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function distributeTracksAcrossStacks(tracks: FeedTrack[]) {
  const artworkTracks = tracks.filter(hasArtwork);
  if (artworkTracks.length === 0) {
    return [];
  }

  const stackCount = Math.min(STACK_COUNT, Math.ceil(artworkTracks.length / TRACKS_PER_STACK));
  const baseSize = Math.floor(artworkTracks.length / stackCount);
  const remainder = artworkTracks.length % stackCount;
  const groups: FeedTrack[][] = [];
  let cursor = 0;

  for (let index = 0; index < stackCount; index += 1) {
    const size = baseSize + (index < remainder ? 1 : 0);
    const group = artworkTracks.slice(cursor, cursor + size).slice(0, TRACKS_PER_STACK);
    cursor += size;
    if (group.length > 0) {
      groups.push(group);
    }
  }

  return groups;
}

function getTrackColor(trackId: number, layerIndex: number) {
  const seed = Array.from(String(trackId)).reduce((total, char) => total + char.charCodeAt(0), 0);
  const hue = (seed * 19 + layerIndex * 37) % 360;
  const saturation = clamp(68 + layerIndex * 5, 0, 100);
  const lightness = clamp(56 - layerIndex * 5, 0, 100);
  return hslToHex(hue, saturation, lightness);
}

export function createTrackStackFromTracks(tracks: FeedTrack[], stackIndex: number): TrackStack {
  return {
    id: `soundcloud-stack-${stackIndex}-${tracks.map((track) => track.id).join("-")}`,
    projects: tracks.map((track, cardIndex) => ({
      id: String(track.id),
      title: track.title,
      artistName: track.user?.username ?? null,
      releaseYear: getReleaseYear(track),
      releaseTitle: track.source?.release_title ?? null,
      media: track.artwork_url ?? "",
      thumbnail: track.artwork_url ?? undefined,
      previewFallback: track.artwork_url ?? undefined,
      type: "image" as const,
      color: getTrackColor(track.id, cardIndex),
    })),
  };
}

export function createTrackStacksFromTracks(tracks: FeedTrack[]) {
  return distributeTracksAcrossStacks(tracks)
    .map((trackGroup, stackIndex) => createTrackStackFromTracks(trackGroup, stackIndex));
}

export function createTrackStackSections(tracks: FeedTrack[]) {
  return chunkItems(createTrackStacksFromTracks(tracks), STACKS_PER_SECTION);
}

export const trackStacks: TrackStack[] = Array.from({ length: STACK_COUNT }, (_, stackIndex) => ({
  id: `track-stack-${stackIndex + 1}`,
  projects: Array.from({ length: TRACKS_PER_STACK }, (_, cardIndex) => {
    const topHue = (stackIndex * 137) % 360;
    return {
      id: `track-stack-${stackIndex + 1}-card-${cardIndex + 1}`,
      title: `Track Stack ${stackIndex + 1} Card ${cardIndex + 1}`,
      media: "",
      type: "image" as const,
      color:
        cardIndex === 0
          ? hslToHex(topHue, 92, 52)
          : hslToHex((topHue + 72 + cardIndex * 83) % 360, 82, 58),
    };
  }),
}));
