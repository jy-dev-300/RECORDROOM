import { fetchRandomAlbumsByGenre } from "../../services/musicBrainzRandomAlbums";

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
    const result = await fetchRandomAlbumsByGenre();

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json({
      genres: result.genres,
      genreSections: result.genreSections,
      allAlbums: result.allAlbums,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown MusicBrainz fetch failure";
    res.status(500).json({ error: message });
  }
}
