// "Your most important quotes": lines from the past month that stand out, picked on this device by
// simple, explainable rules (no AI): sentences where the writer reflects on themselves, names a
// feeling, or gives a reason. Never features a line about self-harm or danger.

const REFLECT = /\b(i think|i realized|i realised|i learned|i noticed|i feel like|i guess|i wonder|i hope|i want|i need|i miss|i love|i wish|i'?m (?:starting|learning|proud|grateful|not sure|trying|excited)|i (?:actually|finally|kind of) \w+|maybe i|for the first time|it felt|that felt|made me)\b/gi;
const FEEL = /\b(proud|grateful|thankful|happy|glad|calm|peaceful|excited|hopeful|lighter|myself|alive|sad|heavy|empty|lonely|scared|nervous|tired|stressed|overwhelmed|guilty|relieved|confident|free)\b/gi;
const REASON = /\b(because|since|so that|which is why|but|even though|instead)\b/gi;
const URGENT = /\b(kill myself|end my life|want to die|wanna die|suicid\w*|self[- ]?harm\w*|hurt myself|cut myself|cutting myself|no reason to live|better off without me|overdose)\b/i;

const count = (re, s) => (s.match(re) || []).length;

/** Scores one sentence; 0 means it doesn't qualify. */
export function scoreLine(s) {
  const words = s.split(/\s+/).filter(Boolean).length;
  if (words < 6 || words > 45 || URGENT.test(s) || !/\b(i|i'?m|my|me|myself)\b/i.test(s)) return 0;
  return Math.min(count(REFLECT, s), 2) * 3 + Math.min(count(FEEL, s), 2) * 2 + Math.min(count(REASON, s), 1);
}

/**
 * @param {{id: string, title: string, content: string, created_at: string}[]} entries
 * @param {{ now?: Date, days?: number, limit?: number, toText?: (md: string) => string }} opts
 * @returns {{ text: string, entry: object, score: number }[]}  newest first, at most one per entry
 */
export function pickQuotes(entries, { now = new Date(), days = 30, limit = 5, toText = (s) => s } = {}) {
  const since = now.getTime() - days * 864e5;
  const best = [];
  for (const e of entries) {
    if (new Date(e.created_at).getTime() < since) continue;
    const text = toText(e.content || "");
    if (URGENT.test(text)) continue; // an entry about danger is never mined for "highlights"
    let top = null;
    for (const raw of text.split(/(?<=[.!?…])\s+|\n+/)) {
      const s = raw.trim().replace(/^[-*•\d.)\s]+/, "");
      const score = scoreLine(s);
      if (score >= 3 && (!top || score > top.score)) top = { text: s, entry: e, score };
    }
    if (top) best.push(top);
  }
  return best.sort((a, b) => b.score - a.score || new Date(b.entry.created_at) - new Date(a.entry.created_at))
    .slice(0, limit)
    .sort((a, b) => new Date(b.entry.created_at) - new Date(a.entry.created_at));
}
