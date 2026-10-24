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
  let mode = "signin";
  const el = html(`<div class="page"><div class="auth">
    <div class="card">
      <div>
        <h1>Welcome to Luna</h1>
        <p class="muted" style="margin:6px 0 0">A private journal that helps you understand what you've written.</p>
      </div>
      <div class="seg" role="group" aria-label="Account">
        <button type="button" data-mode="signin" aria-pressed="true">Sign in</button>
        <button type="button" data-mode="signup" aria-pressed="false">Create account</button>
      </div>
      <form novalidate style="display:grid;gap:14px">
        <label class="field">Email<input class="input" type="email" name="email" autocomplete="email" required /></label>
        <label class="field">Password<input class="input" type="password" name="password" autocomplete="current-password" minlength="8" required /></label>
        <div data-msg role="alert" class="small"></div>
        <button class="btn btn-primary" type="submit">Sign in</button>
      </form>
      <div class="divider">or</div>
      <button class="btn" type="button" data-demo>Try it with sample data</button>
      <p class="small muted" style="margin:0">Your entries are private to your account. Luna is not a therapist and never diagnoses.</p>
    </div></div></div>`);

  const form = $("form", el), msg = $("[data-msg]", el), submit = $("button[type=submit]", form);
  $$("[data-mode]", el).forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    $$("[data-mode]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    submit.textContent = mode === "signin" ? "Sign in" : "Create account";
    form.password.autocomplete = mode === "signin" ? "current-password" : "new-password";
    msg.textContent = "";
  }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || password.length < 8) { msg.style.color = "var(--rose)"; msg.textContent = "Enter your email and a password of at least 8 characters."; return; }
    submit.disabled = true; msg.textContent = "";
    const fn = mode === "signin" ? "signInWithPassword" : "signUp";
    const { data, error } = await state.sb.auth[fn]({ email, password });
    submit.disabled = false;
    if (error) { msg.style.color = "var(--rose)"; msg.textContent = error.message; return; }
    if (mode === "signup" && !data.session) {
      msg.style.color = "var(--sage)";
      msg.textContent = "Check your email to confirm your account, then sign in.";
    }
  });
  return el;
}

function setupScreen() {
  return html(`<div class="page"><div class="auth" style="max-width:560px">
    <div class="card">
      <h1>Connect Supabase</h1>
      <p class="muted" style="margin:0">Luna stores journals in your Supabase project. Add your project URL and anon key to <code>js/config.js</code>, then reload.</p>
      <ol class="muted small" style="margin:0;padding-left:20px;line-height:1.8">
        <li>Create a project at supabase.com</li>
        <li>Run <code>supabase/schema.sql</code> in the SQL editor</li>
        <li>Copy the URL and anon key from Project Settings → API</li>
      </ol>
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
