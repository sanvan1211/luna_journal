import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fake Ollama that records what it was sent and replies with scripted JSON.
let reply = {};
let lastPrompt = '';
let calls = 0;
const fake = http.createServer(async (req, res) => {
  calls++;
  let body = '';
  for await (const chunk of req) body += chunk;
  lastPrompt = JSON.parse(body).messages.at(-1).content;
  res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ message: { content: JSON.stringify(reply) } }));
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));

const dir = await mkdtemp(join(tmpdir(), 'luna-ask-'));
Object.assign(process.env, {
  LUNA_DATA_DIR: dir, AI_PROVIDER: 'ollama', AI_MODEL: 'test', OLLAMA_URL: `http://127.0.0.1:${fake.address().port}`,
});
const journal = await import('../server/journal/index.js');
const { ask, stripEntryIds } = await import('../server/ask/index.js');
const { dateRange, keywords } = await import('../server/ask/retrieve.js');
after(async () => { await new Promise((r) => fake.close(r)); await rm(dir, { recursive: true, force: true }); });

const page = (title, date, text) =>
  journal.createEntry({ title, date, blocks: [{ type: 'paragraph', rich: [{ t: text }] }] });

const stressed = await page('Exam week', '2026-10-08', 'So stressed about the chem exam. Barely slept.');
const sleepy = await page('Tired', '2026-10-09', 'Slept four hours again, stress is getting to me.');
await page('Beach day', '2026-07-04', 'Fireworks with my cousins. Great day.');

test('date phrases become ranges', () => {
  const now = new Date(2026, 9, 12); // Oct 12, 2026
  assert.deepEqual(dateRange('how was this week?', now), { from: '2026-10-06', to: '2026-10-12', label: 'the past week' });
  assert.equal(dateRange('what happened in july', now).from, '2026-07-01');
  assert.equal(dateRange('anything in december?', now).from, '2025-12-01');
  assert.equal(dateRange('what do I write about', now), null);
});

test('keywords drop filler words', () => {
  assert.deepEqual(keywords('What have I been stressed about lately?'), ['stressed']);
});

test('answers come only from relevant entries, with checked citations', async () => {
  reply = { answer: 'Your entries mention stress about a chem exam and short sleep.', cited_entry_ids: ['E1', 'E2', 'E9'], safety_flag: false };
  const chat = await ask({ question: 'What have I been stressed about?' });
  const luna = chat.messages[1];
  assert.equal(luna.kind, 'answer');
  // E9 was never given to the model, so it's dropped.
  assert.deepEqual(luna.citations.map((c) => c.id).sort(), [stressed.id, sleepy.id].sort());
  assert.ok(lastPrompt.includes('chem exam'));
  assert.ok(!lastPrompt.includes('Fireworks'), 'unrelated entries are not sent');
  assert.equal(chat.title, 'What have I been stressed about?');
});

test('no matching entries: honest answer and no AI call', async () => {
  calls = 0;
  const chat = await ask({ question: 'What did I say about basketball?' });
  assert.equal(chat.messages[1].kind, 'no_entries');
  assert.match(chat.messages[1].text, /basketball/);
  assert.equal(calls, 0);
});

test('crisis language gets the support message, never an AI answer', async () => {
  calls = 0;
  const chat = await ask({ question: 'I want to die' });
  assert.equal(chat.messages[1].kind, 'support');
  assert.equal(calls, 0);
});

test('follow-ups stay in the same chat', async () => {
  reply = { answer: 'Mostly in Exam week.', cited_entry_ids: ['E1'], safety_flag: false };
  const first = await ask({ question: 'When did I mention the exam?' });
  const second = await ask({ chatId: first.id, question: 'Show me the exam entry' });
  assert.equal(second.messages.length, 4);
});

test('empty or huge questions are refused', async () => {
  await assert.rejects(ask({ question: '  ' }), /Ask a question/);
  await assert.rejects(ask({ question: 'x'.repeat(501) }), /limited to 500/);
});

test('internal entry labels never reach the user', () => {
  assert.equal(
    stripEntryIds("You've been stressed about your exam, with mentions of not sleeping in entries E1 and E5. You also talked about school (E2)."),
    "You've been stressed about your exam, with mentions of not sleeping. You also talked about school.",
  );
  assert.equal(stripEntryIds('See entry E3, it was a good day.'), 'It was a good day.');
  assert.equal(stripEntryIds('Nothing to strip here.'), 'Nothing to strip here.');
});
