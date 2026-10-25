// App-wide state + Supabase client. The client is only loaded if config.js is filled in.
import { SUPABASE_URL, SUPABASE_ANON_KEY, AI_PROVIDER } from "./config.js";

export const state = {
  configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
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
  if (!state.configured) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    state.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await state.sb.auth.getSession();
    state.session = data.session;
    state.sb.auth.onAuthStateChange((_event, session) => {
      const changed = (session && session.user.id) !== (state.session && state.session.user.id);
      state.session = session;
      if (changed) emit("auth");
    });
  } catch (err) {
    console.error("Could not load Supabase", err);
    state.configured = false;
  }
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
