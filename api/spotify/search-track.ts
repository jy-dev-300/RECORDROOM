type RequestLike = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type SpotifySearchResponse = {
  tracks?: {
    items?: Array<{
      id: string;
      name: string;
      uri: string;
      external_urls?: {
        spotify?: string;
      };
      artists?: Array<{
        name?: string;
      }>;
      album?: {
        name?: string;
        release_date?: string;
      };
    }>;
  };
};

let spotifyAccessToken: string | null = null;
let spotifyAccessTokenExpiresAt = 0;

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getSpotifyCredentials() {
  const clientId = getEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getEnv("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

function readSingleQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function buildSearchQuery(title: string, artistName: string, releaseYear?: string) {
  const parts = [
    `track:${title}`,
    artistName ? `artist:${artistName}` : "",
    releaseYear ? `year:${releaseYear}` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

async function getSpotifyAccessToken() {
  if (spotifyAccessToken && Date.now() < spotifyAccessTokenExpiresAt) {
    return spotifyAccessToken;
  }

  const { clientId, clientSecret } = getSpotifyCredentials();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as SpotifyTokenResponse;
  spotifyAccessToken = payload.access_token;
  spotifyAccessTokenExpiresAt = Date.now() + Math.max(0, payload.expires_in - 60) * 1000;
  return spotifyAccessToken;
}

async function searchSpotifyTrack(title: string, artistName: string, releaseYear?: string) {
  const token = await getSpotifyAccessToken();
  const query = buildSearchQuery(title, artistName, releaseYear);
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "1");
  url.searchParams.set("market", "from_token");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify search failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as SpotifySearchResponse;
  return payload.tracks?.items?.[0] ?? null;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const title = readSingleQueryValue(req.query?.title).trim();
  const artistName = readSingleQueryValue(req.query?.artistName).trim();
  const releaseYear = readSingleQueryValue(req.query?.releaseYear).trim();

  if (!title) {
    res.status(400).json({ error: "Missing title query parameter." });
    return;
  }

  try {
    const match = await searchSpotifyTrack(title, artistName, releaseYear || undefined);

    if (!match) {
      res.status(404).json({ error: "No Spotify track match found." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      track: {
        id: match.id,
        name: match.name,
        uri: match.uri,
        externalUrl: match.external_urls?.spotify ?? `https://open.spotify.com/track/${match.id}`,
        embedUrl: `https://open.spotify.com/embed/track/${match.id}`,
        artistNames: (match.artists ?? []).map((artist) => artist.name).filter(Boolean),
        albumName: match.album?.name ?? null,
        releaseDate: match.album?.release_date ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Spotify search failure";
    res.status(500).json({ error: message });
  }
}
