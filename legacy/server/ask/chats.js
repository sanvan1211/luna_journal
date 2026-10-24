// Saved Ask Luna conversations: one JSON file per chat in data/chats/.
// They contain your questions and Luna's answers (with links to the entries
// cited), never copies of the entries themselves. Deletable any time.

import { randomUUID } from 'node:crypto';
import { notFound } from '../errors.js';
import { clearCollection, deleteRecord, isSafeId, listRecords, readRecord, writeRecord } from '../store.js';

const COLLECTION = 'chats';

export async function listChats() {
  return (await listRecords(COLLECTION))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, createdAt, updatedAt, messages }) => ({ id, title, createdAt, updatedAt, count: messages.length }));
}

export async function getChat(id) {
  const chat = isSafeId(id) ? await readRecord(COLLECTION, id) : null;
  if (!chat) throw notFound('That chat');
  return chat;
}

export async function saveChat(chat) {
  chat.updatedAt = new Date().toISOString();
  return writeRecord(COLLECTION, chat.id, chat);
}

export function newChat(firstQuestion) {
  const title = firstQuestion.replace(/\s+/g, ' ').trim();
  const now = new Date().toISOString();
  return { id: randomUUID(), title: title.length > 60 ? `${title.slice(0, 59)}…` : title, createdAt: now, updatedAt: now, messages: [] };
}

export const deleteChat = (id) => (isSafeId(id) ? deleteRecord(COLLECTION, id) : undefined);
export const deleteAllChats = () => clearCollection(COLLECTION);
