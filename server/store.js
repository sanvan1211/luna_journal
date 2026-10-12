// Tiny JSON-file store under data/ (gitignored). Each record is one file so
// deleting something really deletes it — no hidden copies in a big blob.

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// Record ids become filenames, so only allow a safe alphabet.
const SAFE_ID = /^[a-z0-9-]{1,80}$/;
export const isSafeId = (id) => typeof id === 'string' && SAFE_ID.test(id);

function pathFor(collection, id) {
  if (!isSafeId(id)) throw new Error('unsafe record id');
  return join(DATA_DIR, collection, `${id}.json`);
}

export async function readRecord(collection, id) {
  try {
    return JSON.parse(await readFile(pathFor(collection, id), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeRecord(collection, id, value) {
  const file = pathFor(collection, id);
  await mkdir(join(DATA_DIR, collection), { recursive: true });
  // Write-then-rename so a crash never leaves a half-written file.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(tmp, file);
  return value;
}

export async function deleteRecord(collection, id) {
  await rm(pathFor(collection, id), { force: true });
}

export async function listRecords(collection) {
  let names;
  try {
    names = await readdir(join(DATA_DIR, collection));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const ids = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter(isSafeId);
  const records = await Promise.all(ids.map((id) => readRecord(collection, id)));
  return records.filter(Boolean);
}

export async function clearCollection(collection) {
  await rm(join(DATA_DIR, collection), { recursive: true, force: true });
}
