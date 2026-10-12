import { api, esc, formatDate } from './api.js';
import { bunny } from './mascot.js';
import { supportPanel, hydrateSupportPanel } from './support.js';

// "Reflect with Luna" card for a single entry. `beforeReflect` lets the editor
// save pending changes so Luna reads the latest text.
export function mountReflection(root, { source, id, aiConfigured, beforeReflect }) {
  root.innerHTML = `
    <section class="card reflection" aria-labelledby="reflection-title">
      <div class="card-head">
        <h2 id="reflection-title">Luna’s reflection</h2>
        <button class="btn btn--primary btn--sm" type="button" data-reflect ${aiConfigured ? '' : 'disabled'}>Reflect with Luna</button>
      </div>
      <div data-reflection-body aria-live="polite"></div>
    </section>`;

  const body = root.querySelector('[data-reflection-body]');
  const btn = root.querySelector('[data-reflect]');

  const intro = () => {
    body.innerHTML = aiConfigured
      ? `<p class="card-text">Luna can read this entry and offer a short summary, a few themes, and a question you could write about next. Only this one entry is sent to the AI.</p>`
      : `<p class="card-text">The AI provider isn’t set up yet, so Luna can’t reflect. <a href="#/settings">See setup</a>.</p>`;
  };

  const show = (result) => {
    if (result.status === 'support') {
      btn.hidden = true;
      body.innerHTML = `
        <p class="support-message">${esc(result.message)}</p>
        ${supportPanel({ open: true, title: 'People you can reach right now' })}`;
      hydrateSupportPanel(body);
      return;
    }
    if (result.status === 'empty') {
      body.innerHTML = `<p class="card-text">${esc(result.message)}</p>`;
      return;
    }
    const r = result.reflection;
    btn.textContent = 'Reflect again';
    body.innerHTML = `
      ${result.stale ? '<p class="note">You’ve edited this entry since Luna last read it.</p>' : ''}
      <p class="reflection-summary">${esc(r.summary)}</p>
      ${r.themes.length ? `<ul class="tags" aria-label="Themes">${r.themes.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>` : ''}
      ${r.reflectionQuestion ? `
        <div class="prompt-q">
          <p class="eyebrow">Something to write about</p>
          <p>${esc(r.reflectionQuestion)}</p>
        </div>` : ''}
      <p class="receipt">Based only on this entry · ${esc(formatDate(r.createdAt.slice(0, 10)))} · ${esc(r.provider)} / ${esc(r.model)}</p>
      ${result.showSupport ? `<div class="reflection-support">${supportPanel({ title: 'If any of this feels heavy, people can help' })}</div>` : ''}`;
    if (result.showSupport) hydrateSupportPanel(body);
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    body.innerHTML = `<div class="reflecting">${bunny({ bob: true })}<p>Luna is reading this entry…</p></div>`;
    try {
      await beforeReflect?.();
      show(await api.reflect(source, id));
    } catch (err) {
      body.innerHTML = `<p class="result result--err">${esc(err.message)}</p>`;
    } finally {
      btn.disabled = !aiConfigured;
    }
  });

  intro();
  api.reflection(source, id)
    .then((res) => { if (res.reflection) show({ status: 'ok', reflection: res.reflection, stale: res.stale }); })
    .catch(() => { /* no saved reflection is fine */ });
}
