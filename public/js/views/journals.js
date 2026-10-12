import { api, esc, formatDate } from '../api.js';
import { bunny } from '../mascot.js';
import { renderMarkdown } from '../markdown.js';
import { mountReflection } from '../reflection.js';
import { entryLinks, wireTitleFilter } from './entry-list.js';
import { renderLuna } from './luna-journal.js';

// Routes: #/journals/luna[/…] (see luna-journal.js) and #/journals/notion[/<id>]
export async function render(el, { status, params }) {
  const source = params[0] === 'notion' ? 'notion' : 'luna';
  const entryId = params[1] ?? null;

  const { entries, sources } = await api.entries();
  const list = entries.filter((e) => e.source === source);

  el.innerHTML = `
    <div class="journal ${entryId ? 'has-entry' : ''} ${source === 'notion' && !(status.notion.configured && status.notion.databaseSelected) ? 'show-pane' : ''}">
      <aside class="journal-list" aria-label="Entries">
        <div class="source-tabs" role="tablist">
          <a role="tab" href="#/journals/luna" aria-selected="${source === 'luna'}">Luna journal</a>
          <a role="tab" href="#/journals/notion" aria-selected="${source === 'notion'}">Notion</a>
        </div>
        <div data-list-body></div>
      </aside>
      <section class="journal-pane" data-pane></section>
    </div>`;

  const listBody = el.querySelector('[data-list-body]');
  const pane = el.querySelector('[data-pane]');

  if (source === 'luna') return renderLuna({ listBody, pane, entries: list, sub: entryId, status });

  // Notion
  if (!status.notion.configured) {
    listBody.innerHTML = `<p class="list-note">Not connected.</p>`;
    renderNotionSetup(pane);
  } else if (!status.notion.databaseSelected) {
    listBody.innerHTML = `<p class="list-note">Pick a journal database to see entries.</p>`;
    await renderDatabasePicker(pane);
  } else {
    renderNotionList(listBody, list, entryId, sources.notion);
    if (entryId) await renderNotionEntry(pane, entryId, status);
    else renderNotionWelcome(pane, sources.notion);
  }
}

// --- Notion -----------------------------------------------------------------------

function renderNotionList(root, entries, activeId, notion) {
  root.innerHTML = `
    <div class="list-head">
      <p class="list-note" data-db-name>Notion journal</p>
      <button class="link-btn" type="button" data-change-db>Change</button>
    </div>
    ${notion.error ? `<p class="result result--err">${esc(notion.error)}</p>` : ''}
    ${entries.length ? '<input class="search" type="search" placeholder="Search titles" aria-label="Search entries by title" data-search>' : ''}
    <nav class="entry-groups" aria-label="Notion entries">
      ${notion.error ? '' : entryLinks(entries, activeId, 'This database has no pages yet.')}
    </nav>`;
  wireTitleFilter(root);
  api.notionSelection()
    .then(({ database }) => { if (database) root.querySelector('[data-db-name]').textContent = database.title; })
    .catch(() => {});
  root.querySelector('[data-change-db]').addEventListener('click', async () => {
    await api.disconnectNotionDatabase();
    location.hash = '#/journals/notion';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}


function renderNotionSetup(pane) {
  pane.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Connect your Notion journal</h2><span class="pill pill--todo">Not connected</span></div>
      <ol class="steps">
        <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">notion.so/my-integrations</a> and create an <strong>internal integration</strong>. Under capabilities, <strong>Read content</strong> is all Luna needs.</li>
        <li>Open your journal database in Notion, choose <strong>⋯ → Connections</strong>, and add the integration. Luna can only see pages you share this way.</li>
        <li>Copy the integration secret into <code>NOTION_TOKEN</code> in your <code>.env</code> file, then restart Luna.</li>
      </ol>
      <ul class="plain-list notion-promises">
        <li>Luna reads only the one database you pick, and never edits it.</li>
        <li>Notion pages aren’t copied into Luna — they’re read when you open them.</li>
        <li>Disconnect any time from Privacy &amp; setup, or by removing the integration in Notion.</li>
      </ul>
    </div>`;
}

async function renderDatabasePicker(pane) {
  pane.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Which database is your journal?</h2></div>
      <div data-dbs><p class="card-text">Looking for databases shared with Luna…</p></div>
    </div>`;
  const box = pane.querySelector('[data-dbs]');
  try {
    const { databases } = await api.notionDatabases();
    if (!databases.length) {
      box.innerHTML = `<p class="card-text">Luna can’t see any databases yet. In Notion, open your journal database and add your integration under <strong>⋯ → Connections</strong>, then <a href="">refresh</a>.</p>`;
      return;
    }
    box.innerHTML = `
      <p class="card-text">These are the databases your integration can see. Luna will only read the one you choose.</p>
      <ul class="db-list">
        ${databases.map((db) => `
          <li>
            <div>
              <p class="db-title">${esc(db.title)}</p>
              <p class="db-meta">Edited ${esc(formatDate(db.lastEditedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' }))}${db.hasDateProperty ? ' · has a date column' : ''}</p>
            </div>
            <button class="btn btn--ghost btn--sm" type="button" data-pick="${esc(db.id)}">Use this</button>
          </li>`).join('')}
      </ul>
      <p class="result" data-pick-result role="status"></p>`;
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api.selectNotionDatabase(b.dataset.pick);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        box.querySelector('[data-pick-result]').textContent = err.message;
        b.disabled = false;
      }
    }));
  } catch (err) {
    box.innerHTML = `<p class="result result--err">${esc(err.message)}</p>`;
  }
}

function renderNotionWelcome(pane, notion) {
  pane.innerHTML = `
    <div class="pane-empty">
      ${bunny({ mood: 'awake' })}
      <h1>${notion.error ? 'Luna couldn’t load your Notion journal' : `${notion.count} ${notion.count === 1 ? 'entry' : 'entries'} from Notion`}</h1>
      <p>${notion.error ? esc(notion.error) : 'Open any entry to read it here and ask Luna to reflect on it. Your Notion pages stay exactly as they are.'}</p>
    </div>`;
}

async function renderNotionEntry(pane, id, status) {
  pane.innerHTML = `<div class="pane-empty">${bunny({ bob: true })}<p>Opening from Notion…</p></div>`;
  let entry;
  try {
    entry = await api.notionEntry(id);
  } catch (err) {
    pane.innerHTML = `<div class="pane-empty">${bunny({ mood: 'resting' })}<p>${esc(err.message)}</p><a href="#/journals/notion">Back to entries</a></div>`;
    return;
  }
  pane.innerHTML = `
    <a class="back-link" href="#/journals/notion">← All entries</a>
    <article class="editor reader">
      <div class="editor-bar">
        <span class="pill pill--quiet">Read-only · from Notion</span>
        <div class="editor-actions">
          <a class="link-btn" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Open in Notion</a>
        </div>
      </div>
      <h1 class="reader-title">${esc(entry.title)}</h1>
      <p class="reader-date">${esc(formatDate(entry.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</p>
      <div class="md-preview">${entry.content.trim() ? renderMarkdown(entry.content) : '<p class="card-text">This page has no text Luna can read.</p>'}</div>
    </article>
    <div data-reflection></div>`;
  mountReflection(pane.querySelector('[data-reflection]'), { source: 'notion', id: entry.id, aiConfigured: status.ai.configured });
}
