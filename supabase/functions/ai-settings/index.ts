// Settings → AI model. One endpoint, four actions, all for the signed-in user only:
//   get     { provider, model, base_url, has_key, key_last4 }  (never the key itself)
//   save    tests the provider with one tiny request, then stores the settings and the key
//           (encrypted in Supabase Vault). A key that fails the test is not saved.
//   test    one tiny request with the saved settings
//   delete  removes the key and settings; Luna's default AI is used again
// Writes go through the service role after the user's JWT is verified by serve(), and only ever
// touch that user's own row.
import { serve, json } from "../_shared/luna.ts";
import { PRESETS, ProviderError, Provider, compat, checkBaseUrl, admin, missingTable, loadUserAI } from "../_shared/providers.ts";

const SETUP = { error: "setup_needed", message: "Bring-your-own-key needs a one-time database update before it can be used. Luna's default AI still works." };
const MODEL_RE = /^[\w.\-/:+@]{1,200}$/;

async function current(userId: string) {
  const { data, error } = await admin().from("ai_settings").select("provider, model, base_url, key_last4, key_secret_id").eq("user_id", userId).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw error;
  return {
    provider: data?.provider ?? "default",
    model: data?.model ?? "",
    base_url: data?.base_url ?? "",
    has_key: Boolean(data?.key_secret_id),
    key_last4: data?.key_secret_id ? data.key_last4 : null,
  };
}

/** One tiny completion, to check the key, address, and model actually work together. */
async function tryIt(ai: { provider: Provider; baseUrl: string; model: string; key: string }) {
  await compat(ai, "You are a connection test. Reply with the single word OK.", "Say OK.", 16);
}

serve(async ({ body, userId }) => {
  const action = String(body.action ?? "get");
  if (action === "save") return save(body, userId);
  const now = await current(userId);
  if (!now) return action === "get" ? json({ provider: "default", has_key: false, setup_needed: true }) : json(SETUP, 409);

  if (action === "get") return json(now);

  if (action === "delete") {
    const db = admin();
    const { error } = await db.rpc("luna_delete_ai_key", { p_user: userId });
    if (error) throw error;
    const del = await db.from("ai_settings").delete().eq("user_id", userId);
    if (del.error) throw del.error;
    return json({ provider: "default", model: "", base_url: "", has_key: false, key_last4: null });
  }

  if (action === "test") {
    const ai = await loadUserAI(userId);
    if (!ai) return json({ error: "no_key", message: "You haven't added your own key, so Luna is using its default AI." }, 400);
    try { await tryIt(ai); } catch (err) {
      if (err instanceof ProviderError) return json({ error: "test_failed", code: err.code, message: err.message }, 400);
      throw err;
    }
    return json({ ...now, tested: true });
  }

  return json({ error: "bad_action", message: "Unknown action." }, 400);
}, { ownKey: false });

/** Checks the settings, tests them with one tiny request, and only then stores them. The checks
 *  and the test run even before the database update, so a bad key gets a clear answer either way. */
async function save(body: any, userId: string) {
  const provider = String(body.provider ?? "") as Provider | "default";
  const now = await current(userId);
  if (provider === "default") {
    if (!now) return json(SETUP, 409);
    const db = admin();
    const { error } = await db.rpc("luna_delete_ai_key", { p_user: userId });
    if (error) throw error;
    await db.from("ai_settings").delete().eq("user_id", userId);
    return json({ provider: "default", model: "", base_url: "", has_key: false, key_last4: null });
  }
  if (!["groq", "huggingface", "custom"].includes(provider)) return json({ error: "bad_provider", message: "Pick a provider from the list." }, 400);

  const model = String(body.model ?? "").trim();
  if (!MODEL_RE.test(model)) return json({ error: "bad_model", message: "Enter a model name, like openai/gpt-oss-20b (no spaces)." }, 400);

  let baseUrl = "";
  if (provider === "custom") {
    try { baseUrl = await checkBaseUrl(String(body.base_url ?? "")); }
    catch (err) { if (err instanceof ProviderError) return json({ error: "bad_url", message: err.message }, 400); throw err; }
  }

  // A new key, or the saved one when only the model changed (same provider and address).
  let key = typeof body.api_key === "string" ? body.api_key.trim() : "";
  let newKey = true;
  if (!key) {
    if (!now || !now.has_key || now.provider !== provider || (provider === "custom" && now.base_url !== baseUrl)) {
      return json({ error: "no_key", message: "Paste your key first." }, 400);
    }
    const saved = await loadUserAI(userId);
    key = saved?.key ?? "";
    newKey = false;
  }
  if (newKey) {
    if (/\s/.test(key) || key.length < 8 || key.length > 500) return json({ error: "bad_key", message: "That doesn't look like a complete key. Copy it again (no spaces) and paste it here." }, 400);
    if (provider !== "custom" && !key.startsWith(PRESETS[provider].keyPrefix)) {
      return json({ error: "bad_key", message: `That doesn't look like a ${PRESETS[provider].label} key. ${PRESETS[provider].label} keys start with "${PRESETS[provider].keyPrefix}".` }, 400);
    }
  }

  try { await tryIt({ provider, baseUrl, model, key }); } catch (err) {
    if (err instanceof ProviderError) return json({ error: "test_failed", code: err.code, message: `${err.message} Nothing was saved.` }, 400);
    throw err;
  }

  if (!now) return json({ ...SETUP, message: "Your key works, but saving it needs a one-time database update first. Nothing was saved." }, 409);
  const db = admin();
  const up = await db.from("ai_settings").upsert({ user_id: userId, provider, model, base_url: baseUrl }, { onConflict: "user_id" });
  if (up.error) throw up.error;
  if (newKey) {
    const { error } = await db.rpc("luna_set_ai_key", { p_user: userId, p_key: key });
    if (error) { console.error("Couldn't store the key in Vault", error.code); throw new Error("vault"); }
  }
  return json({ ...(await current(userId)), tested: true });
}
