// Text clean-up for what the model writes to the writer. Plain JS so the unit tests (Node) and the
// Edge Functions (Deno) share one copy.

/** Removes entry ids the model wrote into text meant for the writer ("Entries 7d7fe2c0, 9b8c… show"). */
export function stripIds(text = "") {
  const ID = "(?:[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|demo-\\d+)";
  return text
    .replace(new RegExp(`\\s*\\(\\s*(?:entry\\s+)?(?:ids?\\s*:?\\s*)?(?:\\s*,?\\s*(?:and\\s+)?${ID})+\\s*\\)`, "gi"), "")
    .replace(new RegExp(`\\b(entries|entry)\\s+${ID}(?:\\s*,\\s*(?:and\\s+)?${ID}|\\s+and\\s+${ID})*`, "gi"), (_m, w) => `${w[0] === "E" ? "T" : "t"}${/y$/i.test(w) ? "his entry" : "hese entries"}`)
    .replace(new RegExp(`\\b${ID}\\b`, "gi"), "")
    .replace(/\s*\(\s*(?:entry\s+)?ids?\s*:?\s*\)/gi, "")
    .replace(/[ \t]+([.,;:])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
