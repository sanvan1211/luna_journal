import { state } from "../state.js";
import { listEntries, createEntry } from "../data.js";
import { queueQuestion, SUGGESTIONS } from "./ask.js";
import { bunny } from "../bunny.js";
import { esc, html, $, $$, toast } from "../util.js";

const ICON = {
  chat: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14v9H8l-4 3v-3H3z"/></svg>`,
  write: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h7l3 3v4M5 3v14h5M8 8h5M8 11h3"/><path d="M16.5 11.5l1.5 1.5-5 5h-1.5V16.5z"/></svg>`,
  send: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V4M5 9l5-5 5 5"/></svg>`,
};

export async function render(main) {
  const entries = await listEntries();
  const greeting = entries.length ? "Hey, welcome back to Luna" : "Hey, welcome to Luna";

  main.innerHTML = "";
  const el = html(`<div class="home">
    <div class="home-moon" aria-hidden="true"></div>
    <div class="home-hill" aria-hidden="true"></div>
    <div class="home-center">
      <h1>${greeting}</h1>
      <form class="home-ask">
        <label for="home-input" class="sr-only">Ask Luna about your journal</label>
        <input id="home-input" type="text" placeholder="Ask Luna about your journal…" maxlength="500" autocomplete="off" />
        <button type="submit" class="home-send" aria-label="Ask Luna">${ICON.send}</button>
      </form>
      ${entries.length ? `<div class="home-suggest" role="group" aria-label="Suggested questions">
        ${SUGGESTIONS.map((q) => `<button type="button" class="home-chip" data-suggest>${esc(q)}</button>`).join("")}
      </div>` : ""}
      <div class="home-actions">
        <a class="home-pill" href="#/ask">${ICON.chat}<span>chat with luna</span></a>
        <button type="button" class="home-pill" data-new>${ICON.write}<span>new journal</span></button>
      </div>
    </div>
    <div class="home-ground">
      ${bunny("home-bunny")}
      <p class="small">${state.demo ? "Sample data only. " : ""}Luna reads only your own entries. It isn't a therapist and never diagnoses.</p>
    </div>
  </div>`);
  main.append(el);

  const form = $(".home-ask", el), input = $("input", form);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    queueQuestion(q);
    location.hash = "#/ask";
  });

  $$("[data-suggest]", el).forEach((b) => b.addEventListener("click", () => {
    queueQuestion(b.textContent);
    location.hash = "#/ask";
  }));

  const newBtn = $("[data-new]", el);
  newBtn.addEventListener("click", async () => {
    newBtn.disabled = true;
    try { const row = await createEntry(); location.hash = `#/journal/${row.id}`; }
    catch (err) { toast(err.message || "Couldn't create an entry"); newBtn.disabled = false; }
  });
}
