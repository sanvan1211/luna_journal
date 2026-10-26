# Luna

A private journal with AI reflection. Luna helps people understand what they've written. It is not a therapist and never diagnoses.

Plain HTML, CSS, and JavaScript (no build step) + Supabase for auth, database, and AI Edge Functions.

## What's inside

- **Home:** a chat-style start page. Ask Luna a question, or start a new journal entry.
- **Journal:** a block editor with autosave, an optional self-reported mood, and tags. Entries can be grouped by month, week, or day.
- **Reflect with Luna:** a short reflection on one entry that you can reply to like a chat. After a reply, Luna offers to add a first-person summary to the entry; you edit it and click Insert, and nothing is added without that.
- **Dashboard:** writing stats, an interactive calendar, journal language trends, and "Luna noticed" insights that always link to their entries.
- **Check-in:** four gentle questions, which can be saved as an entry.
- **Ask Luna:** answers from your own entries, with a link to every entry used.
- **Account menu** (bottom left): choose the AI model (Luna's default on Groq, or models on your own Hugging Face / Groq key), see your plan, open settings, and turn demo mode on or off.
- **Settings & privacy:** connect your own AI key, delete Luna's memory, insights, or your whole account, and see exactly what gets sent to the AI. Crisis resources (988, Crisis Text Line) are on every page that shows AI output.
- **Demo mode** ("Try it with sample data"): a sample journal kept only in the browser. Luna's AI needs an account, so the reflection chat uses pre-written replies written for each sample entry, each labelled "Sample reply (demo mode)". Nothing in demo mode is saved or sent to an AI.

```
luna_journal/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js          ← paste your Supabase URL + anon key here
│   ├── app.js             router, sign-in, demo mode
│   ├── account.js         account menu and model picker
│   ├── reflection-chat.js the reflection conversation and add-to-journal flow
│   ├── demo-replies.js    labelled sample replies for demo mode
│   ├── ai-model-settings.js  Settings → AI model (bring your own key)
│   ├── rail.js            collapsible sidebar
│   ├── state.js data.js ai.js editor.js markdown.js util.js bunny.js support.js demo.js
│   └── pages/             home, journal, dashboard, checkin, ask, settings
└── supabase/
    ├── schema.sql         tables + Row-Level Security
    ├── schema-chats-and-keys.sql  saved reflection chats + bring-your-own-key (run after schema.sql)
    └── functions/         reflect-entry, generate-insights, ask-luna, check-in, safety-check,
                           analyze-journal, ai-settings
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
2. **SQL Editor → New query →** paste `supabase/schema.sql` → **Run**. Then do the same with `supabase/schema-chats-and-keys.sql`.
3. **Project Settings → API:** copy the Project URL and the `anon` public key into `js/config.js`.
4. **Authentication → URL Configuration:** set **Site URL** to where the app lives (e.g. `https://your-app.vercel.app`) and add it plus `http://localhost:5173` under **Redirect URLs** (as `https://your-app.vercel.app/**`). Password-reset and confirmation links only return to addresses on this list; anything else falls back to the Site URL.
5. Optional for demos: **Authentication → Providers → Email**, turn off "Confirm email" so sign-up is instant.
6. Deploy the AI functions with the Supabase CLI:

```bash
brew install supabase/tap/supabase
cd luna_journal              # the repo root
supabase login
supabase init                 # say no to the VS Code prompts; it keeps the functions folder
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set LUNA_PROVIDER=groq GROQ_API_KEY=gsk_...     # see "Choosing the AI model" below
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check analyze-journal ai-settings
```

Until the functions and key are set up, the app shows an honest "AI not configured" state. It never shows fake AI output.

## Choosing the AI model

Luna's AI runs only in the Supabase Edge Functions. API keys go in **Supabase secrets**, never in this repo or in `js/config.js`. Pick a provider with the `LUNA_PROVIDER` secret, then set `ai` in `js/config.js` to the same name so the Privacy page says honestly where writing goes.

### Default: GPT-OSS on Groq

1. Create a free account at [console.groq.com](https://console.groq.com) → **API Keys** → **Create API Key**.
2. Set it as a secret (type it in your own terminal so the key never lands in a file or a chat):
   ```bash
   supabase secrets set LUNA_PROVIDER=groq GROQ_API_KEY=gsk_...
   ```
3. In `js/config.js`, keep `ai: "groq"`.

Each person picks a model in the account menu: **Fast** (`openai/gpt-oss-20b`) or **Thoughtful** (`openai/gpt-oss-120b`). Thoughtful is for in-depth answers: for Ask Luna and Look for patterns it gets about twice the room and more reasoning time, so it connects details across entries and dates. Reflections stay short with either model. Safety checks always use Fast. Deep analysis uses Fast for notes and Thoughtful for the analysis. To use other Groq models, set `GROQ_FAST_MODEL` and `GROQ_THOUGHTFUL_MODEL`.

Groq's free tier has limits on tokens per minute and per day. When one is reached, Luna says so and tells people when it should work again. Deep analysis uses the most (about 15,000 tokens a run).

### Other providers

| Provider | `LUNA_PROVIDER` | Secrets to set | Models |
|---|---|---|---|
| [OpenAI Platform](https://platform.openai.com/api-keys) | `openai` | `OPENAI_API_KEY`, `OPENAI_FAST_MODEL`, `OPENAI_THOUGHTFUL_MODEL` | You choose both from OpenAI's model list (names change often, so there's no default) |
| [Hugging Face](https://huggingface.co/settings/tokens) | `huggingface` | `HF_TOKEN` (fine-grained, "Make calls to Inference Providers") | `openai/gpt-oss-20b` / `openai/gpt-oss-120b` by default; override with `HF_FAST_MODEL`, `HF_THOUGHTFUL_MODEL` |
| [Anthropic](https://console.anthropic.com/settings/keys) | `anthropic` | `ANTHROPIC_API_KEY` | Claude Haiku 5.5 (Fast) / Claude Sonnet 5.5 (Thoughtful) |
| [Ollama](https://ollama.com) (on your own computer, local Supabase only) | `ollama` | `OLLAMA_URL` (e.g. `http://host.docker.internal:11434`) | `llama3.2` / `qwen2.5:7b` by default; override with `OLLAMA_FAST_MODEL`, `OLLAMA_THOUGHTFUL_MODEL` |

For example, to switch to OpenAI:

```bash
supabase secrets set LUNA_PROVIDER=openai OPENAI_API_KEY=sk-... OPENAI_FAST_MODEL=<model> OPENAI_THOUGHTFUL_MODEL=<model>
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check analyze-journal ai-settings
```

Then set `ai: "openai"` in `js/config.js`. To change which model everyone gets by default (instead of Fast), set `LUNA_MODEL` to a model name. If a provider's key or models are missing, the app shows an honest "AI not configured" message; it never shows made-up answers.

After changing anything in `supabase/functions/`, deploy again with the same `supabase functions deploy …` command.

### Use a model from Hugging Face

Luna can run on almost any chat model hosted on [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers), which exposes them through one OpenAI-compatible API (`https://router.huggingface.co/v1`). There are two ways to use one.

**As a user, from the app (no code, no secrets):**
1. Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained). Choose a fine-grained token with **Make calls to Inference Providers** ticked (the link pre-selects it). It starts with `hf_`.
2. In Luna, open **Settings → AI model → Hugging Face**.
3. Pick a preset or choose **Other (type a model name)**. The box searches every chat model that is live on Hugging Face right now (the router's public model list), so you can type `Llama`, `Qwen`, `gemma`, `DeepSeek` and pick one. Any full model id works, e.g. `meta-llama/Llama-3.3-70B-Instruct`. You can also pin a provider with a suffix, like `openai/gpt-oss-120b:groq`, or add `:cheapest`/`:fastest`.
4. Paste the token and click **Save and test**. Luna sends one tiny request to check the token and model together, and only saves them if it works.
5. Switch between your Hugging Face models (or back to Luna's default) any time from the **account menu → Model**. Your token stays saved until you click **Remove my key**.

Presets (checked against the live list): GPT-OSS 20B and 120B, Llama 3.3 70B Instruct, Qwen 2.5 72B Instruct, Gemma 3 27B.

**As the person running Luna, for everyone:** make Hugging Face the server default instead of Groq.

```bash
supabase secrets set LUNA_PROVIDER=huggingface HF_TOKEN=hf_... \
  HF_FAST_MODEL=openai/gpt-oss-20b HF_THOUGHTFUL_MODEL=meta-llama/Llama-3.3-70B-Instruct
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check analyze-journal ai-settings
```

Then set `ai: "huggingface"` in `js/config.js` so the Privacy page names the right provider. Whichever model you pick, Luna's rules (no diagnosing, no mood labels, support resources) are sent with every request. Smaller models follow them less reliably, so test a model with a few entries before relying on it.

### Generic secrets (any provider)

`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, and `AI_BASE_URL` work with every provider and take priority when set. `AI_PROVIDER=custom` with `AI_BASE_URL` (https) points Luna at any OpenAI-compatible API. With none of them set, Luna behaves exactly as above.

### People can bring their own key

Under **Settings → AI model**, a signed-in person can connect their own Groq or Hugging Face key, or any OpenAI-compatible service. They get their own limits instead of sharing Luna's. It needs `supabase/schema-chats-and-keys.sql` (Supabase Vault plus the `ai_settings` table) and the `ai-settings` function:

```bash
supabase functions deploy ai-settings
```

How keys are handled:
- A key is tested with one tiny request before it's saved, then stored encrypted in Supabase Vault.
- Only the Edge Functions can read a key, through the service role, and only for that same user's requests.
- The browser only ever learns "a key is saved" and its last 4 characters.
- Custom addresses must be https public hosts. IPs, internal names, and private DNS answers are refused.
- Luna's rules travel in the system prompt to every provider.

Demo mode never shows key entry.

## Deep analysis

`supabase/functions/analyze-journal` reads a range of days (oldest first, inline-dated entries split into days) and writes a longitudinal reflection in three passes: verified notes per day, the analysis, and a review. **Luna's master prompt for it lives in `supabase/functions/_shared/deep-analysis-prompt.ts`**; change the analysis there, not in the function. The parts that matter most for safety are also enforced in code (`_shared/quotes.js`, `_shared/deep-checks.js`): quotes must be the writer's exact words, clinical words are removed, recurring sadness always gets a gentle note about talking to someone, and urgent writing stops the analysis so the app can show support instead.

`npm test` covers those checks. `tests/eval/deep-analysis.eval.mjs` runs fictional scenarios (`tests/fixtures/deep/scenarios.json`) against the deployed function and scores them; it uses real AI calls, so it isn't part of `npm test` (see the comment at the top of the file).

## Sign in with Google

Email and password always work, including "Forgot password?" reset links. The "Continue with Google" button is hidden until Google is set up: after these steps, set `GOOGLE_SIGNIN_ENABLED = true` at the top of `js/app.js`. The Client Secret goes only into the Supabase dashboard, never into this repo.

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.**
2. Under **Authorized redirect URIs**, add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Sign In / Providers → Google:** turn it on, paste the Client ID and Client Secret, and **Save**.
4. **Supabase → Authentication → URL Configuration:** set **Site URL** to your Vercel URL, and add `http://localhost:5173` and your Vercel URL to **Redirect URLs**.
5. **Google Cloud Console → OAuth consent screen:** add yourself (and anyone testing) as a **test user**, or publish the app so judges don't see an "unverified app" warning.

Google sign-in returns to Luna as `?code=…` (Supabase's PKCE flow), so it doesn't clash with Luna's `#/` page links. Luna removes the code from the address bar and opens your journal.

## Deploy to Cloudflare Pages

Upload only the frontend files. `wrangler pages deploy .` would also publish `supabase/` and any local `.env` or data files, because direct uploads ignore `.gitignore`.

```bash
rm -rf /tmp/luna-site && mkdir /tmp/luna-site
cp -R index.html css js /tmp/luna-site/
npx wrangler pages deploy /tmp/luna-site --project-name luna
```
Then add your Pages URL under Supabase **Authentication → URL Configuration → Site URL**.

## Deploy to Vercel

Import the repo in Vercel with no build command and the repo root as the output. `vercel.json` sends `Cache-Control: no-cache` for `index.html`, `js/`, and `css/`, so config and code changes show up right away. `.vercelignore` keeps `supabase/`, scripts, and any secrets out of the upload. Add the Vercel URL to Supabase's Site URL as above.

## Privacy design

- Row-Level Security: every row is readable only by its owner.
- Luna's AI key lives only in Supabase secrets, and a user's own key only in Supabase Vault; the browser never calls an AI API and never gets a key back.
- Luna's rules (no diagnosing, no mood labels, support resources) go in the system prompt to every provider.
- AI runs only when the user presses a button. Moods are self-reported only.
- Demo mode uses a separate in-memory store and is never written to the database.
