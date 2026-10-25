// Shared helpers for Luna's Edge Functions (Deno).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { splitByDate } from "./date-split.js";
import { retryAfterSeconds } from "./limits.js";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

export class NotConfigured extends Error {}
export class Refused extends Error {}
/** The AI provider's free allowance is used up (HTTP 413/429 after a short wait and retry).
 *  `retryAfter` is the provider's own wait in seconds, when it says. */
export class FreeLimit extends Error {
  constructor(message: string, public retryAfter: number | null = null) { super(message); }
}
/** Builds a FreeLimit from a provider's 413/429 response, keeping its wait time. */
async function freeLimit(provider: string, res: Response): Promise<FreeLimit> {
  const body = await res.text();
  return new FreeLimit(`${provider} ${res.status}: ${body}`, retryAfterSeconds(res.headers.get("retry-after"), body));
}
export const FREE_LIMIT_MESSAGE = "Luna has reached its free AI limit for now. Your writing is safe.";

// Phrases that always show support resources. Run on the FULL text, before any clipping.
export const URGENT = /\b(kill myself|end my life|want to die|wanna die|suicid\w*|self[- ]?harm\w*|hurt myself|cut myself|cutting myself|no reason to live|better off without me|overdose)\b/i;

export type Entry = { id: string; title: string; content: string; mood: string | null; tags: string[]; created_at: string; cut?: boolean };

// Text limits. One entry can carry up to ENTRY_CHARS to the model; a whole request carries at most
// TOTAL_CHARS of entry text, which keeps Luna inside the AI provider's free daily token budget.
export const ENTRY_CHARS = 12000;
export const TOTAL_CHARS = 30000;
const clipEntry = (content: unknown) => {
  const text = String(content ?? "");
  return { content: text.slice(0, ENTRY_CHARS), cut: text.length > ENTRY_CHARS };
};

export const LUNA_RULES = `You are Luna, a calm reflection companion inside a private journaling app used by teenagers and adults.
Rules you always follow:
- You are not a therapist, counselor, or doctor. Never diagnose, never name disorders, never suggest someone "has" a condition.
- Never assign moods, scores, or ratings to a person. Describe what they WROTE, not who they ARE.
- Only use what is in the journal text you are given. If something isn't there, say you don't see it.
- Be warm, plain, and brief. No therapy jargon, no exclamation-heavy cheerleading, no emojis.
- If writing mentions self-harm, wanting to die, abuse, or being in danger, gently encourage reaching out to a trusted adult, a school counselor, or calling/texting 988, without lecturing.`;

/** Deep analysis: the same rules, except "brief" becomes "thorough". Quick Reflect keeps LUNA_RULES. */
export const DEEP_RULES = LUNA_RULES.replace(
  "- Be warm, plain, and brief. No therapy jargon, no exclamation-heavy cheerleading, no emojis.",
  `- Be warm and plain, and be thorough, specific, and insightful: connect details across days, compare days to each other, and say plainly what the writing doesn't show.
- Keep what the writer said separate from what is only a possibility ("one possibility is…", "it may be that…"). Prefer the writer's own conclusions over new ones.
- No therapy jargon, no exclamation-heavy cheerleading, no emojis, no advice they didn't ask for, and no pressure to be more productive.`,
);

/** Wraps a handler with CORS, auth, and consistent error responses. */
export function serve(handler: (ctx: { body: any; db: SupabaseClient; userId: string }) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const auth = req.headers.get("Authorization") ?? "";
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }, // every query runs as the user, so RLS applies
    });
    const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "unauthorized", message: "Please sign in again." }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    try {
      return await handler({ body, db, userId: user.id });
    } catch (err) {
      if (err instanceof NotConfigured) return json({ error: "ai_not_configured", message: err.message }, 503);
      if (err instanceof FreeLimit) return json({ error: "free_limit", message: FREE_LIMIT_MESSAGE, retry_after_seconds: err.retryAfter }, 429);
      console.error(err);
      return json({ error: "server_error", message: "Luna couldn't finish that. Please try again." }, 500);
    }
  });
}

/** Demo mode sends sample entries in the request; real mode reads the user's own rows. */
export async function loadEntries(db: SupabaseClient, body: any, limit = 40): Promise<Entry[]> {
  if (body?.demo && Array.isArray(body.demo_entries)) {
    return body.demo_entries.slice(0, limit).map((e: any) => ({
      id: String(e.id), title: String(e.title ?? "").slice(0, 200), ...clipEntry(e.content),
      mood: e.mood ?? null, tags: Array.isArray(e.tags) ? e.tags.slice(0, 10) : [], created_at: String(e.created_at),
    }));
  }
  const { data, error } = await db.from("entries").select("id,title,content,mood,tags,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((e) => ({ ...e, ...clipEntry(e.content) }));
}

/** An entry that marks days inline ("10.22- … 10.23- …") becomes one dated section per day,
 *  so the model sees each day separately. Sections keep the entry's id for citations. */
export function splitDays(entries: Entry[]): Entry[] {
  return entries.flatMap((e) => {
    const { before, days } = splitByDate(e.content, { now: new Date(e.created_at) });
    if (!days.length) return [e];
    const parts = days.map((d, i) => ({ ...e, content: d.text, created_at: d.created_at, cut: i === days.length - 1 ? e.cut : false }));
    return before ? [{ ...e, content: before, cut: false }, ...parts] : parts;
  });
}

/** Keeps entries in the order given (most relevant or newest first) until TOTAL_CHARS is used up.
 *  The entry that crosses the line is cut to fit; anything after it is left out. */
export function withinBudget(entries: Entry[], total = TOTAL_CHARS): Entry[] {
  const out: Entry[] = [];
  let used = 0;
  for (const e of splitDays(entries)) {
    const room = total - used;
    if (room <= 0) break;
    out.push(e.content.length > room ? { ...e, content: e.content.slice(0, room), cut: true } : e);
    used += Math.min(e.content.length, room);
  }
  return out;
}

/** Formats entries for the model. Pass entries already trimmed with withinBudget when you need
 *  to know which ones were sent (for citations); otherwise the budget is applied here. */
export function formatEntries(entries: Entry[]) {
  return withinBudget(entries).map((e) =>
    `<entry id="${e.id}" date="${e.created_at.slice(0, 10)}"${e.mood ? ` self_reported_mood="${e.mood}"` : ""}${e.tags?.length ? ` tags="${e.tags.join(",")}"` : ""}>
<title>${e.title || "Untitled"}</title>
${e.content}${e.cut ? "\n[entry continues]" : ""}
</entry>`).join("\n\n");
}

// Which AI writes Luna's replies. Set LUNA_PROVIDER in the function secrets (or supabase/functions/.env locally):
//   anthropic    Claude through Anthropic's API (needs ANTHROPIC_API_KEY). The default.
//   ollama       a model running on your own computer (OLLAMA_URL, e.g. http://host.docker.internal:11434)
//   huggingface  Hugging Face Inference Providers (needs HF_TOKEN)
//   groq         open models on Groq (needs GROQ_API_KEY)
const PROVIDER = (Deno.env.get("LUNA_PROVIDER") ?? "anthropic").trim().toLowerCase();
const env = (name: string, fallback: string) => Deno.env.get(name)?.trim() || fallback;

// The two choices under Account → Model, per provider. Anything else gets the default.
const MODELS: Record<string, { fast: string; thoughtful: string }> = {
  anthropic: { fast: "claude-haiku-5-5", thoughtful: "claude-sonnet-5-5" },
  ollama: { fast: env("OLLAMA_FAST_MODEL", "llama3.2"), thoughtful: env("OLLAMA_THOUGHTFUL_MODEL", "qwen2.5:7b") },
  huggingface: { fast: env("HF_FAST_MODEL", "Qwen/Qwen2.5-7B-Instruct"), thoughtful: env("HF_THOUGHTFUL_MODEL", "Qwen/Qwen2.5-72B-Instruct") },
  groq: { fast: env("GROQ_FAST_MODEL", "openai/gpt-oss-20b"), thoughtful: env("GROQ_THOUGHTFUL_MODEL", "openai/gpt-oss-120b") },
};
const models = () => {
  const m = MODELS[PROVIDER];
  if (!m) throw new NotConfigured(`LUNA_PROVIDER "${PROVIDER}" isn't one of: ${Object.keys(MODELS).join(", ")}.`);
  return m;
};
export const pickModel = (choice: unknown): string => {
  const m = models();
  return m[String(choice) as "fast" | "thoughtful"] ?? Deno.env.get("LUNA_MODEL") ?? m.fast;
};

/** Optional per-call settings. `reasoning` applies to reasoning models on Groq; `usage` collects
 *  how many calls and tokens a multi-step request used. */
export type CallOptions = { reasoning?: "low" | "medium" | "high"; usage?: { calls: number; tokens: number } };

/** Sends one system prompt and one user message to the configured provider; returns the reply text. */
export async function complete(system: string, user: string, maxTokens = 600, model = pickModel(null), opts: CallOptions = {}): Promise<string> {
  const text = (PROVIDER === "ollama" ? ollama : PROVIDER === "huggingface" ? huggingface : PROVIDER === "groq" ? groq : anthropic)(system, user, maxTokens, model, opts);
  const reply = (await text).trim();
  if (!reply) throw new Error("The model returned an empty reply");
  return reply;
}

// Claude Haiku 5.5 and Sonnet 5.5 think by default, and thinking counts toward max_tokens. Luna's
// replies are short and single-turn, so thinking is turned off and the budget goes to the answer.
const THINKING_OFF: Record<string, unknown> = {
  "claude-haiku-5-5": { type: "disabled" },
  "claude-sonnet-5-5": { type: "between_tools" },
};

async function anthropic(system: string, user: string, maxTokens: number, model: string, _opts: CallOptions = {}) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new NotConfigured("ANTHROPIC_API_KEY is not set in Supabase secrets.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(THINKING_OFF[model] ? { thinking: THINKING_OFF[model] } : {}),
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (res.status === 413 || res.status === 429) throw await freeLimit("Anthropic", res);
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Refused("Claude declined this request");
  return (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

async function ollama(system: string, user: string, maxTokens: number, model: string, _opts: CallOptions = {}) {
  const url = Deno.env.get("OLLAMA_URL")?.replace(/\/+$/, "");
  if (!url) throw new NotConfigured("OLLAMA_URL is not set.");
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model, stream: false,
        options: { num_predict: maxTokens, temperature: 0.4 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
  } catch {
    throw new NotConfigured(`Couldn't reach Ollama at ${url}. Is it running?`);
  }
  if (res.status === 404) throw new NotConfigured(`Ollama doesn't have the model "${model}". Run: ollama pull ${model}`);
  if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // Some local models wrap their reasoning in <think> tags; only the answer is kept.
  return String(data.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
}

async function huggingface(system: string, user: string, maxTokens: number, model: string, _opts: CallOptions = {}) {
  const token = Deno.env.get("HF_TOKEN");
  if (!token) throw new NotConfigured("HF_TOKEN is not set in Supabase secrets.");
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0.4,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (res.status === 413 || res.status === 429) throw await freeLimit("Hugging Face", res);
  if (!res.ok) throw new Error(`Hugging Face error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return String(data.choices?.[0]?.message?.content ?? "");
}

async function groq(system: string, user: string, maxTokens: number, model: string, opts: CallOptions = {}) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new NotConfigured("GROQ_API_KEY is not set in Supabase secrets.");
  const body = JSON.stringify({
    model, max_tokens: maxTokens, temperature: 0.4,
    // gpt-oss models reason before answering, and reasoning counts toward max_tokens.
    ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: opts.reasoning ?? "low" } : {}),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  // The free tier limits tokens per minute: wait out a short limit once or twice, then give up honestly.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(75000), // a stuck call fails honestly instead of hanging the function
    });
    if (opts.usage) opts.usage.calls++;
    if (res.status === 413 || res.status === 429) {
      const wait = parseFloat(res.headers.get("retry-after") ?? "") || parseFloat(res.headers.get("x-ratelimit-reset-tokens") ?? "") || 0;
      if (res.status === 429 && attempt < 2 && wait > 0 && wait <= 25) { await new Promise((r) => setTimeout(r, wait * 1000 + 250)); continue; }
      throw await freeLimit("Groq", res);
    }
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (opts.usage) opts.usage.tokens += Number(data.usage?.total_tokens ?? 0);
    return String(data.choices?.[0]?.message?.content ?? "");
  }
}

/** Pulls the first JSON object out of a model reply. */
export function parseJSON<T>(text: string): T | null {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}
