import { providerError } from '../errors.js';

export const name = 'anthropic';

export function missingConfig(cfg) {
  return cfg.anthropicKey ? null : 'ANTHROPIC_API_KEY is not set';
}

export async function complete(cfg, { system, messages, maxTokens, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw await providerError(name, res);
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return { text, stopReason: data.stop_reason };
}
