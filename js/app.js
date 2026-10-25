import { state, initSupabase, loadDemoPref, loadModelPref, setDemo, subscribe } from "./state.js";
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
      <form novalidate class="stack">
        <label class="field">Email<input class="input" type="email" name="email" autocomplete="email" required /></label>
        <label class="field">Password<input class="input" type="password" name="password" autocomplete="current-password" minlength="8" required /></label>
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
