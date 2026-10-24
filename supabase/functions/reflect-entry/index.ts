import { serve, json, loadEntries, formatEntries, claude, LUNA_RULES, pickModel } from "../_shared/luna.ts";

serve(async ({ body, db }) => {
  const entries = await loadEntries(db, body, 200);
  const entry = entries.find((e) => e.id === body.entry_id);
  // 400, not 404: the app treats 404 as "function not deployed".
  if (!entry) return json({ error: "entry_not_found", message: "That entry wasn't found. Try saving it first." }, 400);

  const reflection = await claude(
    `${LUNA_RULES}

Task: reflect on ONE journal entry. Reply in plain text (no markdown, no headings), under 130 words:
1. One sentence naming what the writer seems to be focused on, using their own words where possible.
2. Two or three sentences of warm, specific reflection that notice something they may have missed (a strength, a contrast, a small win).
3. One open, gentle question they could write about next.`,
    formatEntries([entry]),
    400,
    pickModel(body.model),
  );
  return json({ reflection });
});
