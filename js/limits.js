// Wording for "Luna's free AI limit was reached": when it should work again.

/**
 * @param {number | null} seconds  from the server (the AI provider's own retry time), or null
 * @param {Date} now
 * @returns {string}  a short sentence to add after the limit message
 */
export function limitResetText(seconds, now = new Date()) {
  if (!seconds || seconds <= 0) return "Free limits usually reset within a few minutes; a daily limit can take a few hours.";
  if (seconds < 60) return "It should work again in less than a minute.";
  const at = new Date(now.getTime() + seconds * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const mins = Math.round(seconds / 60);
  const span = mins < 60 ? `about ${mins} ${mins === 1 ? "minute" : "minutes"}` : `about ${Math.round(mins / 6) / 10} hours`.replace(".0 ", " ");
  return `It should work again in ${span}, around ${at}.`;
}
