// Quote checks for deep analysis. Plain JS so the unit tests (Node) and the Edge Functions (Deno)
// share one copy. A quote counts only if it appears word for word in the writer's own text
// (ignoring case, curly vs straight quotes, and spacing).

// Models often write typographic look-alikes (non-breaking spaces and hyphens, curly quotes),
// so both sides are compared in plain form.
const plainForm = (s = "") => String(s)
  .normalize("NFKC")
  .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
  .replace(/[\u2010-\u2015\u2212]/g, "-")
  .replace(/[‘’‛`´]/g, "'")
  .replace(/[“”„]/g, '"');
const norm = (s = "") => plainForm(s)
  .toLowerCase()
  .replace(/…/g, "...")
  .replace(/\s+/g, " ")
  .trim();
const unwrap = (s) => s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

/** Keeps only the quotes that appear verbatim in `text`. */
export function verifyQuotes(quotes = [], text = "") {
  const hay = norm(text);
  return [...new Set(quotes.map((q) => unwrap(String(q ?? ""))))]
    .filter((q) => q.length >= 6 && hay.includes(norm(q)));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-22" → "Oct 22" */
export const shortDate = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

/**
 * Checks every blockquote in the analysis against the days' text.
 * A quote attributed to the wrong day is re-attributed; a quote that isn't verbatim anywhere is removed.
 * @param {string} markdown
 * @param {{ date: string, text: string }[]} days
 * @returns {{ markdown: string, verified: number, removed: string[] }}
 */
export function checkBlockquotes(markdown = "", days = []) {
  const lines = markdown.split("\n"), out = [], removed = [];
  let verified = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) { out.push(lines[i]); continue; }
    const block = [];
    while (i < lines.length && /^\s*>/.test(lines[i])) block.push(lines[i++].replace(/^\s*>\s?/, ""));
    i--;
    // "quote" — Oct 22   (the attribution may also sit on its own last line)
    const joined = plainForm(block.join(" ")).replace(/\s+/g, " ").trim();
    const m = joined.match(/^(.*?)(?:\s*-{1,2}\s*\(?([A-Z][a-z]{2,8}\.?\s\d{1,2}(?:,\s\d{4})?)\)?)?\s*$/);
    const quote = unwrap(m ? m[1] : joined);
    const home = days.find((d) => norm(d.text).includes(norm(quote)) && quote.length >= 6);
    if (!home) { removed.push(quote); if (out.length && out[out.length - 1].trim() === "") out.pop(); continue; }
    verified++;
    out.push(`> “${quote}” — ${shortDate(home.date)}`);
  }
  return { markdown: out.join("\n").replace(/\n{3,}/g, "\n\n"), verified, removed };
}

/**
 * Sentences outside blockquotes that put words in quotation marks the writer never wrote
 * (a made-up "your own note, '…'"). Short single-word scare quotes are ignored.
 * @param {string} markdown
 * @param {string[]} texts  the writer's own text (days, plus their question if they asked one)
 * @returns {string[]} the offending sentences, as written
 */
export function fakeInlineQuotes(markdown = "", texts = []) {
  const hay = texts.map(norm).join("\n");
  const out = [];
  for (const line of markdown.split("\n")) {
    if (/^\s*>/.test(line)) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const spans = [...plainForm(sentence).matchAll(/"([^"]{3,}?)"/g)].map((m) => m[1].trim());
      if (spans.some((q) => q.split(/\s+/).length >= 2 && !hay.includes(norm(q).replace(/[.,;:!?]+$/, "")))) out.push(sentence.trim());
    }
  }
  return out;
}

/** Removes whole sentences (as written in the analysis) that a check flagged. */
export function removeSentences(markdown = "", sentences = []) {
  let md = markdown;
  for (const s of sentences) {
    const t = String(s ?? "").trim();
    if (t.length >= 12 && md.includes(t)) md = md.replace(t, "");
  }
  // Drop list items left empty, then renumber numbered lists so there's no "2." with nothing after it.
  let n = 0;
  md = md.split("\n").filter((l) => !/^\s*(\d+\.|[-*])\s*$/.test(l)).map((l) => {
    const m = l.match(/^(\s*)\d+\.\s+(.*)$/);
    if (!m) { if (l.trim()) n = 0; return l; }
    return `${m[1]}${++n}. ${m[2]}`;
  }).join("\n");
  return md.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
