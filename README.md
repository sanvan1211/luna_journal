# Luna

A private journal with AI reflection. Luna helps people understand what they've written. It is not a therapist and never diagnoses.

Plain HTML, CSS, and JavaScript (no build step) + Supabase for auth, database, and AI Edge Functions.

## What's inside

- **Home:** a chat-style start page. Ask Luna a question, or start a new journal entry.
- **Journal:** a block editor with autosave, an optional self-reported mood, and tags. Entries can be grouped by month, week, or day.
- **Dashboard:** writing stats, an interactive calendar, journal language trends, and "Luna noticed" insights that always link to their entries.
- **Check-in:** four gentle questions, which can be saved as an entry.
- **Ask Luna:** answers from your own entries, with a link to every entry used.
- **Account menu** (bottom left): choose the AI model, see your plan, open settings, and turn demo mode on or off.
- **Settings & privacy:** delete Luna's memory, insights, or your whole account, and see exactly what gets sent to the AI.

```
luna_journal/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js          ← paste your Supabase URL + anon key here
│   ├── app.js             router, sign-in, demo mode
│   ├── account.js         account menu and model picker
│   ├── state.js data.js ai.js editor.js markdown.js util.js bunny.js support.js demo.js
│   └── pages/             home, journal, dashboard, checkin, ask, settings
├── supabase/
│   ├── schema.sql         tables + Row-Level Security
│   └── functions/         reflect-entry, generate-insights, ask-luna, check-in, safety-check
└── legacy/                the earlier Node + Notion version (not deployed)
```

## Run it locally (Mac)

```bash
cd luna_journal              # the repo root
python3 -m http.server 5173
```
Open http://localhost:5173. Without Supabase set up, you can still use **demo mode** with sample data.

## Set up Supabase (about 15 minutes)

1. Create a project at supabase.com.
2. **SQL Editor → New query →** paste `supabase/schema.sql` → **Run**.
3. **Project Settings → API:** copy the Project URL and the `anon` public key into `js/config.js`.
4. Optional for demos: **Authentication → Providers → Email**, turn off "Confirm email" so sign-up is instant.
5. Deploy the AI functions with the Supabase CLI:

```bash
brew install supabase/tap/supabase
cd luna_journal              # the repo root
supabase login
supabase init                 # say no to the VS Code prompts; it keeps the functions folder
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check
```

Until the functions and key are set up, the app shows an honest "AI not configured" state. It never shows fake AI output.

## Deploy to Cloudflare Pages

Upload only the frontend files. `wrangler pages deploy .` would also publish `legacy/`, `supabase/`, and any local `.env` or journal data, because direct uploads ignore `.gitignore`.

```bash
rm -rf /tmp/luna-site && mkdir /tmp/luna-site
cp -R index.html css js /tmp/luna-site/
npx wrangler pages deploy /tmp/luna-site --project-name luna
```
Then add your Pages URL under Supabase **Authentication → URL Configuration → Site URL**.

## Legacy app

`legacy/` holds the earlier Node + Notion version of Luna, kept for reference. It is not part of the deployed site.

## Privacy design

- Row-Level Security: every row is readable only by its owner.
- The AI key lives only in Supabase secrets; the browser never calls an AI API.
- AI runs only when the user presses a button. Moods are self-reported only.
- Demo mode uses a separate in-memory store and is never written to the database.
