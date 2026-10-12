// Luna's own journal: entries written inside the app, stored as one JSON file
// per entry in data/journal/.

import { randomUUID } from 'node:crypto';
import { badRequest, notFound } from '../errors.js';
import { deleteRecord, isSafeId, listRecords, readRecord, writeRecord } from '../store.js';

const COLLECTION = 'journal';
const MAX_TITLE = 200;
const MAX_CONTENT = 50_000;
export const MOODS = ['great', 'good', 'okay', 'low', 'rough'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clean(input, existing = {}) {
  const out = { ...existing };
  if ('title' in input) {
    if (typeof input.title !== 'string') throw badRequest('Title must be text.');
    out.title = input.title.slice(0, MAX_TITLE);
  }
  if ('content' in input) {
    if (typeof input.content !== 'string') throw badRequest('Content must be text.');
    if (input.content.length > MAX_CONTENT) throw badRequest('That entry is too long to save (50,000 characters max).');
    out.content = input.content;
  }
  if ('mood' in input) {
    // Mood is self-reported only — Luna never assigns one.
    if (input.mood !== null && !MOODS.includes(input.mood)) throw badRequest('Unknown mood.');
    out.mood = input.mood;
  }
  if ('date' in input) {
    if (!DATE_RE.test(input.date ?? '')) throw badRequest('Date must look like YYYY-MM-DD.');
    out.date = input.date;
  }
  return out;
}

// The shape every journal source shares. `content` is omitted from lists.
export function toEntry(rec, { withContent = true } = {}) {
  const entry = {
    key: `luna:${rec.id}`,
    source: 'luna',
    id: rec.id,
    title: rec.title || 'Untitled',
    date: rec.date,
    mood: rec.mood ?? null,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
  if (withContent) entry.content = rec.content ?? '';
  return entry;
}

async function load(id) {
  const rec = isSafeId(id) ? await readRecord(COLLECTION, id) : null;
  if (!rec) throw notFound('That entry');
  return rec;
}

export async function listEntries() {
  const recs = await listRecords(COLLECTION);
  return recs.map((r) => toEntry(r, { withContent: false }));
}

export async function getEntry(id) {
  return toEntry(await load(id));
}

export async function createEntry(input = {}) {
  const now = new Date().toISOString();
  const rec = clean(input, { id: randomUUID(), title: '', content: '', mood: null, date: today(), createdAt: now });
  rec.updatedAt = now;
  await writeRecord(COLLECTION, rec.id, rec);
  return toEntry(rec);
}

export async function updateEntry(id, input = {}) {
  const rec = clean(input, await load(id));
  rec.updatedAt = new Date().toISOString();
  await writeRecord(COLLECTION, id, rec);
  return toEntry(rec);
}

export async function deleteEntry(id) {
  await load(id);
  await deleteRecord(COLLECTION, id);
}
