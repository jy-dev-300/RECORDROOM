import fs from "node:fs/promises";
import path from "node:path";

const MUSICBRAINZ_API_BASE = "https://musicbrainz.org/ws/2";
const COVER_ART_ARCHIVE_BASE = "https://coverartarchive.org";
const USER_AGENT = "RECORDROOM/1.0.0 ( https://recordroom.vercel.app )";
const MIN_REQUEST_INTERVAL_MS = 1100;
const SEARCH_PAGE_SIZE = 100;
const TARGET_TRACK_COUNT = 3840;
const MAX_OFFSET_STEPS = 240;
const COVER_ART_SIZE = 250;
const MAX_ARTIST_TRACKS = 2;

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, "generated");
const ARTWORK_DIR = path.join(GENERATED_DIR, "track-artwork");

let lastMusicBrainzRequestAt = 0;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDirectories() {
  await fs.mkdir(ARTWORK_DIR, { recursive: true });
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function getCurrentYearDateRange() {
  const year = getCurrentYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

async function waitForMusicBrainzRateLimit() {
  const now = Date.now();
  const elapsed = now - lastMusicBrainzRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastMusicBrainzRequestAt = Date.now();
}

async function musicBrainzFetch(pathname) {
  await waitForMusicBrainzRateLimit();

  const response = await fetch(`${MUSICBRAINZ_API_BASE}${pathname}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MusicBrainz API request failed for ${pathname} (${response.status}): ${body}`);
  }

  return response.json();
}

function buildRecordingQuery() {
  const { start, end } = getCurrentYearDateRange();
  return encodeURIComponent(
    `(primarytype:album OR primarytype:single OR primarytype:ep) AND status:official AND date:[${start} TO ${end}] AND dur:[90000 TO 480000]`
  );
}

function normalizeForDedupe(value) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashToPositiveInt(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function getArtistName(artistCredits) {
  const names =
    artistCredits
      ?.map((credit) => credit.artist?.name || credit.name || "")
      .filter(Boolean) ?? [];

  return names.length > 0 ? names.join(", ") : null;
}

function getArtistId(artistCredits, recordingId) {
  const firstArtistId = artistCredits?.find((credit) => credit.artist?.id)?.artist?.id;
  return firstArtistId ? hashToPositiveInt(firstArtistId) : hashToPositiveInt(recordingId);
}

function getCurrentYearRelease(recording) {
  const yearPrefix = `${getCurrentYear()}-`;
  return recording.releases?.find((release) => release.id && release.date?.startsWith(yearPrefix)) ?? null;
}

function getTrackSignature(recording) {
  const title = normalizeForDedupe(recording.title);
  const artist = normalizeForDedupe(getArtistName(recording["artist-credit"]));
  return `${artist}::${title}`;
}

function getAlbumSignature(recording, release) {
  const artist = normalizeForDedupe(getArtistName(recording["artist-credit"]));
  const releaseTitle = normalizeForDedupe(release.title);
  return `${artist}::${releaseTitle}`;
}

function buildCoverArtUrl(releaseId) {
  return `${COVER_ART_ARCHIVE_BASE}/release/${releaseId}/front-${COVER_ART_SIZE}`;
}

function getArtworkFileName(releaseId, trackId) {
  return `${releaseId}-${trackId}.jpg`;
}

async function downloadArtwork(artworkUrl, destinationPath) {
  try {
    const response = await fetch(artworkUrl, {
      headers: {
        Accept: "image/*",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return false;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1024) {
      return false;
    }

    await fs.writeFile(destinationPath, bytes);
    return true;
  } catch {
    return false;
  }
}

function toStoredTrack(recording, release, artworkFileName) {
  const duration = recording.length ?? 180_000;
  return {
    id: hashToPositiveInt(`${recording.id}:${release.id}`),
    title: recording.title,
    artwork_url: `generated/track-artwork/${artworkFileName}`.replace(/\\/g, "/"),
    source_artwork_url: buildCoverArtUrl(release.id),
    duration,
    genre: null,
    likes_count: 0,
    playback_count: 0,
    user: {
      id: getArtistId(recording["artist-credit"], recording.id),
      username: getArtistName(recording["artist-credit"]),
    },
    source: {
      recording_id: recording.id,
      release_id: release.id,
      release_title: release.title ?? null,
      release_date: release.date ?? null,
      year: getCurrentYear(),
    },
  };
}

async function writeOutput(tracks, meta) {
  await ensureDirectories();
  const outputPath = path.join(GENERATED_DIR, `musicbrainz-track-pool-${getCurrentYear()}.json`);
  const payload = {
    generatedAt: new Date().toISOString(),
    year: getCurrentYear(),
    count: tracks.length,
    meta,
    tracks,
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  return outputPath;
}

async function main() {
  await ensureDirectories();

  const query = buildRecordingQuery();
  const collected = [];
  const seenTrackIds = new Set();
  const seenReleaseIds = new Set();
  const seenTrackSignatures = new Set();
  const seenAlbumSignatures = new Set();
  const seenArtworkUrls = new Set();
  const perArtistCounts = new Map();

  let totalCandidatesSeen = 0;
  let totalArtworkFailures = 0;
  let lastKnownCount = Number.POSITIVE_INFINITY;

  for (let step = 0; step < MAX_OFFSET_STEPS && collected.length < TARGET_TRACK_COUNT; step += 1) {
    const offset = step * SEARCH_PAGE_SIZE;
    const response = await musicBrainzFetch(
      `/recording?query=${query}&fmt=json&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`
    );

    const recordings = Array.isArray(response.recordings) ? response.recordings : [];
    lastKnownCount = typeof response.count === "number" ? response.count : lastKnownCount;

    if (recordings.length === 0) {
      break;
    }

    for (const recording of recordings) {
      totalCandidatesSeen += 1;
      const release = getCurrentYearRelease(recording);
      if (!release?.id) continue;
      if (seenReleaseIds.has(release.id)) continue;

      const trackSignature = getTrackSignature(recording);
      if (trackSignature && seenTrackSignatures.has(trackSignature)) continue;

      const albumSignature = getAlbumSignature(recording, release);
      if (albumSignature && seenAlbumSignatures.has(albumSignature)) continue;

      const trackId = hashToPositiveInt(`${recording.id}:${release.id}`);
      if (seenTrackIds.has(trackId)) continue;

      const artworkUrl = buildCoverArtUrl(release.id);
      if (seenArtworkUrls.has(artworkUrl)) continue;

      const artistId = getArtistId(recording["artist-credit"], recording.id);
      const artistCount = perArtistCounts.get(artistId) ?? 0;
      if (artistCount >= MAX_ARTIST_TRACKS) continue;

      const artworkFileName = getArtworkFileName(release.id, trackId);
      const artworkPath = path.join(ARTWORK_DIR, artworkFileName);
      const downloadSucceeded = await downloadArtwork(artworkUrl, artworkPath);

      if (!downloadSucceeded) {
        totalArtworkFailures += 1;
        continue;
      }

      seenTrackIds.add(trackId);
      seenReleaseIds.add(release.id);
      seenArtworkUrls.add(artworkUrl);
      if (trackSignature) {
        seenTrackSignatures.add(trackSignature);
      }
      if (albumSignature) {
        seenAlbumSignatures.add(albumSignature);
      }
      perArtistCounts.set(artistId, artistCount + 1);

      collected.push(toStoredTrack(recording, release, artworkFileName));

      if (collected.length % 100 === 0) {
        console.log(
          `Collected ${collected.length}/${TARGET_TRACK_COUNT} tracks after ${totalCandidatesSeen} candidates`
        );
      }

      if (collected.length >= TARGET_TRACK_COUNT) {
        break;
      }
    }

    if (offset + SEARCH_PAGE_SIZE >= lastKnownCount) {
      break;
    }
  }

  const outputPath = await writeOutput(collected, {
    targetCount: TARGET_TRACK_COUNT,
    totalCandidatesSeen,
    totalArtworkFailures,
    requestPagesVisited: Math.min(MAX_OFFSET_STEPS, Math.ceil(Math.max(0, totalCandidatesSeen) / SEARCH_PAGE_SIZE)),
    maxArtistTracks: MAX_ARTIST_TRACKS,
    dedupe: {
      byTrackId: true,
      byReleaseId: true,
      byTrackSignature: true,
      byAlbumSignature: true,
      byArtworkUrl: true,
    },
  });

  console.log(`Saved ${collected.length} tracks to ${outputPath}`);
  console.log(`Artwork files saved under ${ARTWORK_DIR}`);

  if (collected.length < TARGET_TRACK_COUNT) {
    console.warn(
      `Only generated ${collected.length} tracks out of ${TARGET_TRACK_COUNT}. Increase MAX_OFFSET_STEPS or relax filters if needed.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
