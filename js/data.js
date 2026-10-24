// Data layer. Demo mode and real mode use completely separate stores, so sample
// data can never be mixed into a real journal (or vice versa).
import { state } from "./state.js";
import { makeDemoData } from "./demo.js";
import { uid } from "./util.js";

// ───────────── Demo store (in memory only) ─────────────
let demo = null;
export function resetDemoStore() { demo = makeDemoData(); }
const D = () => (demo || resetDemoStore(), demo);
const clone = (x) => JSON.parse(JSON.stringify(x));
const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

// ───────────── Real store (Supabase, protected by RLS) ─────────────
const sb = () => {
  if (!state.sb || !state.session) throw new Error("Not signed in");
  return state.sb;
};
const must = ({ data, error }) => { if (error) throw error; return data; };

// ───────────── Entries ─────────────
export async function listEntries() {
  if (state.demo) return clone(D().entries).sort(byNewest);
  return must(await sb().from("entries").select("*").order("created_at", { ascending: false }));
}

export async function getEntry(id) {
  if (state.demo) return clone(D().entries.find((e) => e.id === id) || null);
  return must(await sb().from("entries").select("*").eq("id", id).maybeSingle());
}

export async function createEntry(fields = {}) {
  const base = { title: "", content: "", mood: null, tags: [], ...fields };
  if (state.demo) {
    const now = new Date().toISOString();
    const row = { id: uid(), user_id: "demo", created_at: now, updated_at: now, ...base };
    D().entries.unshift(row);
    return clone(row);
  }
  return must(await sb().from("entries").insert(base).select().single());
}

/** Imports many entries at once. Real journals only: sample data and imports never mix. */
export async function importEntries(rows, onProgress = () => {}) {
  if (state.demo) throw new Error("Turn off demo mode to import into your journal.");
  let done = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map(({ title, content, tags, created_at }) => ({ title, content, tags, mood: null, created_at, updated_at: created_at }));
    must(await sb().from("entries").insert(chunk));
    done += chunk.length;
    onProgress(done);
  }
  return done;
}

export async function updateEntry(id, patch) {
  if (state.demo) {
    const row = D().entries.find((e) => e.id === id);
    if (row) Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return clone(row);
  }
  return must(await sb().from("entries").update(patch).eq("id", id).select().single());
}

export async function deleteEntry(id) {
  if (state.demo) { D().entries = D().entries.filter((e) => e.id !== id); return; }
  must(await sb().from("entries").delete().eq("id", id));
}

// ───────────── Insights ─────────────
export async function listInsights() {
  if (state.demo) return clone(D().insights).sort(byNewest);
  return must(await sb().from("insights").select("*").order("created_at", { ascending: false }));
}

/** Demo-only: hold AI insights generated from sample entries in memory. */
export function addDemoInsights(rows) {
  D().insights = [...rows.map((r) => ({ id: uid(), user_id: "demo", created_at: new Date().toISOString(), ...r })), ...D().insights];
}

export async function deleteAllInsights() {
  if (state.demo) { D().insights = []; return; }
  must(await sb().from("insights").delete().eq("user_id", state.session.user.id));
}

// ───────────── Luna's memory ─────────────
export async function listMemory() {
  if (state.demo) return clone(D().memory).sort(byNewest);
  return must(await sb().from("luna_memory").select("*").order("created_at", { ascending: false }));
}

export async function deleteMemory(id) {
  if (state.demo) { D().memory = D().memory.filter((m) => m.id !== id); return; }
  must(await sb().from("luna_memory").delete().eq("id", id));
}

// ───────────── Account ─────────────
export async function deleteAccount() {
  if (state.demo) throw new Error("Not available in demo mode");
  must(await sb().rpc("delete_my_account"));
  await state.sb.auth.signOut();
}

/** Sample entries to send along with AI calls in demo mode (never real data). */
export function demoEntriesForAI() {
  return D().entries.map(({ id, title, content, mood, tags, created_at }) => ({ id, title, content, mood, tags, created_at }));
}
