import { api, esc } from './api.js';
import { bunny } from './mascot.js';
import { wireThemeToggles, initTheme } from './theme.js';
import * as dashboard from './views/dashboard.js';
import * as journals from './views/journals.js';
import * as ask from './views/ask.js';
import * as settings from './views/settings.js';
import * as home from './views/home.js';
import * as checkin from './views/checkin.js';
import * as resources from './views/resources.js';
import { refreshSidebar } from './sidebar.js';

const views = { home, dashboard, journals, ask, settings, checkin, resources };
const titles = {
  home: 'Home', dashboard: 'Insights', journals: 'Journal', ask: 'Chat with Luna',
  settings: 'Account & privacy', checkin: 'Wellness check', resources: 'Resources',
};

const viewEl = document.getElementById('view');
const mainEl = document.getElementById('main');
let renderToken = 0;
let cleanup = null;

// "#/journals/luna/abc" → { name: 'journals', params: ['luna', 'abc'] }
function currentRoute() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (name === 'new') return { name: 'new', params };
  return views[name] ? { name, params } : { name: 'home', params: [] };
}

async function render() {
  const { name, params } = currentRoute();
  const token = ++renderToken;

  // Let the previous view flush anything pending (e.g. an unsaved edit).
  if (cleanup) {
    try { cleanup(); } catch { /* best effort */ }
    cleanup = null;
  }

  // "new journal" isn't a page: make one and open it.
  if (name === 'new') {
    try {
      const entry = await api.createEntry();
      location.replace(`#/journals/luna/${entry.id}`);
    } catch (err) {
      viewEl.innerHTML = `<div class="loading">${bunny({ mood: 'resting' })}<p><strong>${esc(err.message)}</strong></p></div>`;
    }
    return;
  }

  const navKey = name === 'ask' && params[0] === 'search' ? 'search' : name;
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === navKey) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${titles[name]} · luna`;
  mainEl.classList.toggle('is-scene', name === 'home');

  // Only show the loading bunny if things are actually slow.
  const loadingTimer = setTimeout(() => {
    if (token === renderToken) viewEl.innerHTML = `<div class="loading">${bunny({ bob: true })}<p>Getting things ready…</p></div>`;
  }, 200);

  let status;
  try {
    status = await api.status();
  } catch (err) {
    clearTimeout(loadingTimer);
    if (token !== renderToken) return;
    viewEl.innerHTML = `
      <div class="loading fade-in">
        ${bunny({ mood: 'resting' })}
        <p><strong>${esc(err.message)}</strong></p>
        <p>Start it with <code>npm start</code>, then <a href="">reload</a>.</p>
      </div>`;
    return;
  }

  refreshSidebar(status);
  const ctx = { status, params, isCurrent: () => token === renderToken };
  const fresh = document.createElement('div');
  try {
    const result = await views[name].render(fresh, ctx);
    clearTimeout(loadingTimer);
    if (token !== renderToken) return;
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    clearTimeout(loadingTimer);
    if (token !== renderToken) return;
    fresh.innerHTML = `
      <div class="loading">
        ${bunny({ mood: 'resting' })}
        <p><strong>${esc(err.message || 'Something went wrong.')}</strong></p>
        <p><a href="">Try again</a></p>
      </div>`;
  }
  fresh.classList.add('fade-in');
  viewEl.replaceChildren(fresh);
  wireThemeToggles(fresh);
  window.dispatchEvent(new Event('luna:rendered'));
}

let lastView = currentRoute().name;
window.addEventListener('hashchange', () => {
  const { name } = currentRoute();
  const changedView = name !== lastView;
  lastView = name;
  render();
  if (changedView) {
    mainEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
});

// ⌘K / Ctrl+K: quick find, like Notion. Jumps to the journal and focuses search.
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
  e.preventDefault();
  const focusSearch = () => document.querySelector('[data-search]')?.focus();
  if (currentRoute().name === 'journals' && document.querySelector('[data-search]')) focusSearch();
  else {
    location.hash = '#/journals/luna';
    window.addEventListener('luna:rendered', focusSearch, { once: true });
  }
});

// Flush unsaved edits if the tab is closed.
window.addEventListener('pagehide', () => cleanup?.());

initTheme();
wireThemeToggles();
if (!location.hash) history.replaceState(null, '', '#/home');
render();
