// Every AI call goes through a Supabase Edge Function. The browser never talks to
// an AI provider directly and never holds an AI API key.
//
// Result shape: { ok: true, data } or { ok: false, kind, message }
//   kind: "notconfigured" | "signin" | "demo" | "offline" | "error"
import { state } from "./state.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { demoEntriesForAI } from "./data.js";
import { esc } from "./util.js";
import { bunny } from "./bunny.js";

// Why the AI can't run when Supabase isn't usable (state.connection.reason, see state.js).
const NOT_CONNECTED = {
  empty: "Supabase isn't set up in js/config.js yet, so Luna's AI can't run.",
  cdn: "Luna couldn't load its Supabase library, so the AI can't run. Check your connection or ad blocker.",
  unreachable: "Luna couldn't reach Supabase, so the AI can't run. Check your connection.",
};

export const AI_FUNCTIONS = ["reflect-entry", "generate-insights", "ask-luna", "check-in", "safety-check"];

export async function callAI(name, body = {}) {
  if (!state.configured) {
    const reason = state.connection && state.connection.reason;
    return { ok: false, kind: "notconfigured", message: NOT_CONNECTED[reason] || NOT_CONNECTED.empty };
  }
  // Demo mode can use the AI on the sample entries, but only with an account.
  if (!state.session && state.demo) {
    return { ok: false, kind: "demo", message: "AI is off in demo mode. Create an account to try Luna's AI." };
  }
  if (!state.session) {
    return { ok: false, kind: "signin", message: "Sign in to use Luna's AI. In demo mode, it reads only the sample entries." };
  }
  body = { ...body, model: state.model };
  if (state.demo) body = { ...body, demo: true, demo_entries: demoEntriesForAI() };

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${state.session.access_token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    if (!navigator.onLine) return { ok: false, kind: "offline", message: "You're offline. Your writing is safe; try again when you're connected." };
    return { ok: false, kind: "notconfigured", message: `The "${name}" function couldn't be reached. It may not be deployed yet.` };
  }

  let data = null;
  try { data = await res.json(); } catch {}

  if (res.status === 404) {
    return { ok: false, kind: "notconfigured", message: `The "${name}" function isn't deployed yet.` };
  }
  if (res.status === 503 && data && data.error === "ai_not_configured") {
    return { ok: false, kind: "notconfigured", message: "The AI key hasn't been added to Supabase secrets yet." };
  }
  if (res.status === 401) {
    return { ok: false, kind: "signin", message: "Your session expired. Please sign in again." };
  }
  if (!res.ok) {
    return { ok: false, kind: "error", message: (data && data.message) || "Luna couldn't finish that. Please try again." };
  }
  return { ok: true, data };
}

/** Standard inline UI for a failed AI call. */
export function aiProblem(result, { retry = false } = {}) {
  const titles = {
    notconfigured: "AI not configured",
    signin: "Sign in to use Luna's AI",
    demo: "Demo mode",
    offline: "You're offline",
    error: "Something went wrong",
  };
  const cls = result.kind === "error" || result.kind === "offline" ? "error" : "notcfg";
  return `<div class="state-inline ${cls}" role="status">
    <div><strong>${titles[result.kind] || "Unavailable"}.</strong> ${esc(result.message)}
    ${result.kind === "demo" ? `<br><button type="button" class="btn btn-primary btn-sm mt-1" data-action="demo-signup">Create account</button>` : ""}
    ${result.kind === "notconfigured" ? `<br><span class="small">No AI response is shown until it's set up. Luna never shows made-up answers.</span>` : ""}
    ${retry && result.kind === "error" ? `<br><button type="button" class="link-btn small" data-retry>Try again</button>` : ""}</div>
  </div>`;
}

export function aiLoading(text = "Luna is reading…") {
  return `<div class="state loading" role="status" aria-live="polite">${bunny("small")}<p>${esc(text)}</p></div>`;
}
