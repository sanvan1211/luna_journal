// Error messages here are shown to the user and written to logs, so they must
// never include prompt or response content — only status and a short reason.

export class AIConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AIConfigError';
  }
}

export class AIProviderError extends Error {
  constructor(provider, message, status) {
    super(`${provider}: ${message}`);
    this.name = 'AIProviderError';
    this.status = status;
  }
}

// Turns a failed fetch Response into a safe error. Provider error bodies describe
// the problem (bad key, unknown model) rather than echoing input, but we still
// only keep the `message` field and truncate it.
export async function providerError(provider, res) {
  let reason = res.statusText || 'request failed';
  try {
    const body = await res.json();
    const msg = body?.error?.message ?? body?.error ?? body?.message;
    if (typeof msg === 'string' && msg) reason = msg.slice(0, 200);
  } catch {
    // Non-JSON body; keep the status text.
  }
  return new AIProviderError(provider, `${res.status} ${reason}`, res.status);
}
