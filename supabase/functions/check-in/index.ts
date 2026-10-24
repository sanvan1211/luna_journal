import { serve, json, claude, LUNA_RULES, pickModel } from "../_shared/luna.ts";

serve(async ({ body }) => {
  const a = body.answers ?? {};
  const clip = (s: unknown) => String(s ?? "").trim().slice(0, 1500);
  const lines = [
    Array.isArray(a.arriving) && a.arriving.length ? `How I'm arriving: ${a.arriving.slice(0, 3).join(", ")}` : "",
    clip(a.space) && `What's taking up space in my mind: ${clip(a.space)}`,
    clip(a.okay) && `One thing that went okay: ${clip(a.okay)}`,
    clip(a.need) && `What would help: ${clip(a.need)}`,
  ].filter(Boolean);
  if (!lines.length) return json({ error: "empty", message: "There's nothing in this check-in to reflect on yet." }, 400);

  const reflection = await claude(
    `${LUNA_RULES}

Task: the writer just finished a short emotional check-in. Reply in plain text, under 90 words:
acknowledge what they shared in their own words, notice the small thing that went okay, and offer one gentle, practical idea connected to what they said would help. No questions, no lists.`,
    lines.join("\n"),
    300,
    pickModel(body.model),
  );
  return json({ reflection });
});
