import { providerError } from '../errors.js';

export const name = 'openai';

export function missingConfig(cfg) {
  return cfg.openaiKey ? null : 'OPENAI_API_KEY is not set';
}

export async function complete(cfg, { system, messages, maxTokens, json, signal }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.openaiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_completion_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw await providerError(name, res);
  const data = await res.json();
  const choice = data.choices?.[0];
  return { text: choice?.message?.content ?? '', stopReason: choice?.finish_reason };
}
