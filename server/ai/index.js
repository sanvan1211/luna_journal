// The one place the app talks to a language model. Everything else calls
// `complete()` and never knows which provider or model is behind it —
// that's chosen by AI_PROVIDER / AI_MODEL in the environment.

import { config, AI_PROVIDERS } from '../config.js';
import { AIConfigError, AIProviderError } from './errors.js';
import * as anthropic from './providers/anthropic.js';
import * as openai from './providers/openai.js';
import * as ollama from './providers/ollama.js';

const providers = { anthropic, openai, ollama };
const TIMEOUT_MS = 60_000;

export { AIConfigError, AIProviderError };

// Safe to send to the browser: no keys, just what's configured and what's missing.
export function getAIStatus() {
  const { provider, model } = config.ai;
  const status = { configured: false, provider: provider || null, model: model || null, problem: null };

  if (!provider) {
    status.problem = 'AI_PROVIDER is not set';
  } else if (!AI_PROVIDERS.includes(provider)) {
    status.problem = `AI_PROVIDER "${provider}" isn't supported (use ${AI_PROVIDERS.join(', ')})`;
  } else if (!model) {
    status.problem = 'AI_MODEL is not set';
  } else {
    status.problem = providers[provider].missingConfig(config.ai);
  }
  status.configured = !status.problem;
  return status;
}

/**
 * Send one request to the configured model.
 * Callers are responsible for passing only the minimum journal content needed.
 *
 * @param {object} opts
 * @param {string} opts.system
 * @param {{role: 'user'|'assistant', content: string}[]} opts.messages
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.json] ask for a JSON object; the result's `json` field holds the parsed value
 * @returns {Promise<{text: string, json?: any, provider: string, model: string}>}
 */
export async function complete({ system, messages, maxTokens = 1024, json = false }) {
  const status = getAIStatus();
  if (!status.configured) throw new AIConfigError(status.problem);

  const impl = providers[status.provider];
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let result;
  try {
    result = await impl.complete(config.ai, { system, messages, maxTokens, json, signal });
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err.name === 'TimeoutError') throw new AIProviderError(impl.name, 'request timed out');
    // Network-level failure (e.g. Ollama not running). err.message here is a
    // transport error, not content.
    throw new AIProviderError(impl.name, `couldn't reach provider (${err.cause?.code ?? err.cause?.errors?.[0]?.code ?? err.message})`);
  }

  const out = { text: result.text, provider: status.provider, model: status.model };
  if (json) out.json = parseJSON(result.text, impl.name);
  return out;
}

// Models sometimes wrap JSON in a code fence; tolerate that, but nothing looser.
function parseJSON(text, provider) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AIProviderError(provider, 'model did not return valid JSON');
  }
}
