// "Luna's reflection" under a journal entry, as a conversation: Luna's first reflection, then the
// writer's replies and Luna's answers. After at least one exchange, Luna offers to add a short
// first-person summary to the entry. Nothing is inserted until the writer edits/reads the preview
// and clicks Insert.
//
// Demo mode without an account can't call the AI, so it uses pre-written replies that say they are
// samples (and are labelled "Sample reply (demo mode)"). They never pretend a model wrote them.
import { state } from "./state.js";
import { getEntryChat, saveEntryChat } from "./data.js";
import { callAI, aiProblem, aiLoading } from "./ai.js";
import { safetyNote, supportMini } from "./support.js";
import { URGENT } from "./quote-picks.js";
import { esc, $, fmtLong, toast } from "./util.js";

const MAX_REPLY = 2000;
const DISCLAIMER = "Luna reflects on what you wrote. It isn't advice or a diagnosis, and it can be wrong.";

const SAMPLE = {
  reflection: "This is a pre-written sample, because Luna's AI is off in demo mode, so I haven't actually read your entry. With an account, this first message would reflect on what you wrote here. What part of this day stands out most when you look back at it?",
  replies: [
    "Another pre-written sample. With an account, Luna would answer from this entry and your messages, and nothing else. Is there anything about this day you'd want to remember?",
    "Still a sample reply in demo mode. In the real app, Luna keeps its replies short and sticks to what you wrote. If you added one more line to this entry, what would it say?",
  ],
};

/** A sample summary made only from the writer's own messages, so it adds nothing they didn't say. */
function sampleSummary(messages) {
  const said = messages.filter((m) => m.role === "user").map((m) => m.content.trim().replace(/\s+/g, " ")).join(" ");
  return `I talked with Luna about this entry. What I said: ${said}`;
}

const SEND = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V4M5 9l5-5 5 5"/></svg>`;

/**
 * @param {HTMLElement} el      where the card goes
 * @param {object} opts
 * @param {{ id: string, created_at: string }} opts.entry
 * @param {() => Promise<void>} opts.flush       saves the entry so the server reads the latest text
 * @param {() => string} opts.text               the entry's current plain text (for the safety check)
 * @param {(markdown: string) => void} opts.append  appends a block to the entry and autosaves
 */
export async function mountReflection(el, { entry, flush, text, append }) {
  el.innerHTML = aiLoading("Luna is reading this entry…");
  await flush();

  let chat;
  try { chat = await getEntryChat(entry.id); }
  catch (err) { console.error("Couldn't load the reflection chat", err); chat = { messages: [], offer: null, saved: false }; }
  let { messages, offer } = chat;
  const saved = chat.saved;
  let flagged = URGENT.test(text()) || messages.some((m) => m.role === "user" && URGENT.test(m.content));
  let busy = false;
  let preview = null; // { text, sample } while the summary preview is open
  let sampleTurn = messages.filter((m) => m.sample && m.role === "luna").length;

  const persist = async () => {
    try { await saveEntryChat(entry.id, { messages, offer }); }
    catch (err) { console.error("Couldn't save the reflection chat", err); toast("Couldn't save this conversation. " + err.message); }
  };

  /** Calls reflect-entry, or returns a labelled sample when there's no account in demo mode. */
  async function ask(mode) {
    await flush();
    const r = await callAI("reflect-entry", {
      entry_id: entry.id, mode,
      messages: messages.filter((m) => !m.sample).map(({ role, content }) => ({ role, content })),
    });
    if (r.ok) return { text: r.data.reflection || r.data.reply || r.data.summary || "", sample: false };
    if (r.kind === "demo") {
      if (mode === "reflect") return { text: SAMPLE.reflection, sample: true };
      if (mode === "summary") return { text: sampleSummary(messages), sample: true };
      return { text: SAMPLE.replies[sampleTurn++ % SAMPLE.replies.length], sample: true };
    }
    return { problem: r };
  }

  // Safety check on the writer's words. Local first (instant, works in demo), then the server check.
  async function checkSafety(words) {
    if (URGENT.test(words)) flagged = true;
    if (flagged) return;
    const s = await callAI("safety-check", { text: words });
    if (s.ok && s.data && s.data.flagged) { flagged = true; render(); }
  }

  // ───── first reflection ─────
  if (!messages.length) {
    const [first] = await Promise.all([ask("reflect"), checkSafety(text())]);
    if (first.problem) {
      el.innerHTML = (flagged ? safetyNote() : "") + aiProblem(first.problem, { retry: true });
      const rt = $("[data-retry]", el);
      rt && rt.addEventListener("click", () => mountReflection(el, { entry, flush, text, append }));
      return;
    }
    messages.push({ role: "luna", content: first.text, at: new Date().toISOString(), ...(first.sample ? { sample: true } : {}) });
    persist();
  }

  el.innerHTML = `<div data-safety></div>
    <div class="card refl">
      <div class="card-head"><span class="eyebrow">Luna's reflection</span>
        <button type="button" class="btn btn-ghost btn-sm" data-close>Hide</button></div>
      <div class="refl-thread" data-thread role="log" aria-label="Conversation with Luna" aria-live="polite"></div>
      <div data-offer></div>
      <form class="refl-composer" data-composer novalidate>
        <label class="sr-only" for="refl-input">Reply to Luna</label>
        <textarea id="refl-input" rows="1" maxlength="${MAX_REPLY}" placeholder="Reply to Luna…" enterkeyhint="send"></textarea>
        <button type="submit" class="send-btn" aria-label="Send" title="Send (Enter)">${SEND}</button>
      </form>
      <p class="refl-hint small faint">Enter to send · Shift+Enter for a new line</p>
      <p class="mt-3 small muted">${DISCLAIMER}</p>
      ${saved || state.demo ? "" : `<p class="small faint m-0">This conversation isn't saved yet, so it will be gone if you leave this entry. (Saving needs a one-time database update.)</p>`}
      ${state.demo ? `<p class="small faint m-0">Demo mode: this conversation is kept only until you leave demo mode.</p>` : ""}
      <div class="mt-3">${supportMini()}</div>
    </div>`;

  const threadEl = $("[data-thread]", el), offerEl = $("[data-offer]", el), form = $("[data-composer]", el);
  const input = $("textarea", form), sendBtn = $("button", form);
  $("[data-close]", el).addEventListener("click", () => (el.innerHTML = ""));

  const bubble = (m) => m.role === "user"
    ? `<div class="msg user">${esc(m.content)}</div>`
    : `<div class="msg luna"><div class="who">Luna${m.sample ? ` <span class="sample-tag">Sample reply (demo mode)</span>` : ""}</div><div class="body">${esc(m.content)}</div></div>`;

  function render({ pending = false, problem = null } = {}) {
    $("[data-safety]", el).innerHTML = flagged ? safetyNote() : "";
    threadEl.innerHTML = messages.map(bubble).join("")
      + (pending ? `<div class="msg luna"><div class="who">Luna</div><div class="typing-dots" role="status" aria-label="Luna is writing"><span></span><span></span><span></span></div></div>` : "")
      + (problem ? `<div class="msg luna">${aiProblem(problem)}</div>` : "");
    threadEl.scrollTop = threadEl.scrollHeight;
    renderOffer();
  }

  // The offer appears once the writer has replied and Luna has answered, until it's answered.
  const exchanged = () => messages.some((m, i) => m.role === "user" && messages.slice(i + 1).some((n) => n.role === "luna"));
  function renderOffer() {
    if (preview) return; // the preview is drawn separately and stays put while it's open
    if (offer || !exchanged() || busy) { offerEl.innerHTML = ""; return; }
    offerEl.innerHTML = `<div class="refl-offer" role="group" aria-label="Add to journal">
      <p class="m-0">Do you want to add this to your journal for ${esc(fmtLong(entry.created_at))}?</p>
      <div class="hstack gap-2"><button type="button" class="btn btn-primary btn-sm" data-add>Add</button>
        <button type="button" class="btn btn-ghost btn-sm" data-not-now>Not now</button></div>
    </div>`;
    $("[data-add]", offerEl).addEventListener("click", startSummary);
    $("[data-not-now]", offerEl).addEventListener("click", () => { offer = "dismissed"; persist(); renderOffer(); });
  }

  async function startSummary() {
    busy = true;
    offerEl.innerHTML = aiLoading("Luna is writing a short summary for you to check…");
    const s = await ask("summary");
    busy = false;
    if (s.problem) { offerEl.innerHTML = aiProblem(s.problem); renderOfferLater(); return; }
    preview = { text: s.text, sample: s.sample };
    offerEl.innerHTML = `<div class="refl-preview">
      <label class="field" for="refl-summary">Check it and edit anything before it goes in your entry
        ${s.sample ? `<span class="sample-tag">Sample summary (demo mode)</span>` : ""}</label>
      <textarea class="textarea" id="refl-summary" rows="5"></textarea>
      <p class="small muted m-0">It will be added at the end of this entry under "Reflection with Luna".</p>
      <div class="hstack gap-2"><button type="button" class="btn btn-primary btn-sm" data-insert>Insert</button>
        <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></div>
    </div>`;
    const box = $("textarea", offerEl);
    box.value = s.text;
    box.focus();
    $("[data-insert]", offerEl).addEventListener("click", () => {
      const note = box.value.trim();
      if (!note) { box.focus(); return; }
      append(`## Reflection with Luna\n\n${note}`);
      offer = "added"; preview = null; persist(); renderOffer();
      toast("Added to your entry");
    });
    $("[data-cancel]", offerEl).addEventListener("click", () => { offer = "dismissed"; preview = null; persist(); renderOffer(); });
  }
  // After a failed summary, show the offer again a moment later so it can be retried.
  const renderOfferLater = () => setTimeout(() => { if (!busy && !preview) renderOffer(); }, 4000);

  async function send() {
    const words = input.value.trim();
    if (!words || busy) return;
    busy = true; sendBtn.disabled = true;
    messages.push({ role: "user", content: words.slice(0, MAX_REPLY), at: new Date().toISOString() });
    input.value = ""; grow();
    render({ pending: true });
    const [r] = await Promise.all([ask("reply"), checkSafety(words)]);
    busy = false; sendBtn.disabled = false;
    if (r.problem) { render({ problem: r.problem }); persist(); return; }
    messages.push({ role: "luna", content: r.text, at: new Date().toISOString(), ...(r.sample ? { sample: true } : {}) });
    persist();
    render();
    input.focus();
  }

  const grow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 8 * 24) + "px"; };
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(); });

  render();
}
