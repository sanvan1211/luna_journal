import { state } from "../state.js";
import { listEntries, createEntry, updateEntry, deleteEntry } from "../data.js";
import { createEditor } from "../editor.js";
import { callAI, aiProblem, aiLoading } from "../ai.js";
import { emptyState } from "../bunny.js";
import { openImport } from "../import.js";
import { safetyNote } from "../support.js";
import { esc, html, $, $$, debounce, fmtShort, fmtLong, fmtMonth, fmtTime, plain, download, slug, toast, confirmDialog, onPageKey, typing } from "../util.js";

// How the sidebar groups entries. Remembered per browser; only a view preference.
const GROUP_KEY = "luna-journal-group";
const GROUPS = { month: "Month", week: "Week", day: "Day" };
const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const groupLabel = {
  month: (d) => fmtMonth(d),
  week: (d) => {
    const s = startOfWeek(d);
    return `Week of ${fmtShort(s)}${s.getFullYear() !== new Date().getFullYear() ? ", " + s.getFullYear() : ""}`;
  },
  day: (d) => {
    const x = new Date(d), today = new Date(), yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (x.toDateString() === today.toDateString()) return "Today";
    if (x.toDateString() === yesterday.toDateString()) return "Yesterday";
    return x.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(x.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) });
  },
};
function loadGroup() {
  try { const g = localStorage.getItem(GROUP_KEY); return GROUPS[g] ? g : "month"; } catch { return "month"; }
}

export const MOODS = ["Calm", "Content", "Hopeful", "Proud", "Okay", "Tired", "Restless", "Stretched thin", "Unsure", "Low"];

const ICON = {
  search: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5 17 17"/></svg>`,
  plus: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`,
  trash: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>`,
  importer: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6 8l4 4 4-4M4 14v3h12v-3"/></svg>`,
  down: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10M6 9l4 4 4-4M4 17h12"/></svg>`,
  list: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10M3 5h0M3 10h0M3 15h0"/></svg>`,
  check: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3"/><path d="M7 10l2 2 4-4"/></svg>`,
  quote: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5v10M9 7h7M9 11h7M9 15h4"/></svg>`,
};

export async function render(main, route) {
  let entries = await listEntries();
  let query = route.query.get("q") || "";
  let groupBy = loadGroup();
  let current = route.id ? entries.find((e) => e.id === route.id) : entries[0];

  if (route.id && !current) {
    main.innerHTML = `<div class="page">${emptyState({ title: "That entry isn't here", text: state.demo ? "It may belong to your real journal. Demo mode only shows sample entries." : "It may have been deleted.", actions: `<a class="btn" href="#/journal">Back to journal</a>` })}</div>`;
    return;
  }

  main.innerHTML = "";
  const el = html(`<div class="journal">
    <aside class="entry-sidebar" aria-label="Entries">
      <button type="button" class="btn btn-primary" data-new>${ICON.plus}New entry</button>
      <button type="button" class="btn btn-ghost" data-import>${ICON.importer}Import</button>
      <div class="search">${ICON.search}<input class="input" type="search" placeholder="Search or #tag" aria-label="Search entries" aria-keyshortcuts="/" title="Press / to search" value="${esc(query)}" /></div>
      <div class="seg group-by" role="group" aria-label="Group entries by">
        ${Object.entries(GROUPS).map(([k, label]) => `<button type="button" data-group="${k}" aria-pressed="${groupBy === k}">${label}</button>`).join("")}
      </div>
      <div data-list></div>
    </aside>
    <section aria-label="Entry">
      <div class="journal-mobile-bar">
        <button type="button" class="btn btn-sm" data-drawer aria-expanded="false">${ICON.list}Entries</button>
        <button type="button" class="btn btn-sm btn-primary" data-new>${ICON.plus}New</button>
      </div>
      <div class="editor-wrap" data-area></div>
    </section>
  </div>`);
  main.append(el);

  const listEl = $("[data-list]", el);
  const area = $("[data-area]", el);
  const searchEl = $(".search input", el);

  // ───── sidebar ─────
  function renderList() {
    const q = query.trim().toLowerCase();
    const matches = entries.filter((e) => {
      if (!q) return true;
      if (q.startsWith("#")) return (e.tags || []).some((t) => t.toLowerCase() === q.slice(1));
      return (e.title + " " + plain(e.content) + " " + (e.tags || []).join(" ")).toLowerCase().includes(q);
    });
    if (!entries.length) { listEl.innerHTML = `<p class="p-2 small muted">No entries yet.</p>`; return; }
    if (!matches.length) { listEl.innerHTML = `<p class="p-2 small muted">Nothing matches “${esc(query)}”.</p>`; return; }
    const summary = q ? `${matches.length} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
    const groups = new Map();
    matches.forEach((e) => {
      const k = groupLabel[groupBy](e.created_at);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    listEl.innerHTML = `<p class="list-summary" aria-live="polite">${summary}</p>` + [...groups].map(([label, list]) => `<div class="month-group">
      <h4>${esc(label)} <span class="count">${list.length}</span></h4>
      <ul class="entry-list">${list.map((e) => `<li><a class="entry-link" href="#/journal/${e.id}" data-id="${e.id}" ${current && e.id === current.id ? 'aria-current="true"' : ""}>
        <span class="t">${esc(e.title || "Untitled")}</span>
        <span class="d">${groupBy === "day" ? fmtTime(e.created_at) : fmtShort(e.created_at)}${e.mood ? " · " + esc(e.mood) : ""}</span></a></li>`).join("")}</ul>
    </div>`).join("");
  }
  renderList();
  searchEl.addEventListener("input", () => { query = searchEl.value; renderList(); });
  $$("[data-group]", el).forEach((b) => b.addEventListener("click", () => {
    groupBy = b.dataset.group;
    try { localStorage.setItem(GROUP_KEY, groupBy); } catch {}
    $$("[data-group]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderList();
  }));

  $$("[data-new]", el).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { const row = await createEntry(); location.hash = `#/journal/${row.id}`; }
    catch (err) { toast("Couldn't create an entry. " + err.message); b.disabled = false; }
  }));
  // Re-render the route once entries are imported.
  $("[data-import]", el).addEventListener("click", () => openImport({ onDone: () => window.dispatchEvent(new HashChangeEvent("hashchange")) }));

  const drawerBtn = $("[data-drawer]", el);
  // "/" jumps to search, like most apps with a search box. Escape closes the phone drawer.
  onPageKey(el, (e) => {
    if (e.key === "/" && !typing(e)) { e.preventDefault(); searchEl.focus(); }
    if (e.key === "Escape" && el.classList.contains("drawer-open")) {
      el.classList.remove("drawer-open");
      drawerBtn.setAttribute("aria-expanded", "false");
      drawerBtn.focus();
    }
  });

  drawerBtn.addEventListener("click", () => {
    const open = el.classList.toggle("drawer-open");
    drawerBtn.setAttribute("aria-expanded", String(open));
    if (open) searchEl.focus();
  });

  // ───── empty journal ─────
  if (!current) {
    area.innerHTML = emptyState({
      title: "Your journal is waiting",
      text: "Write about anything: your day, something on your mind, or one good thing. Only you can see it.",
      actions: `<button type="button" class="btn btn-primary" data-first>Write your first entry</button>`,
    });
    $("[data-first]", area).addEventListener("click", () => $("[data-new]", el).click());
    return;
  }

  // ───── editor ─────
  const entry = { ...current, tags: [...(current.tags || [])] };
  area.innerHTML = `
    <div class="editor-top">
      <div class="editor-meta">
        <span class="entry-date">${fmtLong(entry.created_at)}</span>
        <span class="save-state saved" data-save aria-live="polite">Saved</span>
      </div>
      <div class="editor-actions">
        <button type="button" class="btn btn-sm" data-reflect>Reflect with Luna</button>
        <button type="button" class="icon-btn" data-export aria-label="Export as Markdown" title="Export as Markdown (.md)">${ICON.down}</button>
        <button type="button" class="icon-btn danger" data-delete aria-label="Delete this entry" title="Delete entry">${ICON.trash}</button>
      </div>
    </div>
    <textarea class="title-input" rows="1" placeholder="Untitled" aria-label="Entry title" maxlength="140">${esc(entry.title)}</textarea>
    <div class="entry-props">
      <button type="button" class="prop-btn" data-mood-toggle aria-expanded="false" aria-controls="mood-options">
        <span class="prop-label">Mood</span><span data-mood-value>${entry.mood ? esc(entry.mood) : "Add"}</span>
      </button>
      <div class="tag-row" data-tags></div>
    </div>
    <div class="mood-row" id="mood-options" role="group" aria-label="Mood, optional and chosen by you" hidden>
      ${MOODS.map((m) => `<button type="button" class="mood-btn" aria-pressed="${entry.mood === m}" data-mood="${esc(m)}">${esc(m)}</button>`).join("")}
      <span class="mood-note">Only you set this. Luna never guesses it.</span>
    </div>
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" data-fmt="h1" aria-label="Heading" title="Heading">H1</button>
      <button type="button" data-fmt="h2" aria-label="Subheading" title="Subheading">H2</button>
      <span class="sep"></span>
      <button type="button" data-fmt="bold" aria-label="Bold" title="Bold (Ctrl/Cmd+B)"><b>B</b></button>
      <button type="button" data-fmt="italic" aria-label="Italic" title="Italic (Ctrl/Cmd+I)"><i class="tb-italic">I</i></button>
      <span class="sep"></span>
      <button type="button" data-fmt="bullet" aria-label="Bulleted list" title="Bulleted list">${ICON.list}</button>
      <button type="button" data-fmt="todo" aria-label="Checklist" title="Checklist">${ICON.check}</button>
      <button type="button" data-fmt="quote" aria-label="Quote" title="Quote">${ICON.quote}</button>
    </div>
    <div data-blocks></div>
    <p class="editor-hint">Shortcuts: <kbd>#</kbd> heading · <kbd>-</kbd> list · <kbd>[]</kbd> checkbox · <kbd>&gt;</kbd> quote · <kbd>Ctrl/⌘ B</kbd> bold</p>
    <div class="reflection" data-reflection aria-live="polite"></div>`;

  const saveEl = $("[data-save]", area);
  const titleEl = $(".title-input", area);
  let dirty = false;

  const setSave = (txt, cls = "") => { saveEl.textContent = txt; saveEl.className = "save-state " + cls; };

  async function save() {
    if (!dirty) return;
    dirty = false;
    const patch = { title: titleEl.value.trim(), content: editor.getMarkdown(), mood: entry.mood || null, tags: entry.tags };
    try {
      await updateEntry(entry.id, patch);
      Object.assign(entry, patch);
      const i = entries.findIndex((e) => e.id === entry.id);
      if (i >= 0) entries[i] = { ...entries[i], ...patch };
      const link = $(`.entry-link[data-id="${entry.id}"] .t`, el);
      if (link) link.textContent = patch.title || "Untitled";
      setSave(state.demo ? "Saved (demo)" : "Saved", "saved");
    } catch (err) {
      dirty = true;
      setSave("Couldn't save. Retrying…", "err");
      console.error(err);
      setTimeout(() => queueSave(), 3000);
    }
  }
  const debounced = debounce(save, 700);
  function queueSave() { dirty = true; setSave("Saving…"); debounced(); }

  const editor = createEditor($("[data-blocks]", area), entry.content, queueSave);
  titleEl.addEventListener("input", queueSave);
  titleEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); editor.focus(); } });
  if (!entry.title && !entry.content) titleEl.focus();

  // The title wraps instead of running off the edge.
  const fitTitle = () => { titleEl.style.height = "auto"; titleEl.style.height = titleEl.scrollHeight + "px"; };
  titleEl.addEventListener("input", () => {
    if (titleEl.value.includes("\n")) titleEl.value = titleEl.value.replace(/\n+/g, " ");
    fitTitle();
  });
  requestAnimationFrame(fitTitle);

  // mood (self-reported only), tucked behind one button so it doesn't crowd the page
  const moodToggle = $("[data-mood-toggle]", area), moodRow = $("#mood-options", area);
  moodToggle.addEventListener("click", () => {
    moodRow.hidden = !moodRow.hidden;
    moodToggle.setAttribute("aria-expanded", String(!moodRow.hidden));
    if (!moodRow.hidden) ($("[aria-pressed=true]", moodRow) || $("[data-mood]", moodRow)).focus();
  });
  $$("[data-mood]", area).forEach((b) => b.addEventListener("click", () => {
    entry.mood = entry.mood === b.dataset.mood ? null : b.dataset.mood;
    $$("[data-mood]", area).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mood === entry.mood)));
    $("[data-mood-value]", area).textContent = entry.mood || "Add";
    moodRow.hidden = true;
    moodToggle.setAttribute("aria-expanded", "false");
    moodToggle.focus();
    queueSave();
  }));

  // tags
  const tagsEl = $("[data-tags]", area);
  function renderTags() {
    tagsEl.innerHTML = entry.tags.map((t, i) => `<span class="chip">#${esc(t)}<button type="button" data-rm="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("")
      + `<input class="tag-input" placeholder="+ Add tag" aria-label="Add a tag" maxlength="30" />`;
    $$("[data-rm]", tagsEl).forEach((b) => b.addEventListener("click", () => { entry.tags.splice(+b.dataset.rm, 1); renderTags(); queueSave(); $(".tag-input", tagsEl).focus(); }));
    const input = $(".tag-input", tagsEl);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const t = input.value.trim().replace(/^#/, "").toLowerCase();
        if (t && !entry.tags.includes(t)) { entry.tags.push(t); renderTags(); queueSave(); $(".tag-input", tagsEl).focus(); }
        else input.value = "";
      } else if (e.key === "Backspace" && !input.value && entry.tags.length) {
        entry.tags.pop(); renderTags(); queueSave(); $(".tag-input", tagsEl).focus();
      }
    });
  }
  renderTags();

  // toolbar (mousedown keeps the text selection inside the editor)
  $$("[data-fmt]", area).forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => editor.format(b.dataset.fmt));
  });

  // export
  $("[data-export]", area).addEventListener("click", async () => {
    await debounced.flush();
    const date = new Date(entry.created_at).toISOString().slice(0, 10);
    const head = `# ${entry.title || "Untitled"}\n\n*${fmtLong(entry.created_at)}${entry.mood ? " · Mood: " + entry.mood : ""}${entry.tags.length ? " · " + entry.tags.map((t) => "#" + t).join(" ") : ""}*\n\n`;
    download(`${date}-${slug(entry.title)}.md`, head + editor.getMarkdown() + "\n");
  });

  // delete
  $("[data-delete]", area).addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete this entry?", body: "This can't be undone.", confirmLabel: "Delete entry", danger: true });
    if (!ok) return;
    debounced.cancel(); dirty = false;
    try { await deleteEntry(entry.id); deleted = true; toast("Entry deleted"); location.hash = "#/journal"; }
    catch (err) { toast("Couldn't delete. " + err.message); }
  });

  // reflect
  const reflEl = $("[data-reflection]", area);
  $("[data-reflect]", area).addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    await debounced.flush();
    const text = plain(editor.getMarkdown());
    if (text.length < 30) {
      reflEl.innerHTML = `<div class="state-inline notcfg"><div><strong>Write a little more first.</strong> Luna needs a few sentences to reflect on.</div></div>`;
      return;
    }
    btn.disabled = true;
    reflEl.innerHTML = aiLoading("Luna is reading this entry…");
    const [r, s] = await Promise.all([
      callAI("reflect-entry", { entry_id: entry.id }),
      callAI("safety-check", { text: `${titleEl.value}\n\n${text}` }),
    ]);
    btn.disabled = false;
    const safety = s.ok && s.data && s.data.flagged ? safetyNote() : "";
    if (!r.ok) { reflEl.innerHTML = safety + aiProblem(r, { retry: true }); const rt = $("[data-retry]", reflEl); rt && rt.addEventListener("click", () => btn.click()); return; }
    reflEl.innerHTML = safety + `<div class="card">
      <div class="card-head"><span class="eyebrow">Luna's reflection</span>
        <button type="button" class="btn btn-ghost btn-sm" data-close>Hide</button></div>
      <div class="reflection-body">${esc(r.data.reflection || "")}</div>
      <p class="mt-4 small muted">Luna reflects on what you wrote. It isn't advice or a diagnosis, and it can be wrong.</p>
    </div>`;
    $("[data-close]", reflEl).addEventListener("click", () => (reflEl.innerHTML = ""));
  });

  // flush on tab close
  const beforeUnload = () => { if (dirty) debounced.flush(); };
  window.addEventListener("beforeunload", beforeUnload);

  let deleted = false;
  return async () => {
    window.removeEventListener("beforeunload", beforeUnload);
    if (deleted) return;
    await debounced.flush();
    // Don't leave blank entries behind
    if (!titleEl.value.trim() && !plain(editor.getMarkdown())) {
      try { await deleteEntry(entry.id); } catch {}
    }
  };
}
