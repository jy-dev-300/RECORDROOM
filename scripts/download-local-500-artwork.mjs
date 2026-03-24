import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, "generated");
const OUTPUT_DIR = path.join(ROOT_DIR, "localartork500quality");

function getCurrentYear() {
  return new Date().getFullYear();
}

async function readLocalPool() {
  const filePath = path.join(GENERATED_DIR, `musicbrainz-track-pool-${getCurrentYear()}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function getTrackFilename(track) {
  const artworkUrl = typeof track.artwork_url === "string" ? track.artwork_url : "";
  const basename = path.basename(artworkUrl);
  if (basename && basename.includes(".")) {
    return basename;
  }

  const releaseId = track?.source?.release_id;
  if (!releaseId) {
    throw new Error(`Track ${track?.id ?? "unknown"} is missing both artwork filename and release_id.`);
  }

  return `${releaseId}-${track.id}.jpg`;
}

function getSource500Url(track) {
  if (typeof track.source_artwork_url === "string" && track.source_artwork_url.trim()) {
    return track.source_artwork_url.replace(/front-250(?:\?.*)?$/i, "front-500");
  }

  const releaseId = track?.source?.release_id;
  if (!releaseId) {
    throw new Error(`Track ${track?.id ?? "unknown"} is missing source_artwork_url and release_id.`);
  }

  return `https://coverartarchive.org/release/${releaseId}/front-500`;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RECORDROOM-local-500-artwork-downloader/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
}

async function main() {
  await ensureOutputDir();
  const payload = await readLocalPool();
  const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];

    try {
      const filename = getTrackFilename(track);
      const destination = path.join(OUTPUT_DIR, filename);

      if (await fileExists(destination)) {
        skipped += 1;
      } else {
        await downloadFile(getSource500Url(track), destination);
        downloaded += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn(
        `Failed ${index + 1}/${tracks.length} for track ${track?.id ?? "unknown"}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if ((index + 1) % 100 === 0) {
      console.log(
        `Processed ${index + 1}/${tracks.length} | downloaded=${downloaded} skipped=${skipped} failed=${failed}`
      );
    }
  }

  console.log(`Done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
  console.log(`Output folder: ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
