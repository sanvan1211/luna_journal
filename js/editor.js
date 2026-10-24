// A small Notion-style block editor. Each block is its own contenteditable line.
// Markdown shortcuts: "# " "## " "- " "> " "[] " at the start of a line.
// Keys: Enter = new block, Backspace at start = un-format / merge, Ctrl/Cmd+B / I.
import { parseBlocks, serializeBlocks, inlineToHtml, htmlToInline } from "./markdown.js";
import { $$ } from "./util.js";

const PLACEHOLDER = "Start writing, or type # for a heading, - for a list, [] for a checkbox…";

export function createEditor(root, markdown, onChange) {
  root.classList.add("blocks");
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Entry body");
  let focusedIdx = 0;

  const rows = () => $$(".block", root);
  const editableOf = (row) => row.querySelector("[contenteditable]");
  const indexOf = (row) => rows().indexOf(row);

  function makeRow(b) {
    const row = document.createElement("div");
    row.className = "block";
    row.dataset.type = b.type;
    if (b.type === "todo") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!b.checked;
      cb.setAttribute("aria-label", "Done");
      cb.addEventListener("change", () => { row.classList.toggle("done", cb.checked); changed(); });
      row.append(cb);
      row.classList.toggle("done", !!b.checked);
    }
    const ed = document.createElement("div");
    ed.contentEditable = "true";
    ed.spellcheck = true;
    ed.dataset.placeholder = PLACEHOLDER;
    ed.setAttribute("role", "textbox");
    ed.setAttribute("aria-multiline", "false");
    ed.setAttribute("aria-label", labelFor(b.type));
    ed.innerHTML = inlineToHtml(b.text);
    row.append(ed);
    return row;
  }

  function labelFor(type) {
    return { h1: "Heading", h2: "Subheading", bullet: "Bullet", todo: "Checklist item", quote: "Quote", p: "Paragraph" }[type] || "Paragraph";
  }

  function render(md) {
    root.innerHTML = "";
    parseBlocks(md).forEach((b) => root.append(makeRow(b)));
    refreshEmpty();
  }

  function readBlocks() {
    return rows().map((row) => ({
      type: row.dataset.type,
      text: htmlToInline(editableOf(row)),
      checked: row.dataset.type === "todo" ? row.querySelector("input").checked : undefined,
    }));
  }

  function refreshEmpty() {
    const all = rows();
    root.classList.toggle("is-empty", all.length === 1 && !editableOf(all[0]).textContent);
    all.forEach((r) => {
      const ed = editableOf(r);
      if (ed.innerHTML === "<br>") ed.innerHTML = "";
    });
  }

  function changed() { refreshEmpty(); onChange && onChange(); }

  function setType(row, type) {
    const text = htmlToInline(editableOf(row));
    const fresh = makeRow({ type, text, checked: false });
    row.replaceWith(fresh);
    focusEnd(editableOf(fresh));
    changed();
    return fresh;
  }

  // ── caret helpers ──
  const sel = () => window.getSelection();
  function caretAtStart(el) {
    const s = sel(); if (!s.rangeCount || !s.isCollapsed) return false;
    const r = document.createRange(); r.selectNodeContents(el);
    r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset);
    return r.toString().length === 0;
  }
  function caretAtEnd(el) {
    const s = sel(); if (!s.rangeCount || !s.isCollapsed) return false;
    const r = document.createRange(); r.selectNodeContents(el);
    r.setStart(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
    return r.toString().length === 0;
  }
  function focusEnd(el) {
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    sel().removeAllRanges(); sel().addRange(r);
  }
  function focusStart(el) {
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(true);
    sel().removeAllRanges(); sel().addRange(r);
  }
  function focusAtOffset(el, offset) {
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n, left = offset;
    while ((n = walker.nextNode())) {
      if (left <= n.length) {
        const r = document.createRange(); r.setStart(n, left); r.collapse(true);
        sel().removeAllRanges(); sel().addRange(r); return;
      }
      left -= n.length;
    }
    focusEnd(el);
  }

  // ── keyboard ──
  root.addEventListener("keydown", (e) => {
    const ed = e.target.closest("[contenteditable]");
    if (!ed) return;
    const row = ed.parentElement;
    const type = row.dataset.type;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && (e.key === "b" || e.key === "B")) { e.preventDefault(); document.execCommand("bold"); changed(); return; }
    if (mod && (e.key === "i" || e.key === "I")) { e.preventDefault(); document.execCommand("italic"); changed(); return; }

    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      // Empty list item → leave the list
      if ((type === "bullet" || type === "todo" || type === "quote") && !ed.textContent.trim()) { setType(row, "p"); return; }
      // Split at caret
      const s = sel();
      let tailHTML = "";
      if (s.rangeCount) {
        const r = s.getRangeAt(0);
        r.deleteContents();
        const tail = document.createRange();
        tail.selectNodeContents(ed);
        tail.setStart(r.endContainer, r.endOffset);
        const box = document.createElement("div");
        box.append(tail.extractContents());
        tailHTML = box.innerHTML;
      }
      const nextType = type === "bullet" || type === "todo" ? type : "p";
      const fresh = makeRow({ type: nextType, text: "" });
      editableOf(fresh).innerHTML = tailHTML === "<br>" ? "" : tailHTML;
      row.after(fresh);
      focusStart(editableOf(fresh));
      changed();
      return;
    }

    if (e.key === "Backspace" && caretAtStart(ed)) {
      if (type !== "p") { e.preventDefault(); setType(row, "p"); focusStart(editableOf(rows()[indexOf(row)] || row)); return; }
      const prev = row.previousElementSibling;
      if (prev) {
        e.preventDefault();
        const pe = editableOf(prev);
        const joinAt = pe.textContent.length;
        pe.insertAdjacentHTML("beforeend", ed.innerHTML === "<br>" ? "" : ed.innerHTML);
        row.remove();
        focusAtOffset(pe, joinAt);
        changed();
      }
      return;
    }

    if (e.key === "ArrowUp" && caretAtStart(ed) && row.previousElementSibling) { e.preventDefault(); focusEnd(editableOf(row.previousElementSibling)); }
    if (e.key === "ArrowDown" && caretAtEnd(ed) && row.nextElementSibling) { e.preventDefault(); focusStart(editableOf(row.nextElementSibling)); }
  });

  // ── markdown shortcuts while typing ──
  root.addEventListener("input", (e) => {
    const ed = e.target.closest("[contenteditable]");
    if (!ed) return;
    const row = ed.parentElement;
    const text = ed.textContent;
    const rules = [
      [/^#\s/, "h1"], [/^##\s/, "h2"], [/^[-*]\s/, "bullet"], [/^>\s/, "quote"], [/^\[\s?\]\s/, "todo"],
    ];
    if (row.dataset.type === "p") {
      for (const [re, t] of rules) {
        const m = text.match(re);
        if (m) {
          ed.textContent = text.slice(m[0].length);
          focusStart(editableOf(setType(row, t)));
          return;
        }
      }
    }
    changed();
  });

  // ── paste as plain text; multiple lines become blocks ──
  root.addEventListener("paste", (e) => {
    const ed = e.target.closest("[contenteditable]");
    if (!ed) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    if (lines.length === 1) { document.execCommand("insertText", false, text); return; }
    document.execCommand("insertText", false, lines.shift());
    let after = ed.parentElement;
    parseBlocks(lines.join("\n")).forEach((b) => { const r = makeRow(b); after.after(r); after = r; });
    focusEnd(editableOf(after));
    changed();
  });

  root.addEventListener("focusin", (e) => {
    const row = e.target.closest(".block");
    if (!row) return;
    rows().forEach((r) => r.classList.toggle("focused", r === row));
    focusedIdx = indexOf(row);
  });

  // Click empty space below the last block → focus it
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) { e.preventDefault(); const last = rows().at(-1); last && focusEnd(editableOf(last)); }
  });

  render(markdown);

  return {
    getMarkdown: () => serializeBlocks(readBlocks()),
    setMarkdown: (md) => render(md),
    focus: () => { const r = rows(); r.length && focusEnd(editableOf(r[r.length - 1])); },
    /** Toolbar: change the focused block's type */
    format(kind) {
      const row = rows()[focusedIdx] || rows()[0];
      if (!row) return;
      if (kind === "bold" || kind === "italic") { editableOf(row).focus(); document.execCommand(kind); changed(); return; }
      setType(row, row.dataset.type === kind ? "p" : kind);
    },
  };
}
