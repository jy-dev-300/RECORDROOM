import type { FeedTrack } from "./soundCloudRandomTracks";

const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "RECORDROOM/1.0.0 ( https://recordroom.vercel.app )";
const MIN_REQUEST_INTERVAL_MS = 1100;
const SEARCH_PAGE_SIZE = 100;
const TARGET_TRACK_COUNT = 128;
const MAX_OFFSET_STEPS = 8;
const MAX_ARTIST_TRACKS = 2;
const COVER_ART_SIZE = 250;

type MusicBrainzArtistCredit = {
  name?: string;
  artist?: {
    id?: string;
    name?: string;
  };
};

type MusicBrainzReleaseSummary = {
  id: string;
  title?: string;
  date?: string;
};

type MusicBrainzRecording = {
  id: string;
  title: string;
  length?: number | null;
  "artist-credit"?: MusicBrainzArtistCredit[];
  releases?: MusicBrainzReleaseSummary[];
};

type MusicBrainzRecordingSearchResponse = {
  count: number;
  recordings?: MusicBrainzRecording[];
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function hashToPositiveInt(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function buildCoverArtUrl(releaseId: string) {
  return `https://coverartarchive.org/release/${releaseId}/front-${COVER_ART_SIZE}`;
}

function getArtistName(artistCredits?: MusicBrainzArtistCredit[]) {
  const names =
    artistCredits
      ?.map((credit) => credit.artist?.name || credit.name || "")
      .filter(Boolean) ?? [];

  return names.length > 0 ? names.join(", ") : null;
}

function getArtistId(artistCredits?: MusicBrainzArtistCredit[]) {
  const firstArtistId = artistCredits?.find((credit) => credit.artist?.id)?.artist?.id;
  if (!firstArtistId) {
    return null;
  }

  return hashToPositiveInt(firstArtistId);
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function getCurrentYearRelease(recording: MusicBrainzRecording) {
  const yearPrefix = `${getCurrentYear()}-`;
  return recording.releases?.find((release) => release.id && release.date?.startsWith(yearPrefix)) ?? null;
}

function toFeedTrack(recording: MusicBrainzRecording): FeedTrack | null {
  const release = getCurrentYearRelease(recording);
  if (!release?.id) {
    return null;
  }

  const duration = recording.length ?? 180_000;
  if (duration < 90_000 || duration > 8 * 60_000) {
    return null;
  }

  return {
    id: hashToPositiveInt(`${recording.id}:${release.id}`),
    title: recording.title,
    artwork_url: buildCoverArtUrl(release.id),
    duration,
    genre: null,
    likes_count: 0,
    playback_count: 0,
    user: {
      id: getArtistId(recording["artist-credit"]) ?? hashToPositiveInt(recording.id),
      username: getArtistName(recording["artist-credit"]),
    },
  };
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
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

function buildRecordingQuery() {
  const { start, end } = getCurrentYearDateRange();
  return encodeURIComponent(
    `primarytype:album AND status:official AND date:[${start} TO ${end}] AND dur:[90000 TO 480000]`
  );
}

export async function fetchRandomMusicBrainzTracks(targetCount = TARGET_TRACK_COUNT): Promise<FeedTrack[]> {
  const seenTrackIds = new Set<number>();
  const perArtistCounts = new Map<number, number>();
  const collected: FeedTrack[] = [];

  for (let step = 0; step < MAX_OFFSET_STEPS && collected.length < targetCount; step += 1) {
    const offsetBase = step * SEARCH_PAGE_SIZE;
    const randomOffset = offsetBase === 0 ? 0 : offsetBase + Math.floor(Math.random() * SEARCH_PAGE_SIZE);
    const query = buildRecordingQuery();
    const response = await musicBrainzFetch<MusicBrainzRecordingSearchResponse>(
      `/recording?query=${query}&fmt=json&limit=${SEARCH_PAGE_SIZE}&offset=${randomOffset}`
    );

    const recordings = shuffle(response.recordings ?? []);
    for (const recording of recordings) {
      const track = toFeedTrack(recording);
      if (!track) continue;
      if (seenTrackIds.has(track.id)) continue;

      const artistId = track.user?.id;
      if (artistId != null) {
        const artistCount = perArtistCounts.get(artistId) ?? 0;
        if (artistCount >= MAX_ARTIST_TRACKS) continue;
        perArtistCounts.set(artistId, artistCount + 1);
      }

      seenTrackIds.add(track.id);
      collected.push(track);

      if (collected.length >= targetCount) {
        break;
      }
    }

    if (offsetBase + SEARCH_PAGE_SIZE >= response.count) {
      break;
    }
  }

  return collected.slice(0, targetCount);
}
