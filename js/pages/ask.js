import { state } from "../state.js";
import { listEntries } from "../data.js";
import { callAI, aiProblem } from "../ai.js";
import { bunny, emptyState } from "../bunny.js";
import { esc, html, $, $$, fmtShort, toast } from "../util.js";

const MAX_QUESTION = 5000; // keep in step with the textarea maxlength and ask-luna's limit
const SUGGESTIONS = ["What do I write about most?", "What seems to help on hard days?", "When did I last write about feeling proud?"];

// Conversation lives only in this tab, and never crosses between demo and real mode.
let thread = [];
let threadMode = null;
let queued = null;

/** Hand a question to Ask Luna; it's asked as soon as the page opens. */
export function queueQuestion(q) { queued = q; }

const ICON_DOC = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h6l2 2v10H4z M6 7h4 M6 10h4"/></svg>`;

export async function render(main) {
  const mode = state.demo ? "demo" : "real";
  if (threadMode !== mode) { thread = []; threadMode = mode; }
  const entries = await listEntries();
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

  main.innerHTML = "";
  const page = html(`<div class="page">
    <header class="page-head"><div><h1>Ask Luna</h1><p>Questions about your own journal. Every answer links to the entries it used.</p></div>
      <button type="button" class="btn btn-ghost btn-sm" data-clear ${thread.length ? "" : "hidden"}>Clear chat</button></header>
    <div class="ask">
      <div class="thread" data-thread aria-live="polite"></div>
      <div class="composer">
        <form>
          <label for="ask-input" class="sr-only">Ask about your journal</label>
          <textarea id="ask-input" rows="1" placeholder="Ask about your journal…" maxlength="5000"></textarea>
          <button type="submit" class="btn btn-primary">Ask</button>
        </form>
        <p class="small ask-count" data-count aria-live="polite" hidden></p>
        <p class="center mt-2 small muted">Luna answers only from your entries. It isn't a therapist and can be wrong.</p>
      </div>
    </div></div>`);
  main.append(page);

  const threadEl = $("[data-thread]", page);
  const form = $("form", page), input = $("textarea", page), sendBtn = $("button[type=submit]", form);
  let busy = false;

  function cites(ids = []) {
    const list = ids.map((id) => byId[id]).filter(Boolean);
    if (!list.length) return "";
    return `<div class="cites" aria-label="Sources">${list.map((e) => `<a class="cite" href="#/journal/${e.id}">${ICON_DOC}${esc(e.title || "Untitled")} · ${fmtShort(e.created_at)}</a>`).join("")}</div>`;
  }

  function draw() {
    $("[data-clear]", page).hidden = !thread.length;
    if (!thread.length) {
      threadEl.innerHTML = entries.length
        ? emptyState({
            title: "What would you like to understand?",
            text: "Ask about patterns, people, or moments in your journal.",
            actions: `<div class="suggestions">${SUGGESTIONS.map((s) => `<button type="button" class="chip chip-btn" data-suggest>${esc(s)}</button>`).join("")}</div>`,
          })
        : emptyState({ title: "Nothing to read yet", text: "Luna answers from your entries. Write a couple first.", actions: `<a class="btn" href="#/journal">Go to journal</a>` });
      $$("[data-suggest]", threadEl).forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
      return;
    }
    threadEl.innerHTML = thread.map((m) => {
      if (m.role === "user") return `<div class="msg user">${esc(m.text)}</div>`;
      if (m.pending) return `<div class="msg luna loading"><div class="who">Luna</div><div class="hstack gap-3" role="status">${bunny("small")}<span class="muted">Reading your journal…</span></div></div>`;
      if (m.problem) return `<div class="msg luna"><div class="who">Luna</div>${aiProblem(m.problem)}</div>`;
      return `<div class="msg luna"><div class="who">Luna<button type="button" class="link-btn small copy-btn" data-copy="${thread.indexOf(m)}">Copy</button></div><div class="body">${esc(m.text)}</div>${cites(m.citations)}${m.citations && !m.citations.some((id) => byId[id]) ? `<p class="mt-2 small muted">No specific entries were cited for this answer.</p>` : ""}</div>`;
    }).join("");
    $$("[data-copy]", threadEl).forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(thread[+b.dataset.copy].text); toast("Answer copied"); }
      catch { toast("Couldn't copy. Select the text instead."); }
    }));
    threadEl.lastElementChild && threadEl.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function ask(q) {
    q = q.trim();
    if (!q || busy) return;
    busy = true; sendBtn.disabled = true;
    const history = thread.filter((m) => !m.pending && !m.problem).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    thread.push({ role: "user", text: q });
    const pending = { role: "luna", pending: true };
    thread.push(pending);
    draw();
    const r = await callAI("ask-luna", { question: q, history });
    const i = thread.indexOf(pending);
    thread[i] = r.ok ? { role: "luna", text: r.data.answer || "", citations: r.data.citations || [] } : { role: "luna", problem: r };
    busy = false; sendBtn.disabled = false;
    draw();
    input.focus();
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; resize(); ask(q); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  // Grows with the question up to about 8 lines (max-height in CSS), then scrolls.
  const resize = () => {
    input.style.height = "auto";
    const max = parseFloat(getComputedStyle(input).maxHeight);
    input.style.height = Math.min(input.scrollHeight, max) + "px";
    input.style.overflowY = input.scrollHeight > max ? "auto" : "hidden";
  };
  input.addEventListener("input", resize);
  const countEl = $("[data-count]", page);
  const updateCount = () => {
    const n = input.value.length;
    countEl.hidden = n <= MAX_QUESTION * 0.8; // only worth showing when the box is over 80% full
    countEl.textContent = `${n.toLocaleString()} / ${MAX_QUESTION.toLocaleString()}`;
  };
  input.addEventListener("input", updateCount);
  form.addEventListener("submit", updateCount);
  $("[data-clear]", page).addEventListener("click", () => { thread = []; draw(); input.focus(); });

  draw();
  if (queued) { const q = queued; queued = null; ask(q); }
}
