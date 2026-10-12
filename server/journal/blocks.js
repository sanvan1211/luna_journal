// Notion-style block model for Luna journal entries.
//
// An entry body is a flat list of blocks. Nesting (list children, toggle
// contents) is expressed with `indent`, which keeps storage and editing simple:
// a toggle "contains" the blocks after it with a greater indent.
//
//   { id, type, rich: [{ t, b?, i?, c?, s?, u? }], indent, checked?, collapsed? }
//
// `rich` is inline text with annotations: bold, italic, code, strike, underline.

import { randomBytes } from 'node:crypto';
import { badRequest } from '../errors.js';

export const BLOCK_TYPES = [
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'quote',
  'callout',
  'code',
  'divider',
];

const MARKS = ['b', 'i', 'c', 's', 'u'];
const MAX_BLOCKS = 2000;
const MAX_BLOCK_CHARS = 10_000;
export const MAX_TOTAL_CHARS = 50_000;
const MAX_INDENT = 4;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export const newBlockId = () => randomBytes(6).toString('base64url');

export function block(type, text = '', extra = {}) {
  return { id: newBlockId(), type, rich: text ? [{ t: text }] : [], indent: 0, ...extra };
}

// --- Validation ---------------------------------------------------------------

function cleanRich(rich) {
  if (!Array.isArray(rich)) return [];
  const out = [];
  for (const seg of rich) {
    if (!seg || typeof seg.t !== 'string' || !seg.t) continue;
    const clean = { t: seg.t.replace(/\r\n?/g, '\n') };
    for (const m of MARKS) if (seg[m]) clean[m] = 1;
    // Merge with the previous segment when the marks match.
    const prev = out[out.length - 1];
    if (prev && MARKS.every((m) => !prev[m] === !clean[m])) prev.t += clean.t;
    else out.push(clean);
  }
  return out;
}

export const plainText = (rich) => rich.map((s) => s.t).join('');

// Sanitizes untrusted blocks from the client. Unknown fields are dropped,
// bad ids are replaced, and limits are enforced.
export function cleanBlocks(input) {
  if (!Array.isArray(input)) throw badRequest('Blocks must be a list.');
  if (input.length > MAX_BLOCKS) throw badRequest(`An entry can have at most ${MAX_BLOCKS} blocks.`);
  const seen = new Set();
  let total = 0;
  const out = input.map((raw) => {
    if (!raw || !BLOCK_TYPES.includes(raw.type)) throw badRequest('Unknown block type.');
    let id = typeof raw.id === 'string' && ID_RE.test(raw.id) && !seen.has(raw.id) ? raw.id : newBlockId();
    while (seen.has(id)) id = newBlockId();
    seen.add(id);

    const b = { id, type: raw.type, rich: raw.type === 'divider' ? [] : cleanRich(raw.rich), indent: 0 };
    const indent = Number.isInteger(raw.indent) ? raw.indent : 0;
    b.indent = Math.max(0, Math.min(MAX_INDENT, indent));
    if (b.type === 'to_do') b.checked = raw.checked === true;
    if (b.type === 'toggle') b.collapsed = raw.collapsed === true;

    const len = plainText(b.rich).length;
    if (len > MAX_BLOCK_CHARS) throw badRequest('One of the blocks is too long.');
    total += len;
    return b;
  });
  if (total > MAX_TOTAL_CHARS) throw badRequest('That entry is too long to save (50,000 characters max).');
  return out;
}

// --- Blocks → Markdown (for AI, export, and the shared entry shape) -----------

function inlineToMarkdown(rich) {
  return rich.map(({ t, b, i, c, s }) => {
    if (c) return `\`${t}\``;
    let out = t;
    if (s) out = `~~${out}~~`;
    if (i) out = `*${out}*`;
    if (b) out = `**${out}**`;
    return out;
  }).join('');
}

export function blocksToMarkdown(blocks) {
  const lines = [];
  const counters = [];
  for (const blk of blocks) {
    const pad = '  '.repeat(blk.indent);
    const text = inlineToMarkdown(blk.rich);
    counters.length = blk.indent + 1;
    if (blk.type === 'numbered_list_item') counters[blk.indent] = (counters[blk.indent] ?? 0) + 1;
    else counters[blk.indent] = 0;

    switch (blk.type) {
      case 'heading_1': lines.push(`# ${text}`); break;
      case 'heading_2': lines.push(`## ${text}`); break;
      case 'heading_3': lines.push(`### ${text}`); break;
      case 'bulleted_list_item': lines.push(`${pad}- ${text}`); break;
      case 'numbered_list_item': lines.push(`${pad}${counters[blk.indent]}. ${text}`); break;
      case 'to_do': lines.push(`${pad}- [${blk.checked ? 'x' : ' '}] ${text}`); break;
      case 'toggle': lines.push(`${pad}- ${text}`); break;
      case 'quote':
      case 'callout': lines.push(`${pad}> ${text}`); break;
      case 'code': lines.push('```', plainText(blk.rich), '```'); break;
      case 'divider': lines.push('---'); break;
      default: lines.push(text ? `${pad}${text}` : '');
    }
  }
  // Collapse runs of blank lines.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- Markdown → blocks (migrating old entries, pasting text) -------------------

const INLINE_RE = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*)/g;

export function inlineFromMarkdown(text) {
  const rich = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) rich.push({ t: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) rich.push({ t: tok.slice(2, -2), b: 1 });
    else if (tok.startsWith('~~')) rich.push({ t: tok.slice(2, -2), s: 1 });
    else if (tok.startsWith('`')) rich.push({ t: tok.slice(1, -1), c: 1 });
    else rich.push({ t: tok.slice(1, -1), i: 1 });
    last = m.index + tok.length;
  }
  if (last < text.length) rich.push({ t: text.slice(last) });
  return cleanRich(rich);
}

export function markdownToBlocks(md) {
  const blocks = [];
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    if (raw.trim() === '```') {
      const code = [];
      while (++n < lines.length && lines[n].trim() !== '```') code.push(lines[n]);
      blocks.push(block('code', code.join('\n')));
      continue;
    }
    if (!raw.trim()) continue;
    const indent = Math.min(MAX_INDENT, Math.floor((raw.match(/^ */)[0].length) / 2));
    const line = raw.trim();
    const add = (type, text, extra = {}) =>
      blocks.push({ id: newBlockId(), type, rich: inlineFromMarkdown(text), indent, ...extra });
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) add(`heading_${m[1].length}`, m[2]);
    else if (/^(-{3,}|\*{3,})$/.test(line)) blocks.push(block('divider'));
    else if ((m = /^[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line))) add('to_do', m[2], { checked: m[1] !== ' ' });
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) add('bulleted_list_item', m[1]);
    else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) add('numbered_list_item', m[1]);
    else if ((m = /^>\s?(.*)$/.exec(line))) add('quote', m[1]);
    else add('paragraph', line);
  }
  return blocks;
}

export const countWords = (blocks) =>
  blocks.reduce((n, b) => n + (plainText(b.rich).match(/\S+/g)?.length ?? 0), 0);
