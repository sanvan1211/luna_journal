// Notion as a journal source. Notion stays the source of truth: Luna lists
// pages from the one database the user selected and reads them on demand.
// Nothing is written back, and page content isn't persisted by Luna.

import { getNotionDatabaseId } from '../settings.js';
import { NotionError, notion, paginate } from './client.js';

const ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const LIST_TTL_MS = 60_000;
const MAX_BLOCK_DEPTH = 2;

export const isNotionId = (id) => typeof id === 'string' && ID_RE.test(id);
const bare = (id) => id.replace(/-/g, '').toLowerCase();
const plain = (richText = []) => richText.map((t) => t.plain_text).join('');

// Short-lived in-memory list cache so the dashboard and journal page don't
// each hit Notion. Titles and dates only — never entry bodies.
let listCache = null;

export async function listDatabases() {
  const results = await paginate(
    (cursor) => notion('/search', {
      method: 'POST',
      body: { filter: { property: 'object', value: 'database' }, page_size: 100, start_cursor: cursor },
    }),
    3,
  );
  return results.map((db) => ({
    id: db.id,
    title: plain(db.title) || 'Untitled database',
    url: db.url,
    lastEditedAt: db.last_edited_time,
    hasDateProperty: Object.values(db.properties ?? {}).some((p) => p.type === 'date'),
  }));
}

export async function validateDatabase(id) {
  if (!isNotionId(id)) throw new NotionError(400, 'That doesn’t look like a Notion database ID.', 'bad_request');
  const db = await notion(`/databases/${id}`);
  listCache = null;
  return { id: db.id, title: plain(db.title) || 'Untitled database' };
}

export async function getSelectedDatabase() {
  const id = await getNotionDatabaseId();
  if (!id) return null;
  const db = await notion(`/databases/${id}`);
  return { id: db.id, title: plain(db.title) || 'Untitled database', url: db.url };
}

function pageTitle(page) {
  const prop = Object.values(page.properties ?? {}).find((p) => p.type === 'title');
  return plain(prop?.title) || 'Untitled';
}

// Prefer the journal's own date property; fall back to when the page was made.
function pageDate(page) {
  const prop = Object.values(page.properties ?? {}).find((p) => p.type === 'date' && p.date?.start);
  return (prop?.date.start ?? page.created_time).slice(0, 10);
}

function toEntry(page) {
  return {
    key: `notion:${page.id}`,
    source: 'notion',
    id: page.id,
    title: pageTitle(page),
    date: pageDate(page),
    mood: null,
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
    url: page.url,
  };
}

export async function listEntries() {
  const dbId = await getNotionDatabaseId();
  if (!dbId) return [];
  if (listCache && listCache.dbId === dbId && Date.now() - listCache.at < LIST_TTL_MS) return listCache.entries;

  const pages = await paginate((cursor) => notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: { page_size: 100, start_cursor: cursor, sorts: [{ timestamp: 'created_time', direction: 'descending' }] },
  }), 5);
  const entries = pages.filter((p) => !p.archived && !p.in_trash).map(toEntry);
  listCache = { dbId, at: Date.now(), entries };
  return entries;
}

export function clearCache() {
  listCache = null;
}

// --- Page content → markdown ------------------------------------------------

const PREFIX = {
  heading_1: '# ',
  heading_2: '## ',
  heading_3: '### ',
  bulleted_list_item: '- ',
  numbered_list_item: '1. ',
  quote: '> ',
  callout: '> ',
  toggle: '- ',
};

export function blockToMarkdown(block) {
  const data = block[block.type];
  if (block.type === 'divider') return '---';
  if (block.type === 'to_do') return `- [${data.checked ? 'x' : ' '}] ${plain(data.rich_text)}`;
  if (block.type === 'code') return `\`\`\`\n${plain(data.rich_text)}\n\`\`\``;
  if (block.type === 'paragraph') return plain(data.rich_text);
  if (block.type in PREFIX) return PREFIX[block.type] + plain(data.rich_text);
  return null; // images, embeds, databases, etc. aren't journal text
}

async function readBlocks(blockId, depth = 0) {
  const blocks = await paginate((cursor) =>
    notion(`/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`));
  const lines = [];
  for (const block of blocks) {
    const md = blockToMarkdown(block);
    if (md !== null) lines.push('  '.repeat(depth) + md);
    if (block.has_children && depth < MAX_BLOCK_DEPTH && md !== null) {
      lines.push(...await readBlocks(block.id, depth + 1));
    }
  }
  return lines;
}

export async function getEntry(pageId) {
  if (!isNotionId(pageId)) throw new NotionError(400, 'That doesn’t look like a Notion page ID.', 'bad_request');
  const dbId = await getNotionDatabaseId();
  if (!dbId) throw new NotionError(409, 'Choose a journal database first.', 'notion_no_database');

  const page = await notion(`/pages/${pageId}`);
  // Only read pages that belong to the selected journal, even if the
  // integration can see more of the workspace.
  if (page.parent?.type !== 'database_id' || bare(page.parent.database_id) !== bare(dbId)) {
    throw new NotionError(403, 'That page isn’t part of your selected journal.', 'notion_wrong_database');
  }
  const lines = await readBlocks(page.id);
  return { ...toEntry(page), content: lines.join('\n') };
}
