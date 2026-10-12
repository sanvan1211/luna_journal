// Luna's own journal: Notion-style pages written inside the app, stored as one
// JSON file per entry in data/journal/.
//
// Record shape:
//   { id, title, icon, date, mood, tags[], blocks[], version,
//     createdAt, updatedAt, deletedAt }
// Older records stored a markdown `content` string; they're converted to
// blocks the first time they're read.

import { randomUUID } from 'node:crypto';
import { HttpError, badRequest, notFound } from '../errors.js';
import { deleteRecord, isSafeId, listRecords, readRecord, writeRecord } from '../store.js';
import { blocksToMarkdown, cleanBlocks, countWords, markdownToBlocks, plainText } from './blocks.js';
import { buildTemplate } from './templates.js';

const COLLECTION = 'journal';
const MAX_TITLE = 200;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const MAX_QUERY = 200;
export const MOODS = ['great', 'good', 'okay', 'low', 'rough'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) throw badRequest('Tags must be a list.');
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LEN);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  if (out.length > MAX_TAGS) throw badRequest(`An entry can have at most ${MAX_TAGS} tags.`);
  return out;
}

function cleanIcon(icon) {
  if (icon === null) return null;
  if (typeof icon !== 'string' || !icon.trim() || [...icon].length > 4 || /[<>\w]/.test(icon)) {
    throw badRequest('The icon should be a single emoji.');
  }
  return icon.trim();
}

function apply(input, rec) {
  const out = { ...rec };
  if ('title' in input) {
    if (typeof input.title !== 'string') throw badRequest('Title must be text.');
    out.title = input.title.replace(/\s+/g, ' ').slice(0, MAX_TITLE);
  }
  if ('blocks' in input) out.blocks = cleanBlocks(input.blocks);
  if ('mood' in input) {
    // Mood is self-reported only — Luna never assigns one.
    if (input.mood !== null && !MOODS.includes(input.mood)) throw badRequest('Unknown mood.');
    out.mood = input.mood;
  }
  if ('date' in input) {
    if (!DATE_RE.test(input.date ?? '')) throw badRequest('Date must look like YYYY-MM-DD.');
    out.date = input.date;
  }
  if ('tags' in input) out.tags = cleanTags(input.tags);
  if ('icon' in input) out.icon = cleanIcon(input.icon);
  return out;
}

// Brings any stored record up to the current shape.
function normalize(rec) {
  const out = { tags: [], icon: null, mood: null, version: 1, deletedAt: null, ...rec };
  if (!Array.isArray(out.blocks)) {
    out.blocks = markdownToBlocks(rec.content ?? '');
  }
  delete out.content;
  return out;
}

function excerpt(blocks, max = 140) {
  const text = blocks.map((b) => plainText(b.rich)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The shape every journal source shares. `content` (markdown) is what the AI
// and exports read; `blocks` is what the editor edits. Lists omit both.
export function toEntry(rec, { full = true } = {}) {
  const entry = {
    key: `luna:${rec.id}`,
    source: 'luna',
    id: rec.id,
    title: rec.title || 'Untitled',
    icon: rec.icon,
    date: rec.date,
    mood: rec.mood,
    tags: rec.tags,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    version: rec.version,
    wordCount: countWords(rec.blocks),
  };
  if (full) {
    entry.blocks = rec.blocks;
    entry.content = blocksToMarkdown(rec.blocks);
  } else {
    entry.excerpt = excerpt(rec.blocks);
  }
  if (rec.deletedAt) entry.deletedAt = rec.deletedAt;
  return entry;
}

async function load(id, { includeTrash = false } = {}) {
  const raw = isSafeId(id) ? await readRecord(COLLECTION, id) : null;
  const rec = raw && normalize(raw);
  if (!rec || (rec.deletedAt && !includeTrash)) throw notFound('That entry');
  return rec;
}

async function all() {
  return (await listRecords(COLLECTION)).map(normalize);
}

async function save(rec) {
  rec.updatedAt = new Date().toISOString();
  rec.version = (rec.version ?? 0) + 1;
  await writeRecord(COLLECTION, rec.id, rec);
  return rec;
}

// --- Entries ---------------------------------------------------------------------

export async function listEntries() {
  return (await all()).filter((r) => !r.deletedAt).map((r) => toEntry(r, { full: false }));
}

export async function getEntry(id) {
  return toEntry(await load(id));
}

export async function createEntry(input = {}) {
  const { templateId, ...fields } = input;
  const tpl = buildTemplate(typeof templateId === 'string' ? templateId : 'blank');
  const now = new Date().toISOString();
  const rec = apply(fields, {
    id: randomUUID(),
    title: '',
    icon: tpl.icon,
    date: today(),
    mood: null,
    tags: [],
    blocks: tpl.blocks,
    version: 0,
    createdAt: now,
    deletedAt: null,
  });
  return toEntry(await save(rec));
}

// `baseVersion` is the version the client started editing from. If someone
// else (another tab) saved in between, refuse rather than silently overwrite.
export async function updateEntry(id, input = {}) {
  const current = await load(id);
  if (Number.isInteger(input.baseVersion) && input.baseVersion !== current.version) {
    throw Object.assign(
      new HttpError(409, 'This entry was changed somewhere else (another tab?). Reload to see the latest version.', 'version_conflict'),
      { current: toEntry(current) },
    );
  }
  return toEntry(await save(apply(input, current)));
}

// --- Trash -------------------------------------------------------------------------

export async function trashEntry(id) {
  const rec = await load(id);
  rec.deletedAt = new Date().toISOString();
  await save(rec);
}

export async function listTrash() {
  return (await all())
    .filter((r) => r.deletedAt)
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .map((r) => toEntry(r, { full: false }));
}

export async function restoreEntry(id) {
  const rec = await load(id, { includeTrash: true });
  rec.deletedAt = null;
  return toEntry(await save(rec), { full: false });
}

// Permanent: the file is removed from disk.
export async function purgeEntry(id) {
  const rec = await load(id, { includeTrash: true });
  if (!rec.deletedAt) throw badRequest('Move the entry to the trash first.');
  await deleteRecord(COLLECTION, id);
  return rec;
}

export async function emptyTrash() {
  const trashed = (await all()).filter((r) => r.deletedAt);
  await Promise.all(trashed.map((r) => deleteRecord(COLLECTION, r.id)));
  return trashed;
}

// Everything in the Luna journal, for the user to keep (trash included, marked).
export async function exportAll() {
  return (await all())
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((r) => toEntry(r));
}

// --- Tags & search -------------------------------------------------------------------

export async function listTags() {
  const counts = new Map();
  for (const r of await all()) {
    if (r.deletedAt) continue;
    for (const tag of r.tags) {
      const key = tag.toLowerCase();
      const cur = counts.get(key) ?? { tag, count: 0 };
      cur.count++;
      counts.set(key, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function snippet(text, idx, len, radius = 60) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + len + radius);
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, idx),
    match: text.slice(idx, idx + len),
    after: text.slice(idx + len, end) + (end < text.length ? '…' : ''),
  };
}

// Simple, local full-text search over titles, tags and block text. Every word
// in the query must appear somewhere in the entry.
export async function searchEntries(query, { tag, limit = 30 } = {}) {
  const q = String(query ?? '');
  if (q.length > MAX_QUERY) throw badRequest(`Search is limited to ${MAX_QUERY} characters.`);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const tagKey = tag?.toLowerCase();
  const results = [];
  for (const r of await all()) {
    if (r.deletedAt) continue;
    if (tagKey && !r.tags.some((t) => t.toLowerCase() === tagKey)) continue;
    const title = (r.title || 'Untitled').toLowerCase();
    const body = r.blocks.map((b) => plainText(b.rich)).join('\n');
    const hay = `${title}\n${r.tags.join(' ').toLowerCase()}\n${body.toLowerCase()}`;
    if (!words.every((w) => hay.includes(w))) continue;

    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 10;
      score += Math.min(hay.split(w).length - 1, 10);
    }
    const first = words.length ? body.toLowerCase().indexOf(words[0]) : -1;
    results.push({
      entry: toEntry(r, { full: false }),
      score,
      snippet: first >= 0 ? snippet(body.replace(/\n/g, ' '), first, words[0].length) : null,
    });
  }
  return results
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, limit)
    .map(({ entry, snippet: s }) => ({ entry, snippet: s }));
}
