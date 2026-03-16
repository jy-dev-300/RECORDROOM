import type { FeedTrack } from "./soundCloudRandomTracks";

type StoredTracksPayload = {
  tracks: FeedTrack[];
  generatedAt: string;
};

const DAILY_TRACKS_CACHE_KEY = "recordroom:daily-tracks-v1";
const DAILY_TRACKS_LOCK_KEY = "recordroom:daily-tracks-v1-refresh-lock";
const DAILY_TRACKS_LOCK_TTL_SECONDS = 60 * 15;

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Redis REST credentials. Set KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN."
    );
  }

  return {
    url: url.replace(/\/$/, ""),
    token,
  };
}

async function redisCommand<T>(command: Array<string | number>) {
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

  const data = (await response.json()) as { result: T };
  return data.result;
}

export async function getStoredDailyTracks() {
  const value = await redisCommand<string | null>(["GET", DAILY_TRACKS_CACHE_KEY]);
  if (!value) {
    return null;
  }

  return JSON.parse(value) as StoredTracksPayload;
}

export async function setStoredDailyTracks(payload: StoredTracksPayload) {
  await redisCommand<string>(["SET", DAILY_TRACKS_CACHE_KEY, JSON.stringify(payload)]);
}

export async function acquireDailyTracksRefreshLock() {
  const result = await redisCommand<string | null>([
    "SET",
    DAILY_TRACKS_LOCK_KEY,
    Date.now().toString(),
    "NX",
    "EX",
    DAILY_TRACKS_LOCK_TTL_SECONDS,
  ]);

  return result === "OK";
}

export async function releaseDailyTracksRefreshLock() {
  await redisCommand<number>(["DEL", DAILY_TRACKS_LOCK_KEY]);
}

export type { StoredTracksPayload };
