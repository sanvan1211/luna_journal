// Deep analysis: reads a range of days in order and writes a longitudinal, quote-backed reflection.
// The prompts live in _shared/deep-analysis-prompt.ts (Luna's master prompt for this).
//   0. SAFETY   urgent phrases anywhere in the FULL text stop the analysis; the app shows support instead.
//   1. NOTES    (fast model, low reasoning, one call per 1-3 days): structured notes per day.
//              Quotes are verified in code against that day's text; anything not verbatim is dropped.
//   2. ANALYZE  (thoughtful model, medium reasoning): the analysis, from the verified notes only.
//              Older days' notes are shortened (never dropped) to fit, and the model is told.
//   3. REVIEW   code: every quote must be verbatim; fast model: rule violations. One rewrite,
//              then any sentences still flagged are removed.
// Each request stays under ~6,000 tokens because the free tier limits tokens per minute.
import { serve, json, complete, parseJSON, pickModel, splitDays, URGENT, ENTRY_CHARS, Entry, CallOptions, NotConfigured, FreeLimit } from "../_shared/luna.ts";
import { DEEP_NOTES_PROMPT, DEEP_ANALYSIS_PROMPT, DEEP_REVIEW_PROMPT } from "../_shared/deep-analysis-prompt.ts";
import { verifyQuotes, checkBlockquotes, repairQuotes, removeSentences, fakeInlineQuotes, shortDate } from "../_shared/quotes.js";
import { fitNotes } from "../_shared/deep-notes.js";
import { clinicalSentences, needsSupportNote, addSupportNote, closingSentences } from "../_shared/deep-checks.js";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MAX_DAYS = 31;          // a month; longer ranges keep the most recent month and say so
const BATCH_CHARS = 9000;     // journal text per notes call (~2,300 tokens)
const NOTES_CHARS = 8000;     // verified notes sent to the analysis call (~2,000 tokens)
const FIELDS = ["events", "behaviors", "people", "things_felt", "wins", "stressors", "goals_or_plans", "past_references", "writer_questions", "writer_own_insights", "exact_quotes"] as const;
/** One model call that may come back empty or malformed: returns null instead of throwing, so the
 *  caller can retry. Setup problems and the free limit still stop everything. */
async function tryCall(system: string, input: string, maxTokens: number, model: string, opts: CallOptions): Promise<string | null> {
  try {
    return await complete(system, input, maxTokens, model, opts);
  } catch (err) {
    if (err instanceof NotConfigured || err instanceof FreeLimit) throw err;
    console.error("Model call failed; retrying once", err);
    return null;
  }
}

type Notes = { date: string } & Partial<Record<(typeof FIELDS)[number], string[]>>;
type Day = { date: string; text: string; ids: string[] };

const nyKey = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (k: string, n: number) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** The writer's days in range, oldest first, built from entries (inline-dated entries count as
 *  several days). `left_out` counts days past the month limit, which the response reports. */
async function loadDays(db: SupabaseClient, body: any): Promise<{ days: Day[]; left_out: number }> {
  const ids = Array.isArray(body.entry_ids) ? body.entry_ids.filter((x: unknown) => typeof x === "string").slice(0, 200) : [];
  const to = isDate(body.to) ? body.to : nyKey(new Date());
  const from = isDate(body.from) ? body.from : addDays(to, -6);
  let q = db.from("entries").select("id,title,content,mood,tags,created_at").order("created_at", { ascending: true });
  // An entry pasted later can still hold earlier days inline, so look a month past the range end.
  q = ids.length ? q.in("id", ids) : q.gte("created_at", `${addDays(from, -1)}T00:00:00Z`).lte("created_at", `${addDays(to, 31)}T23:59:59Z`);
  const { data, error } = await q;
  if (error) throw error;
  const byDay = new Map<string, Day>();
  for (const e of splitDays((data ?? []) as Entry[])) {
    const date = nyKey(e.created_at);
    if (!ids.length && (date < from || date > to)) continue;
    const text = String(e.content ?? "").trim();
    if (!text) continue;
    const day = byDay.get(date) ?? { date, text: "", ids: [] };
    day.text = day.text ? `${day.text}\n\n${text}` : text;
    if (!day.ids.includes(e.id)) day.ids.push(e.id);
    byDay.set(date, day);
  }
  const all = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days: all.slice(-MAX_DAYS), left_out: Math.max(0, all.length - MAX_DAYS) };
}

/** Groups days into notes calls: at most 3 days and about BATCH_CHARS of text each. */
function batches(days: Day[]): Day[][] {
  const out: Day[][] = [];
  for (const d of days) {
    const last = out[out.length - 1];
    const size = last ? last.reduce((n, x) => n + Math.min(x.text.length, ENTRY_CHARS), 0) : 0;
    if (last && last.length < 3 && size + Math.min(d.text.length, ENTRY_CHARS) <= BATCH_CHARS) last.push(d);
    else out.push([d]);
  }
  return out;
}

async function extract(group: Day[], opts: CallOptions): Promise<Notes[]> {
  const input = group.map((d) => `<day date="${d.date}">\n${d.text.slice(0, ENTRY_CHARS)}${d.text.length > ENTRY_CHARS ? "\n[entry continues]" : ""}\n</day>`).join("\n\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await tryCall(DEEP_NOTES_PROMPT, input, 2000, pickModel("fast"), { ...opts, reasoning: "low" });
    const parsed = reply ? parseJSON<{ days: Notes[] }>(reply) : null;
    if (parsed?.days?.length) {
      return group.map((d) => {
        const raw = parsed.days.find((n) => n?.date === d.date) ?? (group.length === 1 ? parsed.days[0] : null);
        const notes: Notes = { date: d.date };
        if (!raw) return notes;
        for (const f of FIELDS) {
          let list = (Array.isArray(raw[f]) ? raw[f]! : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 6);
          if (f === "exact_quotes") list = verifyQuotes(list, d.text); // verbatim or dropped
          if (list.length) notes[f] = list;
        }
        return notes;
      });
    }
  }
  return group.map((d) => ({ date: d.date })); // couldn't read notes for these days; the analysis is told
}

type Context = { notes: Notes[]; focus: string; shortened: string[]; leftOut: number; unread: string[] };

async function analyze(c: Context, fix: string[], opts: CallOptions): Promise<string> {
  const input = [
    c.focus && `The writer wants to understand: ${c.focus}`,
    `Days covered, oldest first: ${c.notes.map((n) => `${n.date} (${shortDate(n.date)})`).join(", ")}.`,
    c.notes.length < 3 && "Only a little history is available: say plainly what it can and can't support.",
    c.leftOut && `${c.leftOut} earlier days weren't included (only the most recent month is read); don't assume anything about them.`,
    c.shortened.length && `Notes for ${c.shortened.map(shortDate).join(", ")} were shortened to fit; less detail there isn't less happening.`,
    c.unread.length && `Notes for ${c.unread.map(shortDate).join(", ")} couldn't be read; say so if it matters.`,
    `Verified notes:\n${JSON.stringify(c.notes)}`,
    fix.length && `A previous draft broke the rules in these sentences. Write it again without anything like them:\n${fix.map((s) => `- ${s}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  // Retry once if the model returns something that isn't an analysis (empty, cut off, or malformed).
  for (let attempt = 0; attempt < 2; attempt++) {
    const md = ((await tryCall(DEEP_ANALYSIS_PROMPT, input, 3500, pickModel("thoughtful"), { ...opts, reasoning: "medium" })) ?? "").trim();
    if (md.split(/\s+/).length >= 150 && /^#{1,2}\s/m.test(md)) return md;
  }
  throw new Error("The analysis came back incomplete twice");
}

type Flag = { sentence: string; serious: boolean };

/** The model's rule review. Returns null if it couldn't be read twice (the caller reports that).
 *  Diagnosis (a), scoring (b), and romanticizing distress (e) are serious; the rest are style. */
async function violations(markdown: string, notes: Notes[], opts: CallOptions): Promise<Flag[] | null> {
  for (let i = 0; i < 2; i++) {
    const reply = await tryCall(DEEP_REVIEW_PROMPT, `Notes:\n${JSON.stringify(notes)}\n\nAnalysis:\n${markdown}`, 1500, pickModel("fast"), { ...opts, reasoning: "low" });
    const parsed = reply ? parseJSON<{ violations: { sentence: string; reason: string }[] }>(reply) : null;
    if (parsed && Array.isArray(parsed.violations)) {
      return parsed.violations
        .map((v) => ({ sentence: String(v?.sentence ?? "").trim(), serious: /^[abe]/i.test(String(v?.reason ?? "")) }))
        .filter((v) => v.sentence.length >= 12);
    }
  }
  return null;
}

serve(async ({ body, db }) => {
  const focus = String(body.focus ?? "").trim().slice(0, 1000);
  const { days, left_out } = await loadDays(db, body);
  if (!days.length) return json({ error: "no_entries", message: "There's nothing written in those days yet." }, 400);

  // Safety reads the FULL text of every day, before anything is clipped. Urgent writing stops the
  // analysis (nothing is sent to the AI) so the app can show support and 988 instead.
  if (days.some((d) => URGENT.test(d.text))) {
    return json({
      analysis_markdown: null,
      stopped: "safety",
      message: "Some of what you wrote in these days sounds really hard. Instead of an analysis, here are people who can help right now.",
      days_used: days.map((d) => d.date),
      safety: { flagged: true, level: "urgent" },
    });
  }
  const usage = { calls: 0, tokens: 0 };
  const opts: CallOptions = { usage };

  const extracted: Notes[] = [];
  for (const group of batches(days)) extracted.push(...await extract(group, opts));
  const unread = extracted.filter((n) => Object.keys(n).length === 1).map((n) => n.date);
  const fitted = fitNotes(extracted, NOTES_CHARS);
  const ctx: Context = { notes: fitted.notes as Notes[], focus, shortened: fitted.shortened, leftOut: left_out, unread };

  // Review = sentences quoting words the writer never wrote (code) + the model's rule review.
  // If the model's review can't be read, the code checks still apply and the response says so.
  const ownWords = [...days.map((d) => d.text), focus];
  let reviewed = true;
  // Code checks are always serious: made-up quotes and clinical words.
  const review = async (md: string): Promise<Flag[]> => {
    const found = await violations(md, ctx.notes, opts);
    if (!found) reviewed = false;
    return [
      ...fakeInlineQuotes(md, ownWords).map((sentence) => ({ sentence, serious: true })),
      ...clinicalSentences(md).map((sentence) => ({ sentence, serious: true })),
      ...(found ?? []),
    ];
  };

  // Quotes: blockquotes must be verbatim (fixed or removed), and unbalanced quotation marks are
  // closed where the writer's words end, so Luna's words never read as theirs.
  const tidy = (md: string) => { const c = checkBlockquotes(md, days); return { ...c, markdown: repairQuotes(c.markdown, ownWords) }; };
  let checked = tidy(await analyze(ctx, [], opts));
  let flagged = await review(checked.markdown);
  let rewrites = 0;
  if (flagged.length) {
    rewrites = 1;
    checked = tidy(await analyze(ctx, flagged.map((f) => f.sentence), opts));
    flagged = await review(checked.markdown);
    // Remove what's still flagged, but keep the closing question unless the problem is serious.
    const closing = new Set(closingSentences(checked.markdown));
    flagged = flagged.filter((f) => f.serious || !closing.has(f.sentence));
    if (flagged.length) checked = { ...checked, markdown: removeSentences(checked.markdown, flagged.map((f) => f.sentence)) };
  }
  // When stated sadness or heaviness recurs, the analysis always mentions talking with someone.
  const supportAdded = needsSupportNote(ctx.notes, checked.markdown);
  if (supportAdded) checked = { ...checked, markdown: addSupportNote(checked.markdown) };

  return json({
    analysis_markdown: checked.markdown,
    days_used: days.map((d) => d.date),
    days_left_out: left_out,
    days_shortened: fitted.shortened,
    days_unread: unread,
    entry_ids: [...new Set(days.flatMap((d) => d.ids))],
    quotes_verified: checked.verified,
    quotes_removed: checked.removed.length,
    rewrites,
    sentences_removed: flagged.length,
    rule_review: reviewed ? "done" : "unavailable",
    support_note_added: supportAdded,
    model: pickModel("thoughtful"),
    safety: { flagged: false, level: "none" },
    usage,
  });
});
