// Data layer. Demo mode and real mode use completely separate stores, so sample
// data can never be mixed into a real journal (or vice versa).
import { state } from "./state.js";
import { makeDemoData } from "./demo.js";
import { uid } from "./util.js";

// ───────────── Demo store (in memory only) ─────────────
let demo = null;
export function resetDemoStore() { demo = makeDemoData(); demoEntryChats.clear(); }
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

// ───────────── Ask Luna chats ─────────────
// Real chats live in ask_threads / ask_messages (RLS: own rows only). Demo chats live only in memory.
const demoChats = () => { const d = D(); d.threads ||= []; d.messages ||= []; return d; };
const byUpdated = (a, b) => new Date(b.updated_at) - new Date(a.updated_at);

export async function listThreads() {
  if (state.demo) return clone(demoChats().threads).sort(byUpdated);
  return must(await sb().from("ask_threads").select("*").order("updated_at", { ascending: false }));
}

export async function listMessages(threadId) {
  if (state.demo) return clone(demoChats().messages.filter((m) => m.thread_id === threadId));
  return must(await sb().from("ask_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true }));
}

export async function createThread(title) {
  if (state.demo) {
    const now = new Date().toISOString();
    const row = { id: uid(), user_id: "demo", title, created_at: now, updated_at: now };
    demoChats().threads.push(row);
    return clone(row);
  }
  return must(await sb().from("ask_threads").insert({ title }).select().single());
}

/** Saves one message and moves its thread to the top of the list. */
export async function addMessage(threadId, { role, content, citations = [] }) {
  const now = new Date().toISOString();
  if (state.demo) {
    const row = { id: uid(), thread_id: threadId, user_id: "demo", role, content, citations, created_at: now };
    demoChats().messages.push(row);
    const t = demoChats().threads.find((x) => x.id === threadId);
    if (t) t.updated_at = now;
    return clone(row);
  }
  const row = must(await sb().from("ask_messages").insert({ thread_id: threadId, role, content, citations }).select().single());
  must(await sb().from("ask_threads").update({ updated_at: now }).eq("id", threadId));
  return row;
}

export async function renameThread(id, title) {
  const now = new Date().toISOString();
  if (state.demo) {
    const t = demoChats().threads.find((x) => x.id === id);
    if (t) Object.assign(t, { title, updated_at: now });
    return clone(t);
  }
  return must(await sb().from("ask_threads").update({ title, updated_at: now }).eq("id", id).select().single());
}

/** Deletes a chat and its messages (messages first, so nothing is left behind). */
export async function deleteThread(id) {
  if (state.demo) {
    const d = demoChats();
    d.messages = d.messages.filter((m) => m.thread_id !== id);
    d.threads = d.threads.filter((t) => t.id !== id);
    return;
  }
  must(await sb().from("ask_messages").delete().eq("thread_id", id));
  must(await sb().from("ask_threads").delete().eq("id", id));
}

export async function deleteAllChats() {
  if (state.demo) { Object.assign(demoChats(), { threads: [], messages: [] }); return; }
  const me = state.session.user.id;
  must(await sb().from("ask_messages").delete().eq("user_id", me));
  must(await sb().from("ask_threads").delete().eq("user_id", me));
}

// ───────────── Reflection conversations (one per entry) ─────────────
// Saved in entry_chats once supabase/schema-chats-and-keys.sql has been run. Before that, getEntryChat reports
// saved: false and the conversation lives only in the open page.
const demoEntryChats = new Map();
let entryChatsMissing = false;
const missingTable = (error) => error && (error.code === "42P01" || error.code === "PGRST205" || /entry_chats/.test(error.message || ""));

/** { messages, offer, saved } for an entry. */
export async function getEntryChat(entryId) {
  if (state.demo) return { ...clone(demoEntryChats.get(entryId) || { messages: [], offer: null }), saved: false };
  if (entryChatsMissing) return { messages: [], offer: null, saved: false };
  const { data, error } = await sb().from("entry_chats").select("messages, offer").eq("entry_id", entryId).maybeSingle();
  if (missingTable(error)) { entryChatsMissing = true; console.warn("entry_chats table not found; run supabase/schema-chats-and-keys.sql to save reflection chats"); return { messages: [], offer: null, saved: false }; }
  if (error) throw error;
  return { messages: data ? data.messages : [], offer: data ? data.offer : null, saved: true };
}

/** Saves an entry's conversation. Returns false when it can't be saved (table missing). */
export async function saveEntryChat(entryId, { messages, offer = null }) {
  if (state.demo) { demoEntryChats.set(entryId, clone({ messages, offer })); return false; }
  if (entryChatsMissing) return false;
  const { error } = await sb().from("entry_chats").upsert({ entry_id: entryId, messages, offer }, { onConflict: "entry_id" });
  if (missingTable(error)) { entryChatsMissing = true; return false; }
  if (error) throw error;
  return true;
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
