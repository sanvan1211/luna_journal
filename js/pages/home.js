import { state } from "../state.js";
import { listEntries, createEntry } from "../data.js";
import { queueQuestion } from "./ask.js";
import { bunny } from "../bunny.js";
import { html, $, toast, onPageKey, typing } from "../util.js";

const ICON = {
  dashboard: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17V9 M8 17V4 M13 17v-6 M18 17V7"/></svg>`,
  write: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3h7l3 3v4M5 3v14h5M8 8h5M8 11h3"/><path d="M16.5 11.5l1.5 1.5-5 5h-1.5V16.5z"/></svg>`,
  send: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V4M5 9l5-5 5 5"/></svg>`,
};

// Moon surface: a few soft seas and craters in flat, slightly darker creams.
const MOON = `<svg class="moon-tex" viewBox="0 0 100 100" aria-hidden="true">
  <g fill="#e0d6c3">
    <path d="M17 31C19 22 30 17 38 21C44 24 43 33 36 36.5C29 40 20 39 17 31Z"/>
    <path d="M59 25C65 20 76 23 79 31C81 39 73 45 66 43C59 41 55 31 59 25Z"/>
    <path d="M36 53C43 48 54 50 57 57C59 63 51 68 44 66C37 64 32 57 36 53Z"/>
    <path d="M70 52C74 50 80 52 80 57C80 61 75 63 71 61C68 59 67 54 70 52Z"/>
  </g>
  <g fill="#d9cfbb">
    <circle cx="27" cy="49" r="3.2"/><circle cx="74" cy="66" r="4.4"/><circle cx="84" cy="27" r="2.2"/>
    <circle cx="50" cy="16" r="2.6"/><circle cx="18" cy="63" r="2.4"/><circle cx="58" cy="76" r="3"/>
    <circle cx="44" cy="37" r="1.4"/><circle cx="88" cy="46" r="1.6"/><circle cx="33" cy="72" r="1.8"/>
  </g>
  <g fill="#e6ddcc">
    <circle cx="27.6" cy="48.4" r="1.9"/><circle cx="74.8" cy="65.2" r="2.8"/><circle cx="50.5" cy="15.5" r="1.5"/>
    <circle cx="18.4" cy="62.6" r="1.3"/><circle cx="58.5" cy="75.4" r="1.8"/>
  </g>
</svg>`;

// Light grass on the hill: [left %, top %, size] inside the hill, kept clear of its curved edge.
const TUFTS = [[14, 34, 1], [22, 58, .8], [29, 30, .9], [36, 70, 1.1], [43, 44, .7], [51, 26, .9], [57, 62, 1],
  [64, 38, .8], [71, 72, .9], [78, 30, 1.1], [85, 52, .8], [19, 82, .9], [62, 86, .8], [47, 80, 1]];
const tufts = () => TUFTS.map(([x, y, s]) =>
  `<svg class="tuft" viewBox="0 0 14 10" style="left:${x}%;top:${y}%;width:${Math.round(14 * s)}px"><path d="M2 10Q2.5 5.5.8 2.5M6 10Q6 4 7.5.5M10 10Q10.5 6 13 3.5"/></svg>`).join("");

export async function render(main) {
  const entries = await listEntries();
  const greeting = entries.length ? "Hey, welcome back to Luna" : "Hey, welcome to Luna";

  main.innerHTML = "";
  const el = html(`<div class="home">
    <div class="home-moon" aria-hidden="true">${MOON}</div>
    <div class="home-hill" aria-hidden="true">${tufts()}</div>
    <div class="home-center">
      <h1>${greeting}</h1>
      <form class="home-ask">
        <label for="home-input" class="sr-only">Ask Luna about your journal</label>
        <input id="home-input" type="text" placeholder="Ask Luna about your journal…" maxlength="500" autocomplete="off" />
        <button type="submit" class="home-send" aria-label="Ask Luna">${ICON.send}</button>
      </form>
      <div class="home-actions">
        <a class="home-pill" href="#/dashboard">${ICON.dashboard}<span>dashboard</span></a>
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

  onPageKey(el, (e) => { if (e.key === "/" && !typing(e)) { e.preventDefault(); input.focus(); } });

  const newBtn = $("[data-new]", el);
  newBtn.addEventListener("click", async () => {
    newBtn.disabled = true;
    try { const row = await createEntry(); location.hash = `#/journal/${row.id}`; }
    catch (err) { toast(err.message || "Couldn't create an entry"); newBtn.disabled = false; }
  });
}
