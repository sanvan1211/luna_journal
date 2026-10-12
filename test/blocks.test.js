import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blocksToMarkdown, cleanBlocks, countWords, inlineFromMarkdown, markdownToBlocks, plainText,
} from '../server/journal/blocks.js';

test('markdown converts to typed blocks with nesting', () => {
  const blocks = markdownToBlocks([
    '# Monday',
    'Calc test went **better** than expected.',
    '- practice ran late',
    '  - skipped dinner',
    '- [x] email coach',
    '- [ ] history reading',
    '1. first',
    '> barely slept',
    '---',
    '```',
    'const x = 1;',
    '```',
  ].join('\n'));

  assert.deepEqual(blocks.map((b) => b.type), [
    'heading_1', 'paragraph', 'bulleted_list_item', 'bulleted_list_item', 'to_do', 'to_do',
    'numbered_list_item', 'quote', 'divider', 'code',
  ]);
  assert.equal(blocks[3].indent, 1);
  assert.equal(blocks[4].checked, true);
  assert.equal(blocks[5].checked, false);
  assert.deepEqual(blocks[1].rich, [{ t: 'Calc test went ' }, { t: 'better', b: 1 }, { t: ' than expected.' }]);
  assert.equal(plainText(blocks[9].rich), 'const x = 1;');
});

test('blocks round-trip back to the same markdown', () => {
  const md = '## Today\nI felt *okay*.\n- one\n  - nested\n1. a\n2. b\n- [x] done\n> quote\n---\n`code` and ~~gone~~';
  assert.equal(blocksToMarkdown(markdownToBlocks(md)), md);
});

test('numbered lists restart after other blocks', () => {
  const md = blocksToMarkdown(markdownToBlocks('1. a\n1. b\nbreak\n1. c'));
  assert.equal(md, '1. a\n2. b\nbreak\n1. c');
});

test('inline parsing keeps plain asterisks that are not emphasis', () => {
  assert.deepEqual(inlineFromMarkdown('5 * 3 = 15'), [{ t: '5 * 3 = 15' }]);
});

test('cleanBlocks drops unknown fields, fixes ids, clamps indent, merges marks', () => {
  const [a, b] = cleanBlocks([
    { id: 'same', type: 'paragraph', rich: [{ t: 'hi ', b: 1, evil: '<script>' }, { t: 'there', b: true }], indent: 9, onclick: 'x' },
    { id: 'same', type: 'to_do', rich: [{ t: 'x' }], checked: 'yes' },
  ]);
  assert.deepEqual(a, { id: 'same', type: 'paragraph', rich: [{ t: 'hi there', b: 1 }], indent: 4 });
  assert.notEqual(b.id, 'same');
  assert.equal(b.checked, false);
});

test('cleanBlocks rejects unknown block types and oversized entries', () => {
  assert.throws(() => cleanBlocks([{ type: 'iframe' }]), /Unknown block type/);
  const big = Array.from({ length: 6 }, () => ({ type: 'paragraph', rich: [{ t: 'x'.repeat(9000) }] }));
  assert.throws(() => cleanBlocks(big), /too long/);
});

test('word count ignores block structure', () => {
  assert.equal(countWords(markdownToBlocks('# Two words\n- three more here')), 5);
});
