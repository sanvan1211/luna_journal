import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the store at a throwaway folder before the journal module loads.
const dir = await mkdtemp(join(tmpdir(), 'luna-test-'));
process.env.LUNA_DATA_DIR = dir;
const journal = await import('../server/journal/index.js');
after(() => rm(dir, { recursive: true, force: true }));

test('a new entry from a template has its structure, icon, and today’s date', async () => {
  const e = await journal.createEntry({ templateId: 'daily' });
  assert.equal(e.icon, '🌙');
  assert.equal(e.blocks[0].type, 'heading_2');
  assert.equal(e.blocks.at(-1).type, 'to_do');
  assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(e.version, 1);
});

test('updates bump the version and reject stale writes', async () => {
  const e = await journal.createEntry();
  const saved = await journal.updateEntry(e.id, { title: 'First', baseVersion: 1 });
  assert.equal(saved.version, 2);
  await assert.rejects(
    journal.updateEntry(e.id, { title: 'Stale tab', baseVersion: 1 }),
    (err) => err.status === 409 && err.current.title === 'First',
  );
});

test('tags are trimmed and de-duplicated case-insensitively', async () => {
  const e = await journal.createEntry({ tags: [' School ', 'school', 'sleep', ''] });
  assert.deepEqual(e.tags, ['School', 'sleep']);
});

test('icons must be emoji', async () => {
  await assert.rejects(journal.createEntry({ icon: '<b>' }), /single emoji/);
  const e = await journal.createEntry({ icon: '🌱' });
  assert.equal(e.icon, '🌱');
});

test('search matches title, tags and body, with a snippet', async () => {
  const e = await journal.createEntry({
    title: 'Practice day',
    tags: ['soccer'],
    blocks: [{ type: 'paragraph', rich: [{ t: 'Coach moved practice to Thursday evening.' }] }],
  });
  const byBody = await journal.searchEntries('thursday');
  assert.ok(byBody.some((r) => r.entry.id === e.id && r.snippet.match.toLowerCase() === 'thursday'));
  const byTag = await journal.searchEntries('', { tag: 'SOCCER' });
  assert.deepEqual(byTag.map((r) => r.entry.id), [e.id]);
  assert.equal((await journal.searchEntries('thursday nonexistentword')).length, 0);
});

test('trash, restore, and permanent delete', async () => {
  const e = await journal.createEntry({ title: 'Temporary' });
  await journal.trashEntry(e.id);
  assert.ok(!(await journal.listEntries()).some((x) => x.id === e.id));
  assert.ok((await journal.listTrash()).some((x) => x.id === e.id));
  await assert.rejects(journal.getEntry(e.id), /wasn’t found/);

  await journal.restoreEntry(e.id);
  assert.equal((await journal.getEntry(e.id)).title, 'Temporary');

  await assert.rejects(journal.purgeEntry(e.id), /trash first/);
  await journal.trashEntry(e.id);
  await journal.purgeEntry(e.id);
  await assert.rejects(journal.restoreEntry(e.id), /wasn’t found/);
});

test('old markdown entries are converted to blocks on read', async () => {
  await mkdir(join(dir, 'journal'), { recursive: true });
  const id = '00000000-0000-4000-8000-000000000001';
  await writeFile(join(dir, 'journal', `${id}.json`), JSON.stringify({
    id, title: 'Old', content: '## Hi\n- [x] done', mood: 'okay', date: '2026-10-01',
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  }));
  const e = await journal.getEntry(id);
  assert.deepEqual(e.blocks.map((b) => b.type), ['heading_2', 'to_do']);
  assert.equal(e.content, '## Hi\n- [x] done');
  assert.deepEqual(e.tags, []);
});

test('tag list counts only live entries', async () => {
  const tags = await journal.listTags();
  const school = tags.find((t) => t.tag === 'School');
  assert.equal(school.count, 1);
});

test('a damaged file is skipped instead of breaking the whole list', async () => {
  await writeFile(join(dir, 'journal', '00000000-0000-4000-8000-0000000000ff.json'), '{ not json');
  const list = await journal.listEntries();
  assert.ok(list.length > 0);
  assert.ok(!list.some((e) => e.id.endsWith('ff')));
});

test('very long search queries are refused', async () => {
  await assert.rejects(journal.searchEntries('x'.repeat(201)), /limited to 200/);
});
