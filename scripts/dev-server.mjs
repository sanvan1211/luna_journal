// Local dev server for Luna: serves the repo root on http://localhost:5173 with caching off,
// so edits to js/config.js and the rest of the app show up on a normal reload.
// No dependencies. Run with `npm run dev` (PORT=… to change the port).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  const send = (status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(body);
  };
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
    let file = join(ROOT, path);
    if (file !== ROOT.replace(/[\\/]$/, "") && !file.startsWith(ROOT)) return send(403, "Forbidden");
    // Never serve dotfiles (.env, .git, …) or local secrets.
    if (path.split(sep).some((p) => p.startsWith(".") || p.startsWith("secrets.local"))) return send(404, "Not found");
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file).catch(() => null);
    if (!body) return send(404, "Not found");
    send(200, body, TYPES[extname(file).toLowerCase()] || "application/octet-stream");
  } catch {
    send(400, "Bad request");
  }
}).listen(PORT, () => console.log(`Luna is running at http://localhost:${PORT} (caching off)`));
