// Decides whether to gently show support resources. It never blocks writing, never
// stores anything, and never labels the person. When unsure, it errs toward showing help.
import { serve, json, complete, parseJSON, NotConfigured, Refused } from "../_shared/luna.ts";

const URGENT = /\b(kill myself|end my life|want to die|wanna die|suicid\w*|self[- ]?harm\w*|hurt myself|cut myself|cutting myself|no reason to live|better off without me|overdose)\b/i;

serve(async ({ body }) => {
  const full = String(body.text ?? "");
  if (!full.trim()) return json({ flagged: false, level: "none" });

  // Fast path, on the full text before any clipping: obvious phrases always show resources,
  // even if the AI is unavailable.
  if (URGENT.test(full)) return json({ flagged: true, level: "urgent" });
  const text = full.slice(0, 10000);

  try {
    const reply = await complete(
      `You check private journal text for signs that the writer may be at risk: thoughts of suicide or self-harm, being abused or unsafe at home, or being in immediate danger.
Ordinary stress, sadness, breakups, or a bad day are "none".
Return ONLY JSON: {"level": "none" | "concern" | "urgent"}`,
      text,
      30,
    );
    const level = parseJSON<{ level: string }>(reply)?.level;
    const ok = level === "concern" || level === "urgent";
    return json({ flagged: ok, level: ok ? level : "none" });
  } catch (err) {
    if (err instanceof NotConfigured) return json({ flagged: false, level: "none", ai: false });
    // A declined safety read leans toward showing help, never toward hiding it.
    if (err instanceof Refused) return json({ flagged: true, level: "concern" });
    throw err;
  }
});
