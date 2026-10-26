import { serve, json, loadEntries, formatEntries, withinBudget, complete, parseJSON, stripIds, LUNA_RULES, Entry, pickModel } from "../_shared/luna.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const STOP = new Set("the a an and or but i me my we you it is was are to of in on for with about at what when did do does how have has had that this from be been am".split(" "));
const toks = (s: string) => (s.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w));

/* Picks the entries most related to the question, plus the most recent few. */
function relevant(entries: Entry[], question: string, n = 14) {
  const q = new Set(toks(question));
  const scored = entries.map((e, i) => {
    const words = toks(`${e.title} ${e.content} ${(e.tags ?? []).join(" ")} ${e.mood ?? ""}`);
    const hits = words.filter((w) => q.has(w)).length;
    return { e, score: hits + (i < 5 ? 0.5 : 0) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, n).map((s) => s.e);
}

/** The last ~10 messages of a saved chat, read as the caller (RLS keeps it to their own chats).
 *  Demo chats aren't stored, so demo mode sends its recent messages in the request instead. */
async function threadHistory(db: SupabaseClient, body: any, question: string): Promise<{ role: string; text: string }[]> {
  if (typeof body.thread_id === "string" && body.thread_id && !body.demo) {
    const { data, error } = await db.from("ask_messages").select("role, content")
      .eq("thread_id", body.thread_id).order("created_at", { ascending: false }).limit(11);
    if (error) throw error;
    const rows = (data ?? []).reverse().map((m) => ({ role: m.role, text: String(m.content ?? "") }));
    // The app saves the question before asking, so drop it from the history if it's the last message.
    const last = rows[rows.length - 1];
    if (last && last.role === "user" && last.text.trim() === question) rows.pop();
    return rows.slice(-10);
  }
  return (Array.isArray(body.history) ? body.history : []).slice(-10)
    .map((m: any) => ({ role: m.role === "user" ? "user" : "luna", text: String(m.text ?? "") }));
}

serve(async ({ body, db }) => {
  const question = String(body.question ?? "").trim().slice(0, 5000);
  if (!question) return json({ error: "empty", message: "Ask a question first." }, 400);

  const entries = await loadEntries(db, body, 120);
  if (!entries.length) return json({ answer: "I don't see any entries yet, so there's nothing for me to read. Write a little and ask again.", citations: [] });

  const pool = withinBudget(relevant(entries, question)); // most relevant first, within the text budget
  const history = (await threadHistory(db, body, question))
    .map((m) => `${m.role === "user" ? "Writer" : "Luna"}: ${m.text.slice(0, 2000)}`).join("\n");

  // "Thoughtful" gets more room and more reasoning, for questions that need a fuller answer.
  const deep = body.model === "thoughtful";
  const reply = await complete(
    `${LUNA_RULES}

Task: answer the writer's question using ONLY the journal entries provided.
Return ONLY a JSON object: {"answer": "plain text, ${deep ? "under 260 words. Be specific: connect details across entries and dates, and say plainly what the entries don't show" : "under 150 words"}", "citations": ["ids of every entry you drew on, copied exactly"]}
If the entries don't contain the answer, say so honestly and return "citations": [].
Refer to entries by date or title in the answer when it helps, never by id.`,
    `${history ? `Earlier in this conversation:\n${history}\n\n` : ""}Journal entries:\n${formatEntries(pool)}\n\nQuestion: ${question}`,
    deep ? 1600 : 700,
    pickModel(body.model),
    deep ? { reasoning: "medium" } : {},
  );

  const parsed = parseJSON<{ answer: string; citations: string[] }>(reply);
  const known = new Set(pool.map((e) => e.id));
  // Entry ids belong in citations (shown as links), never in the text.
  const answer = stripIds(parsed?.answer?.trim() || reply.replace(/[{}]/g, "").trim());
  const citations = (parsed?.citations ?? []).filter((id) => known.has(id));
  return json({ answer, citations });
});
