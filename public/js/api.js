// Thin client for Luna's server. The browser never sees API keys —
// it only talks to these same-origin endpoints.

export class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body, { keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      keepalive,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new APIError('Can’t reach the Luna server. Is it running?', 0, 'offline');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new APIError(data.error || `Request failed (${res.status})`, res.status, data.code);
  return data;
}

const enc = encodeURIComponent;

export const api = {
  status: () => request('GET', '/api/status'),
  supportResources: () => request('GET', '/api/support/resources'),
  testAI: () => request('POST', '/api/ai/test'),

  entries: () => request('GET', '/api/entries'),

  createEntry: (data = {}) => request('POST', '/api/journal/entries', data),
  getEntry: (id) => request('GET', `/api/journal/entries/${enc(id)}`),
  updateEntry: (id, data, opts) => request('PUT', `/api/journal/entries/${enc(id)}`, data, opts),
  deleteEntry: (id) => request('DELETE', `/api/journal/entries/${enc(id)}`),

  notionDatabases: () => request('GET', '/api/notion/databases'),
  notionSelection: () => request('GET', '/api/notion/selection'),
  selectNotionDatabase: (databaseId) => request('PUT', '/api/notion/selection', { databaseId }),
  disconnectNotionDatabase: () => request('DELETE', '/api/notion/selection'),
  notionEntry: (id) => request('GET', `/api/notion/entries/${enc(id)}`),

  reflection: (source, id) => request('GET', `/api/reflections/${enc(source)}/${enc(id)}`),
  reflect: (source, id) => request('POST', `/api/reflections/${enc(source)}/${enc(id)}`),
  deleteAllReflections: () => request('DELETE', '/api/reflections'),
  themes: () => request('GET', '/api/insights/themes'),
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// "2026-10-12" → "Monday, October 12" (parsed as a local date, not UTC).
export function formatDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

export function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
