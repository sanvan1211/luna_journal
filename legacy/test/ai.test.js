import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A stand-in for a local Ollama server whose replies each test scripts.
let replies = [];
let calls = 0;
const fake = http.createServer((req, res) => {
  calls++;
  const [status, body] = replies.shift() ?? [500, { error: 'no scripted reply' }];
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));

process.env.AI_PROVIDER = 'ollama';
process.env.AI_MODEL = 'test-model';
process.env.OLLAMA_URL = `http://127.0.0.1:${fake.address().port}`;
const { complete, getAIStatus } = await import('../server/ai/index.js');

before(() => { calls = 0; });
after(() => new Promise((r) => fake.close(r)));

const ok = (content) => [200, { message: { content }, done_reason: 'stop' }];
const ask = (opts = {}) => complete({ system: 's', messages: [{ role: 'user', content: 'u' }], ...opts });

test('configured from the environment, with no secrets in the status', () => {
  assert.deepEqual(getAIStatus(), { configured: true, provider: 'ollama', model: 'test-model', problem: null });
});

test('a busy provider is retried once', async () => {
  calls = 0;
  replies = [[503, { error: 'loading model' }], ok('ready')];
  const r = await ask();
  assert.equal(r.text, 'ready');
  assert.equal(calls, 2);
});

test('it gives up after the second failure', async () => {
  calls = 0;
  replies = [[429, { error: 'slow down' }], [429, { error: 'slow down' }]];
  await assert.rejects(ask(), /429 slow down/);
  assert.equal(calls, 2);
});

test('client errors are not retried', async () => {
  calls = 0;
  replies = [[404, { error: 'model "test-model" not found' }]];
  await assert.rejects(ask(), /404/);
  assert.equal(calls, 1);
});

test('JSON replies are parsed, even inside a code fence', async () => {
  replies = [ok('```json\n{"summary":"hi"}\n```')];
  assert.deepEqual((await ask({ json: true })).json, { summary: 'hi' });
  replies = [ok('not json at all')];
  await assert.rejects(ask({ json: true }), /valid JSON/);
});
