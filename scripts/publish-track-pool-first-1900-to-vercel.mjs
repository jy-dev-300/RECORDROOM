import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { put } from "@vercel/blob";

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, "generated");
const DAILY_TRACKS_CACHE_KEY = "recordroom:daily-tracks-v1";
const DAILY_TRACKS_MANIFEST_KEY = "recordroom:daily-tracks-v1-manifest";
const TRACK_LIMIT = 1900;

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });

function getCurrentYear() {
  return new Date().getFullYear();
}

function getRedisConfig() {
  const rawUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const envToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!rawUrl) {
    throw new Error(
      "Missing Redis REST credentials. Set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN."
    );
  }

  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error(
      `Redis REST URL must start with http:// or https://. Received ${parsedUrl.protocol}`
    );
  }
  const tokenFromUrl =
    parsedUrl.username || parsedUrl.password
      ? decodeURIComponent(parsedUrl.password || parsedUrl.username)
      : "";

  parsedUrl.username = "";
  parsedUrl.password = "";

  const token = envToken || tokenFromUrl;

  if (!token) {
    throw new Error(
      "Missing Redis REST token. Set KV_REST_API_TOKEN/UPSTASH_REDIS_REST_TOKEN or include credentials in the Redis REST URL."
    );
  }

  return {
    url: parsedUrl.toString().replace(/\/$/, ""),
    token,
  };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Redis command failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.result;
}

function getBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!token) {
    throw new Error("Missing BLOB_READ_WRITE_TOKEN.");
  }
  return token;
}

async function readLocalPool() {
  const filePath = path.join(GENERATED_DIR, `musicbrainz-track-pool-${getCurrentYear()}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return {
    filePath,
    payload: JSON.parse(raw),
  };
}

async function uploadArtwork(track, namespace) {
  const localArtworkPath = path.join(ROOT_DIR, track.artwork_url);
  const buffer = await fs.readFile(localArtworkPath);
  const filename = path.basename(localArtworkPath);
  const blobPath = `track-artwork/${getCurrentYear()}/${namespace}/${filename}`;

  const uploaded = await put(blobPath, buffer, {
    access: "public",
    addRandomSuffix: false,
    token: getBlobToken(),
    contentType: "image/jpeg",
  });

  return uploaded.url;
}

async function main() {
  const { filePath, payload } = await readLocalPool();
  const allTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  const sourceTracks = allTracks.slice(0, TRACK_LIMIT);
  const namespace = `${new Date().toISOString().replace(/[:.]/g, "-")}-first-${TRACK_LIMIT}`;

  console.log(`Publishing first ${sourceTracks.length} tracks from ${filePath}`);

  const publishedTracks = [];

  for (let index = 0; index < sourceTracks.length; index += 1) {
    const track = sourceTracks[index];
    const artworkUrl = await uploadArtwork(track, namespace);
    publishedTracks.push({
      ...track,
      artwork_url: artworkUrl,
      blob_artwork_url: artworkUrl,
    });

    if ((index + 1) % 100 === 0 || index + 1 === sourceTracks.length) {
      console.log(`Uploaded ${index + 1}/${sourceTracks.length} artwork files`);
    }
  }

  const generatedAt = new Date().toISOString();
  const redisPayload = {
    tracks: publishedTracks,
    generatedAt,
  };

  await redisCommand(["SET", DAILY_TRACKS_CACHE_KEY, JSON.stringify(redisPayload)]);
  await redisCommand([
    "SET",
    DAILY_TRACKS_MANIFEST_KEY,
    JSON.stringify({
      generatedAt,
      namespace,
      year: payload.year ?? getCurrentYear(),
      count: publishedTracks.length,
      subset: {
        first: TRACK_LIMIT,
      },
    }),
  ]);

  console.log(`Stored ${publishedTracks.length} published tracks in Redis`);
  console.log(`Blob namespace: ${namespace}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
