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
npm run dev
```
Open http://localhost:5173. Without Supabase set up, you can still use **demo mode** with sample data.

`npm run dev` needs Node.js but no `npm install`. It serves the app with caching turned off, so a normal reload always picks up changes to `js/config.js`. Don't use `python3 -m http.server`: browsers can cache its files, and a stale `config.js` makes Luna say Supabase isn't connected. If that happens anyway, hard refresh with Cmd/Ctrl+Shift+R.

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

### Choosing the AI model

Each person picks a model in the account menu: **Claude Haiku 5.5** (fast, the default) or **Claude Sonnet 5.5** (slower, more thoughtful). The functions accept only those two. Safety checks always use the default model. To change the default for everyone, set a secret:

```bash
supabase secrets set LUNA_MODEL=claude-sonnet-5-5
```

After changing anything in `supabase/functions/`, deploy again with the same `supabase functions deploy …` command.

## Deep analysis

`supabase/functions/analyze-journal` reads a range of days (oldest first, inline-dated entries split into days) and writes a longitudinal reflection in three passes: verified notes per day, the analysis, and a review. **Luna's master prompt for it lives in `supabase/functions/_shared/deep-analysis-prompt.ts`**; change the analysis there, not in the function. The parts that matter most for safety are also enforced in code (`_shared/quotes.js`, `_shared/deep-checks.js`): quotes must be the writer's exact words, clinical words are removed, recurring sadness always gets a gentle note about talking to someone, and urgent writing stops the analysis so the app can show support instead.

`npm test` covers those checks. `tests/eval/deep-analysis.eval.mjs` runs fictional scenarios (`tests/fixtures/deep/scenarios.json`) against the deployed function and scores them; it uses real AI calls, so it isn't part of `npm test` (see the comment at the top of the file).

## Sign in with Google

Email and password always work. "Continue with Google" works once you do these steps. Until then, the button says Google sign-in isn't turned on. The Client Secret goes only into the Supabase dashboard, never into this repo.

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
2. Under **Authorized redirect URIs**, add `https://mhygsrifrklsrfxbcmvq.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Sign In / Providers → Google:** turn it on, paste the Client ID and Client Secret, and **Save**.
4. **Supabase → Authentication → URL Configuration:** set **Site URL** to your Vercel URL, and add `http://localhost:5173` and your Vercel URL to **Redirect URLs**.
5. **Google Cloud Console → OAuth consent screen:** add yourself (and anyone testing) as a **test user**, or publish the app so judges don't see an "unverified app" warning.

Google sign-in returns to Luna as `?code=…` (Supabase's PKCE flow), so it doesn't clash with Luna's `#/` page links. Luna removes the code from the address bar and opens your journal.

## Deploy to Cloudflare Pages

Upload only the frontend files. `wrangler pages deploy .` would also publish `legacy/`, `supabase/`, and any local `.env` or journal data, because direct uploads ignore `.gitignore`.

```bash
rm -rf /tmp/luna-site && mkdir /tmp/luna-site
cp -R index.html css js /tmp/luna-site/
npx wrangler pages deploy /tmp/luna-site --project-name luna
```
Then add your Pages URL under Supabase **Authentication → URL Configuration → Site URL**.

## Deploy to Vercel

Import the repo in Vercel with no build command and the repo root as the output. `vercel.json` sends `Cache-Control: no-cache` for `index.html`, `js/`, and `css/`, so config and code changes show up right away. `.vercelignore` keeps `legacy/`, `supabase/`, and any secrets out of the upload. Add the Vercel URL to Supabase's Site URL as above.

## Legacy app

`legacy/` holds the earlier Node + Notion version of Luna, kept for reference. It is not part of the deployed site.

## Privacy design

- Row-Level Security: every row is readable only by its owner.
- The AI key lives only in Supabase secrets; the browser never calls an AI API.
- AI runs only when the user presses a button. Moods are self-reported only.
- Demo mode uses a separate in-memory store and is never written to the database.
