// Account menu, bottom-left of the rail (the last tab on phones): who's signed in,
// the plan, which AI model Luna uses, and links to settings and support.
import { state, MODELS, setModel } from "./state.js";
import { esc, html, $, $$, openModal } from "./util.js";

const ICON = {
  user: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M4 17c.8-3.2 3.1-4.8 6-4.8s5.2 1.6 6 4.8"/></svg>`,
  chevron: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 12l4-4 4 4"/></svg>`,
  check: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3L15 6.5"/></svg>`,
  spark: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z"/></svg>`,
  gear: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l6 2.5v5c0 4-2.7 6.7-6 8.5-3.3-1.8-6-4.5-6-8.5v-5z"/></svg>`,
  heart: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16.5S3.5 12.6 3.5 8A3.3 3.3 0 0 1 10 6.6 3.3 3.3 0 0 1 16.5 8c0 4.6-6.5 8.5-6.5 8.5z"/></svg>`,
  out: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4H4v12h4M12 6.5 15.5 10 12 13.5M15.5 10H8"/></svg>`,
};

let menu = null;

const who = () =>
  state.session ? state.session.user.email
  : state.demo ? "Demo mode"
  : state.configured ? "Not signed in"
  : "Not connected yet";

const planLine = () => `${MODELS[state.model].name.replace("Claude ", "")} · Free`;

/** Redraws the account button. Called whenever the app chrome renders. */
export function renderAccount() {
  const btn = $("#account-btn");
  const initial = state.session ? esc(state.session.user.email[0].toUpperCase()) : "";
  btn.innerHTML = `<span class="avatar">${initial || ICON.user}</span>
    <span class="who"><span class="name">${esc(who())}</span><span class="plan">${esc(planLine())}</span></span>
    <span class="chev">${ICON.chevron}</span>
    <span class="tab-label">Account</span>`;
  btn.title = who();
  btn.setAttribute("aria-label", `Account menu: ${who()}, ${planLine()}`);
  if (menu) close(false);
}

function items() { return $$("[role^=menuitem]", menu); }

function open() {
  const btn = $("#account-btn");
  menu = html(`<div class="account-menu" id="account-menu" role="menu" aria-label="Account">
    <div class="menu-head"><div class="name">${esc(who())}</div><div class="small muted">Luna Free plan</div></div>
    <div class="menu-label" id="model-label">Model</div>
    <div role="group" aria-labelledby="model-label">
      ${Object.entries(MODELS).map(([k, m]) => `<button type="button" role="menuitemradio" aria-checked="${state.model === k}" data-model="${k}">
        <span class="menu-text"><span>${esc(m.name)}</span><span class="small muted">${esc(m.blurb)}</span></span>
        <span class="menu-check">${ICON.check}</span></button>`).join("")}
    </div>
    <p class="menu-note">Used for reflections, patterns, check-ins and Ask Luna. Safety checks always use the fast model.</p>
    <div class="menu-sep" role="separator"></div>
    <button type="button" role="menuitem" data-upgrade>${ICON.spark}<span class="menu-text">Upgrade plan</span><span class="tag">Free</span></button>
    <a role="menuitem" href="#/settings">${ICON.gear}<span class="menu-text">Settings &amp; privacy</span></a>
    <a role="menuitem" href="#/dashboard?focus=support">${ICON.heart}<span class="menu-text">Get support</span></a>
    <button type="button" role="menuitemcheckbox" aria-checked="${state.demo}" data-demo-item>
      <span class="menu-text">Demo mode<span class="small muted">Sample data only</span></span><span class="switch-track" aria-hidden="true"></span></button>
    ${state.session ? `<div class="menu-sep" role="separator"></div>
      <button type="button" role="menuitem" data-action="signout">${ICON.out}<span class="menu-text">Sign out</span></button>` : ""}
  </div>`);
  $(".rail-foot").append(menu);
  btn.setAttribute("aria-expanded", "true");

  $$("[data-model]", menu).forEach((b) => b.addEventListener("click", () => {
    setModel(b.dataset.model);
    $$("[data-model]", menu).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $(".plan", btn).textContent = planLine();
  }));
  $("[data-upgrade]", menu).addEventListener("click", () => { close(false); showPlan(); });
  $("[data-demo-item]", menu).addEventListener("click", () => {
    const on = !state.demo;
    close(false);
    document.dispatchEvent(new CustomEvent("luna:demo-toggle", { detail: on }));
  });
  $$("a[role=menuitem], [data-action=signout]", menu).forEach((a) => a.addEventListener("click", () => close(false)));
  menu.addEventListener("keydown", onKey);
  (items().find((i) => i.getAttribute("aria-checked") === "true") || items()[0]).focus();
}

function close(refocus = true) {
  if (!menu) return;
  menu.remove();
  menu = null;
  const btn = $("#account-btn");
  btn.setAttribute("aria-expanded", "false");
  if (refocus) btn.focus();
}

function onKey(e) {
  const list = items(), i = list.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); close(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
  else if (e.key === "Home") { e.preventDefault(); list[0].focus(); }
  else if (e.key === "End") { e.preventDefault(); list[list.length - 1].focus(); }
  else if (e.key === "Tab") close(false);
}

function showPlan() {
  const el = html(`<div>
    <h2>Your plan</h2>
    <p class="muted">You're on <strong style="color:var(--text)">Luna Free</strong>. Everything in Luna is free right now: unlimited entries, the dashboard, check-ins, and Luna's AI with either model.</p>
    <p class="muted" style="margin-bottom:0">There's no paid plan yet, so there's nothing to buy.</p>
    <div class="modal-actions"><button type="button" class="btn" data-close>Close</button></div>
  </div>`);
  const closeModal = openModal(el, { label: "Your plan" });
  $("[data-close]", el).addEventListener("click", closeModal);
}

export function initAccount() {
  $("#account-btn").addEventListener("click", () => (menu ? close() : open()));
  document.addEventListener("mousedown", (e) => {
    if (menu && !e.target.closest(".account-menu, #account-btn")) close(false);
  });
  window.addEventListener("hashchange", () => close(false));
}
