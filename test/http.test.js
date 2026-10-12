import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'luna-http-'));
process.env.LUNA_DATA_DIR = dir;
const { createApp } = await import('../server/app.js');

let server;
let base;
before(async () => {
  server = createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const json = (path, { method = 'GET', body, headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));

test('status reports configuration without leaking secrets', async () => {
  const { status, data } = await json('/api/status');
  assert.equal(status, 200);
  assert.ok('configured' in data.ai);
  assert.ok(!JSON.stringify(data).match(/key|token/i));
});

test('journal pages can be created, edited, searched and trashed over HTTP', async () => {
  const created = await json('/api/journal/entries', { method: 'POST', body: { templateId: 'daily' } });
  assert.equal(created.status, 200);
  const { id, version } = created.data;

  const edited = await json(`/api/journal/entries/${id}`, {
    method: 'PUT',
    body: { title: 'Over HTTP', baseVersion: version, blocks: [{ type: 'paragraph', rich: [{ t: 'searchable words' }] }] },
  });
  assert.equal(edited.data.title, 'Over HTTP');

  const found = await json('/api/journal/search?q=searchable');
  assert.deepEqual(found.data.results.map((r) => r.entry.id), [id]);

  const stale = await json(`/api/journal/entries/${id}`, { method: 'PUT', body: { title: 'old tab', baseVersion: version } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.current.title, 'Over HTTP');

  assert.equal((await json(`/api/journal/entries/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await json(`/api/journal/entries/${id}`)).status, 404);
  assert.equal((await json(`/api/journal/trash/${id}/restore`, { method: 'POST' })).status, 200);
});

test('reflection without an AI provider is an honest 503, not fake output', async () => {
  const { data: e } = await json('/api/journal/entries', { method: 'POST', body: { blocks: [{ type: 'paragraph', rich: [{ t: 'hello' }] }] } });
  const res = await json(`/api/reflections/luna/${e.id}`, { method: 'POST' });
  assert.equal(res.status, 503);
  assert.equal(res.data.code, 'ai_not_configured');
});

test('cross-site requests and non-JSON bodies are refused', async () => {
  const cross = await json('/api/journal/entries', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  const form = await fetch(`${base}/api/journal/entries`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(form.status, 415);
});

test('unknown routes, wrong methods and bad ids', async () => {
  assert.equal((await json('/api/nope')).status, 404);
  assert.equal((await json('/api/entries', { method: 'PATCH' })).status, 405);
  assert.equal((await json('/api/journal/entries/..%2F..%2Fetc')).status, 404);
  assert.equal((await json('/api/reflections/other/abc')).status, 400);
});

test('static files are served, and paths outside public/ are not', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  const escape = await fetch(`${base}/%2e%2e/server/config.js`);
  assert.notEqual(escape.status, 200);
});
