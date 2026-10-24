import { api, esc } from './api.js';

// "10.10.2026" — the date style from the mockup, for untitled pages.
const dotted = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}.${d}.${y}`;
};

// Fills the parts of the sidebar that depend on data: the model card and the
// saved journals list. Called after every route change.
export async function refreshSidebar(status) {
  const model = document.querySelector('[data-model-name]');
  if (model) model.textContent = status.ai.configured ? status.ai.model : 'not set up yet';

  const list = document.querySelector('[data-saved-journals]');
  if (!list) return;
  try {
    const { entries } = await api.entries();
    const luna = entries.filter((e) => e.source === 'luna').slice(0, 8);
    list.innerHTML = luna.length
      ? luna.map((e) => `
          <li><a href="#/journals/luna/${esc(e.id)}" title="${esc(e.title)}">${e.icon ? `${esc(e.icon)} ` : ''}${esc(e.title === 'Untitled' ? dotted(e.date) : e.title)}</a></li>`).join('')
      : '<li class="saved-empty">nothing yet</li>';
    const current = location.hash.match(/^#\/journals\/luna\/([\w-]+)/)?.[1];
    list.querySelectorAll('a').forEach((a) => {
      if (current && a.getAttribute('href').endsWith(current)) a.setAttribute('aria-current', 'page');
    });
  } catch {
    list.innerHTML = '<li class="saved-empty">couldn’t load</li>';
  }
}
