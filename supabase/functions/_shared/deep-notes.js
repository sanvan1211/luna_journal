// Keeps deep-analysis notes inside the per-request token budget without dropping days.
// Plain JS so the unit tests (Node) and the Edge Function (Deno) share one copy.
// Older days are shortened first; dates, stated feelings, references to the past, and the writer's
// own questions and insights are kept longest, because they set the baseline for comparison.

const KEEP_LONGEST = ["things_felt", "past_references", "writer_questions", "writer_own_insights"];

const size = (notes) => JSON.stringify(notes).length;
const cap = (day, n, fields) => {
  const out = { ...day };
  for (const f of fields) if (Array.isArray(out[f])) { out[f] = out[f].slice(0, n); if (!out[f].length) delete out[f]; }
  return out;
};

/**
 * @param {any[]} notes  oldest first, each { date, …lists of strings }
 * @param {number} maxChars  JSON size to stay under (~4 characters per token)
 * @param {number} keepRecent  the most recent days are shortened last
 * @returns {{ notes: any[], shortened: string[] }}  `shortened` lists the dates whose notes were cut
 */
export function fitNotes(notes, maxChars = 10000, keepRecent = 5) {
  let out = notes.map((d) => ({ ...d }));
  const shortened = new Set();
  if (size(out) <= maxChars) return { notes: out, shortened: [] };
  const older = Math.max(0, out.length - keepRecent);
  const others = (d) => Object.keys(d).filter((k) => k !== "date" && !KEEP_LONGEST.includes(k));
  // 1) older days, other fields: 3 → 2 → 1 → 0 items; 2) older days, kept fields: 2 → 1;
  // 3) the same for recent days. Stop as soon as everything fits.
  const plan = [];
  for (const [from, to] of [[0, older], [older, out.length]]) {
    for (const n of [3, 2, 1, 0]) plan.push({ from, to, n, kept: false });
    for (const n of [2, 1]) plan.push({ from, to, n, kept: true });
  }
  for (const step of plan) {
    for (let i = step.from; i < step.to && size(out) > maxChars; i++) {
      const before = JSON.stringify(out[i]);
      out[i] = cap(out[i], step.n, step.kept ? KEEP_LONGEST : others(out[i]));
      if (JSON.stringify(out[i]) !== before) shortened.add(out[i].date);
    }
    if (size(out) <= maxChars) break;
  }
  return { notes: out, shortened: [...shortened].sort() };
}
