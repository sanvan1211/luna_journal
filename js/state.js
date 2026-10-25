// App-wide state + Supabase client. The client is only loaded if config.js is filled in.
import { SUPABASE_URL, SUPABASE_ANON_KEY, AI_PROVIDER } from "./config.js";

export const state = {
  configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
  // Why Supabase isn't usable, for the setup screen: null when it's fine, otherwise
  // { reason: "empty" | "cdn" | "unreachable", error }
  connection: null,
  sb: null,          // Supabase client
  session: null,     // Supabase auth session
  demo: false,       // demo mode on/off
  model: "fast",     // AI model choice: "fast" | "thoughtful" (see MODELS)
};

// What the user can pick under Account → Model, named for the provider the Edge Functions use.
// The functions map "fast" and "thoughtful" to model IDs and ignore anything else.
const MODEL_NAMES = {
  anthropic: { fast: "Claude Haiku 5.5", thoughtful: "Claude Sonnet 5.5" },
  ollama: { fast: "Llama 3.2 (on this computer)", thoughtful: "Qwen 2.5 7B (on this computer)" },
  huggingface: { fast: "Qwen 2.5 7B (Hugging Face)", thoughtful: "Qwen 2.5 72B (Hugging Face)" },
  groq: { fast: "GPT-OSS 20B (Groq)", thoughtful: "GPT-OSS 120B (Groq)" },
};
const names = MODEL_NAMES[AI_PROVIDER] || MODEL_NAMES.anthropic;
export const MODELS = {
  fast: { name: names.fast, blurb: "Fast, for everyday reflections" },
  thoughtful: { name: names.thoughtful, blurb: "Slower, more thoughtful answers" },
};

const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (why) => listeners.forEach((fn) => fn(why));

export async function initSupabase() {
  if (!state.configured) {
    const missing = [!SUPABASE_URL && "URL", !SUPABASE_ANON_KEY && "anon key"].filter(Boolean).join(" and ");
    state.connection = { reason: "empty", error: `The Supabase ${missing} in js/config.js ${missing.includes(" and ") ? "are" : "is"} empty.` };
    return;
  }
  let createClient;
  try {
    ({ createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"));
  } catch (err) {
    console.error("Could not load supabase-js from the CDN", err);
    return fail("cdn", err);
  }
  try {
    state.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.sb.auth.getSession();
    state.session = data.session;
    state.sb.auth.onAuthStateChange((_event, session) => {
      const changed = (session && session.user.id) !== (state.session && state.session.user.id);
      state.session = session;
      if (changed) emit("auth");
    });
  } catch (err) {
    console.error("Could not start the Supabase client", err);
    return fail("unreachable", err);
  }
  // getSession reads local storage, so check the project itself answers before showing sign-in.
  if (!state.session) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`${SUPABASE_URL} answered ${res.status} ${res.statusText}`.trim());
    } catch (err) {
      console.error("Could not reach Supabase", err);
      return fail("unreachable", err);
    }
  }
}

function fail(reason, err) {
  state.configured = false;
  state.sb = null;
  state.session = null;
  state.connection = { reason, error: (err && err.message) || String(err) };
}

export const signedIn = () => Boolean(state.session);

const DEMO_KEY = "luna-demo";
export function loadDemoPref() {
  try { state.demo = localStorage.getItem(DEMO_KEY) === "1"; } catch { state.demo = false; }
}
export function setDemo(on) {
  state.demo = on;
  try { on ? localStorage.setItem(DEMO_KEY, "1") : localStorage.removeItem(DEMO_KEY); } catch {}
  emit("demo");
}

const MODEL_KEY = "luna-model";
export function loadModelPref() {
  try { const m = localStorage.getItem(MODEL_KEY); if (MODELS[m]) state.model = m; } catch {}
}
export function setModel(m) {
  if (!MODELS[m]) return;
  state.model = m;
  try { localStorage.setItem(MODEL_KEY, m); } catch {}
  emit("model");
}
