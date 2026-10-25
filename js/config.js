// Supabase project values. The anon key is safe to ship in a browser: Row-Level Security protects the data.
// Never put an AI key here. AI keys live only in Supabase Edge Function secrets.
//
// LOCAL is used when the app runs on localhost (Supabase running on your computer: `supabase start`,
// then copy "API URL" and "anon key" from `supabase status`). HOSTED is used everywhere else
// (Supabase Dashboard → Project Settings → API).
//
// `ai` names the provider the Edge Functions use (LUNA_PROVIDER), so the app can say honestly
// where your writing goes: "anthropic", "ollama", "huggingface", or "groq".

const LOCAL = { url: "", anonKey: "", ai: "ollama" };
const HOSTED = {
  url: "https://mhygsrifrklsrfxbcmvq.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oeWdzcmlmcmtsc3JmeGJjbXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzU4OTgsImV4cCI6MjEwODUxMTg5OH0.dr69n5cPFiLTxCeL0RqlL54RS5YymKPvnmTRQ-h-k1g",
  ai: "groq",
};

const onLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
const use = onLocalhost && LOCAL.url ? LOCAL : HOSTED;

export const SUPABASE_URL = use.url;           // e.g. "https://abcd1234.supabase.co"
export const SUPABASE_ANON_KEY = use.anonKey;  // the long "anon public" key
export const AI_PROVIDER = use.ai;
