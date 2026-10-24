import { esc, formatDate } from '../api.js';

// Entry sidebar shared by the Luna journal and the Notion source.

function groupByMonth(entries) {
  const groups = new Map();
  for (const e of entries) {
    const label = formatDate(e.date, { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(e);
  }
  return groups;
}

export function entryLink(e, activeId) {
  return `
    <a class="entry-link" href="#/journals/${e.source}/${esc(e.id)}" data-entry-id="${esc(e.id)}" data-search-title="${esc(e.title.toLowerCase())}" ${e.id === activeId ? 'aria-current="page"' : ''}>
      <span class="entry-title">${e.icon ? `<span class="entry-icon" aria-hidden="true">${esc(e.icon)}</span>` : ''}<span data-title-text>${esc(e.title)}</span></span>
      <span class="entry-date">${esc(formatDate(e.date))}${e.mood ? ` · ${esc(e.mood)}` : ''}</span>
    </a>`;
}

export function entryLinks(entries, activeId, emptyText) {
  if (!entries.length) return `<p class="list-note">${emptyText}</p>`;
  return [...groupByMonth(entries)].map(([month, items]) => `
    <div class="month">
      <p class="month-label">${esc(month)}</p>
      <ul>${items.map((e) => `<li>${entryLink(e, activeId)}</li>`).join('')}</ul>
    </div>`).join('');
}

// Title-only filtering, for sources without server search (Notion).
export function wireTitleFilter(root) {
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
