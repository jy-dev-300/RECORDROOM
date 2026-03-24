import fs from "node:fs/promises";
import path from "node:path";
import type { FeedTrack } from "../../services/soundCloudRandomTracks";

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

type GeneratedTrackPool = {
  generatedAt?: string;
  tracks?: FeedTrack[];
};

const ROOT_DIR = process.cwd();
const RANDOM_TRACK_COUNT = 128;

function getCurrentYear() {
  return new Date().getFullYear();
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function sampleTracks(tracks: FeedTrack[], count: number) {
  if (tracks.length <= count) {
    return tracks;
  }

  return shuffle(tracks).slice(0, count);
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const filePath = path.join(ROOT_DIR, "generated", `musicbrainz-track-pool-${getCurrentYear()}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw) as GeneratedTrackPool;

    if (!Array.isArray(payload.tracks)) {
      res.status(500).json({ error: "Generated track pool is missing tracks." });
      return;
    }

    const sampledTracks = sampleTracks(payload.tracks, RANDOM_TRACK_COUNT);

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      tracks: sampledTracks,
      generatedAt: payload.generatedAt ?? null,
      totalPoolCount: payload.tracks.length,
      source: "generated",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generated track fetch failure";
    res.status(500).json({ error: message });
  }
}
