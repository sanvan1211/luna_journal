import { api, esc, formatDate } from '../api.js';
import { bunny } from '../mascot.js';
import { renderMarkdown, toMarkdownFile } from '../markdown.js';
import { mountReflection } from '../reflection.js';

const MOODS = ['great', 'good', 'okay', 'low', 'rough'];
const SAVE_DELAY_MS = 700;

// Routes: #/journals[/luna[/<id>]] and #/journals/notion[/<id>]
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

  if (source === 'luna') {
    renderLunaList(listBody, list, entryId);
    if (entryId) return renderEditor(pane, entryId, status, listBody);
    renderLunaWelcome(pane, list.length);
    return;
  }

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

// --- Entry lists ---------------------------------------------------------------

function groupByMonth(entries) {
  const groups = new Map();
  for (const e of entries) {
    const label = formatDate(e.date, { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(e);
  }
  return groups;
}

function entryLinks(entries, activeId, emptyText) {
  if (!entries.length) return `<p class="list-note">${emptyText}</p>`;
  return [...groupByMonth(entries)].map(([month, items]) => `
    <div class="month">
      <p class="month-label">${esc(month)}</p>
      <ul>
        ${items.map((e) => `
          <li>
            <a class="entry-link" href="#/journals/${e.source}/${esc(e.id)}" data-entry-id="${esc(e.id)}" data-search-title="${esc(e.title.toLowerCase())}" ${e.id === activeId ? 'aria-current="page"' : ''}>
              <span class="entry-title">${esc(e.title)}</span>
              <span class="entry-date">${esc(formatDate(e.date))}${e.mood ? ` · ${esc(e.mood)}` : ''}</span>
            </a>
          </li>`).join('')}
      </ul>
    </div>`).join('');
}

function wireSearch(root) {
  const input = root.querySelector('[data-search]');
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    root.querySelectorAll('.entry-link').forEach((a) => {
      a.parentElement.hidden = q && !a.dataset.searchTitle.includes(q);
    });
    root.querySelectorAll('.month').forEach((m) => {
      m.hidden = ![...m.querySelectorAll('li')].some((li) => !li.hidden);
    });
  });
}

function renderLunaList(root, entries, activeId) {
  root.innerHTML = `
    <button class="btn btn--primary btn--block" type="button" data-new>New entry</button>
    ${entries.length ? '<input class="search" type="search" placeholder="Search titles" aria-label="Search entries by title" data-search>' : ''}
    <nav class="entry-groups" aria-label="Luna journal entries">
      ${entryLinks(entries, activeId, 'No entries yet.')}
    </nav>`;
  root.querySelector('[data-new]').addEventListener('click', newEntry);
  wireSearch(root);
}

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
  wireSearch(root);
  api.notionSelection()
    .then(({ database }) => { if (database) root.querySelector('[data-db-name]').textContent = database.title; })
    .catch(() => {});
  root.querySelector('[data-change-db]').addEventListener('click', async () => {
    await api.disconnectNotionDatabase();
    location.hash = '#/journals/notion';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

async function newEntry() {
  const entry = await api.createEntry();
  location.hash = `#/journals/luna/${entry.id}`;
}

// --- Luna journal ---------------------------------------------------------------

function renderLunaWelcome(pane, count) {
  pane.innerHTML = `
    <div class="pane-empty">
      ${bunny({ mood: count ? 'awake' : 'resting' })}
      <h1>${count ? 'Pick an entry, or start a new one' : 'Your Luna journal'}</h1>
      <p>Write here like you would in Notion: headings with <code>#</code>, lists with <code>-</code>, checkboxes with <code>- [ ]</code>. Entries are saved on this computer, and you can ask Luna to reflect on any of them.</p>
      <button class="btn btn--primary" type="button" data-new-main>Write an entry</button>
    </div>`;
  pane.querySelector('[data-new-main]').addEventListener('click', newEntry);
}

async function renderEditor(pane, id, status, listBody) {
  let entry;
  try {
    entry = await api.getEntry(id);
  } catch (err) {
    pane.innerHTML = `<div class="pane-empty">${bunny({ mood: 'resting' })}<p>${esc(err.message)}</p><a href="#/journals/luna">Back to entries</a></div>`;
    return;
  }

  pane.innerHTML = `
    <a class="back-link" href="#/journals/luna">← All entries</a>
    <article class="editor">
      <div class="editor-bar">
        <div class="mode-toggle" role="group" aria-label="Editor mode">
          <button type="button" data-mode="write" aria-pressed="true">Write</button>
          <button type="button" data-mode="preview" aria-pressed="false">Preview</button>
        </div>
        <span class="save-state" data-save-state role="status">Saved</span>
        <div class="editor-actions">
          <button class="link-btn" type="button" data-export>Export .md</button>
          <button class="link-btn link-btn--danger" type="button" data-delete>Delete</button>
        </div>
      </div>

      <input class="title-input" type="text" maxlength="200" placeholder="Untitled" aria-label="Entry title" value="${esc(entry.title === 'Untitled' ? '' : entry.title)}" data-title>

      <div class="meta-row">
        <label class="date-field">
          <span class="visually-hidden">Entry date</span>
          <input type="date" value="${esc(entry.date)}" data-date required>
        </label>
        <div class="mood-picker" role="group" aria-label="How you’re feeling (optional, only you choose this)">
          ${MOODS.map((m) => `<button type="button" data-mood="${m}" aria-pressed="${entry.mood === m}">${m}</button>`).join('')}
        </div>
      </div>

      <textarea class="body-input" placeholder="Write whatever’s on your mind…" aria-label="Entry text" data-body>${esc(entry.content)}</textarea>
      <div class="md-preview" data-preview hidden></div>
    </article>
    <div data-reflection></div>`;

  const $ = (sel) => pane.querySelector(sel);
  const titleEl = $('[data-title]');
  const bodyEl = $('[data-body]');
  const dateEl = $('[data-date]');
  const saveState = $('[data-save-state]');
  const preview = $('[data-preview]');
  let mood = entry.mood;
  let timer = null;
  let dirty = false;
  let saving = Promise.resolve();

  const autosize = () => {
    bodyEl.style.height = 'auto';
    bodyEl.style.height = `${Math.max(bodyEl.scrollHeight, 280)}px`;
  };

  const snapshot = () => ({ title: titleEl.value.trim(), content: bodyEl.value, mood, ...(dateEl.value ? { date: dateEl.value } : {}) });

  const save = ({ keepalive = false } = {}) => {
    clearTimeout(timer);
    if (!dirty) return saving;
    dirty = false;
    const data = snapshot();
    saveState.textContent = 'Saving…';
    saveState.dataset.state = 'saving';
    saving = saving.then(() => api.updateEntry(id, data, { keepalive }))
      .then((saved) => {
        entry = saved;
        if (!dirty) {
          saveState.textContent = 'Saved';
          saveState.dataset.state = '';
        }
        const link = listBody.querySelector(`[data-entry-id="${CSS.escape(id)}"]`);
        if (link) {
          link.querySelector('.entry-title').textContent = saved.title;
          link.dataset.searchTitle = saved.title.toLowerCase();
        }
      })
      .catch((err) => {
        dirty = true;
        saveState.textContent = `Couldn’t save: ${err.message}`;
        saveState.dataset.state = 'error';
      });
    return saving;
  };

  const schedule = () => {
    dirty = true;
    saveState.textContent = 'Editing…';
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };

  titleEl.addEventListener('input', schedule);
  dateEl.addEventListener('change', schedule);
  bodyEl.addEventListener('input', () => { autosize(); schedule(); });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); bodyEl.focus(); }
  });

  pane.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
    mood = mood === b.dataset.mood ? null : b.dataset.mood; // click again to clear
    pane.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mood === mood)));
    schedule();
  }));

  const setMode = (mode) => {
    const isPreview = mode === 'preview';
    pane.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    bodyEl.hidden = isPreview;
    preview.hidden = !isPreview;
    if (isPreview) preview.innerHTML = bodyEl.value.trim() ? renderMarkdown(bodyEl.value) : '<p class="card-text">Nothing written yet.</p>';
    else autosize();
  };
  pane.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  // Like Notion: entries open formatted, and clicking the text starts editing.
  preview.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    setMode('write');
    bodyEl.focus();
  });
  if (entry.content.trim()) setMode('preview');

  $('[data-export]').addEventListener('click', () => {
    const data = { ...entry, ...snapshot() };
    const blob = new Blob([toMarkdownFile(data)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${data.date} ${(data.title || 'untitled').replace(/[^\w\- ]+/g, '').slice(0, 60)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('[data-delete]').addEventListener('click', async () => {
    if (!confirm('Delete this entry? This can’t be undone.')) return;
    clearTimeout(timer);
    dirty = false;
    try {
      await api.deleteEntry(id);
      location.hash = '#/journals/luna';
    } catch (err) {
      saveState.textContent = err.message;
      saveState.dataset.state = 'error';
    }
  });

  mountReflection($('[data-reflection]'), {
    source: 'luna',
    id,
    aiConfigured: status.ai.configured,
    beforeReflect: () => save(),
  });

  // The view is attached to the page after render resolves, so defer
  // anything that needs layout or focus.
  setTimeout(() => {
    autosize();
    if (!entry.content && entry.title === 'Untitled') titleEl.focus();
  }, 0);

  // Called by the router when leaving this view.
  return () => save({ keepalive: true });
}

// --- Notion -----------------------------------------------------------------------

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
