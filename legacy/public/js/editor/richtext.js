// Converting between the stored inline format — [{ t, b?, i?, c?, s?, u? }] —
// and the HTML inside each contenteditable block, plus caret utilities.

import { esc } from '../api.js';

const MARKS = ['b', 'i', 'c', 's', 'u'];
const TAG_MARK = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', CODE: 'c', S: 's', STRIKE: 's', DEL: 's', U: 'u' };

export function richToHTML(rich) {
  return rich.map((seg) => {
    let html = esc(seg.t);
    if (seg.c) html = `<code>${html}</code>`;
    if (seg.u) html = `<u>${html}</u>`;
    if (seg.s) html = `<s>${html}</s>`;
    if (seg.i) html = `<em>${html}</em>`;
    if (seg.b) html = `<strong>${html}</strong>`;
    return html;
  }).join('');
}

export function normalizeRich(rich) {
  const out = [];
  for (const seg of rich) {
    if (!seg.t) continue;
    const prev = out[out.length - 1];
    if (prev && MARKS.every((m) => !prev[m] === !seg[m])) prev.t += seg.t;
    else out.push({ ...seg });
  }
  return out;
}

// Reads whatever the browser put in the block (including pasted or
// execCommand markup) back into plain segments. Unknown tags keep their text
// but contribute no formatting, so nothing unexpected survives.
export function domToRich(root) {
  const out = [];
  const walk = (node, marks) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.data) out.push({ t: child.data, ...marks });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          // Browsers leave a trailing <br> in emptied blocks; it isn't content.
          if (child !== root.lastChild) out.push({ t: '\n', ...marks });
          continue;
        }
        const mark = TAG_MARK[child.tagName];
        walk(child, mark ? { ...marks, [mark]: 1 } : marks);
      }
    }
  };
  walk(root, {});
  return normalizeRich(out);
}

export const richText = (rich) => rich.map((s) => s.t).join('');
export const richLength = (rich) => rich.reduce((n, s) => n + s.t.length, 0);

export function splitRich(rich, offset) {
  const left = [];
  const right = [];
  let pos = 0;
  for (const seg of rich) {
    const end = pos + seg.t.length;
    if (end <= offset) left.push({ ...seg });
    else if (pos >= offset) right.push({ ...seg });
    else {
      left.push({ ...seg, t: seg.t.slice(0, offset - pos) });
      right.push({ ...seg, t: seg.t.slice(offset - pos) });
    }
    pos = end;
  }
  return [normalizeRich(left), normalizeRich(right)];
}

// Removes `count` characters starting at `start`.
export function deleteRange(rich, start, count) {
  const [left, rest] = splitRich(rich, start);
  const [, right] = splitRich(rest, count);
  return normalizeRich([...left, ...right]);
}

// --- Caret -------------------------------------------------------------------------

// Character offset of the caret (or selection start) within `el`.
export function getCaret(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length, collapsed: range.collapsed };
}

export function setCaret(el, offset) {
  const sel = window.getSelection();
  const range = document.createRange();
  let remaining = offset === 'end' ? Infinity : Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  let last = null;
  while ((node = walker.nextNode())) {
    last = node;
    if (remaining <= node.data.length) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= node.data.length;
  }
  if (last) range.setStart(last, last.data.length);
  else range.setStart(el, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// True when the caret sits on the first / last visual line of `el`, which is
// when ArrowUp / ArrowDown should move to the neighbouring block.
export function caretOnEdgeLine(el, edge) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(edge === 'top');
  const rects = range.getClientRects();
  const rect = rects.length ? rects[0] : null;
  if (!rect || (!rect.height && !rect.top)) return true;
  const box = el.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return edge === 'top' ? rect.top - box.top < line * 0.75 : box.bottom - rect.bottom < line * 0.75;
}

export function setSelection(el, start, end) {
  if (start === end) return setCaret(el, start);
  const sel = window.getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node;
  let startSet = false;
  while ((node = walker.nextNode())) {
    const next = pos + node.data.length;
    if (!startSet && start <= next) { range.setStart(node, start - pos); startSet = true; }
    if (startSet && end <= next) { range.setEnd(node, end - pos); break; }
    pos = next;
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// Adds a mark to [start, end), or removes it if the whole range already has it.
export function toggleMark(rich, start, end, mark) {
  const [left, rest] = splitRich(rich, start);
  const [mid, right] = splitRich(rest, end - start);
  const has = mid.length && mid.every((s) => s[mark]);
  const changed = mid.map((s) => {
    const copy = { ...s };
    if (has) delete copy[mark]; else copy[mark] = 1;
    return copy;
  });
  return normalizeRich([...left, ...changed, ...right]);
}

// --- Markdown lines (for paste) -------------------------------------------------

const INLINE_RE = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*)/g;

export function inlineMarkdown(text) {
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
  return normalizeRich(rich);
}

// One pasted line → { type, rich, indent, checked? }
export function parseMarkdownLine(raw) {
  const indent = Math.min(4, Math.floor(raw.match(/^ */)[0].length / 2));
  const line = raw.trim();
  let m;
  if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) return { type: `heading_${m[1].length}`, rich: inlineMarkdown(m[2]), indent };
  if (/^(-{3,}|\*{3,})$/.test(line)) return { type: 'divider', rich: [], indent };
  if ((m = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line))) return { type: 'to_do', rich: inlineMarkdown(m[2]), indent, checked: m[1] !== ' ' };
  if ((m = /^[-*+]\s+(.*)$/.exec(line))) return { type: 'bulleted_list_item', rich: inlineMarkdown(m[1]), indent };
  if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) return { type: 'numbered_list_item', rich: inlineMarkdown(m[1]), indent };
  if ((m = /^>\s?(.*)$/.exec(line))) return { type: 'quote', rich: inlineMarkdown(m[1]), indent };
  return { type: 'paragraph', rich: inlineMarkdown(line), indent };
}
