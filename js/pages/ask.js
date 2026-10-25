// Ask Luna: questions about your own journal, saved as chats (like other chat apps).
// Real chats are stored in Supabase (ask_threads / ask_messages); demo chats stay in memory.
// Failed AI calls ("AI not configured", errors) are shown but never saved as Luna's answers.
import { state } from "../state.js";
import { listEntries, listThreads, listMessages, createThread, addMessage, renameThread, deleteThread } from "../data.js";
import { callAI, aiProblem } from "../ai.js";
import { bunny, emptyState } from "../bunny.js";
import { esc, html, $, $$, fmtShort, toast, confirmDialog } from "../util.js";

const MAX_QUESTION = 5000; // keep in step with the textarea maxlength and ask-luna's limit
const SUGGESTIONS = ["What do I write about most?", "What seems to help on hard days?", "When did I last write about feeling proud?"];
const ICON_DOC = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h6l2 2v10H4z M6 7h4 M6 10h4"/></svg>`;
const ICON = {
  plus: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>`,
  edit: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16h3l8.5-8.5-3-3L4 13z"/></svg>`,
  trash: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>`,
  chats: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12v8H8l-4 3z"/></svg>`,
};

let queued = null;
/** Hand a question to Ask Luna; it's asked in a new chat as soon as the page opens. */
export function queueQuestion(q) { queued = q; }

const titleFrom = (q) => { const t = q.replace(/\s+/g, " ").trim(); return t.length > 40 ? t.slice(0, 40).trimEnd() + "…" : t; };

// Today / Yesterday / Previous 7 days / Older, by when the chat was last updated.
function groupOf(iso) {
  const d = new Date(iso), start = new Date(); start.setHours(0, 0, 0, 0);
  const days = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days <= 7 ? "Previous 7 days" : "Older";
}

export async function render(main, route) {
  const [entries, threadsLoaded] = await Promise.all([listEntries(), listThreads()]);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  let threads = threadsLoaded;
  let activeId = route.id && threads.some((t) => t.id === route.id) ? route.id : null;
  let messages = activeId ? await listMessages(activeId) : [];
  let query = "";
  let busy = false;
  let renaming = null;

  main.innerHTML = "";
  const page = html(`<div class="page ask-page">
    <div class="ask-layout">
      <div class="chats-scrim" data-scrim hidden></div>
      <aside class="chats" id="chats-panel" aria-label="Your chats">
        <button type="button" class="btn btn-primary chats-new" data-new>${ICON.plus}New chat</button>
        <label class="sr-only" for="chat-search">Search chats</label>
        <input class="input chats-search" id="chat-search" type="search" placeholder="Search chats" autocomplete="off" />
        <nav class="chats-list" data-list aria-label="Past chats"></nav>
      </aside>
      <section class="ask-main" aria-labelledby="ask-h">
        <header class="page-head ask-head">
          <div class="hstack gap-3">
            <button type="button" class="btn btn-sm chats-toggle" data-drawer aria-controls="chats-panel" aria-expanded="false">${ICON.chats}Chats</button>
            <div><h1 id="ask-h">Ask Luna</h1><p data-sub></p></div>
          </div>
        </header>
        <div class="ask">
          <div class="thread" data-thread aria-live="polite"></div>
          <div class="composer">
            <form>
              <label for="ask-input" class="sr-only">Ask about your journal</label>
              <textarea id="ask-input" rows="1" placeholder="Ask about your journal…" maxlength="${MAX_QUESTION}"></textarea>
              <button type="submit" class="btn btn-primary">Ask</button>
            </form>
            <p class="small ask-count" data-count aria-live="polite" hidden></p>
            <p class="center mt-2 small muted">Luna answers only from your entries. It isn't a therapist and can be wrong.${state.demo ? " Demo chats aren't saved." : ""}</p>
          </div>
        </div>
      </section>
    </div></div>`);
  main.append(page);

  const listEl = $("[data-list]", page), threadEl = $("[data-thread]", page), aside = $(".chats", page);
  const form = $("form", page), input = $("textarea", page), sendBtn = $("button[type=submit]", form);
  const drawerBtn = $("[data-drawer]", page), scrim = $("[data-scrim]", page);

  // ───── Sidebar ─────
  function drawList() {
    const shown = threads.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));
    if (!threads.length) { listEl.innerHTML = `<p class="small muted chats-empty">No chats yet.</p>`; return; }
    if (!shown.length) { listEl.innerHTML = `<p class="small muted chats-empty">No chats match “${esc(query)}”.</p>`; return; }
    const groups = {};
    shown.forEach((t) => (groups[groupOf(t.updated_at)] ||= []).push(t));
    listEl.innerHTML = ["Today", "Yesterday", "Previous 7 days", "Older"].filter((g) => groups[g]).map((g) => `
      <h2 class="chats-group">${g}</h2>
      <ul>${groups[g].map((t) => `<li class="chat-item${t.id === activeId ? " active" : ""}" data-id="${t.id}">
        ${renaming === t.id
          ? `<label class="sr-only" for="rename-${t.id}">Rename chat</label><input class="input chat-rename" id="rename-${t.id}" value="${esc(t.title)}" maxlength="80" />`
          : `<button type="button" class="chat-open" data-open ${t.id === activeId ? `aria-current="true"` : ""}>${esc(t.title)}</button>
             <span class="chat-actions">
               <button type="button" class="icon-btn" data-rename aria-label="Rename ${esc(t.title)}" title="Rename">${ICON.edit}</button>
               <button type="button" class="icon-btn danger" data-delete aria-label="Delete ${esc(t.title)}" title="Delete">${ICON.trash}</button>
             </span>`}
      </li>`).join("")}</ul>`).join("");

    $$("[data-open]", listEl).forEach((b) => b.addEventListener("click", () => openThread(b.closest("[data-id]").dataset.id)));
    $$("[data-rename]", listEl).forEach((b) => b.addEventListener("click", () => { renaming = b.closest("[data-id]").dataset.id; drawList(); }));
    $$("[data-delete]", listEl).forEach((b) => b.addEventListener("click", () => removeThread(b.closest("[data-id]").dataset.id)));
    const r = $(".chat-rename", listEl);
    if (r) {
      r.focus(); r.select();
      let done = false;
      const finish = async (save) => {
        if (done) return; done = true;
        const id = renaming, title = r.value.replace(/\s+/g, " ").trim();
        renaming = null;
        const t = threads.find((x) => x.id === id);
        if (save && t && title && title !== t.title) {
          try {
            Object.assign(t, await renameThread(id, title));
            threads.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          } catch (err) { console.error(err); toast("Couldn't rename. " + err.message); }
        }
        drawList(); drawHead();
        const open = $(`[data-id="${id}"] [data-open]`, listEl); open && open.focus();
      };
      r.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      r.addEventListener("blur", () => finish(true));
    }
  }

  function drawHead() {
    const t = threads.find((x) => x.id === activeId);
    $("[data-sub]", page).textContent = t ? t.title : "Questions about your own journal. Every answer links to the entries it used.";
  }

  async function openThread(id) {
    if (busy) { toast("Wait for Luna to finish answering first."); return; }
    activeId = id;
    history.replaceState(null, "", `#/ask/${id}`);
    closeDrawer(false);
    threadEl.innerHTML = `<div class="state loading" role="status">${bunny("small")}<p>Opening chat…</p></div>`;
    try { messages = await listMessages(id); }
    catch (err) { console.error(err); messages = []; toast("Couldn't open that chat. " + err.message); }
    drawList(); drawHead(); drawThread(); input.focus();
  }

  function newChat() {
    if (busy) { toast("Wait for Luna to finish answering first."); return; }
    activeId = null; messages = [];
    history.replaceState(null, "", "#/ask");
    closeDrawer(false);
    drawList(); drawHead(); drawThread(); input.focus();
  }

  async function removeThread(id) {
    const t = threads.find((x) => x.id === id);
    const ok = await confirmDialog({ title: "Delete this chat?", body: `“${esc(t.title)}” and all of its messages will be deleted. Your journal entries stay exactly as they are.`, confirmLabel: "Delete chat", danger: true });
    if (!ok) return;
    try {
      await deleteThread(id);
      threads = threads.filter((x) => x.id !== id);
      toast("Chat deleted");
      if (id === activeId) newChat(); else drawList();
    } catch (err) { console.error(err); toast("Couldn't delete. " + err.message); }
  }

  // ───── Conversation ─────
  function cites(ids = []) {
    const list = ids.map((id) => byId[id]).filter(Boolean);
    if (!list.length) return "";
    return `<div class="cites" aria-label="Sources">${list.map((e) => `<a class="cite" href="#/journal/${e.id}">${ICON_DOC}${esc(e.title || "Untitled")} · ${fmtShort(e.created_at)}</a>`).join("")}</div>`;
  }

  function drawThread() {
    if (!messages.length) {
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
    threadEl.innerHTML = messages.map((m, i) => {
      if (m.role === "user") return `<div class="msg user">${esc(m.content)}</div>`;
      if (m.pending) return `<div class="msg luna loading"><div class="who">Luna</div><div class="hstack gap-3" role="status">${bunny("small")}<span class="muted">Reading your journal…</span></div></div>`;
      if (m.problem) return `<div class="msg luna"><div class="who">Luna</div>${aiProblem(m.problem)}</div>`;
      const c = Array.isArray(m.citations) ? m.citations : [];
      return `<div class="msg luna"><div class="who">Luna<button type="button" class="link-btn small copy-btn" data-copy="${i}">Copy</button></div><div class="body">${esc(m.content)}</div>${cites(c)}${!c.some((id) => byId[id]) ? `<p class="mt-2 small muted">No specific entries were cited for this answer.</p>` : ""}</div>`;
    }).join("");
    $$("[data-copy]", threadEl).forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(messages[+b.dataset.copy].content); toast("Answer copied"); }
      catch { toast("Couldn't copy. Select the text instead."); }
    }));
    threadEl.lastElementChild && threadEl.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function ask(q) {
    q = q.trim().slice(0, MAX_QUESTION);
    if (!q || busy) return;
    busy = true; sendBtn.disabled = true;
    let threadId = activeId;
    try {
      // The first message creates the chat, titled from the question (no AI call for titles).
      if (!threadId) {
        const t = await createThread(titleFrom(q));
        threads.unshift(t);
        threadId = activeId = t.id;
        history.replaceState(null, "", `#/ask/${t.id}`);
      }
      const recent = messages.filter((m) => !m.pending && !m.problem).slice(-10).map((m) => ({ role: m.role, text: m.content }));
      messages.push(await addMessage(threadId, { role: "user", content: q }));
      const pending = { role: "luna", pending: true };
      messages.push(pending);
      bump(threadId); drawList(); drawHead(); drawThread();

      const r = await callAI("ask-luna", { question: q, thread_id: threadId, ...(state.demo ? { history: recent } : {}) });
      let reply;
      if (r.ok) {
        reply = await addMessage(threadId, { role: "luna", content: r.data.answer || "", citations: r.data.citations || [] });
        bump(threadId);
      } else {
        reply = { role: "luna", problem: r }; // shown, never saved
      }
      if (activeId === threadId) { messages[messages.indexOf(pending)] = reply; }
    } catch (err) {
      console.error("Couldn't save the chat", err);
      messages = messages.filter((m) => !m.pending);
      messages.push({ role: "luna", problem: { ok: false, kind: "error", message: `Couldn't save this chat: ${err.message}` } });
    }
    busy = false; sendBtn.disabled = false;
    drawList(); drawThread();
    input.focus();
  }

  const bump = (id) => {
    const t = threads.find((x) => x.id === id);
    if (t) { t.updated_at = new Date().toISOString(); threads.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)); }
  };

  // ───── Mobile drawer ─────
  const narrow = () => matchMedia("(max-width: 820px)").matches;
  function openDrawer() {
    aside.classList.add("open"); scrim.hidden = false; drawerBtn.setAttribute("aria-expanded", "true");
    ($("[aria-current=true]", aside) || $("[data-new]", aside)).focus();
  }
  function closeDrawer(refocus = true) {
    if (!aside.classList.contains("open")) return;
    aside.classList.remove("open"); scrim.hidden = true; drawerBtn.setAttribute("aria-expanded", "false");
    if (refocus) drawerBtn.focus();
  }
  drawerBtn.addEventListener("click", () => (aside.classList.contains("open") ? closeDrawer() : openDrawer()));
  scrim.addEventListener("click", () => closeDrawer());
  aside.addEventListener("keydown", (e) => { if (e.key === "Escape" && narrow()) closeDrawer(); });

  // ───── Composer ─────
  $("[data-new]", page).addEventListener("click", newChat);
  $("#chat-search", page).addEventListener("input", (e) => { query = e.target.value; drawList(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); const q = input.value; input.value = ""; resize(); updateCount(); ask(q); });
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

  drawList(); drawHead(); drawThread();
  if (queued) { const q = queued; queued = null; if (activeId) newChat(); ask(q); }
  return () => closeDrawer(false);
}
