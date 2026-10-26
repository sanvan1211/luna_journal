// "Bring your own key": a signed-in user can point Luna at their own Groq, Hugging Face, or other
// OpenAI-compatible provider. Their key lives encrypted in Supabase Vault (see supabase/schema-chats-and-keys.sql)
// and is only ever read here, server-side, for that user's own requests. It is never returned to
// the browser, never logged, and redacted from any provider error text.
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { retryAfterSeconds } from "./limits.js";

export type Provider = "groq" | "huggingface" | "custom";
export type UserAI = { provider: Provider; baseUrl: string; model: string; key: string };

export const PRESETS: Record<Exclude<Provider, "custom">, { label: string; baseUrl: string; keyPrefix: string }> = {
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", keyPrefix: "gsk_" },
  // OpenAI-compatible router, per https://huggingface.co/docs/inference-providers (checked 2026-10-26).
  huggingface: { label: "Hugging Face", baseUrl: "https://router.huggingface.co/v1", keyPrefix: "hf_" },
};
export const label = (p: Provider) => (p === "custom" ? "Your provider" : PRESETS[p].label);

/** A problem with the user's own provider, already worded for them (no raw bodies, no key). */
export class ProviderError extends Error {
  constructor(message: string, public code: "bad_key" | "model" | "rate_limit" | "credits" | "down" | "bad_url" | "bad_request" | "setup", public retryAfter: number | null = null) {
    super(message);
  }
}

/** The current request's own-key settings, if the user has any (set by serve() in luna.ts). */
export const userAI = new AsyncLocalStorage<UserAI | null>();

// ───────────── Base URL safety (custom providers) ─────────────
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".private", ".test", ".invalid", ".example", ".arpa"];

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
}
function privateV6(ip: string) {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
}

/** Checks a custom base URL: https, a public host name (no IPs, no internal names), no
 *  credentials or odd ports, and (when DNS lookup is available) no private addresses behind it.
 *  Returns the cleaned URL, e.g. "https://api.example.com/v1". */
export async function checkBaseUrl(raw: string): Promise<string> {
  let url: URL;
  try { url = new URL(String(raw).trim()); } catch { throw new ProviderError("That doesn't look like a web address. It should start with https://", "bad_url"); }
  if (url.protocol !== "https:") throw new ProviderError("The address must start with https:// so your key is sent securely.", "bad_url");
  if (url.username || url.password) throw new ProviderError("Leave the username and password out of the address. Paste the key in the key box instead.", "bad_url");
  if (url.port && url.port !== "443") throw new ProviderError("Use the provider's standard https address, without a port number.", "bad_url");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.startsWith("[");
  if (isIP || host === "localhost" || !host.includes(".") || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ProviderError("Use the provider's public web address (like https://api.example.com/v1). Private or internal addresses aren't allowed.", "bad_url");
  }
  // Resolve it and refuse private addresses (stops a public name pointing inside a network).
  const addrs: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try { addrs.push(...(await Deno.resolveDns(host, type))); } catch { /* no records of this type, or DNS not available here */ }
  }
  if (addrs.some((a) => (a.includes(":") ? privateV6(a) : privateV4(a)))) {
    throw new ProviderError("That address points to a private network, so Luna can't use it.", "bad_url");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  return `https://${host}${path}`;
}

// ───────────── Calling an OpenAI-compatible provider with the user's key ─────────────
const redact = (text: string, key: string) =>
  text.split(key).join("[key]").replace(/\b(gsk|hf|sk|sk-proj)_[A-Za-z0-9_-]{8,}/g, "[key]").replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[key]");

/** The provider's own short error message, if it gave one, with any key removed. */
async function providerMessage(res: Response, key: string) {
  const text = await res.text().catch(() => "");
  let msg = "";
  try { const j = JSON.parse(text); msg = j?.error?.message ?? j?.error ?? j?.message ?? ""; } catch { msg = ""; }
  return { text, msg: redact(String(msg || ""), key).slice(0, 200) };
}

export async function compat(ai: UserAI, system: string, user: string, maxTokens: number, opts: { reasoning?: string } = {}): Promise<string> {
  const name = label(ai.provider);
  const base = ai.provider === "custom" ? await checkBaseUrl(ai.baseUrl) : PRESETS[ai.provider].baseUrl;
  const gptOss = /gpt-oss/i.test(ai.model);
  const body = {
    model: ai.model,
    // Reasoning models think before answering and that counts toward the limit, so leave room.
    max_tokens: gptOss ? Math.max(maxTokens, 400) : maxTokens,
    temperature: 0.4,
    ...(gptOss && ai.provider === "groq" ? { reasoning_effort: opts.reasoning ?? "low" } : {}),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  };
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${ai.key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual", // never follow a redirect with the key attached
      signal: AbortSignal.timeout(75000),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ProviderError(timedOut ? `${name} took too long to answer. Try again, or pick a smaller model.` : `Luna couldn't reach ${name}. Check the address, or try again in a minute.`, "down");
  }
  if (res.status >= 300 && res.status < 400) throw new ProviderError("That address redirected somewhere else. Use the provider's exact API address (it usually ends in /v1).", "bad_url");
  if (res.ok) {
    const data = await res.json().catch(() => null);
    const text = String(data?.choices?.[0]?.message?.content ?? "");
    if (!data?.choices) throw new ProviderError(`${name} answered, but not like an OpenAI-compatible API. Check the address (it usually ends in /v1).`, "bad_url");
    return text;
  }
  const { text, msg } = await providerMessage(res, ai.key);
  const extra = msg ? ` (${name} said: "${msg}")` : "";
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${name} didn't accept that key. Check that you copied all of it, and that it's allowed to make inference calls.`, "bad_key");
  if (res.status === 402) throw new ProviderError(`${name} says this account is out of credits or needs billing set up.`, "credits");
  if (res.status === 413 || res.status === 429) {
    throw new ProviderError(`${name} says you've hit your rate limit. Your writing is safe.`, "rate_limit", retryAfterSeconds(res.headers.get("retry-after"), text));
  }
  if (res.status === 404 || /model/i.test(msg) && /(not found|does not exist|not supported|unknown|invalid)/i.test(msg)) {
    throw new ProviderError(`${name} doesn't have the model "${ai.model}". Pick another model, or check the spelling.${ai.provider === "custom" ? " If the model is right, check the address." : ""}`, "model");
  }
  if (res.status >= 500) throw new ProviderError(`${name} is having trouble right now. Try again in a few minutes.`, "down");
  throw new ProviderError(`${name} couldn't run that request.${extra}`, "bad_request");
}

// ───────────── Loading a user's saved settings (service role, server-side only) ─────────────
let tableMissing = false;
export const admin = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export const missingTable = (e: any) => e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /ai_settings|luna_get_ai_key/.test(e.message ?? ""));

/** The user's own provider and key, or null to use Luna's default. Only called with the id of the
 *  user whose JWT was just verified, so a request can only ever use its own user's key. */
export async function loadUserAI(userId: string, { evenIfDefault = false } = {}): Promise<UserAI | null> {
  if (tableMissing) return null;
  const db = admin();
  const { data, error } = await db.from("ai_settings").select("provider, model, base_url, key_secret_id, key_provider").eq("user_id", userId).maybeSingle();
  if (missingTable(error)) { tableMissing = true; return null; }
  if (error) throw error;
  if (!data || !data.key_secret_id || (data.provider === "default" && !evenIfDefault)) return null;
  const { data: key, error: keyErr } = await db.rpc("luna_get_ai_key", { p_user: userId });
  if (keyErr || !key) {
    console.error("Couldn't read the user's saved AI key", keyErr?.code ?? "no key");
    throw new ProviderError("Luna couldn't read your saved AI key. Remove it in Settings → AI model and add it again.", "setup");
  }
  return { provider: data.provider === "default" ? data.key_provider : data.provider, baseUrl: data.base_url ?? "", model: data.model, key: String(key) };
}
