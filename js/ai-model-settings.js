// Settings → AI model: use Luna's default AI, or connect your own Groq, Hugging Face, or other
// OpenAI-compatible key. The key is typed here, sent once to the ai-settings Edge Function over
// HTTPS, and stored encrypted on the server. It is never kept in this page's state after sending,
// never put in browser storage, and never sent back: the server only says whether a key is saved
// and its last 4 characters.
import { state, setOwnAI } from "./state.js";
import { callAI } from "./ai.js";
import { esc, $, $$, toast, confirmDialog } from "./util.js";

// Model names checked against each provider's live model list on 2026-10-26.
export const PROVIDERS = {
  default: {
    name: "Luna's default",
    blurb: "Works right away with no setup. Shares Luna's free limit with everyone else.",
  },
  groq: {
    name: "Groq",
    blurb: "Very fast open models. A free Groq key gives you your own limits.",
    models: [
      ["openai/gpt-oss-20b", "GPT-OSS 20B (fast, recommended)"],
      ["openai/gpt-oss-120b", "GPT-OSS 120B (more thoughtful)"],
      ["llama-3.3-70b-versatile", "Llama 3.3 70B"],
      ["llama-3.1-8b-instant", "Llama 3.1 8B (fastest, simplest)"],
    ],
    link: "https://console.groq.com/keys",
    linkText: "Get a Groq key",
    steps: [
      "Open the link and sign in (a Google account works).",
      "Click “Create API Key”, name it “Luna”, and copy the key. It starts with gsk_.",
      "Paste it below and click Save and test.",
    ],
    placeholder: "gsk_…",
  },
  huggingface: {
    name: "Hugging Face",
    blurb: "Hundreds of open models with one token. Uses your Hugging Face inference credits.",
    models: [
      ["openai/gpt-oss-20b", "GPT-OSS 20B (fast, recommended)"],
      ["openai/gpt-oss-120b", "GPT-OSS 120B (more thoughtful)"],
      ["meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"],
      ["Qwen/Qwen2.5-72B-Instruct", "Qwen 2.5 72B Instruct"],
      ["google/gemma-3-27b-it", "Gemma 3 27B"],
    ],
    link: "https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained",
    linkText: "Get a Hugging Face token",
    steps: [
      "Open the link and sign in (or make a free account).",
      "Name the token “Luna”. “Make calls to Inference Providers” is already ticked. Click Create token and copy it. It starts with hf_.",
      "Paste it below and click Save and test.",
    ],
    placeholder: "hf_…",
  },
  custom: {
    name: "Custom",
    blurb: "Any other OpenAI-compatible service. For people who already know its address and model name.",
    models: [],
    steps: [
      "In your provider's docs, find its API address (it usually ends in /v1) and a model name.",
      "Create an API key in your provider's dashboard and copy it.",
      "Fill in all three below and click Save and test.",
    ],
    placeholder: "Your API key",
  },
};
const OTHER = "__other";

// Every chat model live on Hugging Face's router right now. The list is public (no key needed).
let hfModels = null;
export async function liveHFModels() {
  if (hfModels) return hfModels;
  try {
    const res = await fetch("https://router.huggingface.co/v1/models", { signal: AbortSignal.timeout(8000) });
    const { data = [] } = await res.json();
    hfModels = data
      .filter((m) => (m.architecture?.output_modalities || ["text"]).includes("text") && (m.providers || []).some((p) => p.status === "live"))
      .map((m) => m.id).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.warn("Couldn't load Hugging Face's model list", err);
    hfModels = [];
  }
  return hfModels;
}

/** Display name for a model id: the preset's label, else the id without its owner. */
export const modelLabel = (provider, id) => (PROVIDERS[provider]?.models || []).find(([m]) => m === id)?.[1] || id.split("/").pop();
const PRIVACY = "Your key is sent once over HTTPS and stored encrypted on the server. It is never shown again or kept in your browser. Your journal text is sent to the provider you choose.";

const statusText = (s) => s.provider === "default" || !s.has_key
  ? `<strong>Using Luna's default AI.</strong> Everything works as usual.${s.has_key ? ` Your ${esc(PROVIDERS[s.key_provider]?.name || "")} key (ending in <code>${esc(s.key_last4 || "")}</code>) is saved for when you switch back.` : ""}`
  : `<strong>Connected</strong> · ${esc(PROVIDERS[s.provider]?.name || s.provider)} · <code>${esc(s.model)}</code> · key ending in <code>${esc(s.key_last4 || "????")}</code>`;

/** Fills the section's body. Demo mode never shows key entry. */
export async function renderAIModel(root) {
  if (state.demo || !state.session) {
    root.innerHTML = `<p class="m-0 muted">${state.demo ? "Demo mode uses sample replies, so there's no AI model to set up here. Sign in to connect your own key." : "Sign in to choose an AI model."}</p>`;
    return;
  }
  root.innerHTML = `<p class="m-0 muted" role="status">Checking your AI settings…</p>`;
  const r = await callAI("ai-settings", { action: "get" });
  if (!r.ok) { root.innerHTML = `<p class="m-0 muted">${esc(r.message)}</p>`; return; }
  let saved = r.data;
  setOwnAI(saved);
  if (saved.setup_needed) {
    root.innerHTML = `<div class="aim-status">${statusText(saved)}</div>
      <p class="small muted mt-2 mb-0">Connecting your own key isn't switched on for this copy of Luna yet (it needs a one-time database update).</p>`;
    return;
  }

  let choice = saved.has_key && saved.provider !== "default" ? saved.provider : "default";
  root.innerHTML = `<div class="aim">
    <div class="aim-status" data-status role="status">${statusText(saved)}</div>
    <fieldset class="aim-providers">
      <legend class="sr-only">Provider</legend>
      ${Object.entries(PROVIDERS).map(([k, p]) => `<label class="aim-option">
        <input type="radio" name="aim-provider" value="${k}" ${k === choice ? "checked" : ""} />
        <span><strong>${esc(p.name)}</strong><span class="small muted">${esc(p.blurb)}</span></span>
      </label>`).join("")}
    </fieldset>
    <form class="aim-form" data-form novalidate autocomplete="off"></form>
  </div>`;
  const form = $("[data-form]", root), statusEl = $("[data-status]", root);

  function drawForm() {
    if (choice === "default") {
      const usingKey = saved.has_key && saved.provider !== "default";
      form.innerHTML = saved.has_key
        ? `<p class="m-0 small muted">${usingKey ? `Switch back to Luna's default? Your ${esc(PROVIDERS[saved.key_provider]?.name || "")} key stays saved, so you can switch again from the account menu.` : `Your ${esc(PROVIDERS[saved.key_provider]?.name || "")} key is saved but not in use.`}</p>
           <div class="aim-actions">${usingKey ? `<button type="button" class="btn btn-primary btn-sm" data-use-default>Use Luna's default</button>` : ""}
             <button type="button" class="btn btn-ghost btn-sm" data-remove>Remove my key</button></div>`
        : `<p class="m-0 small muted">Nothing to set up. Luna's AI works as it always has.</p>`;
      $("[data-use-default]", form)?.addEventListener("click", async () => {
        busy(true);
        const r = await callAI("ai-settings", { action: "save", provider: "default" });
        busy(false);
        if (!r.ok) { toast(r.message); return; }
        update(r.data); drawForm(); toast("Using Luna's default AI");
      });
      wireRemove();
      return;
    }
    const p = PROVIDERS[choice];
    const same = saved.has_key && saved.key_provider === choice;
    const savedModel = same && saved.provider === choice ? saved.model : "";
    const preset = p.models.find(([id]) => id === savedModel);
    const firstModel = p.models[0] ? p.models[0][0] : "";
    form.innerHTML = `
      ${p.link ? `<p class="m-0"><a href="${p.link}" target="_blank" rel="noopener noreferrer">${esc(p.linkText)} ↗</a></p>` : ""}
      <ol class="aim-steps small">${p.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${choice === "custom" ? `<label class="field">API address
        <input class="input" name="base_url" type="url" inputmode="url" placeholder="https://api.example.com/v1" value="${esc(same ? saved.base_url : "")}" spellcheck="false" />
      </label>` : ""}
      ${p.models.length ? `<label class="field">Model
        <select class="input" name="model_pick">
          ${p.models.map(([id, name]) => `<option value="${esc(id)}" ${(preset ? preset[0] : savedModel ? "" : firstModel) === id ? "selected" : ""}>${esc(name)}</option>`).join("")}
          <option value="${OTHER}" ${savedModel && !preset ? "selected" : ""}>Other (type a model name)</option>
        </select>
      </label>` : ""}
      <label class="field" data-model-other ${p.models.length && (preset || !savedModel) ? "hidden" : ""}>Model name
        <input class="input" name="model_other" ${choice === "huggingface" ? `list="hf-models"` : ""} placeholder="${choice === "custom" ? "e.g. gpt-4o-mini" : choice === "huggingface" ? "Type to search Hugging Face models" : "e.g. openai/gpt-oss-20b"}" value="${esc(savedModel && !preset ? savedModel : "")}" spellcheck="false" />
        ${choice === "huggingface" ? `<span class="small muted" data-hf-count>Loading the models live on Hugging Face…</span><datalist id="hf-models"></datalist>` : ""}
      </label>
      <label class="field">${same ? "Key (leave empty to keep the saved one)" : "Your key"}
        <input class="input" name="api_key" type="password" autocomplete="off" spellcheck="false" data-1p-ignore data-lpignore="true" placeholder="${same ? `Saved key ends in ${esc(saved.key_last4 || "")}` : esc(p.placeholder)}" />
      </label>
      <p class="m-0 small muted aim-privacy">${PRIVACY}</p>
      <div data-msg role="alert" class="small"></div>
      <div class="aim-actions">
        <button type="submit" class="btn btn-primary btn-sm">Save and test</button>
        ${same ? `<button type="button" class="btn btn-sm" data-test>Test again</button>` : ""}
        ${saved.has_key ? `<button type="button" class="btn btn-ghost btn-sm" data-remove>Remove my key</button>` : ""}
      </div>`;
    const pick = form.model_pick, other = $("[data-model-other]", form);
    pick && pick.addEventListener("change", () => { other.hidden = pick.value !== OTHER; if (!other.hidden) form.model_other.focus(); });
    if (choice === "huggingface") liveHFModels().then((ids) => {
      const list = $("#hf-models", form), count = $("[data-hf-count]", form);
      if (!list) return;
      list.innerHTML = ids.map((id) => `<option value="${esc(id)}"></option>`).join("");
      count.textContent = ids.length ? `Any of the ${ids.length} chat models live on Hugging Face right now. Start typing a name, like Llama or Qwen.` : "Type the model's full name from its Hugging Face page, like meta-llama/Llama-3.3-70B-Instruct.";
    });
    $("[data-test]", form)?.addEventListener("click", test);
    wireRemove();
  }

  const msg = (text, ok = false) => { const m = $("[data-msg]", form); if (m) { m.style.color = ok ? "var(--sage)" : "var(--rose)"; m.textContent = text; } };
  const busy = (on) => $$("button", form).forEach((b) => (b.disabled = on));
  const update = (s) => { saved = s; setOwnAI(s); statusEl.innerHTML = statusText(s); };

  function wireRemove() {
    $("[data-remove]", form)?.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Remove your key?", body: "Your key will be deleted from Luna's server, and Luna will use its default AI again.", confirmLabel: "Remove key" });
      if (!ok) return;
      busy(true);
      const r = await callAI("ai-settings", { action: "delete" });
      busy(false);
      if (!r.ok) { msg(r.message); return; }
      update(r.data);
      choice = "default";
      $$("[name=aim-provider]", root).forEach((x) => (x.checked = x.value === "default"));
      drawForm();
      toast("Key removed. Using Luna's default AI.");
    });
  }

  async function test() {
    busy(true); msg("Testing…", true);
    const r = await callAI("ai-settings", { action: "test" });
    busy(false);
    if (!r.ok) { msg(r.message); return; }
    msg(`Connected. ${PROVIDERS[saved.provider].name} answered with ${saved.model}.`, true);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const model = form.model_pick && form.model_pick.value !== OTHER ? form.model_pick.value : (form.model_other.value || "").trim();
    if (!model) { msg("Pick a model, or type a model name."); form.model_other.focus(); return; }
    const body = { action: "save", provider: choice, model };
    if (choice === "custom") body.base_url = form.base_url.value.trim();
    const typed = form.api_key.value.trim();
    if (typed) body.api_key = typed;
    busy(true); msg("Checking your key with a tiny test request…", true);
    const r = await callAI("ai-settings", body);
    busy(false);
    if (!r.ok) { msg(r.message); return; } // the key stays in the box so it can be fixed; nothing was saved
    update(r.data);
    drawForm();
    msg(`Connected. Key ending in ${r.data.key_last4}. Luna will use ${r.data.model} for you from now on.`, true);
  });

  $$("[name=aim-provider]", root).forEach((x) => x.addEventListener("change", () => { choice = x.value; drawForm(); }));
  drawForm();
}
