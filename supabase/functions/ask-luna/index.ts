import { serve, json, loadEntries, formatEntries, complete, parseJSON, LUNA_RULES, Entry, pickModel } from "../_shared/luna.ts";

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

serve(async ({ body, db }) => {
  const question = String(body.question ?? "").trim().slice(0, 500);
  if (!question) return json({ error: "empty", message: "Ask a question first." }, 400);

  const entries = await loadEntries(db, body, 120);
  if (!entries.length) return json({ answer: "I don't see any entries yet, so there's nothing for me to read. Write a little and ask again.", citations: [] });

  const pool = relevant(entries, question);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-6)
    .map((m: any) => `${m.role === "user" ? "Writer" : "Luna"}: ${String(m.text ?? "").slice(0, 600)}`).join("\n");

  const reply = await complete(
    `${LUNA_RULES}

Task: answer the writer's question using ONLY the journal entries provided.
Return ONLY a JSON object: {"answer": "plain text, under 150 words", "citations": ["ids of every entry you drew on, copied exactly"]}
If the entries don't contain the answer, say so honestly and return "citations": [].
Refer to entries by date or title in the answer when it helps, never by id.`,
    `${history ? `Earlier in this conversation:\n${history}\n\n` : ""}Journal entries:\n${formatEntries(pool)}\n\nQuestion: ${question}`,
    700,
    pickModel(body.model),
  );

  const parsed = parseJSON<{ answer: string; citations: string[] }>(reply);
  const known = new Set(pool.map((e) => e.id));
  const answer = parsed?.answer?.trim() || reply.replace(/[{}]/g, "").trim();
  const citations = (parsed?.citations ?? []).filter((id) => known.has(id));
  return json({ answer, citations });
});
