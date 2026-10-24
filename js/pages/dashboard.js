import { state } from "../state.js";
import { listEntries, listInsights, listMemory, addDemoInsights, createEntry } from "../data.js";
import { callAI, aiProblem, aiLoading } from "../ai.js";
import { emptyState } from "../bunny.js";
import { supportPanel } from "../support.js";
import { esc, html, $, $$, dayKey, fmtShort, fmtDate, fmtLong, fmtMonth, fmtTime, plain, words, openModal, toast } from "../util.js";

// Word families for "Journal language trends". This describes LANGUAGE, not feelings.
// Colors validated for color-blind separation on the card surface.
const SERIES = [
  { key: "gratitude", label: "Gratitude words", color: "#b8862a", words: ["grateful", "thankful", "thanks", "appreciate", "appreciated", "glad", "lucky", "blessed"] },
  { key: "people", label: "People words", color: "#4c86de", words: ["friend", "friends", "family", "mom", "dad", "brother", "sister", "together", "talked", "team", "coach", "we"] },
  { key: "pressure", label: "Pressure words", color: "#d65f49", words: ["stressed", "stress", "worried", "worry", "overwhelmed", "pressure", "nervous", "anxious", "behind", "deadline", "tired"] },
  { key: "future", label: "Future words", color: "#a072da", words: ["plan", "plans", "goal", "goals", "tomorrow", "next", "hope", "want", "will", "going"] },
];

const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

export async function render(main, route) {
  const [entries, insights, memory] = await Promise.all([listEntries(), listInsights(), listMemory()]);
  const now = new Date();

  // ───── stats ─────
  const thisMonth = entries.filter((e) => { const d = new Date(e.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const monthWords = thisMonth.reduce((n, e) => n + words(plain(e.content)).length, 0);
  const days = new Set(entries.map((e) => dayKey(e.created_at)));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // today not written yet doesn't break it
  const streakDays = new Set();
  while (days.has(dayKey(cursor))) { streak++; streakDays.add(dayKey(cursor)); cursor.setDate(cursor.getDate() - 1); }
  const streakEntries = entries.filter((e) => streakDays.has(dayKey(e.created_at)));

  const wordsByDay = {};
  entries.forEach((e) => { const k = dayKey(e.created_at); wordsByDay[k] = (wordsByDay[k] || 0) + words(plain(e.content)).length; });

  // ───── themes: Luna's remembered themes + your most-used tags ─────
  const tagCounts = {};
  entries.forEach((e) => (e.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const themes = memory.filter((m) => m.type === "theme").slice(0, 6);

  main.innerHTML = "";
  const page = html(`<div class="page">
    <header class="page-head">
      <div><h1>Dashboard</h1><p>A quiet look at your writing${state.demo ? " (sample journal)" : ""}.</p></div>
      <a class="btn" href="#/checkin">Start a check-in</a>
    </header>
    <div class="dash">
      <section class="card summary span-12" aria-label="This month at a glance">
        <div>
          <h2 class="summary-label">Entries this month</h2>
          <p class="summary-num">${thisMonth.length}</p>
          ${thisMonth.length ? `<button type="button" class="link-btn small" data-see="month">See them</button>` : `<p class="small muted">None yet</p>`}
        </div>
        <div>
          <h2 class="summary-label">Words this month</h2>
          <p class="summary-num">${monthWords.toLocaleString()}</p>
          <p class="small muted">${thisMonth.length ? `About ${Math.round(monthWords / thisMonth.length)} per entry` : "Across every entry you write"}</p>
        </div>
        <div>
          <h2 class="summary-label">Writing streak</h2>
          <p class="summary-num">${streak} <span class="summary-unit">${streak === 1 ? "day" : "days"}</span></p>
          ${streak ? `<button type="button" class="link-btn small" data-see="streak">See the entries</button>` : `<p class="small muted">Write today to start one</p>`}
        </div>
      </section>

      <section class="card span-8 noticed" aria-labelledby="noticed-h" data-noticed></section>
      <div class="span-4">${supportPanel()}</div>

      <section class="card span-12" aria-labelledby="cal-h" data-calendar></section>

      <section class="card span-8" aria-labelledby="trend-h" data-trend></section>
      <section class="card span-4" aria-labelledby="themes-h">
        <div class="card-head"><h2 id="themes-h">Recurring themes</h2></div>
        ${themes.length || topTags.length ? `
          ${themes.length ? `<div class="chips">${themes.map((t) => `<span class="chip">${esc(t.content)}</span>`).join("")}</div>` : ""}
          ${topTags.length ? `<h3 class="sub-label">Your tags</h3><div class="chips">${topTags.map(([t, n]) => `<a class="chip chip-btn" href="#/journal?q=%23${encodeURIComponent(t)}">#${esc(t)} <span class="count">${n}</span></a>`).join("")}</div>` : ""}
        ` : `<p class="muted small">Themes show up here as you tag entries and Luna looks for patterns.</p>`}
      </section>

      <section class="card span-12" aria-labelledby="moods-h" data-moods></section>
    </div>
  </div>`);
  main.append(page);

  $$("[data-see]", page).forEach((b) => b.addEventListener("click", () =>
    b.dataset.see === "month"
      ? openEntryList("Entries this month", thisMonth)
      : openEntryList(`Your ${streak}-day streak`, streakEntries)));

  renderMoods($("[data-moods]", page), entries);

  renderCalendar($("[data-calendar]", page), entries, wordsByDay);
  renderTrend($("[data-trend]", page), entries);
  renderNoticed($("[data-noticed]", page), entries, insights);

  if (route.query.get("focus") === "support") {
    const s = $("#support", page);
    s.scrollIntoView({ behavior: "smooth", block: "center" });
    s.focus({ preventScroll: true });
  }
}

// ─────────────────────────── Calendar ───────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const level = (w) => (w === 0 ? "" : w < 60 ? "w1" : w < 140 ? "w2" : "w3");

function renderCalendar(card, entries, wordsByDay) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const byDay = {};
  entries.forEach((e) => (byDay[dayKey(e.created_at)] ||= []).push(e));
  // Open on today, or on the latest entry's day if nothing was written this month.
  const latest = entries.length ? new Date(entries.reduce((a, e) => (e.created_at > a ? e.created_at : a), entries[0].created_at)) : null;
  const thisMonthHasEntries = entries.some((e) => { const d = new Date(e.created_at); return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth(); });
  let selected = latest && !thisMonthHasEntries ? new Date(latest.getFullYear(), latest.getMonth(), latest.getDate()) : new Date(today);
  let month = new Date(selected.getFullYear(), selected.getMonth(), 1);

  function draw(focus = false) {
    const first = new Date(month);
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const inMonth = entries.filter((e) => { const d = new Date(e.created_at); return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth(); });
    const daysWritten = new Set(inMonth.map((e) => dayKey(e.created_at))).size;
    const isCurrent = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<span class="cal-pad" aria-hidden="true"></span>`);
    for (let n = 1; n <= daysIn; n++) {
      const d = new Date(month.getFullYear(), month.getMonth(), n);
      const k = dayKey(d), list = byDay[k] || [], w = wordsByDay[k] || 0;
      const sel = k === dayKey(selected);
      const label = `${fmtLong(d)}: ${list.length ? `${list.length} ${list.length === 1 ? "entry" : "entries"}, ${w} words` : "no entries"}`;
      cells.push(`<button type="button" class="cal-cell ${level(w)} ${k === dayKey(today) ? "today" : ""} ${d > today ? "future" : ""}"
        data-day="${k}" aria-label="${esc(label)}" aria-pressed="${sel}" tabindex="${sel ? 0 : -1}">
        <span class="n">${n}</span>${list.length ? `<span class="dots" aria-hidden="true">${"<i></i>".repeat(Math.min(list.length, 3))}</span>` : ""}</button>`);
    }

    card.innerHTML = `
      <div class="wrap card-head">
        <div><h2 id="cal-h">Calendar</h2>
        <p class="mt-1 muted small">Pick a day to see what you wrote. Arrow keys move between days; Home and End jump to the ends of the month.</p></div>
        <div class="cal-nav">
          <button type="button" class="icon-btn" data-prev aria-label="Previous month"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 5l-5 5 5 5"/></svg></button>
          <span class="cal-title" aria-live="polite">${fmtMonth(month)}</span>
          <button type="button" class="icon-btn" data-next aria-label="Next month"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5l5 5-5 5"/></svg></button>
          <button type="button" class="btn btn-sm btn-ghost" data-today ${isCurrent && dayKey(selected) === dayKey(today) ? "disabled" : ""}>Today</button>
        </div>
      </div>
      <div class="cal">
        <div>
          <div class="cal-grid" role="group" aria-label="${esc(fmtMonth(month))}">
            ${WEEKDAYS.map((d) => `<span class="cal-wd" aria-hidden="true">${d}</span>`).join("")}
            ${cells.join("")}
          </div>
          <div class="cal-foot">
            <span class="muted small">${inMonth.length} ${inMonth.length === 1 ? "entry" : "entries"} on ${daysWritten} ${daysWritten === 1 ? "day" : "days"} in ${esc(month.toLocaleDateString(undefined, { month: "long" }))}</span>
            <span class="cal-key small muted" aria-hidden="true">Fewer words <i></i><i class="w1"></i><i class="w2"></i><i class="w3"></i> More</span>
          </div>
        </div>
        <div class="cal-day" data-panel aria-live="polite"></div>
      </div>`;

    $("[data-prev]", card).addEventListener("click", () => shiftMonth(-1));
    $("[data-next]", card).addEventListener("click", () => shiftMonth(1));
    $("[data-today]", card).addEventListener("click", () => select(new Date(today), true));
    $$("[data-day]", card).forEach((b) => b.addEventListener("click", () => select(parseDay(b.dataset.day))));
    $(".cal-grid", card).addEventListener("keydown", onKey);
    drawPanel();
    if (focus) { const b = $(`[data-day="${dayKey(selected)}"]`, card); b && b.focus(); }
  }

  function drawPanel() {
    const k = dayKey(selected), list = byDay[k] || [];
    const panel = $("[data-panel]", card);
    panel.innerHTML = `<h3>${esc(fmtLong(selected))}</h3>` + (list.length
      ? list.map((e) => `<a class="mini-entry" href="#/journal/${e.id}">
          <span class="t">${esc(e.title || "Untitled")}</span>
          <span class="small muted">${fmtTime(e.created_at)}${e.mood ? " · " + esc(e.mood) : ""}</span>
          <span class="x">${esc(plain(e.content).slice(0, 180))}</span></a>`).join("")
      : `<p class="m-0 muted small">${selected > today ? "This day hasn't happened yet." : "No entry on this day."}</p>
         ${k === dayKey(today) ? `<button type="button" class="mt-3 btn btn-primary btn-sm" data-write>Write today's entry</button>` : ""}`);
    const write = $("[data-write]", panel);
    write && write.addEventListener("click", async () => {
      write.disabled = true;
      try { const row = await createEntry(); location.hash = `#/journal/${row.id}`; }
      catch (err) { toast("Couldn't create an entry. " + err.message); write.disabled = false; }
    });
  }

  function select(d, focus = false) {
    selected = d;
    if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) {
      month = new Date(d.getFullYear(), d.getMonth(), 1);
      draw(true);
      return;
    }
    // Same month: update in place so the focused day button survives.
    const k = dayKey(d);
    $$("[data-day]", card).forEach((b) => {
      const on = b.dataset.day === k;
      b.setAttribute("aria-pressed", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    $("[data-today]", card).disabled = k === dayKey(today);
    drawPanel();
  }

  function shiftMonth(delta) {
    month = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    selected = new Date(month.getFullYear(), month.getMonth(), Math.min(selected.getDate(), last));
    draw();
  }

  function onKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const d = new Date(selected); d.setDate(d.getDate() + step);
      select(d, true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
      select(new Date(month.getFullYear(), month.getMonth(), e.key === "Home" ? 1 : last), true);
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      shiftMonth(e.key === "PageUp" ? -1 : 1);
      $(`[data-day="${dayKey(selected)}"]`, card).focus();
    }
  }

  draw();
}

const parseDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

// ─────────────────────────── Moods you picked ───────────────────────────
// Counts only the moods people chose on their own entries. Luna never assigns one.
function renderMoods(card, entries) {
  let range = 30;
  function draw() {
    const since = new Date(); since.setDate(since.getDate() - range);
    const list = entries.filter((e) => e.mood && (range === 0 || new Date(e.created_at) >= since));
    const groups = {};
    list.forEach((e) => (groups[e.mood] ||= []).push(e));
    const rows = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    const max = rows.length ? rows[0][1].length : 0;
    card.innerHTML = `
      <div class="wrap card-head">
        <div><h2 id="moods-h">Moods you picked</h2>
        <p class="mt-1 muted small">Only the moods you chose on your entries. Luna never assigns one. Pick a mood to see its entries.</p></div>
        <div class="seg" role="group" aria-label="Time range">
          <button type="button" data-mrange="30" aria-pressed="${range === 30}">30 days</button>
          <button type="button" data-mrange="0" aria-pressed="${range === 0}">All time</button>
        </div>
      </div>
      ${rows.length ? `<div class="mood-bars">${rows.map(([mood, es]) => `
        <button type="button" class="mood-bar" data-mood-row="${esc(mood)}" aria-label="${esc(mood)}: ${es.length} ${es.length === 1 ? "entry" : "entries"}. Show them">
          <span class="m">${esc(mood)}</span>
          <span class="track"><span class="fill" style="width:${Math.max(4, Math.round((es.length / max) * 100))}%"></span></span>
          <span class="n">${es.length}</span>
        </button>`).join("")}</div>`
        : `<p class="m-0 muted small">${range ? "No moods picked in the last 30 days." : "Pick a mood on an entry and it shows up here."}</p>`}`;
    $$("[data-mrange]", card).forEach((b) => b.addEventListener("click", () => { range = +b.dataset.mrange; draw(); $(`[data-mrange="${range}"]`, card).focus(); }));
    $$("[data-mood-row]", card).forEach((b) => b.addEventListener("click", () =>
      openEntryList(`Entries where you picked “${b.dataset.moodRow}”`, groups[b.dataset.moodRow])));
  }
  draw();
}

// ─────────────────────────── Language trends chart ───────────────────────────
function renderTrend(card, entries) {
  let range = 8;
  const visible = new Set(SERIES.map((s) => s.key));
  let showTable = false;

  function buckets() {
    const end = startOfWeek(new Date());
    return Array.from({ length: range }, (_, i) => {
      const start = new Date(end); start.setDate(start.getDate() - 7 * (range - 1 - i));
      const stop = new Date(start); stop.setDate(stop.getDate() + 7);
      const list = entries.filter((e) => { const d = new Date(e.created_at); return d >= start && d < stop; });
      const toks = list.flatMap((e) => words(plain(e.content) + " " + e.title));
      const vals = {};
      SERIES.forEach((s) => {
        if (!toks.length) { vals[s.key] = null; return; }
        const hits = toks.filter((t) => s.words.includes(t)).length;
        vals[s.key] = Math.round((hits / toks.length) * 1000) / 10; // per 100 words
      });
      return { start, list, total: toks.length, vals };
    });
  }

  function draw() {
    const data = buckets();
    const hasData = data.some((b) => b.total);
    card.innerHTML = `
      <div class="wrap card-head">
        <div><h2 id="trend-h">Journal language trends</h2>
        <p class="mt-1 muted small">How often each kind of word appears, per 100 words you wrote each week.</p></div>
        <div class="seg" role="group" aria-label="Time range">
          <button type="button" data-range="8" aria-pressed="${range === 8}">8 weeks</button>
          <button type="button" data-range="26" aria-pressed="${range === 26}">6 months</button>
        </div>
      </div>
      <div class="trend-legend" role="group" aria-label="Show or hide word groups">
        ${SERIES.map((s) => `<button type="button" class="legend-btn" data-series="${s.key}" aria-pressed="${visible.has(s.key)}"><span class="sw" style="background:${s.color}"></span>${s.label}</button>`).join("")}
      </div>
      <div data-plot></div>
      <div class="mt-3 row-between">
        <p class="m-0 chart-note">This counts words. It isn't a measure of how you feel. Click a week to see its entries.</p>
        <button type="button" class="link-btn small" data-table>${showTable ? "Hide table" : "View as table"}</button>
      </div>
      <div data-tablewrap></div>`;

    $$("[data-range]", card).forEach((b) => b.addEventListener("click", () => { range = +b.dataset.range; draw(); }));
    $$("[data-series]", card).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.series;
      if (visible.has(k) && visible.size === 1) return; // keep at least one
      visible.has(k) ? visible.delete(k) : visible.add(k);
      draw();
      $(`[data-series="${k}"]`, card).focus();
    }));
    $("[data-table]", card).addEventListener("click", () => { showTable = !showTable; draw(); $("[data-table]", card).focus(); });

    const plot = $("[data-plot]", card);
    if (!hasData) {
      plot.innerHTML = emptyState({ text: "Write a few entries and your language trends will appear here." });
      return;
    }
    plot.append(lineChart(data, SERIES.filter((s) => visible.has(s.key))));

    if (showTable) {
      $("[data-tablewrap]", card).innerHTML = `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Week of</th><th class="num">Words</th>${SERIES.map((s) => `<th class="num">${s.label}</th>`).join("")}</tr></thead>
        <tbody>${data.map((b) => `<tr><td>${fmtShort(b.start)}</td><td class="num">${b.total}</td>${SERIES.map((s) => `<td class="num">${b.vals[s.key] ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
  }
  draw();
}

function lineChart(data, series) {
  const W = 640, H = 250, L = 34, R = 96, T = 14, B = 30;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(2, ...data.flatMap((b) => series.map((s) => b.vals[s.key] || 0)));
  const yMax = Math.ceil(max / 2) * 2;
  const x = (i) => L + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => T + ih - (v / yMax) * ih;
  const ticks = [0, yMax / 2, yMax];
  const labelEvery = data.length > 10 ? 4 : 1;

  const paths = series.map((s) => {
    let d = "", pen = false;
    data.forEach((b, i) => {
      const v = b.vals[s.key];
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    const dots = data.map((b, i) => (b.vals[s.key] == null ? "" : `<circle cx="${x(i)}" cy="${y(b.vals[s.key])}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`)).join("");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join("");

  // Direct labels at each line's last point, nudged apart so they never overlap
  const ends = series.map((s) => {
    let i = data.length - 1;
    while (i >= 0 && data[i].vals[s.key] == null) i--;
    return i < 0 ? null : { s, y: y(data[i].vals[s.key]), x: x(i) };
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  const endLabels = ends.map((e) => `<text x="${W - R + 10}" y="${e.y + 4}" fill="var(--muted)" font-size="12">${e.s.label.replace(" words", "")}</text>`).join("");

  const wrap = html(`<div class="chart" tabindex="0" role="img" aria-label="Line chart of word groups per 100 words by week. Use left and right arrow keys to read each week.">
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((t) => `<text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("")}
        ${data.map((b, i) => (i % labelEvery === 0 || i === data.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtShort(b.start)}</text>` : "")).join("")}</g>
      <line class="hover-line" x1="0" x2="0" y1="${T}" y2="${T + ih}" visibility="hidden"/>
      ${paths}
      ${endLabels}
    </svg>
    <div class="chart-tip" hidden></div>
    <div class="sr-only" aria-live="polite" data-live></div>
  </div>`);

  const svg = $("svg", wrap), tip = $(".chart-tip", wrap), vline = $(".hover-line", wrap), live = $("[data-live]", wrap);
  let active = -1;

  function show(i) {
    active = i;
    const b = data[i];
    const px = x(i);
    vline.setAttribute("x1", px); vline.setAttribute("x2", px); vline.setAttribute("visibility", "visible");
    const rect = svg.getBoundingClientRect(), scale = rect.width / W;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(px * scale, 90), rect.width - 90)}px`;
    tip.style.top = `${T * scale}px`;
    tip.innerHTML = `<div class="tip-title">Week of ${fmtShort(b.start)}</div>
      ${b.total ? series.map((s) => `<div class="row"><span><i class="sw" style="background:${s.color}"></i>${s.label}</span><span>${b.vals[s.key]}</span></div>`).join("") : `<div class="muted">No entries</div>`}
      <div class="mt-1 muted small">${b.list.length} ${b.list.length === 1 ? "entry" : "entries"} · ${b.total} words</div>`;
    live.textContent = `Week of ${fmtShort(b.start)}: ` + (b.total ? series.map((s) => `${s.label} ${b.vals[s.key]}`).join(", ") : "no entries");
  }
  function hide() { active = -1; tip.hidden = true; vline.setAttribute("visibility", "hidden"); }
  const nearest = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    data.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
    return best;
  };
  const openWeek = (i) => {
    const b = data[i];
    if (!b.list.length) return;
    openEntryList(`Week of ${fmtShort(b.start)}`, b.list);
  };

  svg.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("click", (e) => openWeek(nearest(e.clientX)));
  svg.style.cursor = "pointer";
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); show(Math.min(data.length - 1, active + 1)); }
    if (e.key === "ArrowLeft") { e.preventDefault(); show(Math.max(0, active < 0 ? data.length - 1 : active - 1)); }
    if ((e.key === "Enter" || e.key === " ") && active >= 0) { e.preventDefault(); openWeek(active); }
    if (e.key === "Escape") hide();
  });
  wrap.addEventListener("blur", hide);
  return wrap;
}

// ─────────────────────────── Luna noticed ───────────────────────────
function renderNoticed(card, entries, insights) {
  const head = `<div class="card-head"><h2 id="noticed-h">Luna noticed</h2>
    <button type="button" class="btn btn-sm" data-generate ${entries.length < 3 ? "disabled title=\"Write at least 3 entries first\"" : ""}>Look for patterns</button></div>`;

  function show(list, extra = "") {
    const ins = list[0];
    if (!ins) {
      card.innerHTML = head + extra + emptyState({
        title: "Nothing noticed yet",
        text: entries.length < 3 ? "After a few entries, Luna can point out patterns in your writing, always with the entries behind them." : "Ask Luna to look across your entries for patterns. Every insight links to the entries it came from.",
      });
    } else {
      const lvl = { low: 1, medium: 2, high: 3 }[ins.confidence] || 1;
      const supporting = entries.filter((e) => (ins.supporting_entry_ids || []).includes(e.id));
      card.innerHTML = head + extra + `
        <div class="hstack gap-3 wrap">
          ${state.demo ? `<span class="sample-tag">Sample</span>` : ""}
          <span class="conf" title="How sure Luna is, based on how many entries support this"><span class="dots">${[1, 2, 3].map((n) => `<i class="${n <= lvl ? "on" : ""}"></i>`).join("")}</span>${esc(ins.confidence)} confidence</span>
          <span class="muted small">${fmtDate(ins.created_at)}</span>
        </div>
        <p class="insight">${esc(ins.insight)}</p>
        <p class="m-0 muted">${esc(ins.explanation)}</p>
        <div class="hstack gap-3 wrap mt-1">
          <button type="button" class="btn btn-primary btn-sm" data-show ${supporting.length ? "" : "disabled"}>Show me the entries (${supporting.length})</button>
          ${list.length > 1 ? `<span class="self-center muted small">${list.length - 1} earlier ${list.length - 1 === 1 ? "insight" : "insights"} in Privacy settings</span>` : ""}
        </div>`;
      const btn = $("[data-show]", card);
      btn && btn.addEventListener("click", () => openEntryList("Entries behind this insight", supporting, ins.insight));
    }
    $("[data-generate]", card).addEventListener("click", generate);
  }

  async function generate() {
    card.innerHTML = head + aiLoading("Luna is reading across your entries…");
    $("[data-generate]", card).disabled = true;
    const r = await callAI("generate-insights", {});
    if (!r.ok) { show(insights, `<div class="mb-3">${aiProblem(r)}</div>`); return; }
    const fresh = r.data.insights || [];
    if (state.demo) addDemoInsights(fresh);
    insights = state.demo ? await listInsights() : [...fresh, ...insights];
    if (!fresh.length) { show(insights, `<div class="mb-3 state-inline notcfg"><div><strong>No clear pattern yet.</strong> Luna only shares a pattern when several entries support it.</div></div>`); return; }
    show(insights);
  }

  show(insights);
}

function openEntryList(title, list, subtitle = "") {
  const el = html(`<div>
    <h2>${esc(title)}</h2>
    ${subtitle ? `<p class="m-0 mb-4 muted">${esc(subtitle)}</p>` : `<p class="m-0 mb-4 muted">${list.length} ${list.length === 1 ? "entry" : "entries"}</p>`}
    ${list.map((e) => `<a class="mini-entry" href="#/journal/${e.id}">
      <span class="t">${esc(e.title || "Untitled")}</span>
      <span class="small muted">${fmtDate(e.created_at)}${e.mood ? " · " + esc(e.mood) : ""}</span>
      <span class="x">${esc(plain(e.content).slice(0, 260))}</span></a>`).join("")}
    <div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>
  </div>`);
  const close = openModal(el, { label: title });
  $("[data-close]", el).addEventListener("click", close);
  $$("a.mini-entry", el).forEach((a) => a.addEventListener("click", () => close()));
}
