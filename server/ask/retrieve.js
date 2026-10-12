// Simple, explainable retrieval for Ask Luna: date hints + keyword matching.
// No embeddings or vector store — just "which entries mention this, when".

import * as journal from '../journal/index.js';
import * as notionSource from '../notion/index.js';
import { config } from '../config.js';
import { getNotionDatabaseId } from '../settings.js';

export const MAX_ENTRIES = 6;
const MAX_NOTION_FETCH = 4;

const STOP = new Set(`a about after again all am an and any are as at be been before being but by can could did do does doing
during each ever for from had has have having he her here hers how i i'd i'll i'm i've if in into is it it's its just lately
luna me more most much my myself no nor not now of off often on once only or other our out over own really recently same she
should so some such tell than that the their them then there these they this those through time times to too under until up
very was we were what when where which while who why will with would you your yours entry entries journal wrote write written
show find did anything something things thing much many been going get got`.split(/\s+/));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() - n); return d; };

// "this week", "last month", "in september", "yesterday"… → { from, to } (inclusive ISO dates)
export function dateRange(question, now = new Date()) {
  const q = question.toLowerCase();
  if (/\btoday\b/.test(q)) return { from: iso(now), to: iso(now), label: 'today' };
  if (/\byesterday\b/.test(q)) return { from: iso(daysAgo(1, now)), to: iso(daysAgo(1, now)), label: 'yesterday' };
  if (/\blast week\b/.test(q)) return { from: iso(daysAgo(13, now)), to: iso(daysAgo(7, now)), label: 'last week' };
  if (/\bthis week\b|\bpast week\b|\bthe week\b/.test(q)) return { from: iso(daysAgo(6, now)), to: iso(now), label: 'the past week' };
  if (/\blast month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(start), to: iso(end), label: 'last month' };
  }
  if (/\bthis month\b|\bpast month\b/.test(q)) return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now), label: 'this month' };
  if (/\blately\b|\brecently\b|\bthese days\b/.test(q)) return { from: iso(daysAgo(13, now)), to: iso(now), label: 'the last two weeks' };
  const m = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(q));
  if (m >= 0) {
    // The most recent past (or current) occurrence of that month.
    const year = m > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
    return { from: iso(new Date(year, m, 1)), to: iso(new Date(year, m + 1, 0)), label: MONTHS[m] };
  }
  return null;
}

export function keywords(question) {
  return [...new Set(question.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !MONTHS.includes(w)))];
}

// Light stemming so "stressed" finds "stress" and "sleeping" finds "sleep".
const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/, '');

function score(entry, words) {
  if (!words.length) return 0;
  const title = entry.title.toLowerCase();
  const body = entry.content.toLowerCase();
  let total = 0;
  for (const w of words) {
    const root = stem(w);
    if (root.length < 3) continue;
    if (title.includes(root)) total += 3;
    total += Math.min(body.split(root).length - 1, 5);
  }
  return total;
}

const inRange = (e, range) => !range || (e.date >= range.from && e.date <= range.to);

async function notionCandidates(range, words) {
  if (!config.notion.token || !(await getNotionDatabaseId())) return [];
  try {
    const pages = (await notionSource.listEntries())
      .filter((p) => inRange(p, range))
      .filter((p) => range || words.some((w) => p.title.toLowerCase().includes(stem(w))))
      .slice(0, MAX_NOTION_FETCH);
    return await Promise.all(pages.map((p) => notionSource.getEntry(p.id)));
  } catch {
    return []; // Notion trouble shouldn't stop answers from the Luna journal.
  }
}

// Returns the few entries most relevant to a question, best first.
export async function retrieve(question, { now = new Date() } = {}) {
  const range = dateRange(question, now);
  const words = keywords(question);
  const pool = [...await journal.pagesWithText(), ...await notionCandidates(range, words)]
    .filter((e) => e.content.trim() && inRange(e, range));

  const ranked = pool
    .map((e) => ({ e, s: score(e, words) }))
    // With a date range, every entry in it counts; otherwise it must match.
    .filter(({ s }) => range || s > 0)
    .sort((a, b) => b.s - a.s || b.e.date.localeCompare(a.e.date))
    .slice(0, MAX_ENTRIES)
    .map(({ e }) => e);
  return { entries: ranked, range, words };
}
