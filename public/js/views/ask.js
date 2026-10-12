import { esc } from '../api.js';
import { bunny } from '../mascot.js';

export async function render(el, { status }) {
  const blocker = !status.ai.configured
    ? `The AI provider isn’t set up yet (${status.ai.problem}).`
    : 'Ask Luna is the next feature being built. For now, open any journal entry and choose “Reflect with Luna”.';

  el.innerHTML = `
    <div>
      <header class="page-head">
        <div>
          <h1>Ask Luna</h1>
          <p class="lede">Ask about your own writing — “What have I been stressed about this month?” Every answer links to the entries it came from.</p>
        </div>
      </header>

      <section class="card chat" aria-label="Conversation">
        <div class="chat-log">
          <div class="empty empty--with-mascot narrow">
            ${bunny({ mood: 'resting' })}
            <div>
              <strong>Not ready yet</strong>
              <p>${esc(blocker)}</p>
            </div>
          </div>
        </div>
        <form class="chat-form">
          <input id="ask-input" type="text" aria-label="Your question" placeholder="Ask about your journal…" disabled>
          <button class="btn btn--primary" type="submit" disabled>Ask</button>
        </form>
      </section>
    </div>`;

  el.querySelector('.chat-form').addEventListener('submit', (e) => e.preventDefault());
}
