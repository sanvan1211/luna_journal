import { providerError } from '../errors.js';

// Local models via Ollama: journal text never leaves the machine.
export const name = 'ollama';

export function missingConfig() {
  return null;
}

export async function complete(cfg, { system, messages, maxTokens, json, signal }) {
  const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      messages: [{ role: 'system', content: system }, ...messages],
      options: { num_predict: maxTokens },
      ...(json ? { format: 'json' } : {}),
    }),
  });
  if (!res.ok) throw await providerError(name, res);
  const data = await res.json();
  return { text: data.message?.content ?? '', stopReason: data.done_reason };
}
