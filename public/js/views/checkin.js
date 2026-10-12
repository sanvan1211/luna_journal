// Wellness check: a few gentle questions, one at a time. No AI — your answers
// stay your words. Save it as a journal page if you want to keep it.

import { api, esc, formatDate, localISODate } from '../api.js';
import { bunny } from '../mascot.js';
import { supportPanel, hydrateSupportPanel } from '../support.js';

const MOODS = ['great', 'good', 'okay', 'low', 'rough'];
const QUESTIONS = [
  { id: 'arriving', text: 'How are you arriving today?', hint: 'Pick one if it fits, and add anything you want.', mood: true },
  { id: 'mind', text: 'What’s taking up the most space in your head right now?' },
  { id: 'body', text: 'What is your body telling you? Sleep, energy, appetite — anything.' },
  { id: 'kind', text: 'What’s one small, kind thing you could do for yourself today?' },
];

export async function render(el) {
  const answers = {};
  let mood = null;
  let step = 0;

  const draw = () => {
    if (step >= QUESTIONS.length) return drawSummary();
    const q = QUESTIONS[step];
    el.innerHTML = `
      <section class="checkin" aria-labelledby="q-title">
        <p class="eyebrow">wellness check · ${step + 1} of ${QUESTIONS.length}</p>
        <div class="checkin-progress" aria-hidden="true">${QUESTIONS.map((_, i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('')}</div>
        <h1 id="q-title">${esc(q.text)}</h1>
        ${q.hint ? `<p class="lede">${esc(q.hint)}</p>` : ''}
        ${q.mood ? `<div class="mood-picker checkin-moods" role="group" aria-label="How you’re arriving">
          ${MOODS.map((m) => `<button type="button" data-mood="${m}" aria-pressed="${mood === m}">${m}</button>`).join('')}
        </div>` : ''}
        <textarea class="checkin-answer" rows="4" placeholder="Write as much or as little as you like…" aria-labelledby="q-title" data-answer>${esc(answers[q.id] ?? '')}</textarea>
        <div class="card-actions">
          ${step > 0 ? '<button class="btn btn--ghost" type="button" data-back>Back</button>' : ''}
          <button class="btn btn--primary" type="button" data-next>${step === QUESTIONS.length - 1 ? 'Finish' : 'Next'}</button>
          <button class="link-btn" type="button" data-skip>Skip</button>
        </div>
        <p class="chat-foot">If any of this feels like too much, <a href="#/resources">people can help</a>.</p>
      </section>`;
    const box = el.querySelector('[data-answer]');
    box.focus();
    const keep = () => { answers[q.id] = box.value.trim(); };
    el.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
      mood = mood === b.dataset.mood ? null : b.dataset.mood;
      el.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mood === mood)));
    }));
    el.querySelector('[data-next]').addEventListener('click', () => { keep(); step++; draw(); });
    el.querySelector('[data-skip]').addEventListener('click', () => { answers[q.id] = ''; step++; draw(); });
    el.querySelector('[data-back]')?.addEventListener('click', () => { keep(); step--; draw(); });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { keep(); step++; draw(); }
    });
  };

  const drawSummary = async () => {
    const said = QUESTIONS.filter((q) => answers[q.id]);
    const text = said.map((q) => answers[q.id]).join('\n');
    const { level } = text ? await api.screen(text).catch(() => ({ level: 'none' })) : { level: 'none' };
    el.innerHTML = `
      <section class="checkin" aria-labelledby="sum-title">
        <p class="eyebrow">wellness check · ${esc(formatDate(localISODate(), { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        <h1 id="sum-title">Thanks for checking in.</h1>
        ${level === 'clear' ? `
          <p class="support-message">Some of what you wrote sounds really heavy. Luna isn’t the right kind of help for this — but people are, and you don’t have to carry it alone.</p>
          ${supportPanel({ open: true, title: 'People you can reach right now' })}` : ''}
        <div class="card checkin-summary">
          <p class="eyebrow">in your words</p>
          ${mood ? `<p><strong>Arriving:</strong> ${esc(mood)}</p>` : ''}
          ${said.length ? said.map((q) => `<p class="sum-q">${esc(q.text)}</p><p>${esc(answers[q.id])}</p>`).join('') : '<p class="card-text">You skipped everything — and that’s okay too.</p>'}
        </div>
        <div class="card-actions">
          <button class="btn btn--primary" type="button" data-save ${said.length || mood ? '' : 'disabled'}>Save as a journal page</button>
          <a class="btn btn--ghost" href="#/home">Done</a>
        </div>
        <p class="result" role="status" data-save-result></p>
      </section>`;
    hydrateSupportPanel(el);
    el.querySelector('[data-save]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const blocks = QUESTIONS.flatMap((q) => [
        { type: 'heading_3', rich: [{ t: q.text }] },
        { type: 'paragraph', rich: answers[q.id] ? [{ t: answers[q.id] }] : [] },
      ]);
      try {
        const entry = await api.createEntry({
          title: `Wellness check · ${formatDate(localISODate(), { month: 'short', day: 'numeric' })}`,
          icon: '🤍',
          mood,
          tags: ['wellness check'],
          blocks,
        });
        location.hash = `#/journals/luna/${entry.id}`;
      } catch (err) {
        el.querySelector('[data-save-result]').textContent = err.message;
      }
    });
  };

  draw();
}
