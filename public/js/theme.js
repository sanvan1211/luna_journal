// Night paper (navy) ↔ Day paper (cream). Stored per browser.
const COLORS = { night: '#0d1626', day: '#ece3d1' };

export const currentTheme = () => (document.documentElement.dataset.theme === 'day' ? 'day' : 'night');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
  syncToggles();
}

// Matches the browser chrome to the theme theme-init.js already applied.
export const initTheme = () => applyTheme(currentTheme());

export function setTheme(theme) {
  applyTheme(theme);
  try { localStorage.setItem('luna-theme', theme); } catch { /* not saved; still applied */ }
}

export function syncToggles(root = document) {
  const day = currentTheme() === 'day';
  root.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(day));
    const label = btn.querySelector('[data-theme-label]');
    if (label) label.textContent = day ? 'Night paper' : 'Day paper';
  });
}

export function wireThemeToggles(root = document) {
  root.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = 'true';
    btn.addEventListener('click', () => setTheme(currentTheme() === 'day' ? 'night' : 'day'));
  });
  syncToggles(root);
}
