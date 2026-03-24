import fs from "node:fs/promises";
import path from "node:path";

type RequestLike = {
  method?: string;
  query?: {
    file?: string | string[];
  };
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (statusCode: number) => ResponseLike;
  end: (body?: unknown) => void;
};

const ROOT_DIR = process.cwd();
const ARTWORK_DIR = path.join(ROOT_DIR, "generated", "track-artwork");

function sendJson(res: ResponseLike, statusCode: number, body: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(statusCode).end(JSON.stringify(body));
}

function getRequestedFilename(req: RequestLike) {
  const file = req.query?.file;
  const raw = Array.isArray(file) ? file[0] : file;
  if (!raw) return null;
  const name = path.basename(raw);
  if (!/^[\w.-]+$/.test(name)) return null;
  return name;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const filename = getRequestedFilename(req);
  if (!filename) {
    sendJson(res, 400, { error: "Missing or invalid file query parameter." });
    return;
  }

  const filePath = path.join(ARTWORK_DIR, filename);

  try {
    const bytes = await fs.readFile(filePath);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).end(bytes);
  } catch (error) {
    if ((error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      sendJson(res, 404, { error: "Artwork file not found." });
      return;
    }

    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unknown local artwork error." });
  }
}
