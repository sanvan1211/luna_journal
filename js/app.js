import { state, initSupabase, signInWithGoogle, loadDemoPref, loadModelPref, setDemo, subscribe } from "./state.js";
import { initAccount, renderAccount } from "./account.js";
import { resetDemoStore } from "./data.js";
import { esc, html, $, $$, toast } from "./util.js";
import { emptyState, loadingState } from "./bunny.js";

import * as home from "./pages/home.js";
import * as journal from "./pages/journal.js";
import * as dashboard from "./pages/dashboard.js";
import * as checkin from "./pages/checkin.js";
import * as ask from "./pages/ask.js";
import * as settings from "./pages/settings.js";

const PAGES = { home, journal, dashboard, checkin, ask, settings };
const TITLES = { home: "Home", journal: "Journal", dashboard: "Dashboard", checkin: "Check-in", ask: "Ask Luna", settings: "Privacy" };

const main = document.getElementById("main");
let cleanup = null;
let lastPage = null;
let authMode = "signin"; // which tab the sign-in screen opens on

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "") || "home";
  const [path, query = ""] = raw.split("?");
  const [page, id] = path.split("/");
  return { page: PAGES[page] ? page : "home", id: id || null, query: new URLSearchParams(query) };
}

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const r = parseRoute();
  if (cleanup) { try { await cleanup(); } catch {} cleanup = null; }

  $$("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.dataset.nav === r.page ? "page" : "false"));
  document.title = `${TITLES[r.page]} · Luna`;
  renderChrome();

  // Gate: demo mode works without an account; everything else needs sign-in.
  if (!state.demo && !state.session) {
    main.innerHTML = "";
    main.append(state.configured ? authScreen() : setupScreen());
    return;
  }

  main.innerHTML = loadingState();
  try {
    cleanup = (await PAGES[r.page].render(main, r)) || null;
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="page">${emptyState({
      title: "Luna couldn't load this page",
      text: esc(err.message || "Something went wrong."),
      actions: `<button class="btn" type="button" onclick="location.reload()">Reload</button>`,
    })}</div>`;
  }
  if (lastPage !== r.page) main.focus({ preventScroll: true });
  lastPage = r.page;
}

function renderChrome() {
  document.body.classList.toggle("demo-on", state.demo);
  $("#demo-banner").hidden = !state.demo;
  renderAccount();
}

// ───────────── Screens shown before sign-in ─────────────
const EYE = {
  show: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10s3-5.5 8.2-5.5 8.2 5.5 8.2 5.5-3 5.5-8.2 5.5S1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.6"/></svg>`,
  hide: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10s3-5.5 8.2-5.5 8.2 5.5 8.2 5.5-3 5.5-8.2 5.5S1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.6"/><path d="M3 3l14 14"/></svg>`,
};

const GOOGLE_G = `<svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
  <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
</svg>`;

function authScreen() {
  let mode = authMode;
  authMode = "signin";
  const el = html(`<div class="page"><div class="auth">
    <div class="card">
      <div>
        <h1>Welcome to Luna</h1>
        <p class="mt-1 muted">A private journal that helps you understand what you've written.</p>
      </div>
      <div class="stack-tight">
        <p class="m-0 small muted" id="auth-mode-label">Already have an account? Sign in. New to Luna? Create an account.</p>
        <div class="seg seg-lg" role="group" aria-labelledby="auth-mode-label">
          <button type="button" data-mode="signin" aria-pressed="true">Sign in</button>
          <button type="button" data-mode="signup" aria-pressed="false">Create account</button>
        </div>
      </div>
      <button class="btn btn-google" type="button" data-google>${GOOGLE_G}<span>Continue with Google</span></button>
      <div class="divider">or</div>
      <form novalidate class="stack">
        <label class="field">Email<input class="input" type="email" name="email" autocomplete="email" required /></label>
        <label class="field">Password
          <span class="pw-wrap">
            <input class="input" type="password" name="password" id="auth-password" autocomplete="current-password" minlength="8" required />
            <button type="button" class="icon-btn pw-toggle" data-pw-toggle aria-controls="auth-password" aria-pressed="false" aria-label="Show password" title="Show password">${EYE.show}</button>
          </span>
        </label>
        <div data-msg role="alert" class="small"></div>
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form>
      <div class="divider">or</div>
      <button class="btn" type="button" data-demo>Try it with sample data</button>
      <p class="m-0 small muted">Your entries are private to your account. Luna is not a therapist and never diagnoses.</p>
    </div></div></div>`);

  const form = $("form", el), msg = $("[data-msg]", el), submit = $("button[type=submit]", form);
  const setMode = (m) => {
    mode = m;
    $$("[data-mode]", el).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === m)));
    submit.textContent = mode === "signin" ? "Sign in" : "Create account";
    form.password.autocomplete = mode === "signin" ? "current-password" : "new-password";
    msg.textContent = "";
  };
  $$("[data-mode]", el).forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  setMode(mode);
  const pwToggle = $("[data-pw-toggle]", el);
  pwToggle.addEventListener("click", () => {
    const show = form.password.type === "password";
    form.password.type = show ? "text" : "password";
    pwToggle.setAttribute("aria-pressed", String(show));
    pwToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    pwToggle.title = show ? "Hide password" : "Show password";
    pwToggle.innerHTML = show ? EYE.hide : EYE.show;
  });
  const showError = (text) => { msg.style.color = "var(--rose)"; msg.textContent = text; };
  if (state.authError) { showError(`Couldn't sign in with Google: ${state.authError}`); state.authError = null; }

  const google = $("[data-google]", el), googleLabel = $("span", google);
  google.addEventListener("click", async () => {
    google.disabled = true;
    googleLabel.textContent = "Opening Google…";
    msg.textContent = "";
    const { error } = await signInWithGoogle();
    if (!error) return; // the browser is on its way to Google
    google.disabled = false;
    googleLabel.textContent = "Continue with Google";
    showError(error);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || password.length < 8) { msg.style.color = "var(--rose)"; msg.textContent = "Enter your email and a password of at least 8 characters."; return; }
    submit.disabled = true; msg.textContent = "";
    const fn = mode === "signin" ? "signInWithPassword" : "signUp";
    let data, error;
    try {
      ({ data, error } = await state.sb.auth[fn]({ email, password }));
    } catch (err) {
      error = err;
    }
    submit.disabled = false;
    if (error) {
      console.error(mode === "signin" ? "Sign-in failed" : "Sign-up failed", error);
      msg.style.color = "var(--rose)";
      msg.textContent = `${mode === "signin" ? "Couldn't sign in" : "Couldn't create your account"}: ${error.message || "something went wrong. Please try again."}`;
      return;
    }
    if (mode === "signup" && !data.session) {
      msg.style.color = "var(--sage)";
      msg.textContent = "Check your email to confirm your account, then sign in.";
    }
  });
  return el;
}

// Shown when Supabase can't be used. Each case names the real reason (see state.connection).
function setupScreen() {
  const { reason, error } = state.connection || { reason: "empty", error: "" };
  const refresh = `<p class="m-0 small muted">Try a hard refresh (Cmd/Ctrl+Shift+R). Your browser may be using an old copy of Luna's files.</p>`;
  const body = {
    empty: `<h1>Connect Supabase</h1>
      <p class="m-0 muted">${esc(error)} Luna stores journals in your Supabase project. Add your project URL and anon key to <code>js/config.js</code>, then reload.</p>
      <ol class="steps-list muted small">
        <li>Create a project at supabase.com</li>
        <li>Run <code>supabase/schema.sql</code> in the SQL editor</li>
        <li>Copy the URL and anon key from Project Settings → API</li>
      </ol>
      <p class="m-0 small muted">Already filled it in? Try a hard refresh (Cmd/Ctrl+Shift+R).</p>`,
    cdn: `<h1>Luna couldn't load Supabase</h1>
      <p class="m-0 muted">Your settings in <code>js/config.js</code> look fine, but the Supabase library didn't download. Check your connection, and turn off any ad or script blocker for this site.</p>
      <p class="m-0 small error-text">Error: ${esc(error)}</p>
      ${refresh}`,
    unreachable: `<h1>Luna can't reach Supabase</h1>
      <p class="m-0 muted">Your settings in <code>js/config.js</code> look fine, but your Supabase project didn't answer. Check your connection, and check that the project is running in the Supabase dashboard.</p>
      <p class="m-0 small error-text">Error: ${esc(error)}</p>
      ${refresh}`,
  }[reason];
  return html(`<div class="page"><div class="auth-narrow auth">
    <div class="card">
      ${body}
      ${reason === "empty" ? "" : `<button class="btn" type="button" onclick="location.reload()">Try again</button>`}
      <div class="divider">meanwhile</div>
      <button class="btn btn-primary" type="button" data-demo>Explore with sample data</button>
    </div></div></div>`);
}

// ───────────── Demo mode ─────────────
function enterDemo() {
  resetDemoStore();
  setDemo(true);
  toast("Demo mode on: sample data only");
  navigate("#/home");
}
function exitDemo() {
  setDemo(false);
  resetDemoStore();
  toast("Demo mode off");
  navigate("#/home");
}

document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-action]");
  if (!a) return;
  if (a.dataset.action === "exit-demo") exitDemo();
  if (a.dataset.action === "demo-signup") { authMode = "signup"; exitDemo(); }
  if (a.dataset.action === "signout") { await state.sb.auth.signOut(); state.session = null; route(); }
});
document.addEventListener("click", (e) => { if (e.target.closest("[data-demo]")) enterDemo(); });

document.addEventListener("luna:demo-toggle", (e) => (e.detail ? enterDemo() : exitDemo()));

subscribe((why) => { if (why === "auth") route(); });
window.addEventListener("hashchange", route);

// ───────────── Boot ─────────────
(async function boot() {
  main.innerHTML = loadingState("Opening your journal…");
  loadDemoPref();
  loadModelPref();
  initAccount();
  if (state.demo) resetDemoStore();
  await initSupabase();
  route();
})();
