import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteRange, inlineMarkdown, normalizeRich, parseMarkdownLine, richLength, richToHTML, splitRich, toggleMark,
} from '../public/js/editor/richtext.js';

const rich = [{ t: 'Went for a ' }, { t: 'run', b: 1 }, { t: ' today.' }];

test('splitting keeps formatting on both sides', () => {
  const [left, right] = splitRich(rich, 12);
  assert.deepEqual(left, [{ t: 'Went for a ' }, { t: 'r', b: 1 }]);
  assert.deepEqual(right, [{ t: 'un', b: 1 }, { t: ' today.' }]);
  assert.equal(richLength(left) + richLength(right), richLength(rich));
});

test('deleting a range across segments', () => {
  assert.deepEqual(deleteRange(rich, 9, 6), [{ t: 'Went for today.' }]);
});

test('toggling a mark adds it, and toggling again removes it', () => {
  const bolded = toggleMark(rich, 0, 4, 'b');
  assert.deepEqual(bolded[0], { t: 'Went', b: 1 });
  assert.deepEqual(toggleMark(bolded, 0, 4, 'b'), rich);
  // A partly-bold range becomes fully bold first.
  assert.deepEqual(toggleMark(rich, 9, 14, 'b'), [{ t: 'Went for ' }, { t: 'a run', b: 1 }, { t: ' today.' }]);
});

test('normalizing merges neighbours with the same marks and drops empties', () => {
  assert.deepEqual(normalizeRich([{ t: 'a', i: 1 }, { t: '' }, { t: 'b', i: 1 }, { t: 'c' }]), [{ t: 'ab', i: 1 }, { t: 'c' }]);
});

test('HTML output escapes journal text', () => {
  assert.equal(richToHTML([{ t: '<img onerror=x>', b: 1 }]), '<strong>&lt;img onerror=x&gt;</strong>');
});

test('pasted markdown lines become the right blocks', () => {
  assert.deepEqual(parseMarkdownLine('## Plans'), { type: 'heading_2', rich: [{ t: 'Plans' }], indent: 0 });
  assert.deepEqual(parseMarkdownLine('  - [x] done'), { type: 'to_do', rich: [{ t: 'done' }], indent: 1, checked: true });
  assert.equal(parseMarkdownLine('3) third').type, 'numbered_list_item');
  assert.equal(parseMarkdownLine('> said').type, 'quote');
  assert.equal(parseMarkdownLine('---').type, 'divider');
  assert.deepEqual(inlineMarkdown('a **b** `c`'), [{ t: 'a ' }, { t: 'b', b: 1 }, { t: ' ' }, { t: 'c', c: 1 }]);
});
