// "Import journals" dialog: pick a source, choose files, check what was found, import.
// Files are read in the browser. Nothing is sent to the AI.
import { state } from "./state.js";
import { listEntries, importEntries } from "./data.js";
import { noteToEntry, splitEntry, isNote, MAX_FILES } from "./import-parse.js";
import { BRAND } from "./brand-icons.js";
import { esc, html, $, $$, dayKey, fmtDate, openModal, toast } from "./util.js";

const FOLDER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const SOURCES = [
  { key: "notion", name: "Notion", icon: BRAND.notion, accept: ".zip,.md,.markdown",
    how: "In Notion, open ••• → Export → Markdown & CSV. Choose the .zip it downloads." },
  { key: "googledocs", name: "Google Docs", icon: BRAND.googledocs, accept: ".md,.markdown,.txt",
    how: "In each doc, choose File → Download → Markdown (.md) or Plain text (.txt)." },
  { key: "obsidian", name: "Obsidian", icon: BRAND.obsidian, folder: true,
    how: "Choose your vault folder. Every note (.md) in it is imported." },
  { key: "desktop", name: "Files on this computer", icon: FOLDER, accept: ".md,.markdown,.txt,.zip",
    how: "Markdown or plain-text files, or a .zip of them." },
];

/** Reads every note out of the chosen files, opening .zip files (and zips inside them). */
async function readNotes(files) {
  const notes = [];
  let JSZip = null;
  async function fromZip(data) {
    JSZip ||= (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
    const zip = await JSZip.loadAsync(data);
    for (const f of Object.values(zip.files)) {
      if (f.dir || notes.length >= MAX_FILES) continue;
      if (/\.zip$/i.test(f.name)) await fromZip(await f.async("arraybuffer")); // Notion nests zips in big exports
      else if (isNote(f.name)) notes.push({ path: f.name, text: await f.async("string"), modified: f.date?.getTime() });
    }
  }
  for (const file of files) {
    if (notes.length >= MAX_FILES) break;
    const path = file.webkitRelativePath || file.name;
    if (/\.zip$/i.test(file.name)) await fromZip(file);
    else if (isNote(path)) notes.push({ path, text: await file.text(), modified: file.lastModified });
  }
  return notes;
}

/** Preview of entries before saving: date, title, how it starts, and its length. */
export function previewTable(rows) {
  return `<div class="split-table-wrap"><table class="split-table">
    <thead><tr><th scope="col">Date</th><th scope="col">Title</th><th scope="col">Starts with</th><th scope="col" class="num">Characters</th></tr></thead>
    <tbody>${rows.map((e) => `<tr><td>${esc(fmtDate(e.created_at))}</td><td>${esc(e.title)}</td><td class="muted">${esc(e.content.slice(0, 60))}${e.content.length > 60 ? "…" : ""}</td><td class="num">${e.content.length.toLocaleString()}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

export function openImport({ onDone }) {
  const el = html(`<div class="import">
    <h2>Import journals</h2>
    <p class="muted">Bring in entries you've written somewhere else. Titles and dates are kept. Files are read on this device and nothing is sent to the AI.</p>
    <div class="import-sources" role="list">
      ${SOURCES.map((s) => `<button type="button" class="import-source" role="listitem" data-source="${s.key}">
        <span class="logo">${s.icon}</span>
        <span class="text"><span class="name">${esc(s.name)}</span><span class="how">${esc(s.how)}</span></span>
      </button>`).join("")}
    </div>
    <input type="file" data-file hidden multiple />
    <div data-step aria-live="polite"></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button></div>
  </div>`);
  const close = openModal(el, { label: "Import journals" });
  $("[data-close]", el).addEventListener("click", close);

  const input = $("[data-file]", el), step = $("[data-step]", el);
  let source = null;

  $$("[data-source]", el).forEach((b) => b.addEventListener("click", () => {
    source = SOURCES.find((s) => s.key === b.dataset.source);
    input.value = "";
    input.toggleAttribute("webkitdirectory", Boolean(source.folder));
    source.folder ? input.removeAttribute("accept") : input.setAttribute("accept", source.accept);
    input.click();
  }));

  input.addEventListener("change", async () => {
    if (!input.files.length) return;
    step.innerHTML = `<p class="import-status">Reading ${input.files.length} ${input.files.length === 1 ? "file" : "files"}…</p>`;
    let notes;
    try { notes = await readNotes([...input.files]); }
    catch (err) { step.innerHTML = `<p class="import-status error">Couldn't read those files. ${esc(err.message || "")}</p>`; return; }

    // Notes that mark days inline ("10.22- … 10.23- …") become one entry per day.
    const parsed = notes.map((n) => noteToEntry(n.path, n.text, n.modified)).filter(Boolean).flatMap((e) => splitEntry(e));
    const splitDays = parsed.filter((e) => e.split === "day").length;
    const existing = new Set((await listEntries()).map((e) => `${e.title}|${dayKey(e.created_at)}`));
    const fresh = parsed.filter((e) => !existing.has(`${e.title}|${dayKey(e.created_at)}`));
    const skipped = parsed.length - fresh.length, empty = notes.length - parsed.length, trimmed = fresh.filter((e) => e.trimmed).length;
    fresh.sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (!fresh.length) {
      step.innerHTML = `<p class="import-status">${notes.length ? `Nothing new to import from ${esc(source.name)}.` : "No Markdown or text notes were found in what you picked."}${skipped ? ` ${skipped} already in your journal.` : ""}</p>`;
      return;
    }
    step.innerHTML = `<div class="import-preview">
      <p class="import-status"><strong>${fresh.length} ${fresh.length === 1 ? "entry" : "entries"}</strong> found in ${esc(source.name)}${notes.length >= MAX_FILES ? ` (the first ${MAX_FILES} files)` : ""}.</p>
      ${splitDays ? `<p class="small muted">${splitDays} days were found from dates written inline (like “10.22-”). Each becomes its own entry, dated at noon. Check them before importing.</p>` : ""}
      ${splitDays ? previewTable(fresh) : `<ul class="import-list">${fresh.slice(0, 6).map((e) => `<li><span>${esc(e.title)}</span><span class="muted">${fmtDate(e.created_at)}</span></li>`).join("")}
        ${fresh.length > 6 ? `<li class="muted">and ${fresh.length - 6} more</li>` : ""}</ul>`}
      ${[skipped && `${skipped} already in your journal will be skipped.`, empty && `${empty} empty ${empty === 1 ? "note was" : "notes were"} left out.`,
         trimmed && `${trimmed} very long ${trimmed === 1 ? "note is" : "notes are"} shortened to 100,000 characters.`].filter(Boolean).map((t) => `<p class="small muted">${t}</p>`).join("")}
      ${state.demo ? `<p class="small import-note">You're in demo mode. Turn it off and sign in to import, so sample data and your real journal never mix.</p>` : ""}
      <button type="button" class="btn btn-primary" data-go ${state.demo ? "disabled" : ""}>Import ${fresh.length} ${fresh.length === 1 ? "entry" : "entries"}</button>
    </div>`;

    let imported = 0; // so "Try again" picks up where a failed import stopped
    $("[data-go]", step).addEventListener("click", async (e) => {
      const go = e.currentTarget;
      go.disabled = true;
      try {
        const before = imported;
        await importEntries(fresh.slice(before), (done) => {
          imported = before + done;
          go.textContent = `Importing ${imported} of ${fresh.length}…`;
        });
        close();
        toast(`Imported ${imported} ${imported === 1 ? "entry" : "entries"}`);
        onDone && onDone();
      } catch (err) {
        go.disabled = false;
        go.textContent = "Try again";
        step.insertAdjacentHTML("beforeend", `<p class="import-status error">Import stopped: ${esc(err.message || "something went wrong")}. Entries already imported are kept.</p>`);
      }
    });
  });
}
