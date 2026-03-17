import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { list } from "@vercel/blob";

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, "generated");
const DAILY_TRACKS_CACHE_KEY = "recordroom:daily-tracks-v1";
const DAILY_TRACKS_MANIFEST_KEY = "recordroom:daily-tracks-v1-manifest";

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

function parseBlobInfo(url) {
  const pathname = new URL(url).pathname.replace(/^\/+/, "");
  const parts = pathname.split("/");

  const trackArtworkIndex = parts.findIndex((part) => part === "track-artwork");
  if (trackArtworkIndex < 0) {
    return null;
  }

  const year = parts[trackArtworkIndex + 1];
  const namespace = parts[trackArtworkIndex + 2];
  const filename = parts[parts.length - 1];

  if (!year || !namespace || !filename) {
    return null;
  }

  return {
    year,
    namespace,
    filename,
  };
}

async function listAllBlobs() {
  let cursor;
  const blobs = [];

  do {
    const page = await list({
      cursor,
      limit: 1000,
      token: getBlobToken(),
    });

    if (Array.isArray(page.blobs)) {
      blobs.push(...page.blobs);
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return blobs;
}

function chooseNamespace(blobs) {
  const targetYear = String(getCurrentYear());
  const groups = new Map();

  for (const blob of blobs) {
    const info = parseBlobInfo(blob.url);
    if (!info || info.year !== targetYear) {
      continue;
    }

    const current = groups.get(info.namespace) ?? [];
    current.push({
      url: blob.url,
      pathname: blob.pathname,
      uploadedAt: blob.uploadedAt,
      filename: info.filename,
    });
    groups.set(info.namespace, current);
  }

  let bestNamespace = null;
  let bestItems = [];

  for (const [namespace, items] of groups.entries()) {
    if (items.length > bestItems.length) {
      bestNamespace = namespace;
      bestItems = items;
    }
  }

  if (!bestNamespace) {
    throw new Error("No current-year track-artwork blobs were found.");
  }

  return {
    namespace: bestNamespace,
    items: bestItems,
  };
}

async function main() {
  const { filePath, payload } = await readLocalPool();
  const sourceTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
  const blobs = await listAllBlobs();
  const { namespace, items } = chooseNamespace(blobs);
  const blobUrlByFilename = new Map(items.map((item) => [item.filename, item.url]));

  const publishedTracks = sourceTracks
    .map((track) => {
      const filename = path.basename(track.artwork_url);
      const blobUrl = blobUrlByFilename.get(filename);
      if (!blobUrl) {
        return null;
      }

      return {
        ...track,
        artwork_url: blobUrl,
        blob_artwork_url: blobUrl,
      };
    })
    .filter((track) => track != null);

  if (publishedTracks.length === 0) {
    throw new Error("No generated tracks matched the blobs in the chosen namespace.");
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
      source: "blob-recovery",
      poolFile: path.basename(filePath),
    }),
  ]);

  console.log(`Stored ${publishedTracks.length} published tracks in Redis`);
  console.log(`Recovered namespace: ${namespace}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
