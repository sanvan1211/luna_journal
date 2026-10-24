// User choices made inside the app (as opposed to .env, which holds secrets).
import { config } from './config.js';
import { readRecord, writeRecord } from './store.js';

const COLLECTION = 'settings';
const ID = 'app';

async function load() {
  return (await readRecord(COLLECTION, ID)) ?? {};
}

// The database picked in the app wins over NOTION_DATABASE_ID. Disconnecting
// stores an explicit null so the .env default doesn't silently come back.
export async function getNotionDatabaseId() {
  const s = await load();
  return 'notionDatabaseId' in s ? s.notionDatabaseId : config.notion.databaseId || null;
}

export async function setNotionDatabaseId(id) {
  const s = await load();
  await writeRecord(COLLECTION, ID, { ...s, notionDatabaseId: id });
}
