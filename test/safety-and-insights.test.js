import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseScreen } from '../server/safety/check.js';
import { recurringThemes } from '../server/insights/themes.js';
import { blockToMarkdown } from '../server/notion/index.js';

test('phrase screen catches explicit crisis language', () => {
  for (const text of ['I want to die', 'thinking about suicide', 'I don’t want to wake up', 'maybe I should hurt myself']) {
    assert.equal(phraseScreen(text.replace('’', "'")), 'clear', text);
  }
});

test('phrase screen leaves ordinary hard days alone', () => {
  for (const text of ['this test is killing me', 'I died laughing', 'practice was brutal', 'I feel drained']) {
    assert.equal(phraseScreen(text), 'none', text);
  }
});

test('recurring themes need two different entries and keep their receipts', () => {
  const r = (key, date, themes) => ({ entryKey: key, entryTitle: key, entryDate: date, themes });
  const themes = recurringThemes([
    r('luna:a', '2026-10-01', ['sleep', 'school']),
    r('luna:b', '2026-10-03', ['sleep']),
    r('luna:c', '2026-10-02', ['friends']),
  ]);
  assert.deepEqual(themes.map((t) => t.theme), ['sleep']);
  assert.deepEqual(themes[0].entries.map((e) => e.key), ['luna:b', 'luna:a']);
});

test('notion blocks map to markdown; unsupported blocks are skipped', () => {
  const rt = (t) => [{ plain_text: t }];
  assert.equal(blockToMarkdown({ type: 'to_do', to_do: { rich_text: rt('x'), checked: true } }), '- [x] x');
  assert.equal(blockToMarkdown({ type: 'heading_2', heading_2: { rich_text: rt('Hi') } }), '## Hi');
  assert.equal(blockToMarkdown({ type: 'image', image: {} }), null);
});
