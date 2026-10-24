// Read-only Notion API client. Luna never calls a Notion endpoint that writes.

import { config } from '../config.js';
import { HttpError } from '../errors.js';

const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export class NotionError extends HttpError {
  constructor(status, message, code = 'notion_error') {
    super(status, message, code);
    this.name = 'NotionError';
  }
}

function friendly(status, body) {
  if (status === 401) return 'Notion didn’t accept the token. Check NOTION_TOKEN in .env.';
  if (status === 403) return 'The Notion integration doesn’t have permission to read that.';
  if (status === 404) return 'Notion couldn’t find it. Make sure the journal is shared with your integration (⋯ → Connections in Notion).';
  if (status === 429) return 'Notion is rate-limiting requests. Wait a moment and try again.';
  return `Notion returned an error (${status}${body?.code ? `: ${body.code}` : ''}).`;
}

export async function notion(path, { method = 'GET', body } = {}) {
  if (!config.notion.token) throw new NotionError(503, 'Notion isn’t connected yet.', 'notion_not_configured');
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Bearer ${config.notion.token}`,
        'notion-version': NOTION_VERSION,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new NotionError(502, err.name === 'TimeoutError' ? 'Notion took too long to respond.' : 'Couldn’t reach Notion.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new NotionError(res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502, friendly(res.status, data));
  }
  return res.json();
}

// Notion endpoints return at most 100 items per call; follow cursors up to a cap.
export async function paginate(fetchPage, maxPages = 10) {
  const results = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(cursor);
    results.push(...page.results);
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return results;
}
