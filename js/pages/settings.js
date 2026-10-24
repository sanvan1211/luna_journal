import { state } from "../state.js";
import { listEntries, listInsights, listMemory, deleteMemory, deleteAllInsights, deleteAccount } from "../data.js";
import { bunny, emptyState } from "../bunny.js";
import { esc, html, $, $$, dayKey, fmtLong, download, toast, confirmDialog } from "../util.js";

// Quote shown in "About Luna". Set to { text: "…", by: "…" } to show it; null hides it.
const QUOTE = null;

const TRASH = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>`;

export async function render(main) {
  let [memory, insights] = await Promise.all([listMemory(), listInsights()]);

  main.innerHTML = "";
  const page = html(`<div class="page">
    <header class="page-head"><div><h1>Settings &amp; privacy</h1><p>What Luna keeps, what it sends, and how to remove it.</p></div></header>
    <div class="settings">

      <section class="card" aria-labelledby="mem-h">
        <div class="card-head"><div><h2 id="mem-h">Luna's memory</h2>
          <p class="muted small" style="margin:4px 0 0">Short notes Luna keeps so it can understand your journal over time. Delete anything you don't want it to remember.</p></div></div>
        <div data-memory></div>
      </section>

      <section class="card" aria-labelledby="ins-h">
        <div class="row-between">
          <div><h2 id="ins-h">Insights</h2><p class="muted small" style="margin:4px 0 0" data-ins-count></p></div>
          <button type="button" class="btn btn-danger btn-sm" data-del-insights>Delete all insights</button>
        </div>
      </section>

      <section class="card plain" aria-labelledby="ai-h">
        <h2 id="ai-h">What gets sent to the AI</h2>
        <p class="muted" style="margin:8px 0 0">Luna only sends your writing to the AI when you press a button that asks for it. Nothing is analyzed in the background.</p>
        <h3>When you press…</h3>
        <ul>
          <li><strong style="color:var(--text)">Reflect with Luna:</strong> that one entry's title and text.</li>
          <li><strong style="color:var(--text)">Look for patterns:</strong> your recent entries (title, text, date, tags, and the mood you picked).</li>
          <li><strong style="color:var(--text)">Ask Luna:</strong> your question and the entries most related to it.</li>
          <li><strong style="color:var(--text)">Check-in reflection:</strong> only your check-in answers.</li>
        </ul>
        <h3>How it's handled</h3>
        <ul>
          <li>Requests go from your browser to Luna's server functions, which call Anthropic's Claude. Your browser never holds an AI key.</li>
          <li>You pick the model under Account: Claude Haiku 5.5 (fast) or Claude Sonnet 5.5 (more thoughtful). Safety checks always use Haiku.</li>
          <li>Anthropic doesn't train its models on data sent through its API by default.</li>
          <li>A short safety check reads text you send for reflection, only to decide whether to show support resources.</li>
          <li>Your entries are stored in a database where only your account can read them. Luna never sells or shares them.</li>
          <li>Moods are only what you choose. Luna never assigns a mood or a score.</li>
        </ul>
      </section>

      <section class="card" aria-labelledby="demo-h">
        <div class="row-between">
          <div><h2 id="demo-h">Demo mode</h2><p class="muted small" style="margin:4px 0 0">Load a clearly labeled sample journal. It's kept fully separate from your real entries.</p></div>
          <label class="switch"><input type="checkbox" data-demo-switch ${state.demo ? "checked" : ""} /><span class="switch-track" aria-hidden="true"></span><span class="switch-label">${state.demo ? "On" : "Off"}</span></label>
        </div>
      </section>

      <section class="card danger-zone" aria-labelledby="acct-h">
        <h2 id="acct-h" style="margin-bottom:14px">Your data</h2>
        <div class="row-between">
          <div><strong>Download all entries</strong><p class="muted small" style="margin:2px 0 0">One Markdown file with everything you've written.</p></div>
          <button type="button" class="btn btn-sm" data-export-all>Download .md</button>
        </div>
        <div class="row-between">
          <div><strong>Delete account</strong><p class="muted small" style="margin:2px 0 0">Permanently deletes your account, entries, insights, and Luna's memory.</p></div>
          <button type="button" class="btn btn-danger btn-sm" data-del-account ${state.demo ? "disabled title=\"Not available in demo mode\"" : ""}>Delete account and all data</button>
        </div>
        ${state.session ? `<p class="small muted" style="margin:16px 0 0">Signed in as ${esc(state.session.user.email)}</p>` : ""}
      </section>

      <section class="card about" aria-labelledby="about-h">
        <div class="about-head">${bunny("small")}
          <div><h2 id="about-h">About Luna</h2><p class="muted small" style="margin:4px 0 0">A private journal that helps you understand what you've written.</p></div></div>
        <p class="muted" style="margin:0">Luna is a place to write and then look back. It can point out patterns in your own words, always with the entries behind them, and answer questions about your journal. Luna is not a therapist and never diagnoses. If things feel heavy, support is always one tap away.</p>
        ${QUOTE ? `<figure class="about-quote"><blockquote>“${esc(QUOTE.text)}”</blockquote><figcaption>${esc(QUOTE.by)}</figcaption></figure>` : ""}
        <dl class="about-facts">
          <div><dt>Built for</dt><dd>Congressional App Challenge</dd></div>
          <div><dt>Made with</dt><dd>HTML, CSS, JavaScript, Supabase, and Claude by Anthropic</dd></div>
          <div><dt>Mascot</dt><dd>Luna, a Holland Lop</dd></div>
        </dl>
      </section>
    </div></div>`);
  main.append(page);

  const memEl = $("[data-memory]", page);
  const label = { theme: "Theme", goal: "Goal", strategy: "Helps me" };
  function drawMemory() {
    if (!memory.length) {
      memEl.innerHTML = emptyState({ text: "Luna isn't remembering anything right now. Notes appear here when Luna looks for patterns." });
      return;
    }
    memEl.innerHTML = `<ul class="memory-list">${memory.map((m) => `<li>
      <span class="type">${label[m.type] || esc(m.type)}</span>
      <span class="content">${esc(m.content)}</span>
      <button type="button" class="icon-btn" data-del="${m.id}" aria-label="Forget: ${esc(m.content)}" title="Forget this">${TRASH}</button></li>`).join("")}</ul>`;
    $$("[data-del]", memEl).forEach((b) => b.addEventListener("click", async () => {
      try {
        await deleteMemory(b.dataset.del);
        const idx = memory.findIndex((m) => m.id === b.dataset.del);
        memory.splice(idx, 1);
        drawMemory();
        toast("Luna forgot that");
        const next = $$("[data-del]", memEl)[Math.min(idx, memory.length - 1)];
        next && next.focus();
      } catch (err) { toast("Couldn't delete. " + err.message); }
    }));
  }
  drawMemory();

  const insCount = $("[data-ins-count]", page);
  const drawIns = () => { insCount.textContent = insights.length ? `${insights.length} saved ${insights.length === 1 ? "insight" : "insights"}. Deleting them doesn't touch your entries.` : "No saved insights."; $("[data-del-insights]", page).disabled = !insights.length; };
  drawIns();

  $("[data-del-insights]", page).addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete all insights?", body: "Luna's saved insights will be removed. Your journal entries stay exactly as they are.", confirmLabel: "Delete insights", danger: true });
    if (!ok) return;
    try { await deleteAllInsights(); insights = []; drawIns(); toast("Insights deleted"); }
    catch (err) { toast("Couldn't delete. " + err.message); }
  });

  $("[data-demo-switch]", page).addEventListener("change", (e) => {
    document.dispatchEvent(new CustomEvent("luna:demo-toggle", { detail: e.target.checked }));
  });

  $("[data-export-all]", page).addEventListener("click", async () => {
    const entries = (await listEntries()).slice().reverse();
    const md = entries.map((e) => `# ${e.title || "Untitled"}\n\n*${fmtLong(e.created_at)}${e.mood ? " · Mood: " + e.mood : ""}${(e.tags || []).length ? " · " + e.tags.map((t) => "#" + t).join(" ") : ""}*\n\n${e.content}`).join("\n\n---\n\n");
    download(`luna-journal${state.demo ? "-sample" : ""}-${dayKey(new Date())}.md`, md + "\n");
  });

  $("[data-del-account]", page).addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete your account?",
      body: "This permanently deletes your account and every entry, insight, and memory. It can't be undone. You may want to download your entries first.",
      confirmLabel: "Delete everything", danger: true, requireText: "DELETE",
    });
    if (!ok) return;
    try { await deleteAccount(); toast("Your account and data were deleted"); location.hash = "#/journal"; }
    catch (err) { toast("Couldn't delete account. " + err.message); }
  });
}
