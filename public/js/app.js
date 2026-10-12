import { api, esc } from './api.js';
import { bunny } from './mascot.js';
import { wireThemeToggles, initTheme } from './theme.js';
import * as dashboard from './views/dashboard.js';
import * as journals from './views/journals.js';
import * as ask from './views/ask.js';
import * as settings from './views/settings.js';

const views = { dashboard, journals, ask, settings };
const titles = { dashboard: 'Dashboard', journals: 'Journal', ask: 'Ask Luna', settings: 'Privacy & setup' };

const viewEl = document.getElementById('view');
const mainEl = document.getElementById('main');
let renderToken = 0;
let cleanup = null;

// "#/journals/luna/abc" → { name: 'journals', params: ['luna', 'abc'] }
function currentRoute() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  return views[name] ? { name, params } : { name: 'dashboard', params: [] };
}

async function render() {
  const { name, params } = currentRoute();
  const token = ++renderToken;

  // Let the previous view flush anything pending (e.g. an unsaved edit).
  if (cleanup) {
    try { cleanup(); } catch { /* best effort */ }
    cleanup = null;
  }

  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${titles[name]} · Luna`;

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
if (!location.hash) history.replaceState(null, '', '#/dashboard');
render();
