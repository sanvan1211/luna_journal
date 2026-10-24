> **Legacy:** this is the earlier Node + Notion version of Luna, kept for reference. The current app lives at the repo root and is described in the main [README](../README.md).

# luna_journal

<img width="250" height="250" alt="Screenshot 2026-09-21 at 19 29 03" src="https://github.com/user-attachments/assets/971d1974-fb77-4f82-a24c-6cd14cad64ef" />

^^ this is real life luna (she is a 4 year old holland lop rabbit) ^^ 

Life Unraveled, Not Alone (LUNA)
(Olivia Rodrigo reference)

### A Claude-powered AI journal companion that analyzes journals stored in Notion.

Sometimes it's hard to reach out to someone and talk face-to-face about what you're going through. Sometimes you don't know how to explain what you're feeling. And sometimes, you simply don't want to talk about it yet.

That doesn't mean those thoughts aren't important. 

Journaling gives you a place to put those thoughts into words. But over time, it can become difficult to look back through everything you've written and recognize the bigger picture.

That's where Luna comes in.

Luna connects to your journals in Notion and uses Claude to help you understand what you've written. It can organize your thoughts, recognize patterns that appear over time, and help you reflect on the experiences you're going through.

Luna can also offer practical suggestions and encouragement when you need another perspective.

### But Luna is not here to replace real people.

Your friends, family, mentors, counselors, and the people you trust are still an important part of your life. Sometimes the most important thing you can do is talk to someone.

Luna is simply another place to start.

A place to put your thoughts into words, look back at where you've been, recognize patterns you might have missed, and figure out how you want to move forward. Maybe its the starting point to get your thoughts together before seeking help from an actual human.  

And sometimes, you just need a little bunny sitting beside you while you figure things out. 🐰

In the song _Lets Pretend We're Numb_ by XXXTENTACION, Jahseh says: 

_I advise you to not hide your feelings...
Don't pretend to be okay when you're not okay...
Don't pretend to be happy when you're sad...
It'll only lead to your misery_

<img width="50" height="40" alt="Screenshot 2026-10-03 at 00 02 30" src="https://github.com/user-attachments/assets/5c52936d-1505-4264-8cfe-e2cecae095f2" />


Do not suffer in silence. 


---

## Running Luna

Requires Node 22+. There are no npm dependencies.

```sh
cp .env.example .env   # set AI_PROVIDER, AI_MODEL, and that provider's key
npm start              # http://127.0.0.1:3000
```

`AI_PROVIDER=ollama` with a local model (e.g. `AI_MODEL=llama3.2`) keeps every word on your own computer, and you don't need an API key.

With nothing configured, Luna still runs and shows honest setup states. It never shows sample entries or made-up AI output.

Run `npm test` for the unit tests. They use a temporary data folder and never touch your journal.

### Two places to journal

- **Luna journal:** a Notion-style page editor built into the app. Entries are stored as files in `data/` on your computer, and that folder is gitignored.
  - **Blocks:** text, three heading sizes, bulleted, numbered and to-do lists, toggles, quotes, callouts, code and dividers.
  - **Typing:** type `/` for the block menu, or Markdown shortcuts (`#`, `-`, `1.`, `[]`, `>`, `"`, ```` ``` ````, `---`). Tab nests blocks, ⌘B/I/U/E and ⌘⇧S format text, and undo/redo works across blocks.
  - **Arranging:** drag blocks by their handle, or use ⌘/ to turn a block into another type, duplicate it, move it or delete it.
  - **Page properties:** an emoji icon, date, self-reported mood and tags, plus templates for new pages.
  - **Search and trash:** full-text search with snippets. Deleted pages go to a trash you can restore from, and "delete forever" removes the file.
  - **Saving:** pages autosave. If another tab saved first, Luna shows a warning instead of overwriting it. You can also export any page to Markdown.
- **Notion:** connect a read-only Notion integration (`NOTION_TOKEN`), then pick your journal database in the app. Luna reads only that database, never edits it, and doesn't copy pages.

On any entry, choose **Reflect with Luna** for a short summary, a few themes, and a question to write about next. Only that one entry is sent to the AI. A safety check runs first. If an entry suggests someone may be unsafe, Luna steps aside and shows real resources (988, Crisis Text Line, Safe2Say PA, trusted adults) instead of a reflection.

### Project layout

```
server/
  index.js        routes, static files, security headers
  ai/             provider-agnostic AI service (anthropic | openai | ollama) + prompts
  journal/        Luna's built-in journal: block model, templates, search, trash
  notion/         read-only Notion connector
  insights/       single-entry reflections, recurring themes with receipts
  safety/         safety check + verified support resources
  store.js        one-JSON-file-per-record storage under data/
public/           HTML, CSS, and vanilla JS views (no framework)
  js/editor/      the Notion-style block editor
test/             node:test unit tests (`npm test`)
docs/prompts/     the original build, frontend, and AI-function specs
```

### Privacy

- API keys stay on the server, never in the browser.
- The server log records request paths and timings only, never journal text.
- Reflections can be deleted any time from **Privacy & setup**. Notion can be disconnected there too.

### Troubleshooting

| You see | Try |
| --- | --- |
| "AI_PROVIDER is not set" | Copy `.env.example` to `.env`, fill in `AI_PROVIDER` and `AI_MODEL`, and restart. |
| "ollama: couldn't reach provider (ECONNREFUSED)" | Ollama isn't running. Start the Ollama app, or run `ollama serve`, then use **Test connection** under Privacy & setup. |
| "ollama: 404 model … not found" | Pull the model first, for example `ollama pull llama3.2`, and make sure `AI_MODEL` matches. |
| "Notion couldn't find it" | Share the journal database with your integration in Notion (**⋯ → Connections**). |
| "This entry was changed somewhere else" | The page was saved in another tab. Choose **Load latest**. Your text in this tab hasn't been saved over it. |
| A page won't load after editing files by hand | Luna skips damaged files in `data/journal/` and logs their names. Fix or remove the named file. |

Run `npm run check` (syntax) and `npm test` (unit and HTTP tests) before you push.
