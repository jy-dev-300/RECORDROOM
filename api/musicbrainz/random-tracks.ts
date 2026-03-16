import { fetchRandomMusicBrainzTracks } from "../../services/musicBrainzRandomTracks";

type RequestLike = {
  method?: string;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const tracks = await fetchRandomMusicBrainzTracks();

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Recordroom-Cache", "BYPASS");
    res.status(200).json({
      tracks,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz track fetch failure";
    res.status(500).json({ error: message });
  }
}
