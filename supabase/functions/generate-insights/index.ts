import { serve, json, loadEntries, formatEntries, complete, parseJSON, LUNA_RULES, pickModel } from "../_shared/luna.ts";

type Raw = {
  insights?: { insight: string; explanation: string; confidence: string; supporting_entry_ids: string[] }[];
  themes?: string[];
};

serve(async ({ body, db, userId }) => {
  const entries = await loadEntries(db, body, 40);
  if (entries.length < 3) return json({ insights: [], message: "Write at least 3 entries first." });

  const reply = await complete(
    `${LUNA_RULES}

Task: look across these journal entries for patterns in what the writer WRITES ABOUT.
Return ONLY a JSON object, no other text:
{
  "insights": [
    {
      "insight": "one sentence about a pattern in their writing, e.g. 'Your entries after a run tend to use calmer language.'",
      "explanation": "2-3 sentences pointing to what in the entries shows this. End by noting it's a pattern in their words, not a conclusion about them.",
      "confidence": "low" | "medium" | "high",
      "supporting_entry_ids": ["ids of the entries that show this, copied exactly"]
    }
  ],
  "themes": ["2-4 short recurring topics, 2-5 words each"]
}
Rules: at most 2 insights. Each insight needs at least 2 supporting entries; use "high" only with 4+.
Never describe mental health, diagnoses, or a mood score. If there is no clear pattern, return "insights": [].`,
    formatEntries(entries),
    900,
    pickModel(body.model),
  );

  const parsed = parseJSON<Raw>(reply) ?? {};
  const known = new Set(entries.map((e) => e.id));
  const insights = (parsed.insights ?? [])
    .map((i) => ({
      insight: String(i.insight ?? "").slice(0, 300),
      explanation: String(i.explanation ?? "").slice(0, 800),
      confidence: ["low", "medium", "high"].includes(i.confidence) ? i.confidence : "low",
      supporting_entry_ids: (i.supporting_entry_ids ?? []).filter((id) => known.has(id)),
    }))
    .filter((i) => i.insight && i.supporting_entry_ids.length >= 2)
    .slice(0, 2);
  const themes = (parsed.themes ?? []).map((t) => String(t).trim().slice(0, 60)).filter(Boolean).slice(0, 4);

  // Demo mode: return results without saving anything.
  if (body?.demo) return json({ insights, themes });

  let saved: unknown[] = [];
  if (insights.length) {
    const { data, error } = await db.from("insights").insert(insights.map((i) => ({ ...i, user_id: userId }))).select();
    if (error) throw error;
    saved = data ?? [];
  }
  if (themes.length) {
    const { data: existing } = await db.from("luna_memory").select("content").eq("type", "theme");
    const have = new Set((existing ?? []).map((m) => m.content.toLowerCase()));
    const fresh = themes.filter((t) => !have.has(t.toLowerCase())).map((content) => ({ user_id: userId, type: "theme", content }));
    if (fresh.length) await db.from("luna_memory").insert(fresh);
  }
  return json({ insights: saved, themes });
});
