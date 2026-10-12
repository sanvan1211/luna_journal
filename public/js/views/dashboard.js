import { api, esc, formatDate, localISODate } from '../api.js';
import { bunny } from '../mascot.js';
import { supportPanel, hydrateSupportPanel } from '../support.js';

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function setupSteps(status, entryCount) {
  return [
    {
      done: status.ai.configured,
      title: 'Choose an AI provider',
      detail: status.ai.configured
        ? `Using ${status.ai.provider} · ${status.ai.model}`
        : `${status.ai.problem}. Set it in your .env file.`,
      href: '#/settings',
    },
    {
      done: entryCount > 0,
      title: 'Add some journal entries',
      detail: 'Write in the Luna journal, or connect a Notion journal database.',
      href: '#/journals',
    },
  ];
}

// Consecutive days with at least one entry, ending today (or yesterday, so a
// streak doesn't look broken first thing in the morning).
function writingStreak(dates) {
  const days = new Set(dates);
  const d = new Date();
  if (!days.has(localISODate(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(localISODate(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function card({ title, sub = '', body, cls = '', id }) {
  return `
    <section class="card ${cls}" aria-labelledby="${id}">
      <div class="card-head"><h2 id="${id}">${title}</h2>${sub ? `<span class="card-sub">${sub}</span>` : ''}</div>
      ${body}
    </section>`;
}

function entryHref(key) {
  const [source, id] = key.split(':');
  return `#/journals/${source}/${encodeURIComponent(id)}`;
}

export async function render(el, { status }) {
  const [{ entries, sources }, { themes }] = await Promise.all([
    api.entries(),
    api.themes().catch(() => ({ themes: [] })),
  ]);
  const steps = setupSteps(status, entries.length);
  const remaining = steps.filter((s) => !s.done).length;
  const today = new Date();
  const monthPrefix = localISODate(today).slice(0, 7);
  const thisMonth = entries.filter((e) => e.date.startsWith(monthPrefix)).length;
  const streak = writingStreak(entries.map((e) => e.date));

  el.innerHTML = `
    <div>
      <header class="page-head">
        <div>
          <p class="eyebrow">${esc(today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
          <h1>${greeting()}.</h1>
          <p class="lede">Luna helps you notice patterns in what you’ve already written — and always shows you the entries behind what it says.</p>
        </div>
        <a class="btn btn--primary" href="#/journals/luna" data-write>Write an entry</a>
      </header>

      <div class="grid">
        ${remaining ? `
        <section class="card span-3" aria-labelledby="setup-title">
          <div class="card-head">
            <h2 id="setup-title">Getting started</h2>
            <span class="pill pill--todo">${remaining} step${remaining === 1 ? '' : 's'} left</span>
          </div>
          <ul class="checklist">
            ${steps.map((s) => `
              <li>
                <span class="step-dot ${s.done ? 'done' : ''}" aria-hidden="true"></span>
                <div><strong>${esc(s.title)}</strong><p class="detail">${esc(s.detail)}</p></div>
                ${s.done ? '<span class="pill pill--ok">Done</span>' : `<a class="pill pill--quiet" href="${s.href}">Set up</a>`}
              </li>`).join('')}
          </ul>
        </section>` : ''}

        ${card({
          id: 'noticed-title',
          title: 'Luna noticed',
          cls: 'card--moon span-2',
          body: `
            <div class="empty empty--with-mascot">
              ${bunny({ mood: 'resting' })}
              <div>
                <strong>${entries.length ? 'Not enough to go on yet.' : 'Nothing yet — Luna hasn’t read any entries.'}</strong>
                <p>Patterns across several entries will show up here, each with the entries that support it, so you can check Luna’s reasoning yourself. For now, open any entry and choose <em>Reflect with Luna</em>.</p>
              </div>
            </div>`,
        })}

        ${card({
          id: 'overview-title',
          title: 'Overview',
          body: entries.length ? `
            <dl class="stats">
              <div><dt>Entries</dt><dd>${entries.length}</dd></div>
              <div><dt>This month</dt><dd>${thisMonth}</dd></div>
              <div><dt>Day streak</dt><dd>${streak}</dd></div>
            </dl>
            <p class="card-sub stats-note">${sources.luna.count} in Luna${sources.notion.databaseSelected ? ` · ${sources.notion.count} from Notion` : ''}</p>
            ${sources.notion.error ? `<p class="result result--err">Notion: ${esc(sources.notion.error)}</p>` : ''}`
            : '<div class="empty"><strong>No entries yet</strong><p>Counts appear once you’ve written something.</p></div>',
        })}

        ${card({
          id: 'themes-title',
          title: 'Recurring themes',
          sub: 'from your own words',
          body: themes.length ? `
            <ul class="theme-list">
              ${themes.map((t, i) => `
                <li>
                  <details>
                    <summary><span class="tag">${esc(t.theme)}</span><span class="card-sub">${t.entries.length} entries</span></summary>
                    <ul class="receipts" aria-label="Entries mentioning ${esc(t.theme)}">
                      ${t.entries.map((e) => `<li><a href="${entryHref(e.key)}">${esc(e.title)}</a> <span class="card-sub">${esc(formatDate(e.date))}</span></li>`).join('')}
                    </ul>
                  </details>
                </li>`).join('')}
            </ul>`
            : '<div class="empty"><p>Themes that come up in two or more reflected entries appear here, with the entries behind each one.</p></div>',
        })}

        ${card({
          id: 'trends-title',
          title: 'Journal language trends',
          sub: 'not a score',
          body: '<div class="empty"><p>How the words in your entries shift over time. Luna describes language — it doesn’t rate how you’re doing.</p></div>',
        })}

        ${card({
          id: 'recent-title',
          title: 'Recent entries',
          body: entries.length ? `
            <ul class="recent">
              ${entries.slice(0, 5).map((e) => `
                <li><a href="${entryHref(e.key)}">${esc(e.title)}</a><span class="card-sub">${esc(formatDate(e.date))} · ${e.source === 'notion' ? 'Notion' : 'Luna'}</span></li>`).join('')}
            </ul>`
            : '<div class="empty"><p>Your latest entries will show up here.</p></div>',
        })}

        <div class="span-3">${supportPanel()}</div>
      </div>
    </div>`;

  el.querySelector('[data-write]').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const entry = await api.createEntry();
      location.hash = `#/journals/luna/${entry.id}`;
    } catch {
      location.hash = '#/journals/luna';
    }
  });
  hydrateSupportPanel(el);
}
