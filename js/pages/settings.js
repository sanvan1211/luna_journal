import { state, MODELS } from "../state.js";
import { AI_PROVIDER } from "../config.js";
import { listEntries, listInsights, listMemory, deleteMemory, deleteAllInsights, deleteAccount, deleteAllChats } from "../data.js";
import { bunny, emptyState } from "../bunny.js";
import { renderAIModel } from "../ai-model-settings.js";
import { esc, html, $, $$, dayKey, fmtLong, download, toast, confirmDialog } from "../util.js";

// Where writing goes depends on which AI provider the Edge Functions use (see js/config.js).
const AI_HANDLING = {
  anthropic: [
    "Requests go from your browser to Luna's server functions, which call Anthropic's Claude. Your browser never holds an AI key.",
    "Anthropic doesn't train its models on data sent through its API by default.",
  ],
  ollama: ["Luna's AI runs on this computer with Ollama. Your writing never leaves your machine."],
  huggingface: [
    "Requests go from your browser to Luna's server functions, which call an open model through Hugging Face. Your browser never holds an AI key.",
    "The Hugging Face provider that runs the model handles requests under its own privacy policy.",
  ],
  groq: [
    "Requests go from your browser to Luna's server functions, which call an open model through Groq. Your browser never holds an AI key.",
    "Groq handles requests under its own privacy policy.",
  ],
  openai: [
    "Requests go from your browser to Luna's server functions, which call OpenAI's API. Your browser never holds an AI key.",
    "OpenAI handles API requests under its own privacy policy.",
  ],
};
const OWN_PROVIDER = { groq: "Groq", huggingface: "Hugging Face", custom: "custom provider" };
const AI_CREDIT = { anthropic: "Claude by Anthropic", ollama: "open models running in Ollama", huggingface: "open models on Hugging Face", groq: "open models on Groq", openai: "OpenAI" };

// How this account signs in, from Supabase's app_metadata.provider.
const signInMethod = (user) => {
  const p = user.app_metadata?.provider || "email";
  return { google: "Google", email: "Email" }[p] || p[0].toUpperCase() + p.slice(1);
};

// Quote shown in "About Luna". Set to { text: "…", by: "…" } to show it; null hides it.
const QUOTE = null;

const TRASH = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>`;

export async function render(main, route) {
  let [memory, insights] = await Promise.all([listMemory(), listInsights()]);

  main.innerHTML = "";
  const page = html(`<div class="page">
    <header class="page-head"><div><h1>Settings &amp; privacy</h1><p>What Luna keeps, what it sends, and how to remove it.</p></div></header>
    <div class="settings">

      <section class="setting" aria-labelledby="mem-h">
        <header><h2 id="mem-h">Luna's memory</h2>
          <p>Short notes Luna keeps so it can understand your journal over time. Delete anything you don't want it to remember.</p></header>
        <div data-memory></div>
      </section>

      <section class="setting" aria-labelledby="ins-h">
        <header><h2 id="ins-h">Insights</h2><p data-ins-count></p></header>
        <div><button type="button" class="btn btn-danger btn-sm" data-del-insights>Delete all insights</button></div>
      </section>

      <section class="setting" aria-labelledby="aim-h">
        <header><h2 id="aim-h">AI model</h2>
          <p>Luna uses its own AI by default. You can connect your own Groq or Hugging Face key instead, so you get your own limits.</p></header>
        <div data-ai-model></div>
      </section>

      <section class="setting" aria-labelledby="ai-h">
        <header><h2 id="ai-h">What gets sent to the AI</h2>
          <p>Only what you ask for, only when you press a button. Nothing is analyzed in the background.</p></header>
        <div class="plain">
          <h3>When you press…</h3>
          <dl class="sent-list">
            <div><dt>Reflect with Luna</dt><dd>That one entry's title and text, plus your conversation with Luna about it.</dd></div>
            <div><dt>Add to journal</dt><dd>The same entry and conversation, to draft a summary you check before it's added.</dd></div>
            <div><dt>Look for patterns</dt><dd>Your recent entries: title, text, date, tags, and the mood you picked.</dd></div>
            <div><dt>Ask Luna</dt><dd>Your question and the entries most related to it.</dd></div>
            <div><dt>Check-in reflection</dt><dd>Only your check-in answers.</dd></div>
          </dl>
          <h3>How it's handled</h3>
          <ul>
            ${state.ownAI
              ? `<li>You connected your own ${esc(OWN_PROVIDER[state.ownAI.provider] || "AI provider")} key, so your requests go from Luna's server functions to ${esc(OWN_PROVIDER[state.ownAI.provider] || "that provider")} using ${esc(state.ownAI.model)}, under that provider's own privacy policy. Your key is stored encrypted on the server and never sent back to your browser.</li>
                 <li>Luna's rules (no diagnosing, no mood labels, support resources) are sent with every request, whichever provider you use.</li>`
              : `${(AI_HANDLING[AI_PROVIDER] || AI_HANDLING.groq).map((t) => `<li>${esc(t)}</li>`).join("")}
                 <li>You pick the model under Account: ${esc(MODELS.fast.name)} (fast) or ${esc(MODELS.thoughtful.name)} (more thoughtful). Safety checks always use the fast one.</li>
                 <li>If you connect your own key under AI model, your requests go to the provider you choose (Groq, Hugging Face, or another service) instead.</li>`}
            <li>A short safety check reads text you send for reflection, only to decide whether to show support resources.</li>
            <li>Your entries are stored in a database where only your account can read them. Luna never sells or shares them.</li>
            <li>Moods are only what you choose. Luna never assigns a mood or a score.</li>
          </ul>
        </div>
      </section>

      <section class="setting" aria-labelledby="demo-h">
        <header><h2 id="demo-h">Demo mode</h2><p>A clearly labeled sample journal, kept fully separate from your real entries.</p></header>
        <div><label class="switch"><input type="checkbox" data-demo-switch ${state.demo ? "checked" : ""} /><span class="switch-track" aria-hidden="true"></span><span class="switch-label">${state.demo ? "On" : "Off"}</span></label></div>
      </section>

      <section class="setting" aria-labelledby="acct-h">
        <header><h2 id="acct-h">Your data</h2>
          <p>${state.session ? `Signed in as ${esc(state.session.user.email)} <span class="chip" data-signin-method>${esc(signInMethod(state.session.user))}</span>` : "Everything you write belongs to you."}</p></header>
        <div class="data-rows">
          <div class="data-row">
            <div><strong>Download all entries</strong><p>One Markdown file with everything you've written.</p></div>
            <button type="button" class="btn btn-sm" data-export-all>Download .md</button>
          </div>
          <div class="data-row">
            <div><strong>Delete all my Ask Luna chats</strong><p>Removes every saved chat and message${state.demo ? " in this demo" : ""}. Your journal entries stay as they are.</p></div>
            <button type="button" class="btn btn-danger btn-sm" data-del-chats>Delete all chats</button>
          </div>
          <div class="data-row danger">
            <div><strong>Delete account</strong><p>Permanently deletes your account, entries, insights, and Luna's memory.</p></div>
            <button type="button" class="btn btn-danger btn-sm" data-del-account ${state.demo ? "disabled title=\"Not available in demo mode\"" : ""}>Delete account and all data</button>
          </div>
        </div>
      </section>

      <section class="setting about" aria-labelledby="about-h">
        <header>${bunny("small")}<h2 id="about-h">About Luna</h2><p>A private journal that helps you understand what you've written.</p></header>
        <div class="about-body">
          <p>Luna is a place to write and then look back. It can point out patterns in your own words, always with the entries behind them, and answer questions about your journal. Luna is not a therapist and never diagnoses. If things feel heavy, support is always one tap away.</p>
          ${QUOTE ? `<figure class="about-quote"><blockquote>“${esc(QUOTE.text)}”</blockquote><figcaption>${esc(QUOTE.by)}</figcaption></figure>` : ""}
          <p class="about-note">You are not alone.</p>
          <dl class="about-facts">
            <div><dt>Created by</dt><dd>Sanhith Vandara · <a href="https://github.com/sanvan1211" target="_blank" rel="noopener noreferrer">GitHub</a></dd></div>
            <div><dt>Made with</dt><dd>HTML, CSS, JavaScript, Supabase, and ${esc(AI_CREDIT[AI_PROVIDER] || AI_CREDIT.groq)}</dd></div>
          </dl>
        </div>
      </section>
    </div></div>`);
  main.append(page);

  const aim = $("[data-ai-model]", page);
  renderAIModel(aim).then(() => {
    if (route && route.query.get("focus") === "ai-model") aim.closest("section").scrollIntoView({ block: "start" });
  });

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
      <button type="button" class="icon-btn danger" data-del="${m.id}" aria-label="Forget: ${esc(m.content)}" title="Forget this">${TRASH}</button></li>`).join("")}</ul>`;
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

  $("[data-del-chats]", page).addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Delete all Ask Luna chats?", body: "Every saved chat and message will be deleted. Your journal entries, insights, and Luna's memory stay exactly as they are.", confirmLabel: "Delete all chats", danger: true });
    if (!ok) return;
    try { await deleteAllChats(); toast("All chats deleted"); }
    catch (err) { console.error(err); toast("Couldn't delete chats. " + err.message); }
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
