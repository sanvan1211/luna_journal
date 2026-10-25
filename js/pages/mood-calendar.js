// Mood calendar: a GitHub-style grid of days, shaded by the moods people picked themselves.
// Luna never assigns a mood. Days with writing but no mood are drawn as "written, not rated",
// and people can rate them here (the mood is saved on that day's entries).
import { updateEntry } from "../data.js";
import { esc, html, $, $$, plain, toast } from "../util.js";

// Days are counted in New York time, so an entry saved at local noon lands on its own day.
const TZ = "America/New_York";
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const nyKey = (d) => keyFmt.format(new Date(d));
const keyDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (k, n) => new Date(keyDate(k).getTime() + n * 864e5).toISOString().slice(0, 10);
const weekday = (k) => keyDate(k).getUTCDay(); // 0 = Sunday
const fmt = (k, opts) => keyDate(k).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

// The five steps. Colors live in CSS (--mood-1 … --mood-5); see css/styles.css for how they were checked.
export const SCALE = ["Rough", "Low", "Okay", "Good", "Great"];
// Where each mood word people can pick sits on the scale. Shown on the page, never applied silently.
const WORD_STEP = {
  Rough: 0,
  Low: 1, "Stretched thin": 1,
  Okay: 2, Unsure: 2, Tired: 2, Restless: 2,
  Good: 3, Calm: 3, Content: 3, Hopeful: 3,
  Great: 4, Proud: 4,
};
const RANGES = [{ days: 30, label: "30 days" }, { days: 90, label: "90 days" }, { days: 365, label: "Year" }];
let rangeDays = 90;

export function renderMoodCalendar(card, entries) {
  const today = nyKey(new Date());
  let focusKey = today;
  let pop = null; // { el, key, rate: { list, i } | null }

  const days = () => {
    const by = {};
    entries.forEach((e) => (by[nyKey(e.created_at)] ||= []).push(e));
    return by;
  };
  // A day's step: the average of its rated entries, rounded. Null when nothing is rated.
  const stepOf = (list = []) => {
    const steps = list.map((e) => WORD_STEP[e.mood]).filter((s) => s !== undefined);
    return steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null;
  };

  function range() {
    const start = addDays(today, -(rangeDays - 1));
    const keys = [];
    for (let k = start; k <= today; k = addDays(k, 1)) keys.push(k);
    return { start, keys };
  }

  function cellLabel(k, list) {
    const s = stepOf(list), n = list ? list.length : 0;
    const count = `${n} ${n === 1 ? "entry" : "entries"}`;
    return `${fmt(k, { month: "short", day: "numeric" })}, ${!n ? "no entry" : s === null ? `written, not rated, ${count}` : `${SCALE[s]}, ${count}`}`;
  }

  function draw() {
    const by = days(), { start, keys } = range();
    if (focusKey < start || focusKey > today) focusKey = today;
    const unrated = keys.filter((k) => by[k] && stepOf(by[k]) === null);
    const counts = { rough: 0, okay: 0, good: 0 };
    keys.forEach((k) => { const s = stepOf(by[k]); if (s !== null) counts[s <= 1 ? "rough" : s === 2 ? "okay" : "good"]++; });

    // Weeks as columns (Sunday first), weekdays as rows.
    const cols = [];
    for (let c = addDays(start, -weekday(start)); c <= today; c = addDays(c, 7)) cols.push(c);
    const colHtml = cols.map((c, ci) => {
      const firsts = [...Array(7).keys()].map((r) => addDays(c, r)).filter((k) => k >= start && k <= today);
      const monthStart = firsts.find((k) => k.endsWith("-01")) || (ci === 0 ? firsts[0] : null);
      const cells = [...Array(7).keys()].map((r) => {
        const k = addDays(c, r);
        if (k < start || k > today) return `<span class="mc-cell mc-pad" aria-hidden="true"></span>`;
        const list = by[k], s = stepOf(list);
        const cls = !list ? "mc-none" : s === null ? "mc-unrated" : `mc-${s + 1}`;
        return `<button type="button" class="mc-cell ${cls}${k === today ? " mc-today" : ""}" data-day="${k}"
          aria-label="${esc(cellLabel(k, list))}" aria-haspopup="dialog" tabindex="${k === focusKey ? 0 : -1}"></button>`;
      }).join("");
      return `<div class="mc-col"><span class="mc-month" aria-hidden="true">${monthStart ? esc(fmt(monthStart, { month: "short" })) : ""}</span>${cells}</div>`;
    }).join("");

    card.innerHTML = `
      <div class="wrap card-head">
        <div><h2 id="cal-h">Mood calendar</h2>
          <p class="mt-1 muted small">Only the moods you picked on your entries. Luna never rates a day for you. Pick a day to see it or rate it; arrow keys move between days.</p></div>
        <div class="mc-tools">
          <div class="seg" role="group" aria-label="Range">${RANGES.map((r) => `<button type="button" data-range="${r.days}" aria-pressed="${r.days === rangeDays}">${r.label}</button>`).join("")}</div>
          <button type="button" class="btn btn-sm" data-rate ${unrated.length ? "" : "disabled"}>Rate unrated days${unrated.length ? ` (${unrated.length})` : ""}</button>
        </div>
      </div>
      <p class="mc-summary small" data-summary>
        <span><b>${counts.rough}</b> rough or low</span> · <span><b>${counts.okay}</b> okay</span> · <span><b>${counts.good}</b> good or great</span> ·
        <span><b>${unrated.length}</b> ${unrated.length === 1 ? "day" : "days"} not rated</span>
        <span class="muted">in the last ${rangeDays === 365 ? "year" : `${rangeDays} days`}</span>
      </p>
      <div class="mc-scroll">
        <div class="mc mc-r${rangeDays}" role="group" aria-label="Mood calendar, ${rangeDays === 365 ? "last year" : `last ${rangeDays} days`}">
          <div class="mc-col mc-wd" aria-hidden="true"><span class="mc-month"></span>${["", "Mon", "", "Wed", "", "Fri", ""].map((d) => `<span>${d}</span>`).join("")}</div>
          ${colHtml}
        </div>
      </div>
      <div class="mc-legend small muted">
        <span class="mc-ramp">Rough ${SCALE.map((s, i) => `<i class="mc-${i + 1}" title="${s}"></i>`).join("")} Great</span>
        <span><i class="mc-unrated"></i> Written, not rated</span>
        <span><i class="mc-none"></i> No entry</span>
      </div>
      <details class="mc-map small muted">
        <summary>How your mood words fit this scale</summary>
        <p>${SCALE.map((s, i) => `<b>${s}:</b> ${Object.keys(WORD_STEP).filter((w) => WORD_STEP[w] === i).map(esc).join(", ")}`).join(" · ")}. A day with several entries shows the average of the moods you picked.</p>
      </details>`;

    $$("[data-range]", card).forEach((b) => b.addEventListener("click", () => { rangeDays = +b.dataset.range; closePop(); draw(); scrollToEnd(); }));
    $("[data-rate]", card).addEventListener("click", () => { if (unrated.length) openPop(unrated[0], { list: unrated, i: 0 }); });
    $$("[data-day]", card).forEach((b) => b.addEventListener("click", () => openPop(b.dataset.day)));
    $(".mc", card).addEventListener("keydown", onGridKey);
  }

  const scrollToEnd = () => { const s = $(".mc-scroll", card); s.scrollLeft = s.scrollWidth; };
  const cellFor = (k) => $(`[data-day="${k}"]`, card);

  function moveFocus(k) {
    const { start } = range();
    k = k < start ? start : k > today ? today : k;
    focusKey = k;
    $$("[data-day]", card).forEach((b) => (b.tabIndex = b.dataset.day === k ? 0 : -1));
    const b = cellFor(k);
    b.focus();
    b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onGridKey(e) {
    if (e.target.dataset.day) focusKey = e.target.dataset.day; // whichever day actually has focus
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (step) { e.preventDefault(); moveFocus(addDays(focusKey, step)); }
    else if (e.key === "Home") { e.preventDefault(); moveFocus(range().start); }
    else if (e.key === "End") { e.preventDefault(); moveFocus(today); }
  }

  // ───── Popover: preview the day, set its mood, open the entry ─────
  function openPop(k, rate = null) {
    closePop(false);
    focusKey = k;
    $$("[data-day]", card).forEach((b) => (b.tabIndex = b.dataset.day === k ? 0 : -1));
    const el = html(`<div class="mc-pop" role="dialog" aria-label="${esc(fmt(k, { weekday: "long", month: "long", day: "numeric" }))}"></div>`);
    card.append(el);
    pop = { el, key: k, rate };
    drawPop();
    place();
    const first = $("[role=radio][tabindex='0']", el) || $("button, a", el);
    first && first.focus();
    setTimeout(() => document.addEventListener("mousedown", outside), 0);
  }

  function drawPop(status = "") {
    const { el, key: k, rate } = pop;
    const list = (days()[k] || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const s = stepOf(list);
    const words = [...new Set(list.map((e) => e.mood).filter(Boolean))];
    el.innerHTML = `
      <div class="mc-pop-head">
        <div><strong>${esc(fmt(k, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}</strong>
          ${rate ? `<div class="small muted">Unrated day ${rate.i + 1} of ${rate.list.length}</div>` : ""}</div>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      ${list.length ? `
        ${list.map((e) => `<a class="mc-entry" href="#/journal/${e.id}"><span class="t">${esc(e.title || "Untitled")}</span><span class="x">${esc(plain(e.content).slice(0, 140) || "No text yet.")}</span></a>`).join("")}
        <div class="mc-rate">
          <div class="small" id="mc-q">How was this day? <span class="muted">${s === null ? "Not rated yet." : `Now: ${SCALE[s]}${words.length && !(words.length === 1 && words[0] === SCALE[s]) ? ` (you picked ${esc(words.join(", "))})` : ""}.`}</span></div>
          <div class="mc-moods" role="radiogroup" aria-labelledby="mc-q">
            ${SCALE.map((m, i) => `<button type="button" role="radio" aria-checked="${s === i}" tabindex="${(s === null ? 2 : s) === i ? 0 : -1}" data-mood="${i}"><i class="mc-${i + 1}" aria-hidden="true"></i>${m}</button>`).join("")}
          </div>
          ${list.length > 1 ? `<p class="m-0 small muted">Saves this mood on all ${list.length} entries from this day.</p>` : ""}
          <p class="m-0 small mc-status" role="status">${esc(status)}</p>
        </div>
        <a class="link-btn small" href="#/journal/${list[list.length - 1].id}">Open entry</a>`
      : `<p class="m-0 small muted">Nothing written on this day.</p>`}
      ${rate ? `<div class="mc-step"><button type="button" class="btn btn-sm" data-prev ${rate.i === 0 ? "disabled" : ""}>Prev</button><button type="button" class="btn btn-sm" data-next ${rate.i >= rate.list.length - 1 ? "disabled" : ""}>Next</button></div>` : ""}`;

    $("[data-close]", el).addEventListener("click", () => closePop());
    el.addEventListener("keydown", onPopKey);
    const radios = $$("[role=radio]", el);
    radios.forEach((b) => b.addEventListener("click", () => save(+b.dataset.mood)));
    const prev = $("[data-prev]", el), next = $("[data-next]", el);
    prev && prev.addEventListener("click", () => openPop(rate.list[rate.i - 1], { ...rate, i: rate.i - 1 }));
    next && next.addEventListener("click", () => openPop(rate.list[rate.i + 1], { ...rate, i: rate.i + 1 }));
  }

  function onPopKey(e) {
    if (e.key === "Escape") { e.preventDefault(); closePop(); return; }
    const radio = e.target.closest("[role=radio]");
    if (!radio) return;
    const radios = $$("[role=radio]", pop.el), i = radios.indexOf(radio);
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (d) {
      e.preventDefault();
      const n = radios[(i + d + radios.length) % radios.length];
      radios.forEach((r) => (r.tabIndex = r === n ? 0 : -1));
      n.focus();
    }
  }

  async function save(step) {
    const k = pop.key, list = days()[k] || [], mood = SCALE[step];
    $$("[role=radio]", pop.el).forEach((b) => (b.disabled = true));
    try {
      for (const e of list) {
        await updateEntry(e.id, { mood });
        e.mood = mood;
      }
    } catch (err) {
      console.error("Couldn't save the mood", err);
      toast("Couldn't save that mood. " + err.message);
      drawPop(`Couldn't save: ${err.message}`);
      return;
    }
    const rate = pop.rate;
    draw();
    if (rate && rate.i < rate.list.length - 1) {
      openPop(rate.list[rate.i + 1], { ...rate, i: rate.i + 1 });
      $(".mc-status", pop.el).textContent = `Saved ${fmt(k, { month: "short", day: "numeric" })} as ${mood}.`;
    } else {
      card.append(pop.el);
      drawPop(rate ? `Saved as ${mood}. That was the last unrated day.` : `Saved as ${mood}.`);
      place();
      const on = $(`[role=radio][data-mood="${step}"]`, pop.el);
      on && on.focus();
    }
  }

  function place() {
    const cell = cellFor(pop.key);
    if (!cell) return;
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    const c = card.getBoundingClientRect(), r = cell.getBoundingClientRect(), w = pop.el.offsetWidth;
    const left = Math.max(12, Math.min(r.left - c.left + r.width / 2 - w / 2, c.width - w - 12));
    pop.el.style.left = `${left}px`;
    pop.el.style.top = `${r.bottom - c.top + 8}px`;
  }

  function outside(e) {
    if (pop && !pop.el.contains(e.target) && !e.target.closest("[data-day], [data-rate]")) closePop(false);
  }

  function closePop(refocus = true) {
    if (!pop) return;
    document.removeEventListener("mousedown", outside);
    const k = pop.key;
    pop.el.remove();
    pop = null;
    if (refocus) { const b = cellFor(k); b && b.focus(); }
  }

  draw();
  requestAnimationFrame(scrollToEnd);
}
