// Ask Luna: answer a question from the user's own entries, with receipts.
//
// 1. A safety screen runs on the question first.
// 2. Retrieval picks at most a handful of relevant entries (see retrieve.js).
// 3. Only those entries — trimmed — go to the model, labelled E1…En.
// 4. The model's citations are checked against what it was actually given.

import { complete, AIProviderError } from '../ai/index.js';
import { ASK_LUNA } from '../ai/prompts.js';
import { badRequest } from '../errors.js';
import { phraseScreen } from '../safety/check.js';
import { SUPPORT_MESSAGE } from '../insights/reflect.js';
import { retrieve } from './retrieve.js';
import { getChat, newChat, saveChat } from './chats.js';

const MAX_QUESTION = 500;
const ENTRY_CHARS = 1500;
const HISTORY_TURNS = 4;

function entriesBlock(entries) {
  return entries.map((e, i) => {
    const text = e.content.length > ENTRY_CHARS ? `${e.content.slice(0, ENTRY_CHARS)}\n[…truncated]` : e.content;
    return `<entry id="E${i + 1}" date="${e.date}" title="${e.title.replace(/"/g, "'")}">\n${text}\n</entry>`;
  }).join('\n\n');
}

const cite = (e) => ({ key: e.key, source: e.source, id: e.id, title: e.title, date: e.date });

async function answer(question, history) {
  if (phraseScreen(question) === 'clear') return { kind: 'support', text: SUPPORT_MESSAGE, citations: [] };

  const { entries, range, words } = await retrieve(question);
  if (!entries.length) {
    // Nothing to go on: say so without calling the model at all.
    const where = range ? ` from ${range.label}` : words.length ? ` that mention ${words.slice(0, 3).map((w) => `“${w}”`).join(', ')}` : '';
    return {
      kind: 'no_entries',
      text: `I couldn’t find any entries${where}. I can only answer from what you’ve written — try different words, or a different time period.`,
      citations: [],
    };
  }

  const past = history.slice(-HISTORY_TURNS * 2).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.role === 'user' ? m.text : JSON.stringify({ answer: m.text }),
  }));
  const { json, provider, model } = await complete({
    system: ASK_LUNA,
    messages: [...past, { role: 'user', content: `${entriesBlock(entries)}\n\nQuestion: ${question}` }],
    maxTokens: 700,
    json: true,
  });

  const text = typeof json?.answer === 'string' ? json.answer.trim() : '';
  if (!text) throw new AIProviderError('ask', 'the model’s answer was incomplete — try again');
  if (json.safety_flag === true) return { kind: 'support', text: SUPPORT_MESSAGE, citations: [] };

  const ids = Array.isArray(json.cited_entry_ids) ? json.cited_entry_ids : [];
  const citations = [...new Set(ids)]
    .map((id) => entries[Number(String(id).replace(/^E/i, '')) - 1])
    .filter(Boolean)
    .map(cite);
  return { kind: 'answer', text: text.slice(0, 2000), citations, consulted: entries.map(cite), provider, model };
}

// Asks a question in a new chat (chatId omitted) or an existing one.
export async function ask({ chatId, question }) {
  if (typeof question !== 'string' || !question.trim()) throw badRequest('Ask a question first.');
  const q = question.trim();
  if (q.length > MAX_QUESTION) throw badRequest(`Questions are limited to ${MAX_QUESTION} characters.`);

  const chat = chatId ? await getChat(chatId) : newChat(q);
  const reply = await answer(q, chat.messages);
  const now = new Date().toISOString();
  chat.messages.push({ role: 'user', text: q, at: now }, { role: 'luna', ...reply, at: now });
  await saveChat(chat);
  return chat;
}

