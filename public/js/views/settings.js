import { api, esc } from '../api.js';

export async function render(el, { status }) {
  const { ai, notion } = status;

  el.innerHTML = `
    <div>
      <header class="page-head">
        <div>
          <h1>account &amp; privacy</h1>
          <p class="lede">What Luna is connected to, and exactly what it does with your writing.</p>
        </div>
      </header>

      <div class="grid">
        <section class="card span-2" aria-labelledby="ai-title">
          <div class="card-head">
            <h2 id="ai-title">AI provider</h2>
            <span class="pill ${ai.configured ? 'pill--ok' : 'pill--todo'}">${ai.configured ? 'Configured' : 'Not configured'}</span>
          </div>
          ${ai.configured
            ? `<p class="card-text">Luna is using <strong>${esc(ai.provider)}</strong> with model <code>${esc(ai.model)}</code>.</p>`
            : `<p class="card-text"><strong>${esc(ai.problem)}.</strong> Add these to <code>.env</code> in the project folder and restart Luna:</p>
               <pre class="env">AI_PROVIDER=anthropic   # or openai, or ollama (runs locally)
AI_MODEL=your-model-name
ANTHROPIC_API_KEY=...   # only the key for the provider you chose</pre>`}
          <div class="card-actions">
            <button class="btn btn--ghost" type="button" data-test-ai ${ai.configured ? '' : 'disabled'}>Test connection</button>
          </div>
          <p class="result" data-test-result role="status"></p>
        </section>

        <section class="card" aria-labelledby="notion-title">
          <div class="card-head">
            <h2 id="notion-title">Notion</h2>
            <span class="pill ${notion.configured ? 'pill--ok' : 'pill--todo'}">${notion.configured ? 'Token found' : 'Not connected'}</span>
          </div>
          <p class="card-text">${!notion.configured
            ? 'Follow the steps on the <a href="#/journals/notion">Journal → Notion</a> tab to connect.'
            : notion.databaseSelected
              ? 'Luna is reading one journal database, read-only.'
              : 'Token found, but no journal database is selected.'}</p>
          ${notion.databaseSelected ? `
          <div class="card-actions">
            <button class="btn btn--ghost" type="button" data-disconnect>Stop reading this database</button>
          </div>` : ''}
          ${notion.configured ? '<p class="card-sub notion-revoke">To revoke access entirely, remove the integration from your journal in Notion, or delete <code>NOTION_TOKEN</code> from <code>.env</code>.</p>' : ''}
          <p class="result" data-notion-result role="status"></p>
        </section>

        <section class="card span-3" aria-labelledby="data-title">
          <div class="card-head"><h2 id="data-title">Your data</h2></div>
          <p class="card-text">Luna saves its reflections and your chats on this computer so you can come back to them. You can download everything, or erase reflections and chats at any time. Your journal pages aren’t touched.</p>
          <div class="card-actions">
            <button class="btn btn--ghost" type="button" data-export-all>Download all my data</button>
            <button class="btn btn--ghost" type="button" data-delete-reflections>Delete all reflections</button>
            <button class="btn btn--ghost" type="button" data-delete-chats>Delete all chats</button>
          </div>
          <p class="result" data-reflections-result role="status"></p>
        </section>

        <section class="card span-3" aria-labelledby="look-title">
          <div class="card-head"><h2 id="look-title">Paper</h2></div>
          <p class="card-text">Night paper is navy; day paper is warm cream. This is remembered in this browser only.</p>
          <div class="card-actions">
            <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false">
              <span class="theme-toggle-dot" aria-hidden="true"></span>
              <span data-theme-label>Day paper</span>
            </button>
          </div>
        </section>

        <section class="card span-3" aria-labelledby="privacy-title">
          <div class="card-head"><h2 id="privacy-title">How Luna handles your journal</h2></div>
          <ul class="plain-list">
            <li>API keys live only on the server, in <code>.env</code>. They’re never sent to this page.</li>
            <li>When you ask for a reflection, only that one entry is sent to the AI — never your whole journal.</li>
            <li>Entries you write in Luna are saved as files on this computer, in the project’s <code>data/</code> folder.</li>
            <li>The server log records which pages were requested and nothing else. Journal text is never logged.</li>
            <li>Notion stays the source of truth. Luna reads from it and never edits it.</li>
            <li>Want nothing to leave your computer? Set <code>AI_PROVIDER=ollama</code> to use a local model.</li>
          </ul>
        </section>
      </div>
    </div>`;

  el.querySelector('[data-disconnect]')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    const out = el.querySelector('[data-notion-result]');
    button.disabled = true;
    try {
      await api.disconnectNotionDatabase();
      out.className = 'result result--ok';
      out.textContent = 'Done. Luna no longer reads that database.';
    } catch (err) {
      out.className = 'result result--err';
      out.textContent = err.message;
      button.disabled = false;
    }
  });

  el.querySelector('[data-export-all]').addEventListener('click', async () => {
    const out = el.querySelector('[data-reflections-result]');
    try {
      const data = await api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `luna-export-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      out.className = 'result result--ok';
      out.textContent = `Downloaded ${data.journal.length} page${data.journal.length === 1 ? '' : 's'} and ${data.reflections.length} reflection${data.reflections.length === 1 ? '' : 's'}.`;
    } catch (err) {
      out.className = 'result result--err';
      out.textContent = err.message;
    }
  });

  el.querySelector('[data-delete-chats]').addEventListener('click', async () => {
    if (!confirm('Delete every saved chat with Luna? Your journal pages stay as they are.')) return;
    const out = el.querySelector('[data-reflections-result]');
    try {
      await api.deleteAllChats();
      out.className = 'result result--ok';
      out.textContent = 'All chats deleted.';
    } catch (err) {
      out.className = 'result result--err';
      out.textContent = err.message;
    }
  });

  el.querySelector('[data-delete-reflections]').addEventListener('click', async () => {
    if (!confirm('Delete every saved reflection? Your journal entries stay as they are.')) return;
    const out = el.querySelector('[data-reflections-result]');
    try {
      await api.deleteAllReflections();
      out.className = 'result result--ok';
      out.textContent = 'All reflections deleted.';
    } catch (err) {
      out.className = 'result result--err';
      out.textContent = err.message;
    }
  });

  const btn = el.querySelector('[data-test-ai]');
  const out = el.querySelector('[data-test-result]');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    out.className = 'result';
    out.textContent = 'Checking…';
    try {
      const r = await api.testAI();
      out.className = 'result result--ok';
      out.textContent = `Connected to ${r.provider} · ${r.model} (${r.latencyMs} ms).`;
    } catch (err) {
      out.className = 'result result--err';
      out.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}
