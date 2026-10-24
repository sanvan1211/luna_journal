import { supportPanel, hydrateSupportPanel } from '../support.js';

export async function render(el) {
  el.innerHTML = `
    <div class="resources">
      <header class="page-head">
        <div>
          <h1>resources</h1>
          <p class="lede">Luna is a place to start, not a replacement for people. These are real, free, confidential ways to talk to someone — any time, about anything.</p>
        </div>
      </header>
      ${supportPanel({ open: true, title: 'Talk to someone' })}
    </div>`;
  await hydrateSupportPanel(el);
}
