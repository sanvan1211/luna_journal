// Small DOM + formatting helpers shared by every page.

export function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Parse an HTML string into a single element (or fragment if several). */
export function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ── Dates ──
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const fmtShort = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const fmtLong = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtMonth = (d) => new Date(d).toLocaleDateString(undefined, { month: "long", year: "numeric" });

// ── Markdown → plain text (for previews, search, word counts) ──
export function plain(md = "") {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}
export const words = (s = "") => (s.toLowerCase().match(/[a-z']+/g) || []);

/** Page-level keyboard shortcut that removes itself once `el` leaves the page. */
export function onPageKey(el, fn) {
  const handler = (e) => {
    if (!el.isConnected) { document.removeEventListener("keydown", handler); return; }
    fn(e);
  };
  document.addEventListener("keydown", handler);
}

/** True when the user is typing somewhere, so single-key shortcuts should stay out of the way. */
export const typing = (e) => Boolean(e.target.closest?.("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey);

// ── Toast ──
let toastTimer;
export function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ── Modal (focus-trapped, Escape to close) ──
export function openModal(contentEl, { label = "Dialog", onClose } = {}) {
  const root = document.getElementById("modal-root");
  const prev = document.activeElement;
  const backdrop = html(`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div></div>`);
  backdrop.firstElementChild.append(contentEl);
  root.append(backdrop);

  const focusables = () => $$('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])', backdrop).filter((e) => !e.disabled);
  const close = () => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("hashchange", onNavigate);
    prev && prev.focus && prev.focus();
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "Tab") {
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  // A dialog belongs to the page that opened it.
  const onNavigate = () => close();
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", onNavigate);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  setTimeout(() => (focusables()[0] || backdrop.firstElementChild).focus(), 0);
  return close;
}

export function confirmDialog({ title, body, confirmLabel = "Confirm", danger = false, requireText = null }) {
  return new Promise((resolve) => {
    let done = false;
    const el = html(`<div>
      <h2>${esc(title)}</h2>
      <p class="muted">${body}</p>
      ${requireText ? `<label class="mt-3 field">Type <strong class="text-strong">${esc(requireText)}</strong> to confirm<input class="input" data-confirm-text autocomplete="off" /></label>` : ""}
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-no>Cancel</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes ${requireText ? "disabled" : ""}>${esc(confirmLabel)}</button>
      </div></div>`);
    const yes = $("[data-yes]", el);
    if (requireText) {
      $("[data-confirm-text]", el).addEventListener("input", (e) => { yes.disabled = e.target.value.trim() !== requireText; });
    }
    const close = openModal(el, { label: title, onClose: () => { if (!done) resolve(false); } });
    $("[data-no]", el).onclick = () => close();
    yes.onclick = () => { done = true; resolve(true); close(); };
  });
}

export function download(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const slug = (s) => (s || "entry").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "entry";
