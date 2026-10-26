# Luna

Luna is a private journal that helps you make sense of what you've written. You write, and when you want, Luna reflects back on it, notices patterns across your entries, and answers questions about your own journal.

I built it with plain HTML, CSS and JavaScript, so there's no build step. Supabase handles accounts, the database, and the server functions that talk to the AI.

**Try it:** [lunajournal.vercel.app](https://lunajournal.vercel.app/#/home). It's hosted on Vercel for now, and a proper domain is coming soon. Click "Try it with sample data" to look around without making an account.

## What it does

- **Journal.** A simple block editor that saves as you type. You can tag entries and pick a mood if you want to (Luna never picks one for you). Entries can be grouped by month, week or day.
- **Reflect with Luna.** Luna writes a short reflection on one entry, and you can reply to it like a chat. After you've talked a bit, it offers to add a short summary to your entry. You see and edit the summary first, and nothing goes in until you click Insert.
- **Dashboard.** Writing stats, a mood calendar, your most important quotes from the past month, and "Luna noticed" patterns. Every pattern links to the entries it came from.
- **Check-in.** Four quick questions you can save as an entry.
- **Ask Luna.** Ask anything about your journal. Answers only come from your entries and link to the ones they used.
- **Settings and privacy.** See exactly what gets sent to the AI, delete Luna's memory or your whole account, and connect your own AI key if you want.

Crisis resources (988 and the Crisis Text Line) show up anywhere Luna's AI does.

**Demo mode** ("Try it with sample data") loads a sample journal that only lives in your browser. The AI needs an account, so in demo mode the reflection chat uses replies I wrote ahead of time for each sample entry. Each one is labelled "Sample reply (demo mode)". Nothing in demo mode is saved or sent to an AI.

## How the code is laid out

```
luna_journal/
├── index.html
├── css/styles.css
├── js/
│   ├── config.js             your Supabase URL and anon key go here
│   ├── app.js                routing, sign-in, demo mode
│   ├── reflection-chat.js    the reflection chat and "add to journal"
│   ├── ai-model-settings.js  Settings → AI model (bring your own key)
│   ├── demo.js, demo-replies.js   sample journal and sample replies
│   ├── ...                   editor, data, sidebar, account menu, helpers
│   └── pages/                home, journal, dashboard, check-in, ask, settings
└── supabase/
    ├── schema.sql                  tables and row-level security
    ├── schema-chats-and-keys.sql   saved reflection chats and user AI keys
    └── functions/                  the AI functions (reflect-entry, ask-luna, ...)
```

## Running it locally

You need Node.js. There's nothing to install.

```bash
cd luna_journal
npm run dev
```

Then open http://localhost:5173. Demo mode works right away, even before Supabase is set up.

The dev server turns caching off, so a normal reload always picks up your changes. I'd avoid `python3 -m http.server`, because the browser can hang on to an old `config.js` and Luna will think Supabase isn't connected. If that happens, a hard refresh (Cmd/Ctrl+Shift+R) fixes it.

## Setting up Supabase

This takes about 15 minutes.

1. Make a project at supabase.com.
2. In the SQL Editor, run `supabase/schema.sql`, then `supabase/schema-chats-and-keys.sql`.
3. Under Project Settings → API, copy the project URL and the `anon` key into `js/config.js`.
4. Under Authentication → URL Configuration, set the Site URL to wherever the app lives (like `https://your-app.vercel.app`). Add that address with `/**` on the end, plus `http://localhost:5173/**`, to Redirect URLs. If you skip this, password reset and confirmation emails send people to the wrong place.
5. Optional: under Authentication → Providers → Email, turn off "Confirm email" so sign-up is instant.
6. Deploy the AI functions with the Supabase CLI:

```bash
brew install supabase/tap/supabase
supabase login
supabase init        # say no to the VS Code prompts
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set LUNA_PROVIDER=groq GROQ_API_KEY=gsk_...
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check analyze-journal ai-settings
```

Until the functions and a key are set up, the app just says the AI isn't configured. It never makes up an answer.

## Picking an AI model

The AI only runs inside the Supabase functions. Keys live in Supabase secrets, never in this repo or in `js/config.js`. You choose a provider with the `LUNA_PROVIDER` secret, and set `ai` in `js/config.js` to the same name so the Privacy page tells people where their writing actually goes.

### The default: GPT-OSS on Groq

Get a free key at [console.groq.com](https://console.groq.com) (API Keys → Create API Key), then set it from your own terminal so it never ends up in a file:

```bash
supabase secrets set LUNA_PROVIDER=groq GROQ_API_KEY=gsk_...
```

People pick between two models in the account menu:

- **Fast** (`openai/gpt-oss-20b`) for everyday use.
- **Thoughtful** (`openai/gpt-oss-120b`) for deeper answers. In Ask Luna and "Look for patterns" it gets about twice as much room and more time to think, so it connects details across entries and dates. Reflections stay short either way.

Safety checks always use Fast. To use other Groq models, set `GROQ_FAST_MODEL` and `GROQ_THOUGHTFUL_MODEL`.

Groq's free tier has limits per minute and per day. When you hit one, Luna says so and tells you roughly when it'll work again.

### Using a model from Hugging Face

Luna works with most chat models on [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers), which serves them all through one OpenAI-compatible API (`https://router.huggingface.co/v1`). There are two ways to use it.

**From the app, for yourself.** No code needed.

1. [Make a Hugging Face token](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained). That link already ticks "Make calls to Inference Providers", which is the permission you need. The token starts with `hf_`.
2. In Luna, go to Settings → AI model → Hugging Face.
3. Pick one of the presets, or choose "Other" and start typing. The box searches every chat model that's live on Hugging Face right now, so you can type something like `Llama`, `Qwen` or `DeepSeek` and pick from the list. Any full model name works, like `meta-llama/Llama-3.3-70B-Instruct`. You can also add `:fastest`, `:cheapest`, or a provider name like `:groq` to the end.
4. Paste your token and click Save and test. Luna sends one tiny request to make sure the token and model work together, and only saves them if they do.
5. After that, you can switch between your Hugging Face models (or back to Luna's default) from the account menu.

The presets are GPT-OSS 20B and 120B, Llama 3.3 70B, Qwen 2.5 72B and Gemma 3 27B. I checked them against the live model list.

**On the server, for everyone.** This makes Hugging Face the default instead of Groq:

```bash
supabase secrets set LUNA_PROVIDER=huggingface HF_TOKEN=hf_... \
  HF_FAST_MODEL=openai/gpt-oss-20b HF_THOUGHTFUL_MODEL=meta-llama/Llama-3.3-70B-Instruct
supabase functions deploy reflect-entry generate-insights ask-luna check-in safety-check analyze-journal ai-settings
```

Then set `ai: "huggingface"` in `js/config.js`. Whatever model you use, Luna's rules (no diagnosing, no mood labels, always show support resources) go along with every request. Smaller models don't always follow them as well, so try a new model on a few entries first.

### Other providers

| Provider | `LUNA_PROVIDER` | Secrets | Models |
|---|---|---|---|
| [OpenAI](https://platform.openai.com/api-keys) | `openai` | `OPENAI_API_KEY`, `OPENAI_FAST_MODEL`, `OPENAI_THOUGHTFUL_MODEL` | Your choice (OpenAI renames models often, so there's no default) |
| [Anthropic](https://console.anthropic.com/settings/keys) | `anthropic` | `ANTHROPIC_API_KEY` | Claude Haiku 5.5 / Claude Sonnet 5.5 |
| [Ollama](https://ollama.com) (local only) | `ollama` | `OLLAMA_URL`, e.g. `http://host.docker.internal:11434` | `llama3.2` / `qwen2.5:7b`, or set `OLLAMA_FAST_MODEL` and `OLLAMA_THOUGHTFUL_MODEL` |

There are also generic secrets that work with any provider: `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` and `AI_BASE_URL`. Setting `AI_PROVIDER=custom` with an https `AI_BASE_URL` points Luna at any OpenAI-compatible API.

After changing anything in `supabase/functions/`, run the deploy command again.

### Letting people use their own key

Signed-in people can connect their own Groq or Hugging Face key, or any OpenAI-compatible service, under Settings → AI model. That way they get their own limits instead of sharing yours. This needs `schema-chats-and-keys.sql` and the `ai-settings` function.

Here's how keys are handled:

- A key gets tested with one tiny request before it's saved, then it's stored encrypted in Supabase Vault.
- Only the server functions can read it, and only for that person's own requests.
- The browser only ever finds out whether a key is saved and its last 4 characters.
- Custom addresses have to be public https sites. IP addresses, internal names, and anything that points to a private network get refused.
- Demo mode never shows the key form.

## Deep analysis

`supabase/functions/analyze-journal` reads a stretch of days and writes a longer reflection in three passes: notes for each day, the analysis itself, and a review. The prompt lives in `supabase/functions/_shared/deep-analysis-prompt.ts`, so that's the place to change it.

The most important safety rules are checked in code too, not just in the prompt. Quotes have to be the writer's exact words, clinical terms get taken out, sadness that keeps coming up always gets a gentle note about talking to someone, and urgent writing stops the analysis so the app can show support instead.

There's no button for it in the app yet. It's available as a server function.

`npm test` runs the unit tests for those checks. `tests/eval/deep-analysis.eval.mjs` runs fictional journals through the real function and scores the results. It makes real AI calls, so it's not part of `npm test`.

## Signing in with Google

Email and password work out of the box, including "Forgot password?". The Google button is hidden until you set it up:

1. In Google Cloud Console, go to APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.
2. Add `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as an authorized redirect URI.
3. In Supabase, go to Authentication → Sign In / Providers → Google, turn it on, and paste in the Client ID and Client Secret. The secret only goes in the Supabase dashboard, never in this repo.
4. Make sure the URL Configuration from the Supabase setup above is done.
5. On Google's OAuth consent screen, add yourself as a test user, or publish the app so people don't see an "unverified app" warning.
6. Set `GOOGLE_SIGNIN_ENABLED = true` at the top of `js/app.js`.

## Deploying

**Vercel.** Import the repo with no build command and the repo root as the output folder. `vercel.json` turns off caching for the app files so changes show up right away, and `.vercelignore` keeps `supabase/` and anything secret out of the upload. Then put your Vercel URL in Supabase's URL Configuration.

**Cloudflare Pages.** Only upload the frontend. Running `wrangler pages deploy .` on the whole repo would also upload `supabase/` and any local `.env` files, because direct uploads ignore `.gitignore`.

```bash
rm -rf /tmp/luna-site && mkdir /tmp/luna-site
cp -R index.html css js /tmp/luna-site/
npx wrangler pages deploy /tmp/luna-site --project-name luna
```

## Privacy

- Row-level security means every row in the database can only be read by the person it belongs to.
- The AI key stays in Supabase secrets, and people's own keys stay in Supabase Vault. The browser never talks to an AI directly and never gets a key back.
- The AI only runs when you press a button. Nothing gets analyzed in the background.
- Moods are only ever the ones you pick.
- Demo mode uses its own sample data in the browser and never touches the database.
