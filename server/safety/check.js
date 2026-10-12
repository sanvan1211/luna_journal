// Runs before any reflection. Two layers: a deterministic phrase screen that
// works even if the model is down or misses something, and the model's own
// read. The higher of the two wins. Results are never stored or logged.
// The phrases are explicit enough that a match counts as "clear": Luna steps
// aside entirely instead of reflecting on that entry.

import { complete } from '../ai/index.js';
import { SAFETY_CHECK, entryBlock } from '../ai/prompts.js';

const PHRASES = [
  /\bkill(?:ing)? my ?self\b/i,
  /\bsuicid/i,
  /\bend (?:it all|my life)\b/i,
  /\bwant(?:ed)? to die\b/i,
  /\bself[- ]?harm/i,
  /\b(?:cut|cutting|hurt|hurting) my ?self\b/i,
  /\bno reason to (?:live|keep going)\b/i,
  /\bbetter off without me\b/i,
  /\b(?:don'?t|do not) want to (?:be here|exist|live|wake up)\b/i,
];

const LEVELS = ['none', 'possible', 'clear'];

export function phraseScreen(text) {
  return PHRASES.some((re) => re.test(text)) ? 'clear' : 'none';
}

export async function checkSafety(entry) {
  const screened = phraseScreen(`${entry.title}\n${entry.content}`);
  let modelLevel = 'none';
  try {
    const { json } = await complete({
      system: SAFETY_CHECK,
      messages: [{ role: 'user', content: entryBlock(entry) }],
      maxTokens: 200,
      json: true,
    });
    if (LEVELS.includes(json?.concern_level)) modelLevel = json.concern_level;
  } catch {
    // If the model can't answer, fall back on the phrase screen alone.
  }
  return LEVELS[Math.max(LEVELS.indexOf(screened), LEVELS.indexOf(modelLevel))];
}
