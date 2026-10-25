// Splits journal text that marks days inline, like "…nothin special… 10.22- why is my life… 10.23- today was…",
// into one piece per day. Pure functions, shared by the browser (js/date-split.js) and the Edge Functions
// (supabase/functions/_shared/date-split.js). The two files must stay identical; a test checks this.
//
// A marker is M.D, M/D, or M-D (optionally followed by "-" or ":") that:
//   - sits at the start of the text, the start of a line, or right after sentence-ending punctuation
//     (. ! ? … or a closing quote/bracket) and a space, so "slept 3.5 hours" and "$11.50" never count;
//   - has M 1-12 and D 1-31, is not followed by more digits ("10.22.5"), and has a letter within
//     3 characters after it;
//   - belongs to the longest run of markers whose dates go strictly forward through the text.
// Days are stored at local noon in America/New_York.

const MARKER = /(^|\n|[.!?…)"'”’]\s+)(\d{1,2})([./-])(\d{1,2})(?![\d./])\s*[-:–—]?/g;

/** All candidate markers, in order of appearance. */
function candidates(text) {
  const out = [];
  for (const m of text.matchAll(MARKER)) {
    const month = +m[2], day = +m[4];
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const start = m.index + m[1].length, end = m.index + m[0].length;
    if (!/^\s{0,2}[A-Za-z]/.test(text.slice(end, end + 3))) continue; // a letter within 3 characters
    out.push({ start, end, month, day, marker: text.slice(start, end) });
  }
  return out;
}

/** Longest run of candidates whose dates strictly increase (so a stray "3.5" can't break a real sequence). */
function ascending(list) {
  const n = list.length, len = Array(n).fill(1), prev = Array(n).fill(-1);
  const key = (c) => c.month * 100 + c.day;
  let best = -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) if (key(list[j]) < key(list[i]) && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    if (best < 0 || len[i] > len[best]) best = i;
  }
  const chain = [];
  for (let i = best; i >= 0; i = prev[i]) chain.unshift(list[i]);
  return chain;
}

/** Today's date in New York, as { y, m, d }. */
function nyToday(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  return { y, m, d };
}

/** ISO time for local noon in New York on that date (handles daylight saving). */
export function nyNoon(y, m, d) {
  const guess = Date.UTC(y, m - 1, d, 12);
  const hour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(guess));
  return new Date(guess + (12 - hour) * 3600e3).toISOString();
}

/**
 * @param {string} text
 * @param {{ now?: Date }} opts  "now" anchors the year: a date later than today belongs to last year.
 * @returns {{ before: string, days: { date: string, created_at: string, marker: string, text: string }[] }}
 *   `before` is any text ahead of the first marker (kept, never dropped). `days` is empty when the
 *   text has fewer than two markers, so ordinary entries are never split.
 */
export function splitByDate(text = "", { now = new Date() } = {}) {
  const chain = ascending(candidates(text));
  if (chain.length < 2) return { before: text, days: [] };
  const today = nyToday(now);
  const days = chain.map((c, i) => {
    const y = c.month * 100 + c.day > today.m * 100 + today.d ? today.y - 1 : today.y;
    const body = text.slice(c.end, i + 1 < chain.length ? chain[i + 1].start : text.length);
    return {
      date: `${y}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`,
      created_at: nyNoon(y, c.month, c.day),
      marker: c.marker,
      text: body.trim(),
    };
  });
  return { before: text.slice(0, chain[0].start).trim(), days };
}
