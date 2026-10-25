// How long until an AI provider's rate limit frees up, from its 429/413 response.
// Plain JS so the unit tests (Node) and the Edge Functions (Deno) share one copy.

/**
 * @param {string | null} retryAfterHeader  e.g. "12" (seconds)
 * @param {string} body  e.g. Groq's "…Please try again in 7m12.5s. …" or "…in 1h2m3s…"
 * @returns {number | null}  seconds to wait, or null when the provider didn't say
 */
export function retryAfterSeconds(retryAfterHeader, body = "") {
  const fromHeader = Number.parseFloat(retryAfterHeader ?? "");
  const m = String(body).match(/try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i);
  const fromBody = m && (m[1] || m[2] || m[3]) ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : null;
  const secs = Math.max(Number.isFinite(fromHeader) ? fromHeader : 0, fromBody ?? 0);
  return secs > 0 ? Math.ceil(secs) : null;
}
