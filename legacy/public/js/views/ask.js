// Chat with Luna: questions about your own journal, answered only from your
// entries, with every answer linking back to the entries it used.
// Routes: #/ask (new chat), #/ask/search, #/ask/<chatId>

import { api, esc, formatDate } from '../api.js';
import { bunny } from '../mascot.js';
import { supportPanel, hydrateSupportPanel } from '../support.js';

const SUGGESTIONS = [
  'What have I been stressed about lately?',
  'How was my week?',
  'What made me happy this month?',
  'What do I write about the most?',
];

const label = (c) => (c.title === 'Untitled' ? formatDate(c.date, { month: 'long', day: 'numeric' }) : c.title);
const entryHref = (c) => `#/journals/${c.source}/${encodeURIComponent(c.id)}`;

function citationChips(citations) {
  return citations.map((c) =>
    `<a class="cite-chip" href="${entryHref(c)}"><span aria-hidden="true">📄</span> ${esc(label(c))} <span class="cite-date">${esc(formatDate(c.date))}</span></a>`).join('');
}

function messageHTML(m) {
  if (m.role === 'user') return `<div class="msg msg--user"><p>${esc(m.text)}</p></div>`;
  if (m.kind === 'support') {
    return `<div class="msg msg--luna msg--support"><p>${esc(m.text)}</p>${supportPanel({ open: true, title: 'People you can reach right now' })}</div>`;
  }
  const cites = m.citations?.length
    ? `<div class="cites" aria-label="Entries this answer is based on">${citationChips(m.citations)}</div>` : '';
  const consulted = m.consulted?.length
    ? `<details class="consulted"><summary>Show me the entries Luna read (${m.consulted.length})</summary>
        <ul>${m.consulted.map((c) => `<li><a href="${entryHref(c)}">${esc(label(c))}</a> <span class="cite-date">${esc(formatDate(c.date))}</span></li>`).join('')}</ul>
       </details>` : '';
  return `<div class="msg msg--luna${m.kind === 'no_entries' ? ' msg--quiet' : ''}"><p>${esc(m.text)}</p>${cites}${consulted}</div>`;
}

export async function render(el, { status, params }) {
  const sub = params[0] ?? null;
  const chatId = sub && sub !== 'search' ? sub : null;
  const [{ chats }, chat] = await Promise.all([
    api.chats(),
    chatId ? api.chat(chatId).catch(() => null) : Promise.resolve(null),
  ]);
  const ready = status.ai.configured;

  el.innerHTML = `
    <div class="journal chat-page ${chatId ? 'has-entry' : ''}">
      <aside class="journal-list" aria-label="Chats">
        <a class="btn btn--primary" href="#/ask">new chat</a>
        ${chats.length ? '<input class="search" type="search" placeholder="search chats" aria-label="Search chats" data-chat-search>' : ''}
        <ul class="chat-list" data-chat-list>
          ${chats.length ? chats.map((c) => `
            <li data-title="${esc(c.title.toLowerCase())}">
              <a class="entry-link" href="#/ask/${esc(c.id)}" ${c.id === chatId ? 'aria-current="page"' : ''}>
                <span class="entry-title">${esc(c.title)}</span>
                <span class="entry-date">${esc(formatDate(c.updatedAt.slice(0, 10)))}</span>
              </a>
            </li>`).join('') : '<li class="list-note">No chats yet.</li>'}
        </ul>
      </aside>

      <section class="journal-pane chat-pane" aria-label="Conversation">
        <a class="back-link" href="#/ask">← All chats</a>
        ${chatId && !chat ? `<div class="pane-empty">${bunny({ mood: 'resting' })}<p>That chat wasn’t found.</p></div>` : `
        <div class="chat-head">
          <h1>${chat ? esc(chat.title) : 'chat with luna'}</h1>
          ${chat ? '<button class="link-btn link-btn--danger" type="button" data-delete-chat>Delete chat</button>' : ''}
        </div>
        <div class="chat-log" data-log aria-live="polite">
          ${chat ? chat.messages.map(messageHTML).join('') : `
            <div class="chat-intro">
              ${bunny({ mood: 'awake' })}
              <p>Ask about what you’ve written. Luna answers only from your entries, and shows you exactly which ones.</p>
              <div class="suggestions">${SUGGESTIONS.map((q) => `<button type="button" class="suggestion" data-suggest="${esc(q)}">${esc(q)}</button>`).join('')}</div>
            </div>`}
        </div>
        ${ready ? '' : `<p class="note">The AI provider isn’t set up yet (${esc(status.ai.problem)}). <a href="#/settings">Set it up</a>.</p>`}
        <form class="composer" data-composer>
          <textarea rows="1" placeholder="Ask about your journal…" aria-label="Your question" maxlength="500" data-question ${ready ? '' : 'disabled'}></textarea>
          <button class="btn btn--primary" type="submit" ${ready ? '' : 'disabled'}>Ask</button>
        </form>
        <p class="chat-foot">Luna isn’t a therapist. If you need to talk to someone, see <a href="#/resources">resources</a>.</p>`}
      </section>
    </div>`;

  hydrateSupportPanel(el);

  // Search chats (titles).
  const search = el.querySelector('[data-chat-search]');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    el.querySelectorAll('[data-chat-list] li[data-title]').forEach((li) => { li.hidden = q && !li.dataset.title.includes(q); });
  });
  if (sub === 'search') setTimeout(() => search?.focus(), 0);

  el.querySelector('[data-delete-chat]')?.addEventListener('click', async () => {
    if (!confirm('Delete this chat? Your journal isn’t affected.')) return;
    await api.deleteChat(chatId);
    location.hash = '#/ask';
  });

  const form = el.querySelector('[data-composer]');
  if (!form) return;
  const input = form.querySelector('[data-question]');
  const log = el.querySelector('[data-log]');

  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  const send = async (question) => {
    const q = question.trim();
    if (!q) return;
    input.value = '';
    grow();
    input.disabled = true;
    form.querySelector('button').disabled = true;
    if (!chat) log.innerHTML = '';
    log.insertAdjacentHTML('beforeend', `${messageHTML({ role: 'user', text: q })}
      <div class="msg msg--luna msg--thinking" data-thinking>${bunny({ bob: true })}<p>Luna is reading your entries…</p></div>`);
    log.lastElementChild.scrollIntoView({ block: 'nearest' });
    try {
      const updated = chat ? await api.sendMessage(chat.id, q) : await api.newChat(q);
      if (!chat) { location.hash = `#/ask/${updated.id}`; return; }
      log.querySelector('[data-thinking]')?.remove();
      log.insertAdjacentHTML('beforeend', messageHTML(updated.messages.at(-1)));
      hydrateSupportPanel(log.lastElementChild);
      chat.messages = updated.messages;
      log.lastElementChild.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      log.querySelector('[data-thinking]')?.remove();
      log.insertAdjacentHTML('beforeend', `<p class="result result--err">${esc(err.message)}</p>`);
      input.value = q;
    } finally {
      input.disabled = !ready;
      form.querySelector('button').disabled = !ready;
      input.focus();
    }
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  el.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', () => send(b.dataset.suggest)));
  if (ready && sub !== 'search') setTimeout(() => input.focus(), 0);
  setTimeout(() => log.lastElementChild?.scrollIntoView({ block: 'nearest' }), 0);
}
