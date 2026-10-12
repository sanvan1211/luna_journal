// A Notion-style block editor.
//
// `this.blocks` is the source of truth. While you type, only the block you're
// in is read back from the DOM; structural changes (split, merge, convert,
// indent, move…) update the model and re-render.

import { esc } from '../api.js';
import {
  caretOnEdgeLine, deleteRange, domToRich, getCaret, inlineMarkdown, normalizeRich, parseMarkdownLine,
  richLength, richText, richToHTML, setCaret, setSelection, splitRich, toggleMark,
} from './richtext.js';

export const BLOCK_MENU = [
  { type: 'paragraph', label: 'Text', icon: 'Aa', hint: '', keys: 'text paragraph plain' },
  { type: 'heading_1', label: 'Heading 1', icon: 'H1', hint: '#', keys: 'heading title h1 big' },
  { type: 'heading_2', label: 'Heading 2', icon: 'H2', hint: '##', keys: 'heading subtitle h2 medium' },
  { type: 'heading_3', label: 'Heading 3', icon: 'H3', hint: '###', keys: 'heading h3 small' },
  { type: 'bulleted_list_item', label: 'Bulleted list', icon: '•', hint: '-', keys: 'bullet list unordered' },
  { type: 'numbered_list_item', label: 'Numbered list', icon: '1.', hint: '1.', keys: 'number list ordered' },
  { type: 'to_do', label: 'To-do list', icon: '☐', hint: '[]', keys: 'todo task check box' },
  { type: 'toggle', label: 'Toggle list', icon: '▸', hint: '>', keys: 'toggle collapse fold hide' },
  { type: 'quote', label: 'Quote', icon: '❝', hint: '"', keys: 'quote citation' },
  { type: 'callout', label: 'Callout', icon: '💡', hint: '', keys: 'callout note highlight' },
  { type: 'code', label: 'Code', icon: '</>', hint: '```', keys: 'code snippet' },
  { type: 'divider', label: 'Divider', icon: '—', hint: '---', keys: 'divider line separator hr' },
];
const LABEL = Object.fromEntries(BLOCK_MENU.map((m) => [m.type, m.label]));

const PLACEHOLDER = {
  paragraph: 'Type ‘/’ for blocks',
  heading_1: 'Heading 1',
  heading_2: 'Heading 2',
  heading_3: 'Heading 3',
  bulleted_list_item: 'List',
  numbered_list_item: 'List',
  to_do: 'To-do',
  toggle: 'Toggle',
  quote: 'Quote',
  callout: 'Write a note',
  code: 'Code',
};

// Typing these at the start of a text block turns it into another type.
const SHORTCUTS = [
  ['### ', 'heading_3'], ['## ', 'heading_2'], ['# ', 'heading_1'],
  ['- ', 'bulleted_list_item'], ['* ', 'bulleted_list_item'], ['+ ', 'bulleted_list_item'],
  ['1. ', 'numbered_list_item'], ['1) ', 'numbered_list_item'],
  ['[] ', 'to_do'], ['[ ] ', 'to_do'], ['[x] ', 'to_do', { checked: true }],
  ['> ', 'toggle'], ['" ', 'quote'], ['```', 'code'], ['---', 'divider'],
];

const CONTINUES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do', 'toggle']);
const RESETS_WHEN_EMPTY = new Set([...CONTINUES, 'quote', 'callout']);
const MARK_KEYS = { b: 'b', i: 'i', u: 'u', e: 'c' };
const MAX_INDENT = 4;
const HISTORY_LIMIT = 100;
const BULLETS = ['•', '◦', '▪'];

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const clone = (x) => JSON.parse(JSON.stringify(x));
export const newBlock = (type = 'paragraph', rich = [], extra = {}) => ({ id: newId(), type, rich, indent: 0, ...extra });

export class BlockEditor {
  constructor(root, { blocks = [], onChange = () => {}, onExitTop = () => {} } = {}) {
    this.root = root;
    this.onChange = onChange;
    this.onExitTop = onExitTop;
    this.blocks = blocks.length ? clone(blocks) : [newBlock()];
    this.undoStack = [];
    this.redoStack = [];
    this.typing = false;
    this.menu = null;
    this.drag = null;

    root.classList.add('blocks');
    root.addEventListener('keydown', (e) => this.onKeyDown(e));
    root.addEventListener('beforeinput', () => this.startTyping());
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('paste', (e) => this.onPaste(e));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('.blk-btn, .blk-check, .blk-toggle')) e.preventDefault(); // keep the caret
    });
    root.addEventListener('dragstart', (e) => this.onDragStart(e));
    root.addEventListener('dragover', (e) => this.onDragOver(e));
    root.addEventListener('drop', (e) => this.onDrop(e));
    root.addEventListener('dragend', () => this.endDrag());
    this.outside = (e) => { if (this.menu && !this.menu.el.contains(e.target)) this.closeMenu(); };
    document.addEventListener('mousedown', this.outside);
    this.render();
  }

  destroy() {
    document.removeEventListener('mousedown', this.outside);
    this.closeMenu();
  }

  getBlocks() {
    return clone(this.blocks);
  }

  emit() {
    this.onChange(this.getBlocks());
  }

  // --- Lookup ---------------------------------------------------------------------

  index(id) { return this.blocks.findIndex((b) => b.id === id); }
  row(id) { return this.root.querySelector(`.blk[data-id="${CSS.escape(id)}"]`); }
  textEl(id) { return this.row(id)?.querySelector('.blk-text'); }

  // A block plus everything nested under it.
  unitEnd(i) {
    let j = i + 1;
    while (j < this.blocks.length && this.blocks[j].indent > this.blocks[i].indent) j++;
    return j;
  }

  visible(i) { return this.row(this.blocks[i].id) && !this.row(this.blocks[i].id).hidden; }

  neighbour(i, dir) {
    for (let j = i + dir; j >= 0 && j < this.blocks.length; j += dir) if (this.visible(j)) return j;
    return -1;
  }

  // --- Rendering --------------------------------------------------------------------

  render(focus) {
    const counters = [];
    let hideDepth = null;
    const html = this.blocks.map((b) => {
      let hidden = false;
      if (hideDepth !== null) {
        if (b.indent > hideDepth) hidden = true;
        else hideDepth = null;
      }
      if (!hidden && b.type === 'toggle' && b.collapsed) hideDepth = b.indent;
      counters.length = b.indent + 1;
      counters[b.indent] = b.type === 'numbered_list_item' ? (counters[b.indent] ?? 0) + 1 : 0;
      return this.rowHTML(b, counters[b.indent], hidden);
    }).join('');
    this.root.innerHTML = html;
    if (focus) this.focus(focus.id, focus.offset, focus.end);
  }

  rowHTML(b, number, hidden) {
    let marker = '';
    if (b.type === 'bulleted_list_item') marker = `<span class="blk-marker" aria-hidden="true">${BULLETS[b.indent % 3]}</span>`;
    else if (b.type === 'numbered_list_item') marker = `<span class="blk-marker" aria-hidden="true">${number}.</span>`;
    else if (b.type === 'callout') marker = '<span class="blk-marker" aria-hidden="true">💡</span>';
    else if (b.type === 'to_do') marker = `<button type="button" class="blk-check" role="checkbox" aria-checked="${b.checked === true}" aria-label="Done" data-act="check" tabindex="-1"></button>`;
    else if (b.type === 'toggle') marker = `<button type="button" class="blk-toggle" aria-expanded="${!b.collapsed}" aria-label="${b.collapsed ? 'Expand' : 'Collapse'}" data-act="toggle" tabindex="-1">▸</button>`;

    const body = b.type === 'divider'
      ? '<div class="blk-text blk-divider" tabindex="0" role="separator" aria-label="Divider. Backspace to remove."><hr></div>'
      : `<div class="blk-text" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(LABEL[b.type])}" data-placeholder="${esc(PLACEHOLDER[b.type])}" spellcheck="true">${richToHTML(b.rich)}</div>`;

    return `
      <div class="blk blk--${b.type}${b.checked ? ' is-checked' : ''}" data-id="${esc(b.id)}" data-indent="${b.indent}"${hidden ? ' hidden' : ''}>
        <div class="blk-gutter">
          <button type="button" class="blk-btn" data-act="add" tabindex="-1" aria-label="Add a block below">+</button>
          <button type="button" class="blk-btn blk-drag" data-act="menu" draggable="true" tabindex="-1" aria-label="Block options, or drag to move">⋮⋮</button>
        </div>
        ${marker}${body}
      </div>`;
  }

  // Re-renders just the text of one block (after formatting or paste).
  renderText(b) {
    const el = this.textEl(b.id);
    if (el) el.innerHTML = richToHTML(b.rich);
  }

  focus(id, offset = 'end', end) {
    const el = this.textEl(id);
    if (!el) return;
    el.focus({ preventScroll: false });
    if (el.isContentEditable) {
      if (end !== undefined && end !== offset) setSelection(el, offset, end);
      else setCaret(el, offset);
    }
  }

  focusStart() {
    const first = this.blocks.findIndex((_, i) => this.visible(i));
    if (first >= 0) this.focus(this.blocks[first].id, 0);
  }

  currentFocus() {
    const row = document.activeElement?.closest?.('.blk');
    if (!row || !this.root.contains(row)) return null;
    const caret = getCaret(row.querySelector('.blk-text'));
    return { id: row.dataset.id, offset: caret?.start ?? 'end' };
  }

  // --- History ----------------------------------------------------------------------

  snapshot() {
    this.typing = false;
    this.undoStack.push({ blocks: clone(this.blocks), focus: this.currentFocus() });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  // One undo step per burst of typing, not per keystroke.
  startTyping() {
    if (!this.typing) {
      this.snapshot();
      this.typing = true;
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => { this.typing = false; }, 1000);
  }

  undo(redo = false) {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    if (!from.length) return;
    to.push({ blocks: clone(this.blocks), focus: this.currentFocus() });
    const state = from.pop();
    this.blocks = state.blocks;
    this.typing = false;
    this.render(state.focus ?? undefined);
    this.emit();
  }

  // Applies a structural change with an undo point, then re-renders and saves.
  change(fn) {
    this.snapshot();
    const focus = fn();
    if (!this.blocks.length) this.blocks.push(newBlock());
    this.render(focus);
    this.emit();
  }

  // --- Input --------------------------------------------------------------------------

  sync(b) {
    const el = this.textEl(b.id);
    b.rich = b.type === 'code' ? [{ t: el.textContent }].filter((s) => s.t) : domToRich(el);
    // Leave truly empty blocks empty so the placeholder shows.
    if (!b.rich.length && el.innerHTML) el.innerHTML = '';
  }

  onInput(e) {
    const row = e.target.closest('.blk');
    if (!row) return;
    const b = this.blocks[this.index(row.dataset.id)];
    if (!b || b.type === 'divider') return;
    this.sync(b);
    if (!e.isComposing && this.applyShortcut(b)) return;
    this.updateSlashMenu(b);
    this.emit();
  }

  applyShortcut(b) {
    if (b.type !== 'paragraph') return false;
    const caret = getCaret(this.textEl(b.id));
    if (!caret?.collapsed) return false;
    const text = richText(b.rich);
    for (const [prefix, type, extra = {}] of SHORTCUTS) {
      if (caret.start !== prefix.length || !text.startsWith(prefix)) continue;
      this.change(() => {
        b.rich = deleteRange(b.rich, 0, prefix.length);
        this.convert(b, type, extra);
        if (type === 'divider') {
          const nb = newBlock('paragraph', [], { indent: b.indent });
          this.blocks.splice(this.index(b.id) + 1, 0, nb);
          return { id: nb.id, offset: 0 };
        }
        return { id: b.id, offset: 0 };
      });
      return true;
    }
    return false;
  }

  convert(b, type, extra = {}) {
    b.type = type;
    delete b.checked;
    delete b.collapsed;
    if (type === 'to_do') b.checked = extra.checked === true;
    if (type === 'toggle') b.collapsed = false;
    if (type === 'divider') b.rich = [];
    if (type === 'code') b.rich = normalizeRich(b.rich.map((s) => ({ t: s.t })));
  }

  onPaste(e) {
    const row = e.target.closest('.blk');
    if (!row) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (!text) return;
    const b = this.blocks[this.index(row.dataset.id)];
    const caret = getCaret(this.textEl(b.id)) ?? { start: richLength(b.rich), end: richLength(b.rich) };
    const base = deleteRange(b.rich, caret.start, caret.end - caret.start);
    const [left, right] = splitRich(base, caret.start);
    const lines = text.split('\n');

    if (b.type === 'code' || lines.length === 1) {
      this.snapshot();
      b.rich = normalizeRich([...left, { t: text }, ...right]);
      this.renderText(b);
      setCaret(this.textEl(b.id), caret.start + text.length);
      this.emit();
      return;
    }

    this.change(() => {
      // The first line continues the current block as plain inline text;
      // the rest become blocks of their own.
      const [firstLine, ...restLines] = lines;
      const rest = restLines.filter((l) => l.trim()).map(parseMarkdownLine);
      b.rich = normalizeRich([...left, ...inlineMarkdown(firstLine)]);
      const added = rest.map((p) => ({ ...newBlock(p.type, p.rich), indent: Math.min(MAX_INDENT, b.indent + p.indent), ...(p.type === 'to_do' ? { checked: p.checked } : {}) }));
      const last = added.at(-1) ?? b;
      const caretAt = richLength(last.rich);
      last.rich = normalizeRich([...last.rich, ...right]);
      this.blocks.splice(this.index(b.id) + 1, 0, ...added);
      return { id: last.id, offset: caretAt };
    });
  }

  // --- Keyboard -------------------------------------------------------------------------

  onKeyDown(e) {
    if (this.menu?.handleKey(e)) return;
    const row = e.target.closest('.blk');
    if (!row) return;
    const i = this.index(row.dataset.id);
    const b = this.blocks[i];
    const el = row.querySelector('.blk-text');
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (mod && key === 'z') { e.preventDefault(); this.undo(e.shiftKey); return; }
    if (mod && key === 'y') { e.preventDefault(); this.undo(true); return; }
    if (mod && key === '/') { e.preventDefault(); this.openBlockMenu(b); return; }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.move(i, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (b.type === 'divider') return this.dividerKey(e, i);

    const markKey = mod && !e.altKey && (MARK_KEYS[key] && !e.shiftKey ? MARK_KEYS[key] : e.shiftKey && key === 's' ? 's' : null);
    if (markKey) {
      e.preventDefault();
      this.toggleMark(b, markKey);
      return;
    }

    if (e.isComposing) return;
    const caret = getCaret(el);
    if (!caret) return;

    if (e.key === 'Enter' && (e.shiftKey || (b.type === 'code' && !mod))) {
      e.preventDefault();
      this.insertText(b, '\n', caret);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.enter(i, caret);
    } else if (e.key === 'Backspace' && caret.collapsed && caret.start === 0) {
      e.preventDefault();
      this.backspaceAtStart(i);
    } else if (e.key === 'Delete' && caret.collapsed && caret.start === richLength(b.rich)) {
      e.preventDefault();
      this.mergeNext(i);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (b.type === 'code') this.insertText(b, '  ', caret);
      else this.indent(i, e.shiftKey ? -1 : 1);
    } else if (e.key === 'ArrowUp' && caretOnEdgeLine(el, 'top')) {
      const p = this.neighbour(i, -1);
      e.preventDefault();
      if (p >= 0) this.focus(this.blocks[p].id, Math.min(caret.start, richLength(this.blocks[p].rich)));
      else this.onExitTop();
    } else if (e.key === 'ArrowDown' && caretOnEdgeLine(el, 'bottom')) {
      const n = this.neighbour(i, 1);
      if (n >= 0) { e.preventDefault(); this.focus(this.blocks[n].id, Math.min(caret.start, richLength(this.blocks[n].rich))); }
    } else if (e.key === 'ArrowLeft' && caret.collapsed && caret.start === 0) {
      const p = this.neighbour(i, -1);
      if (p >= 0) { e.preventDefault(); this.focus(this.blocks[p].id, 'end'); }
    } else if (e.key === 'ArrowRight' && caret.collapsed && caret.start === richLength(b.rich)) {
      const n = this.neighbour(i, 1);
      if (n >= 0) { e.preventDefault(); this.focus(this.blocks[n].id, 0); }
    } else if (e.key === 'Escape') {
      el.blur();
    }
  }

  dividerKey(e, i) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      this.change(() => {
        this.blocks.splice(i, 1);
        const p = Math.max(0, i - 1);
        return this.blocks[p] && { id: this.blocks[p].id, offset: 'end' };
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.change(() => {
        const nb = newBlock();
        this.blocks.splice(i + 1, 0, nb);
        return { id: nb.id, offset: 0 };
      });
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const n = this.neighbour(i, e.key === 'ArrowUp' ? -1 : 1);
      e.preventDefault();
      if (n >= 0) this.focus(this.blocks[n].id, e.key === 'ArrowUp' ? 'end' : 0);
      else if (e.key === 'ArrowUp') this.onExitTop();
    }
  }

  insertText(b, text, caret) {
    this.snapshot();
    const base = deleteRange(b.rich, caret.start, caret.end - caret.start);
    const [left, right] = splitRich(base, caret.start);
    b.rich = normalizeRich([...left, { t: text }, ...right]);
    this.renderText(b);
    setCaret(this.textEl(b.id), caret.start + text.length);
    this.emit();
  }

  toggleMark(b, mark) {
    const el = this.textEl(b.id);
    const caret = getCaret(el);
    if (!caret || caret.collapsed || b.type === 'code') return;
    this.snapshot();
    b.rich = toggleMark(b.rich, caret.start, caret.end, mark);
    this.renderText(b);
    setSelection(el, caret.start, caret.end);
    this.emit();
  }

  enter(i, caret) {
    const b = this.blocks[i];
    this.change(() => {
      const rich = deleteRange(b.rich, caret.start, caret.end - caret.start);
      const empty = !richLength(rich);

      // Enter on an empty list item steps out of the list, like Notion.
      if (empty && RESETS_WHEN_EMPTY.has(b.type)) {
        if (b.indent > 0) b.indent--;
        else this.convert(b, 'paragraph');
        return { id: b.id, offset: 0 };
      }
      // Enter at the very start pushes the block down.
      if (caret.start === 0 && !empty) {
        const nb = newBlock(CONTINUES.has(b.type) ? b.type : 'paragraph', [], { indent: b.indent });
        if (nb.type === 'to_do') nb.checked = false;
        this.blocks.splice(i, 0, nb);
        return { id: b.id, offset: 0 };
      }
      const [left, right] = splitRich(rich, caret.start);
      b.rich = left;
      let nb;
      if (b.type === 'toggle' && !b.collapsed) {
        nb = newBlock('paragraph', right, { indent: Math.min(MAX_INDENT, b.indent + 1) });
        this.blocks.splice(i + 1, 0, nb);
      } else {
        nb = newBlock(CONTINUES.has(b.type) ? b.type : 'paragraph', right, { indent: b.indent });
        if (nb.type === 'to_do') nb.checked = false;
        if (nb.type === 'toggle') nb.collapsed = false;
        // A collapsed toggle keeps its hidden children; the new block goes after them.
        this.blocks.splice(b.type === 'toggle' ? this.unitEnd(i) : i + 1, 0, nb);
      }
      return { id: nb.id, offset: 0 };
    });
  }

  backspaceAtStart(i) {
    const b = this.blocks[i];
    if (b.type !== 'paragraph') {
      this.change(() => { this.convert(b, 'paragraph'); return { id: b.id, offset: 0 }; });
      return;
    }
    if (b.indent > 0) {
      this.indent(i, -1);
      return;
    }
    const p = this.neighbour(i, -1);
    if (p < 0) return;
    const prev = this.blocks[p];
    this.change(() => {
      if (prev.type === 'divider') {
        this.blocks.splice(p, 1);
        return { id: b.id, offset: 0 };
      }
      const offset = richLength(prev.rich);
      prev.rich = normalizeRich([...prev.rich, ...(prev.type === 'code' ? b.rich.map((s) => ({ t: s.t })) : b.rich)]);
      this.blocks.splice(this.index(b.id), 1);
      return { id: prev.id, offset };
    });
  }

  mergeNext(i) {
    const b = this.blocks[i];
    const n = this.neighbour(i, 1);
    if (n < 0) return;
    const next = this.blocks[n];
    this.change(() => {
      const offset = richLength(b.rich);
      if (next.type !== 'divider') b.rich = normalizeRich([...b.rich, ...next.rich]);
      this.blocks.splice(n, 1);
      return { id: b.id, offset };
    });
  }

  indent(i, dir) {
    const b = this.blocks[i];
    const max = i > 0 ? Math.min(MAX_INDENT, this.blocks[i - 1].indent + 1) : 0;
    const target = dir > 0 ? Math.min(max, b.indent + 1) : Math.max(0, b.indent - 1);
    if (target === b.indent) return;
    const focus = this.currentFocus();
    this.change(() => {
      const delta = target - b.indent;
      const end = this.unitEnd(i);
      for (let j = i; j < end; j++) {
        this.blocks[j].indent = Math.max(0, Math.min(MAX_INDENT, this.blocks[j].indent + delta));
      }
      return focus ?? { id: b.id, offset: 0 };
    });
  }

  // Moves a block (with anything nested under it) past its neighbour.
  move(i, dir) {
    const b = this.blocks[i];
    const focus = this.currentFocus() ?? { id: b.id, offset: 0 };
    const end = this.unitEnd(i);
    let to;
    if (dir < 0) {
      if (i === 0) return;
      to = i - 1;
      while (to > 0 && this.blocks[to].indent > b.indent) to--;
    } else {
      if (end >= this.blocks.length) return;
      to = this.unitEnd(end);
    }
    this.change(() => {
      this.moveUnit(i, end, to);
      return focus;
    });
  }

  // Moves blocks [start, end) so they begin at `to` (an index in the original
  // list), re-basing their indent on whatever ends up above them.
  moveUnit(start, end, to, indent) {
    const unit = this.blocks.splice(start, end - start);
    const at = to > start ? to - unit.length : to;
    this.blocks.splice(at, 0, ...unit);
    const above = this.blocks[at - 1];
    const maxRoot = above ? above.indent + 1 : 0;
    const root = Math.min(indent ?? unit[0].indent, maxRoot, MAX_INDENT);
    const delta = root - unit[0].indent;
    for (const blk of unit) blk.indent = Math.max(0, Math.min(MAX_INDENT, blk.indent + delta));
  }

  duplicate(i) {
    const end = this.unitEnd(i);
    this.change(() => {
      const copies = clone(this.blocks.slice(i, end)).map((blk) => ({ ...blk, id: newId() }));
      this.blocks.splice(end, 0, ...copies);
      return { id: copies[0].id, offset: 'end' };
    });
  }

  remove(i) {
    const b = this.blocks[i];
    this.change(() => {
      // Toggles take their contents with them; other blocks leave children in place.
      this.blocks.splice(i, b.type === 'toggle' ? this.unitEnd(i) - i : 1);
      const p = Math.max(0, i - 1);
      return this.blocks[p] && { id: this.blocks[p].id, offset: 'end' };
    });
  }

  // --- Mouse ---------------------------------------------------------------------------

  onClick(e) {
    const act = e.target.closest('[data-act]');
    const row = e.target.closest('.blk');
    if (act && row) {
      const i = this.index(row.dataset.id);
      const b = this.blocks[i];
      if (act.dataset.act === 'check') {
        const focus = this.currentFocus();
        this.change(() => { b.checked = !b.checked; return focus; });
      } else if (act.dataset.act === 'toggle') {
        const focus = this.currentFocus();
        this.change(() => { b.collapsed = !b.collapsed; return focus ?? { id: b.id, offset: 'end' }; });
      } else if (act.dataset.act === 'add') {
        // Like Notion's "+": a new block with the block menu already open.
        const nested = b.type === 'toggle' && !b.collapsed;
        const nb = newBlock('paragraph', [{ t: '/' }], { indent: nested ? b.indent + 1 : b.indent });
        this.change(() => {
          this.blocks.splice(nested ? i + 1 : this.unitEnd(i), 0, nb);
          return { id: nb.id, offset: 1 };
        });
        this.updateSlashMenu(this.blocks[this.index(nb.id)]);
      } else if (act.dataset.act === 'menu') {
        this.openBlockMenu(b);
      }
      return;
    }
    // Clicking the empty space under the last block: focus it, or start a new one.
    if (e.target === this.root) {
      const last = this.blocks[this.blocks.length - 1];
      if (last.type === 'paragraph' && !richLength(last.rich)) this.focus(last.id, 0);
      else this.change(() => { const nb = newBlock(); this.blocks.push(nb); return { id: nb.id, offset: 0 }; });
    }
  }

  onDragStart(e) {
    const handle = e.target.closest?.('.blk-drag');
    if (!handle) return;
    const row = handle.closest('.blk');
    const i = this.index(row.dataset.id);
    this.closeMenu();
    this.drag = { start: i, end: this.unitEnd(i) };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', richText(this.blocks[i].rich));
    e.dataTransfer.setDragImage(row, 20, 16);
    for (let j = i; j < this.drag.end; j++) this.row(this.blocks[j].id)?.classList.add('is-dragging');
  }

  dropTarget(e) {
    const row = e.target.closest?.('.blk');
    if (!row || !this.drag) return null;
    const i = this.index(row.dataset.id);
    if (i >= this.drag.start && i < this.drag.end) return null;
    const box = row.getBoundingClientRect();
    return { row, i, after: e.clientY > box.top + box.height / 2 };
  }

  onDragOver(e) {
    if (!this.drag) return;
    e.preventDefault();
    this.root.querySelectorAll('[data-drop]').forEach((r) => r.removeAttribute('data-drop'));
    const t = this.dropTarget(e);
    if (t) t.row.dataset.drop = t.after ? 'after' : 'before';
  }

  onDrop(e) {
    const t = this.dropTarget(e);
    const drag = this.drag;
    this.endDrag();
    if (!t || !drag) return;
    e.preventDefault();
    const target = this.blocks[t.i];
    const to = t.after ? (target.type === 'toggle' && target.collapsed ? this.unitEnd(t.i) : t.i + 1) : t.i;
    const id = this.blocks[drag.start].id;
    this.change(() => {
      this.moveUnit(drag.start, drag.end, to, target.indent);
      return { id, offset: 'end' };
    });
  }

  endDrag() {
    this.drag = null;
    this.root.querySelectorAll('.is-dragging, [data-drop]').forEach((r) => {
      r.classList.remove('is-dragging');
      r.removeAttribute('data-drop');
    });
  }

  // --- Menus ------------------------------------------------------------------------------

  // "/" menu: opens while the text before the caret looks like "/query".
  updateSlashMenu(b) {
    const el = this.textEl(b.id);
    const caret = getCaret(el);
    const text = richText(b.rich);
    const slash = caret?.collapsed ? text.lastIndexOf('/', caret.start - 1) : -1;
    const query = slash >= 0 ? text.slice(slash + 1, caret.start) : '';
    const valid = slash >= 0 && (slash === 0 || /\s/.test(text[slash - 1])) && !/\s/.test(query) && query.length <= 20;
    if (!valid || b.type === 'code') {
      if (this.menu?.kind === 'slash') this.closeMenu();
      return;
    }
    const q = query.toLowerCase();
    const items = BLOCK_MENU
      .filter((m) => !q || m.label.toLowerCase().includes(q) || m.keys.includes(q))
      .map((m) => ({ ...m, run: () => this.chooseFromSlash(b, slash, caret.start, m.type) }));
    if (!items.length) {
      this.closeMenu();
      return;
    }
    if (this.menu?.kind === 'slash' && this.menu.blockId === b.id) this.menu.update(items);
    else this.openMenu({ kind: 'slash', blockId: b.id, anchor: el, items, title: 'Blocks', keepFocus: true });
  }

  chooseFromSlash(b, slashAt, caretAt, type) {
    this.closeMenu();
    this.change(() => {
      b.rich = deleteRange(b.rich, slashAt, caretAt - slashAt);
      const i = this.index(b.id);
      if (!richLength(b.rich) || type === b.type) {
        this.convert(b, type);
        if (type === 'divider') {
          const nb = newBlock('paragraph', [], { indent: b.indent });
          this.blocks.splice(i + 1, 0, nb);
          return { id: nb.id, offset: 0 };
        }
        return { id: b.id, offset: 0 };
      }
      const nb = newBlock(type, [], { indent: b.indent });
      this.convert(nb, type);
      this.blocks.splice(i + 1, 0, nb);
      if (type === 'divider') {
        const after = newBlock('paragraph', [], { indent: b.indent });
        this.blocks.splice(i + 2, 0, after);
        return { id: after.id, offset: 0 };
      }
      return { id: nb.id, offset: 0 };
    });
  }

  // Block options: turn into, duplicate, move, delete.
  openBlockMenu(b) {
    const anchor = this.row(b.id)?.querySelector('.blk-drag');
    const i = () => this.index(b.id);
    const items = [
      ...BLOCK_MENU.map((m) => ({
        ...m,
        section: 'Turn into',
        current: m.type === b.type,
        run: () => this.change(() => {
          this.convert(b, m.type);
          if (m.type === 'divider' && i() === this.blocks.length - 1) this.blocks.push(newBlock());
          return { id: b.id, offset: 'end' };
        }),
      })),
      { section: 'Actions', label: 'Duplicate', icon: '⧉', hint: '', run: () => this.duplicate(i()) },
      { section: 'Actions', label: 'Move up', icon: '↑', hint: '⇧⌘↑', run: () => this.move(i(), -1) },
      { section: 'Actions', label: 'Move down', icon: '↓', hint: '⇧⌘↓', run: () => this.move(i(), 1) },
      { section: 'Actions', label: 'Delete', icon: '✕', hint: '', danger: true, run: () => this.remove(i()) },
    ];
    this.openMenu({ kind: 'block', blockId: b.id, anchor, items, title: 'Block options', keepFocus: false });
  }

  openMenu(opts) {
    this.closeMenu();
    const returnFocus = this.currentFocus();
    this.menu = new Menu(this.root.parentElement, {
      ...opts,
      onClose: (restore) => {
        this.menu = null;
        if (restore && !opts.keepFocus && returnFocus) this.focus(returnFocus.id, returnFocus.offset);
      },
    });
    this.menu.kind = opts.kind;
    this.menu.blockId = opts.blockId;
  }

  closeMenu(restore = false) {
    this.menu?.close(restore);
  }
}

// Popover list used for the "/" menu and the block options menu.
class Menu {
  constructor(container, { anchor, items, title, keepFocus, onClose }) {
    this.container = container;
    this.keepFocus = keepFocus;
    this.onClose = onClose;
    this.active = 0;
    this.el = document.createElement('div');
    this.el.className = 'blk-menu';
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', title);
    container.appendChild(this.el);
    this.update(items);
    // Position under the anchor, inside the editor container (CSSOM, not inline HTML styles).
    const a = anchor.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    this.el.style.left = `${Math.max(0, Math.min(a.left - c.left, c.width - 280))}px`;
    this.el.style.top = `${a.bottom - c.top + 6}px`;
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    // When the menu holds focus (block options), it handles its own keys.
    this.el.addEventListener('keydown', (e) => this.handleKey(e));
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-i]');
      if (btn) this.choose(Number(btn.dataset.i));
    });
    if (!keepFocus) this.focusActive();
  }

  update(items) {
    this.items = items;
    this.active = Math.min(this.active, items.length - 1);
    let section = null;
    this.el.innerHTML = items.map((it, i) => {
      const head = it.section && it.section !== section ? `<p class="blk-menu-section">${esc(it.section)}</p>` : '';
      section = it.section ?? section;
      return `${head}<button type="button" role="menuitem" class="blk-menu-item${it.danger ? ' is-danger' : ''}${it.current ? ' is-current' : ''}" data-i="${i}" tabindex="-1" ${i === this.active ? 'data-active' : ''}>
          <span class="blk-menu-icon" aria-hidden="true">${esc(it.icon)}</span>
          <span class="blk-menu-label">${esc(it.label)}</span>
          ${it.hint ? `<span class="blk-menu-hint">${esc(it.hint)}</span>` : ''}
        </button>`;
    }).join('');
  }

  setActive(i) {
    this.active = (i + this.items.length) % this.items.length;
    this.el.querySelectorAll('[data-i]').forEach((b) => b.toggleAttribute('data-active', Number(b.dataset.i) === this.active));
    const btn = this.el.querySelector(`[data-i="${this.active}"]`);
    btn?.scrollIntoView({ block: 'nearest' });
    if (!this.keepFocus) btn?.focus();
  }

  focusActive() {
    this.setActive(this.active);
  }

  choose(i) {
    const item = this.items[i];
    this.close(false);
    item?.run();
  }

  // Returns true if the key was handled by the menu.
  handleKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.setActive(this.active + 1); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this.setActive(this.active - 1); return true; }
    if (e.key === 'Enter' || (e.key === 'Tab' && this.keepFocus)) { e.preventDefault(); this.choose(this.active); return true; }
    if (e.key === 'Escape') { e.preventDefault(); this.close(true); return true; }
    return false;
  }

  close(restore = false) {
    if (!this.el.isConnected) return;
    this.el.remove();
    this.onClose(restore);
  }
}
