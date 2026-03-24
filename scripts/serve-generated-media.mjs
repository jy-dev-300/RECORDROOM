import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT_DIR, "generated");
const ARTWORK_DIR = path.join(GENERATED_DIR, "track-artwork");
const PORT = Number(process.env.GENERATED_MEDIA_PORT || 8787);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    sendJson(res, 404, { error: "File not found." });
  });

  res.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-store",
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname.startsWith("/generated/track-artwork/")) {
    const filename = path.basename(url.pathname);
    if (!/^[\w.-]+$/.test(filename)) {
      sendJson(res, 400, { error: "Invalid filename." });
      return;
    }

    const filePath = path.join(ARTWORK_DIR, filename);
    sendFile(res, filePath);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Generated media server listening on http://0.0.0.0:${PORT}`);
});
