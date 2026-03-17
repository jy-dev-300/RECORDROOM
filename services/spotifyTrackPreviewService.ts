import { config } from "./config";

export type SpotifyTrackMatch = {
  id: string;
  name: string;
  uri: string;
  externalUrl: string;
  embedUrl: string;
  artistNames: string[];
  albumName: string | null;
  releaseDate: string | null;
};

type SpotifyTrackMatchResponse = {
  track: SpotifyTrackMatch;
};

function getApiUrl(path: string) {
  if (!config.api.baseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL. Point it at your Vercel deployment.");
  }

  return `${config.api.baseUrl.replace(/\/$/, "")}${path}`;
}

function assertSpotifyTrackMatchResponse(data: unknown): asserts data is SpotifyTrackMatchResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Spotify match response was not an object.");
  }

  const candidate = data as Partial<SpotifyTrackMatchResponse>;
  if (!candidate.track || typeof candidate.track !== "object") {
    throw new Error("Spotify match response is missing track.");
  }
}

export async function fetchSpotifyTrackMatch(params: {
  title: string;
  artistName?: string | null;
  releaseYear?: number | null;
}) {
  const url = new URL(getApiUrl("/api/spotify/search-track"));
  url.searchParams.set("title", params.title);
  if (params.artistName?.trim()) {
    url.searchParams.set("artistName", params.artistName.trim());
  }
  if (typeof params.releaseYear === "number") {
    url.searchParams.set("releaseYear", String(params.releaseYear));
  }

  const response = await fetch(url.toString());

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify match request failed (${response.status}): ${body}`);
  }

  const raw = await response.json();
  assertSpotifyTrackMatchResponse(raw);
  return raw.track;
}
