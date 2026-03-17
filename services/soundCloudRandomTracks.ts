export type SoundCloudUser = {
  id: number;
  username?: string;
  followers_count?: number | null;
};

export type SoundCloudTrack = {
  id: number;
  title: string;
  duration: number;
  artwork_url?: string | null;
  genre?: string | null;
  tag_list?: string | null;
  playback_count?: number | null;
  likes_count?: number | null;
  comment_count?: number | null;
  reposts_count?: number | null;
  streamable: boolean;
  media?: {
    transcodings?: Array<{
      url: string;
      preset?: string;
      format?: {
        protocol?: string;
        mime_type?: string;
      };
    }>;
  };
  user?: SoundCloudUser;
};

export type FeedTrack = {
  id: number;
  title: string;
  artwork_url: string | null;
  duration: number;
  genre: string | null;
  likes_count: number;
  playback_count: number;
  release_year?: number | null;
  source?: {
    recording_id?: string;
    release_id?: string;
    release_title?: string | null;
    release_date?: string | null;
    year?: number | null;
  } | null;
  user: {
    id: number;
    username: string | null;
  } | null;
};

const SOUNDCLOUD_API_BASE = "https://api-v2.soundcloud.com";
const MAX_TRACKS_PER_CREATOR = 2;
const FETCH_PAGE_SIZE = 200;
const MAX_START_PAGE_HOPS = 6;

const SPAM_PATTERNS = [
  "buy beats",
  "free download",
  "type beat",
  "promo",
  "follow for follow",
  "click link",
  "snippet",
  "preview",
  "test",
  "untitled",
  "instrumental lease",
  "dm for collab",
  "exclusive beat",
];

type SoundCloudCollectionResponse = {
  collection?: SoundCloudTrack[];
  next_href?: string;
};

function getSoundCloudClientId() {
  const clientId =
    process.env.SOUNDCLOUD_CLIENT_ID ||
    process.env.EXPO_PUBLIC_SOUNDCLOUD_CLIENT_ID ||
    "";

  if (!clientId) {
    throw new Error(
      "Missing SoundCloud client ID. Set SOUNDCLOUD_CLIENT_ID or EXPO_PUBLIC_SOUNDCLOUD_CLIENT_ID."
    );
  }

  return clientId;
}

async function soundCloudFetch<T>(path: string, params: Record<string, string | number>) {
  const url = new URL(`${SOUNDCLOUD_API_BASE}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SoundCloud API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

async function soundCloudFetchByUrl<T>(urlString: string) {
  const url = new URL(urlString);
  if (!url.searchParams.has("client_id")) {
    url.searchParams.set("client_id", getSoundCloudClientId());
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SoundCloud API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export function isSpammy(track: SoundCloudTrack): boolean {
  const haystack = `${track.title} ${track.tag_list ?? ""}`.toLowerCase();
  return SPAM_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export function passesHardFilters(track: SoundCloudTrack): boolean {
  if (track.streamable !== true) return false;
  if (!track.artwork_url) return false;
  if (!track.media?.transcodings?.length) return false;
  if (track.duration < 90_000) return false;
  if (track.duration > 8 * 60_000) return false;
  if ((track.likes_count ?? 0) < 10) return false;
  if ((track.playback_count ?? 0) < 500) return false;
  return true;
}

export function scoreTrack(track: SoundCloudTrack): number {
  let score = 0;

  const likes = track.likes_count ?? 0;
  const plays = track.playback_count ?? 0;
  const comments = track.comment_count ?? 0;
  const reposts = track.reposts_count ?? 0;
  const followers = track.user?.followers_count ?? 0;

  if (likes >= 10) score += 2;
  if (likes >= 25) score += 2;
  if (likes >= 50) score += 2;
  if (likes >= 200) score += 1;

  if (plays >= 500) score += 2;
  if (plays >= 2_000) score += 2;
  if (plays >= 10_000) score += 1;

  if (comments >= 1) score += 1;
  if (comments >= 5) score += 1;

  if (reposts >= 1) score += 1;
  if (reposts >= 5) score += 1;

  if (followers >= 250) score += 1;
  if (followers >= 2_000) score += 2;

  if (track.genre && track.genre.trim().length > 0) score += 1;
  if (track.tag_list && track.tag_list.trim().length > 0) score += 1;

  if (track.duration >= 2 * 60_000 && track.duration <= 5 * 60_000) score += 1;

  return score;
}

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export function enforceArtistCap(tracks: SoundCloudTrack[], maxPerArtist: number): SoundCloudTrack[] {
  const perArtistCounts = new Map<number, number>();
  const capped: SoundCloudTrack[] = [];

  for (const track of tracks) {
    const artistId = track.user?.id;
    if (artistId == null) {
      capped.push(track);
      continue;
    }

    const artistCount = perArtistCounts.get(artistId) ?? 0;
    if (artistCount >= maxPerArtist) continue;

    perArtistCounts.set(artistId, artistCount + 1);
    capped.push(track);
  }

  return capped;
}

export function toFeedTrack(track: SoundCloudTrack): FeedTrack {
  return {
    id: track.id,
    title: track.title,
    artwork_url: track.artwork_url ?? null,
    duration: track.duration,
    genre: track.genre ?? null,
    likes_count: track.likes_count ?? 0,
    playback_count: track.playback_count ?? 0,
    user: track.user
      ? {
          id: track.user.id,
          username: track.user.username ?? null,
        }
      : null,
  };
}

async function fetchTrackPage(limit: number, nextHref?: string | null) {
  const payload = nextHref
    ? await soundCloudFetchByUrl<SoundCloudCollectionResponse>(nextHref)
    : await soundCloudFetch<SoundCloudCollectionResponse>("/tracks", {
    client_id: getSoundCloudClientId(),
    limit,
    linked_partitioning: 1,
  });

  return {
    collection: Array.isArray(payload.collection) ? payload.collection : [],
    nextHref: payload.next_href ?? null,
  };
}

export async function fetchCandidateTracks(batchSize: number): Promise<SoundCloudTrack[]> {
  const candidates: SoundCloudTrack[] = [];
  const startHops = Math.floor(Math.random() * (MAX_START_PAGE_HOPS + 1));
  let nextHref: string | null = null;

  for (let hop = 0; hop < startHops; hop += 1) {
    const page = await fetchTrackPage(FETCH_PAGE_SIZE, nextHref);
    nextHref = page.nextHref;
    if (!nextHref) {
      break;
    }
  }

  while (candidates.length < batchSize) {
    const remaining = Math.max(0, batchSize - candidates.length);
    const limit = Math.min(FETCH_PAGE_SIZE, remaining);
    const page = await fetchTrackPage(limit, nextHref);

    if (page.collection.length === 0) {
      break;
    }

    candidates.push(...page.collection);
    nextHref = page.nextHref;

    if (!nextHref) {
      break;
    }
  }

  return shuffle(candidates.slice(0, batchSize));
}

export async function getFilteredRandomTracks(targetCount = 128): Promise<FeedTrack[]> {
  const survivors: SoundCloudTrack[] = [];
  const seenTrackIds = new Set<number>();

  while (survivors.length < targetCount) {
    const candidates = await fetchCandidateTracks(500);

    for (const track of candidates) {
      if (seenTrackIds.has(track.id)) continue;
      seenTrackIds.add(track.id);

      if (!passesHardFilters(track)) continue;
      if (isSpammy(track)) continue;

      const score = scoreTrack(track);
      if (score < 8) continue;

      survivors.push(track);
    }

    if (seenTrackIds.size > 5000) break;
  }

  const shuffled = shuffle(survivors);
  const artistCapped = enforceArtistCap(shuffled, MAX_TRACKS_PER_CREATOR);

  return artistCapped.slice(0, targetCount).map(toFeedTrack);
}
