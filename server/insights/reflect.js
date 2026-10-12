// Single-entry reflection: safety check first, then a short structured
// reflection. Only that one entry is sent to the model.

import { complete, AIProviderError } from '../ai/index.js';
import { HttpError } from '../errors.js';
import { REFLECT_ENTRY, entryBlock } from '../ai/prompts.js';
import { checkSafety } from '../safety/check.js';
import { clearCollection, deleteRecord, listRecords, readRecord, writeRecord } from '../store.js';

const COLLECTION = 'reflections';

// Fixed wording, not model-generated: when someone may be unsafe, Luna
// steps aside and points to people, it doesn't try to be the support.
export const SUPPORT_MESSAGE =
  'Some of what you wrote sounds really heavy. Luna isn’t the right kind of help for this — but people are, and you don’t have to carry it alone.';

const recordId = (entry) => `${entry.source}-${entry.id}`.toLowerCase();

function validate(json) {
  const summary = typeof json?.summary === 'string' ? json.summary.trim() : '';
  const question = typeof json?.reflection_question === 'string' ? json.reflection_question.trim() : '';
  const themes = Array.isArray(json?.themes)
    ? [...new Set(json.themes
      .filter((t) => typeof t === 'string')
      .map((t) => t.trim().toLowerCase().replace(/[.!]+$/, ''))
      .filter((t) => t && t.length <= 40))].slice(0, 3)
    : [];
  if (!summary) throw new AIProviderError('reflect', 'the model’s reflection was incomplete — try again');
  return { summary: summary.slice(0, 600), themes, reflectionQuestion: question.slice(0, 300) || null, safetyFlag: json.safety_flag === true };
}

export async function getReflection(entry) {
  return readRecord(COLLECTION, recordId(entry));
}

// Entries currently being reflected on, so a double-click doesn't pay for
// two identical AI calls.
const inFlight = new Set();

export async function reflectOnEntry(entry) {
  if (inFlight.has(entry.key)) {
    throw new HttpError(429, 'Luna is already reading this entry.', 'reflection_in_progress');
  }
  inFlight.add(entry.key);
  try {
    return await reflect(entry);
  } finally {
    inFlight.delete(entry.key);
  }
}

async function reflect(entry) {
  if (!entry.content.trim()) {
    return { status: 'empty', message: 'Write something first — Luna can only reflect on what’s there.' };
  }

  const level = await checkSafety(entry);
  if (level === 'clear') return { status: 'support', message: SUPPORT_MESSAGE };

  const { json, provider, model } = await complete({
    system: REFLECT_ENTRY,
    messages: [{ role: 'user', content: entryBlock(entry) }],
    maxTokens: 600,
    json: true,
  });
  const r = validate(json);
  if (r.safetyFlag && level === 'none') return { status: 'support', message: SUPPORT_MESSAGE };

  const reflection = {
    entryKey: entry.key,
    entryTitle: entry.title,
    entryDate: entry.date,
    entryUpdatedAt: entry.updatedAt,
    summary: r.summary,
    themes: r.themes,
    reflectionQuestion: r.reflectionQuestion,
    createdAt: new Date().toISOString(),
    provider,
    model,
  };
  await writeRecord(COLLECTION, recordId(entry), reflection);
  // "possible" still gets the reflection, plus a gentle pointer to people.
  return { status: 'ok', reflection, showSupport: level === 'possible' };
}

export const listReflections = () => listRecords(COLLECTION);
export const deleteReflection = (entry) => deleteRecord(COLLECTION, recordId(entry));
export const deleteAllReflections = () => clearCollection(COLLECTION);
