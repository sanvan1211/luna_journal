// Deep analysis: reads a range of days in three passes and writes a longer, quote-backed analysis.
//   1. EXTRACT  (fast model, low reasoning, one call per 1-3 days): structured notes per day.
//              Quotes are verified in code against that day's text; anything not verbatim is dropped.
//   2. SYNTHESIZE (thoughtful model, medium reasoning): markdown from the verified notes only.
//   3. CHECK    code: every blockquote must be verbatim; fast model: rule violations. One rewrite,
//              then any sentences still flagged are removed.
// Each request stays under ~6,000 tokens because the free tier limits tokens per minute.
import { serve, json, complete, parseJSON, pickModel, splitDays, DEEP_RULES, URGENT, ENTRY_CHARS, Entry, CallOptions } from "../_shared/luna.ts";
import { verifyQuotes, checkBlockquotes, removeSentences, fakeInlineQuotes, shortDate } from "../_shared/quotes.js";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const MAX_DAYS = 14;          // most recent days kept when a range is longer
const BATCH_CHARS = 9000;     // journal text per extraction call (~2,300 tokens)
const FIELDS = ["events", "people", "things_felt", "wins", "stressors", "goals_or_plans", "exact_quotes", "writer_own_insights"] as const;
type Notes = { date: string } & Partial<Record<(typeof FIELDS)[number], string[]>>;
type Day = { date: string; text: string; ids: string[] };

const nyKey = (d: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (k: string, n: number) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** The writer's days in range, built from entries (inline-dated entries count as several days). */
async function loadDays(db: SupabaseClient, body: any): Promise<Day[]> {
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
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
}

/** Groups days into extraction calls: at most 3 days and about BATCH_CHARS of text each. */
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

const EXTRACT = `${DEEP_RULES}

Task: take careful notes on each journal day below. Return ONLY JSON:
{"days": [{"date": "YYYY-MM-DD",
  "events": ["what happened, briefly"],
  "people": ["people mentioned, as the writer names them"],
  "things_felt": ["only feelings the writer STATED, in their own words; never infer one"],
  "wins": ["things that went well, by the writer's account"],
  "stressors": ["things the writer said weighed on them"],
  "goals_or_plans": ["intentions or plans they wrote"],
  "exact_quotes": ["3-5 short phrases copied EXACTLY, character for character, from that day's text"],
  "writer_own_insights": ["conclusions the writer reached themselves, close to their words"]}]}
Leave a list empty rather than guessing. One object per date given.`;

async function extract(group: Day[], opts: CallOptions): Promise<Notes[]> {
  const input = group.map((d) => `<day date="${d.date}">\n${d.text.slice(0, ENTRY_CHARS)}${d.text.length > ENTRY_CHARS ? "\n[entry continues]" : ""}\n</day>`).join("\n\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await complete(EXTRACT, input, 1800, pickModel("fast"), { ...opts, reasoning: "low" });
    const parsed = parseJSON<{ days: Notes[] }>(reply);
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
  return group.map((d) => ({ date: d.date })); // couldn't read notes for these days; synthesis is told
}

const SYNTH = `${DEEP_RULES}

Task: write a deep analysis of the writer's journal from the verified notes below (taken from their own days).
Write markdown, 500-900 words, in this shape:
- A short opening paragraph naming the single biggest shift or thread across the days. If the writer asked a question in their writing (or in "The writer wants to understand"), answer it from what they wrote.
- 4-6 numbered sections ("## 1. …"). Each heading states a plain claim about their writing (for example "## 1. You're moving from getting through days to noticing them"). Each section has 1-3 short paragraphs and at least one exact quote as a blockquote on its own line, attributed to its date, like:
  > "the exact words" — Oct 22
  Quotes MUST be copied character for character from "exact_quotes" in the notes; never invent or reword one.
  Inside paragraphs, only put words in quotation marks when they are copied exactly from "exact_quotes" or the writer's question. The note headings (events, wins, stressors, things_felt…) are Luna's labels, not the writer's words: never say the writer "labeled" or "called" something by them.
  Compare days with each other (progression, contrast, things that recur), connect separate details (school, work, projects, people) into patterns, and keep what the writer said separate from possibilities ("one possibility is…", "it may be that…"). Prefer the writer's own insights.
- "## Worth noticing": what the writing doesn't show, what a few days can't prove, and that there's no pressure to be productive.
- "## Questions to write about next": 2-3 open questions.
Never diagnose, never rate or score moods, never describe people beyond what the notes say, and don't give advice they didn't ask for.`;

const CHECK = `You review a journal analysis written for a teenager or adult. Find sentences that:
(a) use diagnosis or clinical language about the writer (disorders, "symptoms", "you have …"),
(b) score or rate the writer's mood or the person,
(c) claim things about people that the notes don't support,
(d) give advice the writer didn't ask for.
Return ONLY JSON: {"violations": [{"sentence": "the exact sentence from the analysis", "reason": "a|b|c|d"}]}. Return {"violations": []} when there are none.`;

async function synthesize(notes: Notes[], focus: string, fix: string[], opts: CallOptions): Promise<string> {
  const input = `${focus ? `The writer wants to understand: ${focus}\n\n` : ""}Days covered: ${notes.map((n) => `${n.date} (${shortDate(n.date)})`).join(", ")}
${notes.some((n) => Object.keys(n).length === 1) ? "Some days have no notes because they couldn't be read; say so if it matters.\n" : ""}
Verified notes:
${JSON.stringify(notes)}${fix.length ? `\n\nA previous draft broke the rules in these sentences. Write it again without anything like them:\n${fix.map((s) => `- ${s}`).join("\n")}` : ""}`;
  return (await complete(SYNTH, input, 3500, pickModel("thoughtful"), { ...opts, reasoning: "medium" })).trim();
}

async function violations(markdown: string, notes: Notes[], opts: CallOptions): Promise<string[]> {
  const reply = await complete(CHECK, `Notes:\n${JSON.stringify(notes)}\n\nAnalysis:\n${markdown}`, 900, pickModel("fast"), { ...opts, reasoning: "low" });
  const parsed = parseJSON<{ violations: { sentence: string }[] }>(reply);
  return (parsed?.violations ?? []).map((v) => String(v?.sentence ?? "").trim()).filter((s) => s.length >= 12);
}

serve(async ({ body, db }) => {
  const focus = String(body.focus ?? "").trim().slice(0, 1000);
  const days = await loadDays(db, body);
  if (!days.length) return json({ error: "no_entries", message: "There's nothing written in those days yet." }, 400);

  // Safety reads the FULL text of every day, before anything is clipped.
  const urgent = days.some((d) => URGENT.test(d.text));
  const usage = { calls: 0, tokens: 0 };
  const opts: CallOptions = { usage };

  const notes: Notes[] = [];
  for (const group of batches(days)) notes.push(...await extract(group, opts));

  // Rule check = sentences quoting words the writer never wrote (code) + the model's rule review.
  const ownWords = [...days.map((d) => d.text), focus];
  const review = async (md: string) => [...fakeInlineQuotes(md, ownWords), ...await violations(md, notes, opts)];

  let markdown = await synthesize(notes, focus, [], opts);
  let checked = checkBlockquotes(markdown, days);
  let flagged = await review(checked.markdown);
  let rewrites = 0;
  if (flagged.length) {
    rewrites = 1;
    markdown = await synthesize(notes, focus, flagged, opts);
    checked = checkBlockquotes(markdown, days);
    flagged = await review(checked.markdown);
    if (flagged.length) checked = { ...checked, markdown: removeSentences(checked.markdown, flagged) };
  }

  return json({
    analysis_markdown: checked.markdown,
    days_used: days.map((d) => d.date),
    entry_ids: [...new Set(days.flatMap((d) => d.ids))],
    quotes_verified: checked.verified,
    quotes_removed: checked.removed.length,
    rewrites,
    sentences_removed: flagged.length,
    model: pickModel("thoughtful"),
    safety: { flagged: urgent, level: urgent ? "urgent" : "none" },
    usage,
  });
});
