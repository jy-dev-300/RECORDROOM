import {
  getStoredDailyTracks,
} from "../../services/dailyTracksStore";

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
    const payload = await getStoredDailyTracks();
    if (!payload) {
      res.status(503).json({
        error: "Daily track payload is not published yet. Run the publish pipeline first.",
      });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Recordroom-Cache", "HIT");
    res.status(200).json({
      tracks: payload.tracks,
      generatedAt: payload.generatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz track fetch failure";
    res.status(500).json({ error: message });
  }
}
