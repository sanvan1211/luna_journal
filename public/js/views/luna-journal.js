// The Luna journal: Notion-style pages written inside the app.
// Routes: #/journals/luna, #/journals/luna/<id>, #/journals/luna/templates, #/journals/luna/trash

import { api, esc, formatDate } from '../api.js';
import { bunny } from '../mascot.js';
import { toMarkdownFile } from '../markdown.js';
import { mountReflection } from '../reflection.js';
import { BlockEditor } from '../editor/editor.js';
import { entryLink, entryLinks } from './entry-list.js';

const MOODS = ['great', 'good', 'okay', 'low', 'rough'];
const ICONS = ['🌙', '🌱', '🌀', '🗓️', '✏️', '💭', '☀️', '🌧️', '🔥', '🎧', '📚', '⚽', '🎨', '💤', '🌊', '🐰'];
const SAVE_DELAY_MS = 700;

export async function renderLuna({ listBody, pane, entries, sub, status }) {
  renderSidebar(listBody, entries, sub);
  if (sub === 'trash') return renderTrash(pane);
  if (sub === 'templates') return renderTemplates(pane, { heading: 'Start from a template' });
  if (sub) return renderEditor(pane, sub, status, listBody);
  return renderTemplates(pane, { welcome: true, count: entries.length });
}

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

async function createAndOpen(templateId) {
  const entry = await api.createEntry(templateId ? { templateId } : {});
  location.hash = `#/journals/luna/${entry.id}`;
}

// --- Sidebar ------------------------------------------------------------------------

function renderSidebar(root, entries, activeId) {
  root.innerHTML = `
    <div class="new-row">
      <button class="btn btn--primary" type="button" data-new>New page</button>
      <a class="btn btn--ghost" href="#/journals/luna/templates" title="Start from a template">Templates</a>
    </div>
    ${entries.length ? `
      <input class="search" type="search" placeholder="Search everything you’ve written  ⌘K" aria-label="Search journal entries" data-search>
      <div class="tag-filter" data-tag-filter></div>` : ''}
    <nav class="entry-groups" aria-label="Luna journal entries" data-results>
      ${entryLinks(entries, activeId, 'No pages yet.')}
    </nav>
    <a class="trash-link" href="#/journals/luna/trash" ${activeId === 'trash' ? 'aria-current="page"' : ''}>Trash</a>`;

  root.querySelector('[data-new]').addEventListener('click', () => createAndOpen());
  if (!entries.length) return;

  const input = root.querySelector('[data-search]');
  const results = root.querySelector('[data-results]');
  const tagBox = root.querySelector('[data-tag-filter]');
  let tag = null;
  let timer;
  let seq = 0;

  const run = async () => {
    const q = input.value.trim();
    if (!q && !tag) {
      results.innerHTML = entryLinks(entries, activeId, 'No pages yet.');
      return;
    }
    const mine = ++seq;
    try {
      const { results: found } = await api.search(q, tag);
      if (mine !== seq) return;
      results.innerHTML = found.length
        ? `<p class="month-label">${found.length} result${found.length === 1 ? '' : 's'}</p>
           <ul class="search-results">${found.map(({ entry, snippet }) => `
             <li>${entryLink(entry, activeId)}
               ${snippet ? `<p class="snippet">${esc(snippet.before)}<mark>${esc(snippet.match)}</mark>${esc(snippet.after)}</p>` : ''}
             </li>`).join('')}</ul>`
        : '<p class="list-note">Nothing matches.</p>';
    } catch (err) {
      results.innerHTML = `<p class="result result--err">${esc(err.message)}</p>`;
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });

  api.tags().then(({ tags }) => {
    if (!tags.length) return;
    tagBox.innerHTML = tags.slice(0, 12).map((t) =>
      `<button type="button" class="tag-chip" data-tag="${esc(t.tag)}" aria-pressed="false">${esc(t.tag)}</button>`).join('');
    tagBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (!btn) return;
      tag = tag === btn.dataset.tag ? null : btn.dataset.tag;
      tagBox.querySelectorAll('[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tag === tag)));
      run();
    });
  }).catch(() => {});
}

// --- Templates / welcome ---------------------------------------------------------------

async function renderTemplates(pane, { welcome = false, count = 0, heading } = {}) {
  const { templates } = await api.templates();
  pane.innerHTML = `
    <div class="pane-empty pane-wide">
      ${welcome ? bunny({ mood: count ? 'awake' : 'resting' }) : ''}
      <h1>${esc(heading ?? (count ? 'Open a page, or start a new one' : 'Your Luna journal'))}</h1>
      ${welcome ? '<p>It works like Notion: type <kbd>/</kbd> for blocks, or <kbd>#</kbd>, <kbd>-</kbd>, <kbd>[]</kbd> and <kbd>&gt;</kbd> at the start of a line. Pages are saved on this computer, and Luna can reflect on any of them.</p>' : ''}
      <ul class="template-grid">
        ${templates.map((t) => `
          <li>
            <button type="button" class="template-card" data-template="${esc(t.id)}">
              <span class="template-icon" aria-hidden="true">${esc(t.icon ?? '📄')}</span>
              <span class="template-name">${esc(t.name)}</span>
              <span class="template-desc">${esc(t.description)}</span>
            </button>
          </li>`).join('')}
      </ul>
    </div>`;
  pane.querySelectorAll('[data-template]').forEach((b) =>
    b.addEventListener('click', () => createAndOpen(b.dataset.template)));
}

// --- Trash --------------------------------------------------------------------------------

async function renderTrash(pane) {
  const { entries } = await api.trash();
  pane.innerHTML = `
    <a class="back-link" href="#/journals/luna">← All pages</a>
    <section class="card">
      <div class="card-head">
        <h2>Trash</h2>
        ${entries.length ? '<button class="link-btn link-btn--danger" type="button" data-empty>Empty trash</button>' : ''}
      </div>
      ${entries.length ? `
        <p class="card-text">Pages here can be restored. Deleting forever removes the file from this computer, along with any reflection on it.</p>
        <ul class="trash-list">
          ${entries.map((e) => `
            <li data-id="${esc(e.id)}">
              <div>
                <p class="db-title">${e.icon ? `${esc(e.icon)} ` : ''}${esc(e.title)}</p>
                <p class="db-meta">${esc(formatDate(e.date))} · moved to trash ${esc(formatDate(e.deletedAt.slice(0, 10)))}</p>
              </div>
              <div class="trash-actions">
                <button class="btn btn--ghost btn--sm" type="button" data-restore>Restore</button>
                <button class="link-btn link-btn--danger" type="button" data-purge>Delete forever</button>
              </div>
            </li>`).join('')}
        </ul>
        <p class="result" role="status" data-trash-result></p>`
        : '<p class="card-text">The trash is empty.</p>'}
    </section>`;

  const out = pane.querySelector('[data-trash-result]');
  const fail = (err) => { out.className = 'result result--err'; out.textContent = err.message; };
  pane.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.closest('[data-id]').dataset.id;
    try { await api.restoreEntry(id); location.hash = `#/journals/luna/${id}`; } catch (err) { fail(err); }
  }));
  pane.querySelectorAll('[data-purge]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this page forever? This can’t be undone.')) return;
    try { await api.purgeEntry(b.closest('[data-id]').dataset.id); rerender(); } catch (err) { fail(err); }
  }));
  pane.querySelector('[data-empty]')?.addEventListener('click', async () => {
    if (!confirm(`Delete all ${entries.length} page${entries.length === 1 ? '' : 's'} in the trash forever?`)) return;
    try { await api.emptyTrash(); rerender(); } catch (err) { fail(err); }
  });
}

// --- Page editor ------------------------------------------------------------------------------

async function renderEditor(pane, id, status, listBody) {
  let entry;
  try {
    entry = await api.getEntry(id);
  } catch (err) {
    pane.innerHTML = `<div class="pane-empty">${bunny({ mood: 'resting' })}<p>${esc(err.message)}</p><a href="#/journals/luna">Back to pages</a></div>`;
    return undefined;
  }

  const state = {
    title: entry.title === 'Untitled' ? '' : entry.title,
    icon: entry.icon,
    date: entry.date,
    mood: entry.mood,
    tags: [...entry.tags],
    blocks: entry.blocks,
  };
  let baseVersion = entry.version;

  pane.innerHTML = `
    <a class="back-link" href="#/journals/luna">← All pages</a>
    <div class="conflict" data-conflict hidden role="alert"></div>
    <article class="page">
      <div class="page-bar">
        <span class="save-state" data-save-state role="status">Saved</span>
        <div class="editor-actions">
          <button class="link-btn" type="button" data-export>Export .md</button>
          <button class="link-btn link-btn--danger" type="button" data-trash>Move to trash</button>
        </div>
      </div>

      <div class="icon-row">
        <button class="page-icon ${state.icon ? '' : 'is-empty'}" type="button" data-icon aria-haspopup="true" aria-label="${state.icon ? 'Change icon' : 'Add icon'}">${state.icon ? esc(state.icon) : '+ Add icon'}</button>
        <div class="icon-picker" data-icon-picker hidden role="menu" aria-label="Choose an icon">
          ${ICONS.map((ic) => `<button type="button" role="menuitem" data-pick-icon="${ic}">${ic}</button>`).join('')}
          <button type="button" role="menuitem" class="icon-remove" data-pick-icon="">Remove</button>
        </div>
      </div>

      <input class="title-input" type="text" maxlength="200" placeholder="Untitled" aria-label="Page title" value="${esc(state.title)}" data-title>

      <dl class="props">
        <div class="prop">
          <dt>Date</dt>
          <dd><input type="date" value="${esc(state.date)}" aria-label="Entry date" data-date required></dd>
        </div>
        <div class="prop">
          <dt>Mood</dt>
          <dd>
            <div class="mood-picker" role="group" aria-label="How you’re feeling (optional, only you choose this)">
              ${MOODS.map((m) => `<button type="button" data-mood="${m}" aria-pressed="${state.mood === m}">${m}</button>`).join('')}
            </div>
          </dd>
        </div>
        <div class="prop">
          <dt>Tags</dt>
          <dd>
            <div class="tag-editor" data-tags>
              <span data-tag-chips></span>
              <input type="text" list="tag-options" placeholder="Add a tag" aria-label="Add a tag" maxlength="30" data-tag-input>
              <datalist id="tag-options"></datalist>
            </div>
          </dd>
        </div>
      </dl>

      <div class="editor-surface"><div data-blocks aria-label="Page content"></div></div>

      <p class="page-meta" data-meta></p>
      <details class="shortcuts">
        <summary>Keyboard shortcuts</summary>
        <dl>
          <div><dt><kbd>/</kbd></dt><dd>Block menu</dd></div>
          <div><dt><kbd>#</kbd> <kbd>##</kbd> <kbd>###</kbd></dt><dd>Headings</dd></div>
          <div><dt><kbd>-</kbd> <kbd>1.</kbd> <kbd>[]</kbd></dt><dd>Bullets, numbers, to-dos</dd></div>
          <div><dt><kbd>&gt;</kbd> <kbd>"</kbd> <kbd>\`\`\`</kbd> <kbd>---</kbd></dt><dd>Toggle, quote, code, divider</dd></div>
          <div><dt><kbd>Tab</kbd> / <kbd>⇧ Tab</kbd></dt><dd>Indent / outdent</dd></div>
          <div><dt><kbd>⌘B</kbd> <kbd>⌘I</kbd> <kbd>⌘U</kbd> <kbd>⌘E</kbd> <kbd>⌘⇧S</kbd></dt><dd>Bold, italic, underline, code, strike</dd></div>
          <div><dt><kbd>⌘/</kbd></dt><dd>Turn into, duplicate, move, delete</dd></div>
          <div><dt><kbd>⌘⇧↑</kbd> <kbd>⌘⇧↓</kbd></dt><dd>Move block</dd></div>
          <div><dt><kbd>⌘Z</kbd> / <kbd>⌘⇧Z</kbd></dt><dd>Undo / redo</dd></div>
        </dl>
      </details>
    </article>
    <div data-reflection></div>`;

  const $ = (sel) => pane.querySelector(sel);
  const titleEl = $('[data-title]');
  const saveState = $('[data-save-state]');
  const conflictEl = $('[data-conflict]');
  const metaEl = $('[data-meta]');
  let timer = null;
  let dirty = false;
  let conflict = false;
  let saving = Promise.resolve();

  const setMeta = (e) => {
    metaEl.textContent = `${e.wordCount} word${e.wordCount === 1 ? '' : 's'} · edited ${new Date(e.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  };
  setMeta(entry);

  const updateSidebar = (saved) => {
    const link = listBody.querySelector(`[data-entry-id="${CSS.escape(id)}"]`);
    if (!link) return;
    link.dataset.searchTitle = saved.title.toLowerCase();
    link.querySelector('[data-title-text]').textContent = saved.title;
    let iconEl = link.querySelector('.entry-icon');
    if (saved.icon && !iconEl) {
      iconEl = document.createElement('span');
      iconEl.className = 'entry-icon';
      iconEl.setAttribute('aria-hidden', 'true');
      link.querySelector('.entry-title').prepend(iconEl);
    }
    if (iconEl) {
      if (saved.icon) iconEl.textContent = saved.icon;
      else iconEl.remove();
    }
  };

  const save = ({ keepalive = false } = {}) => {
    clearTimeout(timer);
    if (!dirty || conflict) return saving;
    dirty = false;
    const data = { ...state, title: state.title.trim() };
    saveState.textContent = 'Saving…';
    saveState.dataset.state = 'saving';
    saving = saving
      .then(() => api.updateEntry(id, { ...data, baseVersion }, { keepalive }))
      .then((saved) => {
        baseVersion = saved.version;
        entry = saved;
        if (!dirty) {
          saveState.textContent = 'Saved';
          saveState.dataset.state = '';
        }
        updateSidebar(saved);
        setMeta(saved);
      })
      .catch((err) => {
        if (err.code === 'version_conflict') {
          conflict = true;
          saveState.textContent = 'Not saved';
          saveState.dataset.state = 'error';
          conflictEl.hidden = false;
          conflictEl.innerHTML = `<span>${esc(err.message)}</span> <button class="btn btn--ghost btn--sm" type="button">Load latest</button>`;
          conflictEl.querySelector('button').addEventListener('click', rerender);
          return;
        }
        dirty = true;
        saveState.textContent = `Couldn’t save: ${err.message}`;
        saveState.dataset.state = 'error';
      });
    return saving;
  };

  const schedule = () => {
    if (conflict) return;
    dirty = true;
    saveState.textContent = 'Editing…';
    saveState.dataset.state = '';
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };

  // Blocks
  const editor = new BlockEditor($('[data-blocks]'), {
    blocks: state.blocks,
    onChange: (blocks) => { state.blocks = blocks; schedule(); },
    onExitTop: () => { titleEl.focus(); titleEl.setSelectionRange(titleEl.value.length, titleEl.value.length); },
  });

  // Title
  titleEl.addEventListener('input', () => { state.title = titleEl.value; schedule(); });
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); editor.focusStart(); }
  });

  // Properties
  $('[data-date]').addEventListener('change', (e) => { if (e.target.value) { state.date = e.target.value; schedule(); } });
  pane.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
    state.mood = state.mood === b.dataset.mood ? null : b.dataset.mood; // click again to clear
    pane.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mood === state.mood)));
    schedule();
  }));

  // Tags
  const chips = $('[data-tag-chips]');
  const tagInput = $('[data-tag-input]');
  const drawTags = () => {
    chips.innerHTML = state.tags.map((t, i) =>
      `<span class="tag">${esc(t)}<button type="button" class="tag-x" data-remove-tag="${i}" aria-label="Remove tag ${esc(t)}">×</button></span>`).join('');
  };
  drawTags();
  const addTag = () => {
    const t = tagInput.value.trim().replace(/,$/, '');
    tagInput.value = '';
    if (!t || state.tags.some((x) => x.toLowerCase() === t.toLowerCase()) || state.tags.length >= 10) return;
    state.tags.push(t);
    drawTags();
    schedule();
  };
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    else if (e.key === 'Backspace' && !tagInput.value && state.tags.length) { state.tags.pop(); drawTags(); schedule(); }
  });
  tagInput.addEventListener('change', addTag); // picking from the datalist
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-tag]');
    if (!btn) return;
    state.tags.splice(Number(btn.dataset.removeTag), 1);
    drawTags();
    schedule();
    tagInput.focus();
  });
  api.tags().then(({ tags }) => {
    $('#tag-options').innerHTML = tags.map((t) => `<option value="${esc(t.tag)}"></option>`).join('');
  }).catch(() => {});

  // Icon
  const iconBtn = $('[data-icon]');
  const picker = $('[data-icon-picker]');
  const closePicker = () => { picker.hidden = true; iconBtn.setAttribute('aria-expanded', 'false'); };
  iconBtn.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    iconBtn.setAttribute('aria-expanded', String(!picker.hidden));
    if (!picker.hidden) picker.querySelector('button')?.focus();
  });
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick-icon]');
    if (!btn) return;
    state.icon = btn.dataset.pickIcon || null;
    iconBtn.textContent = state.icon ?? '+ Add icon';
    iconBtn.classList.toggle('is-empty', !state.icon);
    iconBtn.setAttribute('aria-label', state.icon ? 'Change icon' : 'Add icon');
    closePicker();
    iconBtn.focus();
    schedule();
  });
  picker.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePicker(); iconBtn.focus(); } });
  const outside = (e) => { if (!picker.hidden && !picker.contains(e.target) && e.target !== iconBtn) closePicker(); };
  document.addEventListener('mousedown', outside);

  // Actions
  $('[data-export]').addEventListener('click', async () => {
    await save();
    const latest = await api.getEntry(id);
    const blob = new Blob([toMarkdownFile(latest)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${latest.date} ${(latest.title || 'untitled').replace(/[^\w\- ]+/g, '').slice(0, 60)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('[data-trash]').addEventListener('click', async () => {
    await save();
    try {
      await api.trashEntry(id);
      dirty = false;
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

  // Fresh pages start in the title; existing ones leave focus alone.
  setTimeout(() => {
    if (!state.title && entry.wordCount === 0) titleEl.focus();
  }, 0);

  // Called by the router when leaving this page.
  return () => {
    document.removeEventListener('mousedown', outside);
    editor.destroy();
    save({ keepalive: true });
  };
}
