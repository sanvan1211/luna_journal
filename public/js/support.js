import { api, esc } from './api.js';

/*
 * "Don't pretend to be okay when you're not okay."
 *    — XXXTENTACION, "Let's Pretend We're Numb"
 *
 * Why this panel exists: do not suffer in silence. Luna is a place to start,
 * and the people listed here are where to go next.
 */

// Low-key "Need someone?" panel. Content comes from the server's verified list;
// if that can't load we say so rather than guessing at contact details.
export function supportPanel({ open = false, title = 'Need someone?' } = {}) {
  return `
    <details class="card support" data-support ${open ? 'open' : ''}>
      <summary>
        <div>
          <h2>${esc(title)}</h2>
          <p class="intro">Real people you can talk to, any time.</p>
        </div>
      </summary>
      <div data-support-body><p class="intro">Loading…</p></div>
    </details>`;
}

export async function hydrateSupportPanel(root) {
  await Promise.all([...root.querySelectorAll('[data-support-body]')].map(fill));
}

async function fill(body) {
  try {
    const data = await api.supportResources();
    body.innerHTML = `
      <ul class="resource-list">
        ${data.resources.map((r) => `
          <li>
            <p class="name">${esc(r.name)}</p>
            <p class="desc">${esc(r.description)}</p>
            ${r.contacts.length ? `<p class="contacts">${r.contacts.map((c) => `
              <span>${esc(c.label)}: <a href="${esc(c.href)}" ${c.href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(c.value)}</a></span>`).join('')}
            </p>` : ''}
          </li>`).join('')}
      </ul>
      <p class="urgent"><strong>${esc(data.urgent.title)}:</strong> ${esc(data.urgent.body)}</p>`;
  } catch {
    body.innerHTML = `<p class="urgent"><strong>Couldn’t load the resource list.</strong> If you need to talk to someone now, call or text <a href="tel:988">988</a>.</p>`;
  }
}
