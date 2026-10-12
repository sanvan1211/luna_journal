import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { log } from './log.js';
import { HttpError, badRequest } from './errors.js';
import { getAIStatus, complete, AIConfigError, AIProviderError } from './ai/index.js';
import { SUPPORT_RESOURCES } from './safety/resources.js';
import { getNotionDatabaseId, setNotionDatabaseId } from './settings.js';
import * as journal from './journal/index.js';
import { listTemplates } from './journal/templates.js';
import * as notionSource from './notion/index.js';
import { reflectOnEntry, getReflection, listReflections, deleteReflection, deleteAllReflections } from './insights/reflect.js';
import { recurringThemes } from './insights/themes.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_BODY_BYTES = 256 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

// --- Helpers ----------------------------------------------------------------

// Loads one entry with content from whichever source it belongs to.
async function loadEntry(source, id) {
  if (source === 'luna') return journal.getEntry(id);
  if (source === 'notion') return notionSource.getEntry(id);
  throw badRequest('Unknown journal source.');
}

// All entries (metadata only) across sources. A Notion failure doesn't hide
// the Luna journal; it's reported alongside.
async function allEntries() {
  const luna = await journal.listEntries();
  const notion = { connected: Boolean(config.notion.token), databaseSelected: false, error: null, count: 0 };
  let notionEntries = [];
  if (notion.connected && (await getNotionDatabaseId())) {
    notion.databaseSelected = true;
    try {
      notionEntries = await notionSource.listEntries();
      notion.count = notionEntries.length;
    } catch (err) {
      notion.error = err.message;
    }
  }
  const entries = [...luna, ...notionEntries].sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return { entries, sources: { luna: { count: luna.length }, notion } };
}

// --- API routes -------------------------------------------------------------

const routes = [
  ['GET', '/api/status', async () => ({
    ai: getAIStatus(),
    notion: {
      configured: Boolean(config.notion.token),
      databaseSelected: Boolean(await getNotionDatabaseId()),
    },
  })],

  ['GET', '/api/support/resources', () => SUPPORT_RESOURCES],

  // Confirms the AI provider works end to end. Sends no journal content.
  ['POST', '/api/ai/test', async () => {
    const started = Date.now();
    const result = await complete({
      system: 'You are a connectivity check. Reply with exactly one word: ready',
      messages: [{ role: 'user', content: 'Status check.' }],
      maxTokens: 32,
    });
    return { ok: true, provider: result.provider, model: result.model, latencyMs: Date.now() - started };
  }],

  ['GET', '/api/entries', () => allEntries()],

  // Luna journal
  ['GET', '/api/journal/templates', () => ({ templates: listTemplates() })],
  ['GET', '/api/journal/tags', async () => ({ tags: await journal.listTags() })],
  ['GET', '/api/journal/search', async ({ query }) => ({
    results: await journal.searchEntries(query.get('q') ?? '', { tag: query.get('tag') || undefined }),
  })],
  ['POST', '/api/journal/entries', ({ body }) => journal.createEntry(body)],
  ['GET', '/api/journal/entries/:id', ({ params }) => journal.getEntry(params.id)],
  ['PUT', '/api/journal/entries/:id', ({ params, body }) => journal.updateEntry(params.id, body)],
  // Moves to the trash; reflections stay until the entry is deleted for good.
  ['DELETE', '/api/journal/entries/:id', async ({ params }) => {
    await journal.trashEntry(params.id);
    return { ok: true };
  }],
  ['GET', '/api/journal/trash', async () => ({ entries: await journal.listTrash() })],
  ['POST', '/api/journal/trash/:id/restore', ({ params }) => journal.restoreEntry(params.id)],
  ['DELETE', '/api/journal/trash/:id', async ({ params }) => {
    const rec = await journal.purgeEntry(params.id);
    await deleteReflection({ source: 'luna', id: rec.id });
    return { ok: true };
  }],
  ['DELETE', '/api/journal/trash', async () => {
    const purged = await journal.emptyTrash();
    await Promise.all(purged.map((r) => deleteReflection({ source: 'luna', id: r.id })));
    return { ok: true, deleted: purged.length };
  }],

  // Notion
  ['GET', '/api/notion/databases', async () => ({ databases: await notionSource.listDatabases() })],
  ['GET', '/api/notion/selection', async () => ({ database: await notionSource.getSelectedDatabase() })],
  ['PUT', '/api/notion/selection', async ({ body }) => {
    const db = await notionSource.validateDatabase(body.databaseId);
    await setNotionDatabaseId(db.id);
    return { database: db };
  }],
  ['DELETE', '/api/notion/selection', async () => {
    await setNotionDatabaseId(null);
    notionSource.clearCache();
    return { ok: true };
  }],
  ['GET', '/api/notion/entries/:id', ({ params }) => notionSource.getEntry(params.id)],

  // Reflections & insights
  ['GET', '/api/reflections/:source/:id', async ({ params }) => {
    const entry = await loadEntry(params.source, params.id);
    const reflection = await getReflection(entry);
    return { reflection, stale: Boolean(reflection && reflection.entryUpdatedAt !== entry.updatedAt) };
  }],
  ['POST', '/api/reflections/:source/:id', async ({ params }) =>
    reflectOnEntry(await loadEntry(params.source, params.id))],
  ['DELETE', '/api/reflections', async () => {
    await deleteAllReflections();
    return { ok: true };
  }],
  ['GET', '/api/insights/themes', async () => ({ themes: recurringThemes(await listReflections()) })],
].map(([method, pattern, handler]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
  return { method, re, keys, handler };
});

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return ''; }
};

function matchRoute(method, path) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, safeDecode(m[i + 1])]));
    return { handler: r.handler, params };
  }
  return { pathMatched };
}

// --- Request checks ---------------------------------------------------------
// Luna listens on localhost, but any website open in the same browser could
// still send requests to it. These checks stop that:
//  - Host must be the address Luna is served on (blocks DNS-rebinding tricks).
//  - A cross-site Origin is refused outright.
//  - Bodies must be JSON, which browsers can't send cross-site without a
//    CORS preflight that Luna never approves.

const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
const OPEN_HOSTS = ['0.0.0.0', '::'];

function allowedHost(host) {
  if (!host) return false;
  // HOST=0.0.0.0 means the user chose to serve Luna on their network.
  if (OPEN_HOSTS.includes(config.host)) return true;
  const names = new Set([...LOOPBACK, config.host]);
  return [...names].some((name) => host === name || host.startsWith(`${name}:`));
}

function checkRequest(req) {
  const host = req.headers.host;
  if (!allowedHost(host)) throw new HttpError(403, 'Unexpected Host header.', 'bad_host');
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
    throw new HttpError(403, 'Cross-site requests aren’t allowed.', 'cross_site');
  }
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || 'transfer-encoding' in req.headers;
  if (hasBody && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Send request bodies as application/json.', 'bad_content_type');
  }
}

// --- Plumbing ---------------------------------------------------------------

function sendJSON(res, status, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJSONBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw badRequest('Invalid JSON body');
  }
}

async function handleAPI(req, res, path, query) {
  const route = matchRoute(req.method, path);
  if (!route.handler) return sendJSON(res, route.pathMatched ? 405 : 404, { error: route.pathMatched ? 'Method not allowed' : 'Not found' });
  try {
    checkRequest(req);
    const body = req.method === 'GET' ? {} : await readJSONBody(req);
    sendJSON(res, 200, await route.handler({ req, body, params: route.params, query }));
  } catch (err) {
    if (err instanceof AIConfigError) return sendJSON(res, 503, { error: err.message, code: 'ai_not_configured' });
    if (err instanceof AIProviderError) {
      log.error(`AI request failed on ${path}`, err);
      return sendJSON(res, 502, { error: err.message, code: 'ai_provider_error' });
    }
    if (err instanceof HttpError) {
      if (err.status >= 500) log.error(`Upstream error on ${path}`, err);
      return sendJSON(res, err.status, { error: err.message, code: err.code, ...(err.current ? { current: err.current } : {}) });
    }
    log.error(`Unhandled error on ${path}`, err);
    sendJSON(res, 500, { error: 'Something went wrong on Luna’s side.' });
  }
}

async function serveStatic(res, path) {
  // Every non-file route falls back to the SPA shell; the client router handles it.
  const rel = path === '/' || !extname(path) ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, '');
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || file.split(sep).includes('..')) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

// Builds the HTTP server without starting it, so tests can run it on any port.
export function createApp() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) {
      await handleAPI(req, res, pathname, searchParams);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(res, pathname);
    } else {
      res.writeHead(405).end();
    }
    log.request(req.method, pathname, res.statusCode, Date.now() - started);
  });
}
