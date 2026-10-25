// Deterministic safety checks for deep analysis, applied after the model writes. The prompt asks for
// all of this too, but models slip, so the parts that matter most are enforced in code.
// Plain JS so the unit tests (Node) and the Edge Function (Deno) share one copy.

// Clinical or diagnostic words Luna never uses about the writer.
const CLINICAL = /\b(depress(ion|ed|ive)|anxiety disorder|disorders?|diagnos\w*|symptoms?|clinical(ly)?|dissociat\w*|trauma(tic|tized)?|ptsd|adhd|bipolar|ocd|mania|manic|anhedonia|pathological)\b/i;

/** Sentences (outside quotes from the writer) that use clinical or diagnostic words. */
export function clinicalSentences(markdown = "") {
  const out = [];
  for (const line of markdown.split("\n")) {
    if (/^\s*>/.test(line)) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const outsideQuotes = sentence.replace(/[“"][^”"]*[”"]/g, "");
      if (CLINICAL.test(outsideQuotes)) out.push(sentence.trim());
    }
  }
  return out;
}

const HEAVY = /\b(sad|sadness|empty|emptiness|heavy|heaviness|numb|hopeless|lonely|alone|crying|cried|down|gray|grey|exhausted|miserable)\b/i;
const SUPPORT = /\b(trusted adult|someone (you|they) trust|counsel(or|ing)|doctor|therapist|talk(ing)? (with|to) someone|988)\b/i;
export const SUPPORT_NOTE = "Because this heaviness keeps coming back across these days, it might help to talk with someone you trust, like a parent or another trusted adult, a school counselor, or a doctor. You don't need a crisis or a clear reason to reach out.";

/** True when sadness or heaviness the writer stated shows up on 2+ days and the analysis never mentions support. */
export function needsSupportNote(notes = [], markdown = "") {
  const heavyDays = notes.filter((n) => (n.things_felt || []).some((f) => HEAVY.test(f))).length;
  return heavyDays >= 2 && !SUPPORT.test(markdown);
}

/** Adds the standard support line before the closing question (or at the end). */
export function addSupportNote(markdown = "") {
  const i = markdown.search(/^##\s+.*question/im);
  return i < 0 ? `${markdown.trim()}\n\n${SUPPORT_NOTE}` : `${markdown.slice(0, i).trimEnd()}\n\n${SUPPORT_NOTE}\n\n${markdown.slice(i)}`;
}

/** Sentences in the closing-question section, which are only removed for serious reasons. */
export function closingSentences(markdown = "") {
  const i = markdown.search(/^##\s+.*question/im);
  if (i < 0) return [];
  return markdown.slice(i).split("\n").slice(1).join(" ").split(/(?<=[.!?])\s+/).map((s) => s.replace(/^[*_\s]+|[*_\s]+$/g, "").trim()).filter(Boolean);
}
