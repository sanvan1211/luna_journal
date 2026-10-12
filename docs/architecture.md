# How Luna is built

Luna is a small Node server with a plain HTML/CSS/JavaScript front end. There are no frameworks and no npm dependencies, so everything here is code you can read.

```
browser (public/)  ──fetch──▶  server/app.js  ──▶  journal/  (files in data/)
                                     │         ──▶  notion/   (Notion API, read-only)
                                     │         ──▶  ai/       (Anthropic | OpenAI | Ollama)
                                     └────────────▶  safety/, insights/
```

## The path of a reflection

1. You click **Reflect with Luna** on an entry.
2. `POST /api/reflections/:source/:id` loads **that one entry**, from `journal/` or `notion/`.
3. `safety/check.js` runs first. A fixed phrase screen and the model's own read are combined, and the higher level wins.
   - **"clear":** Luna doesn't reflect at all. It returns a fixed supportive message and the verified resources from `safety/resources.js`.
   - **"possible":** the reflection is shown, along with a gentle pointer to people.
4. `insights/reflect.js` asks the model for structured JSON: a summary, up to three themes and a question. It validates the reply before saving.
5. The reflection is saved to `data/reflections/` and linked to the entry it came from. That link is how the dashboard can always show "the entries behind" a theme.

## Modules

| Folder | What it does |
| --- | --- |
| `server/app.js` | Routes, request checks (Host, Origin, JSON-only bodies), static files with ETags |
| `server/ai/` | `complete()` hides which provider and model is used. It retries once on 429 or 5xx. Prompts are in `prompts.js`. |
| `server/journal/` | Notion-style pages: block model (`blocks.js`), templates, search, trash, version checks |
| `server/notion/` | Read-only Notion client. Reads only pages in the selected database. |
| `server/insights/` | Single-entry reflections, plus recurring themes that keep their supporting entries |
| `server/safety/` | Crisis screen and verified support resources |
| `server/store.js` | One JSON file per record under `data/` (or `LUNA_DATA_DIR`) |
| `public/js/editor/` | The block editor (`editor.js`) and rich-text helpers (`richtext.js`) |
| `public/js/views/` | Dashboard, journal (Luna and Notion), Ask Luna, Privacy & setup |

## Rules the code follows

- **No fake data.** If something isn't configured, the UI shows a setup state.
- **Receipts.** Every insight carries the IDs of the entries that support it.
- **Minimum context.** The model only ever sees the entry it's working on.
- **No journal text in logs.** `log.js` records request paths and timings only.
- **Not a therapist.** Prompts forbid diagnosis and scores. Crisis language routes to people, not to Luna.

## Tests

`npm test` runs `node --test` over `test/`. The tests use a temporary data folder and a fake local AI server, so they never touch your journal and never call a paid API. GitHub Actions runs them on Node 22 and 24.
