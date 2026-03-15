import { fetchRandomAlbumsByGenre } from "../../services/spotifyRandomAlbums";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

type RequestLike = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

function requireServerEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server env var: ${name}`);
  }
  return value;
}

function encodeBase64(value: string) {
  return Buffer.from(value).toString("base64");
}

async function getSpotifyAccessToken() {
  const clientId = requireServerEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireServerEnv("SPOTIFY_CLIENT_SECRET");

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBase64(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const market = typeof req.query.market === "string" ? req.query.market : process.env.EXPO_PUBLIC_SPOTIFY_MARKET || "US";
    const accessToken = await getSpotifyAccessToken();
    const result = await fetchRandomAlbumsByGenre(accessToken, market);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json({
      genres: result.genres,
      allAlbums: result.allAlbums,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Spotify fetch failure";
    res.status(500).json({ error: message });
  }
}
