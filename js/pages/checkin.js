import { state } from "../state.js";
import { createEntry } from "../data.js";
import { callAI, aiProblem, aiLoading } from "../ai.js";
import { supportMini, safetyNote } from "../support.js";
import { esc, html, $, $$, fmtShort, toast } from "../util.js";
import { MOODS } from "./journal.js";

const WORDS = ["Calm", "Content", "Hopeful", "Proud", "Okay", "Tired", "Restless", "Stretched thin", "Unsure", "Low", "Lonely", "Grateful"];

const STEPS = [
  { id: "arriving", q: "How are you feeling right now?", help: "Pick up to three words, or skip.", kind: "words" },
  { id: "space", q: "What's taking up the most space in your mind today?", help: "A sentence is plenty.", kind: "text" },
  { id: "okay", q: "What's one small thing that went okay?", help: "It can be tiny. Coffee was good counts.", kind: "text" },
  { id: "need", q: "What would help, even a little, in the next few hours?", help: "Rest, a person, a plan, something else.", kind: "text" },
];

export async function render(main) {
  const answers = { arriving: [], space: "", okay: "", need: "" };
  let step = 0;

  main.innerHTML = "";
  const page = html(`<div class="page"><div class="checkin">
    <header class="page-head"><div><h1>Check-in</h1><p>Four gentle questions, one at a time. Skip anything.</p></div></header>
    <div class="card-roomy card" data-card></div>
    <div class="mt-5">${supportMini()}</div>
  </div></div>`);
  main.append(page);
  const card = $("[data-card]", page);

  function renderStep() {
    const s = STEPS[step];
    card.innerHTML = `
      <div class="progress" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
      <p class="m-0 mb-2 eyebrow">Question ${step + 1} of ${STEPS.length}</p>
      <h2 class="question" id="q" tabindex="-1">${esc(s.q)}</h2>
      <p class="m-0 muted">${esc(s.help)}</p>
      ${s.kind === "words"
        ? `<div class="word-grid" role="group" aria-labelledby="q">${WORDS.map((w) => `<button type="button" aria-pressed="${answers.arriving.includes(w)}" data-word="${esc(w)}">${esc(w)}</button>`).join("")}</div>`
        : `<textarea class="mt-4 textarea" aria-labelledby="q" maxlength="5000">${esc(answers[s.id])}</textarea>`}
      <div class="step-actions">
        <button type="button" class="btn btn-ghost" data-back ${step === 0 ? "disabled" : ""}>Back</button>
        <div class="hstack gap-2">
          <button type="button" class="btn btn-ghost" data-skip>Skip</button>
          <button type="button" class="btn btn-primary" data-next>${step === STEPS.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>`;
    $("#q", card).focus();

    if (s.kind === "words") {
      $$("[data-word]", card).forEach((b) => b.addEventListener("click", () => {
        const w = b.dataset.word, list = answers.arriving;
        if (list.includes(w)) list.splice(list.indexOf(w), 1);
        else if (list.length < 3) list.push(w);
        else { toast("Pick up to three"); return; }
        $$("[data-word]", card).forEach((x) => x.setAttribute("aria-pressed", String(list.includes(x.dataset.word))));
      }));
    } else {
      const ta = $("textarea", card);
      ta.addEventListener("input", () => (answers[s.id] = ta.value));
      ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("[data-next]", card).click(); });
    }
    $("[data-back]", card).addEventListener("click", () => { step--; renderStep(); });
    $("[data-skip]", card).addEventListener("click", () => { if (s.kind === "text") answers[s.id] = ""; else answers.arriving = []; advance(); });
    $("[data-next]", card).addEventListener("click", advance);
  }

  function advance() { if (step < STEPS.length - 1) { step++; renderStep(); } else renderSummary(); }

  function toMarkdown() {
    const parts = [];
    if (answers.arriving.length) parts.push(`## How I'm feeling\n${answers.arriving.join(", ")}`);
    STEPS.slice(1).forEach((s) => { if (answers[s.id].trim()) parts.push(`## ${s.q}\n${answers[s.id].trim()}`); });
    return parts.join("\n\n");
  }

  async function renderSummary() {
    const md = toMarkdown();
    if (!md) {
      card.innerHTML = `<div class="state"><h3>That's okay</h3><p>You skipped everything, and that's allowed. Checking in at all counts.</p>
        <div class="actions"><button type="button" class="btn" data-restart>Start over</button><a class="btn btn-ghost" href="#/journal">Go to journal</a></div></div>`;
      $("[data-restart]", card).addEventListener("click", () => { step = 0; renderStep(); });
      return;
    }
    card.innerHTML = `
      <div class="progress" aria-hidden="true">${STEPS.map(() => `<i class="on"></i>`).join("")}</div>
      <div data-safety></div>
      <h2 class="question" id="q" tabindex="-1">Thanks for checking in</h2>
      <p class="m-0 mb-5 muted">Here's what you shared. Nothing is saved unless you choose to.</p>
      <dl class="summary-list">
        ${answers.arriving.length ? `<div><dt>How you're feeling</dt><dd>${esc(answers.arriving.join(", "))}</dd></div>` : ""}
        ${STEPS.slice(1).filter((s) => answers[s.id].trim()).map((s) => `<div><dt>${esc(s.q)}</dt><dd>${esc(answers[s.id].trim())}</dd></div>`).join("")}
      </dl>
      <div class="start-wrap step-actions">
        <button type="button" class="btn btn-primary" data-save>Save as journal entry</button>
        <button type="button" class="btn" data-reflect>Get a reflection from Luna</button>
        <button type="button" class="btn btn-ghost" data-restart>Start over</button>
      </div>
      <div data-out class="mt-5" aria-live="polite"></div>`;
    $("#q", card).focus();

    const out = $("[data-out]", card);
    const fullText = `How I'm feeling: ${answers.arriving.join(", ")}\n${answers.space}\n${answers.okay}\n${answers.need}`;

    // Quiet safety check: only shows something if it's needed.
    callAI("safety-check", { text: fullText }).then((s) => {
      if (s.ok && s.data && s.data.flagged) $("[data-safety]", card).innerHTML = safetyNote();
    });

    $("[data-restart]", card).addEventListener("click", () => { Object.assign(answers, { arriving: [], space: "", okay: "", need: "" }); step = 0; renderStep(); });

    $("[data-save]", card).addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const mood = answers.arriving.find((w) => MOODS.includes(w)) || null; // self-reported word only
        const row = await createEntry({ title: `Check-in · ${fmtShort(new Date())}`, content: md, mood, tags: ["check-in"] });
        toast(state.demo ? "Saved to the sample journal (not stored)" : "Saved to your journal");
        btn.textContent = "Saved";
        out.insertAdjacentHTML("afterbegin", `<p class="small"><a href="#/journal/${row.id}">Open the entry →</a></p>`);
      } catch (err) {
        btn.disabled = false;
        out.innerHTML = `<div class="state-inline error"><div><strong>Couldn't save.</strong> ${esc(err.message)}</div></div>`;
      }
    });

    $("[data-reflect]", card).addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      out.innerHTML = aiLoading("Luna is reading your check-in…");
      const r = await callAI("check-in", { answers });
      btn.disabled = false;
      if (!r.ok) { out.innerHTML = aiProblem(r); return; }
      out.innerHTML = `<div class="card-inset card">
        <div class="eyebrow">Luna's reflection</div>
        <p class="mt-2 reflection-body">${esc(r.data.reflection || "")}</p>
        <p class="mt-3 small muted">A reflection on what you wrote, not advice or a diagnosis.</p></div>`;
    });
  }

  renderStep();
}
