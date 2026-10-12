// Recurring themes = themes that show up in reflections on 2+ different
// entries. Each theme carries the entries behind it, so the UI can show receipts.

export function recurringThemes(reflections, { minEntries = 2, limit = 8 } = {}) {
  const byTheme = new Map();
  for (const r of reflections) {
    for (const theme of r.themes ?? []) {
      if (!byTheme.has(theme)) byTheme.set(theme, new Map());
      byTheme.get(theme).set(r.entryKey, { key: r.entryKey, title: r.entryTitle, date: r.entryDate });
    }
  }
  return [...byTheme]
    .map(([theme, entries]) => ({
      theme,
      entries: [...entries.values()].sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .filter((t) => t.entries.length >= minEntries)
    .sort((a, b) => b.entries.length - a.entries.length || a.theme.localeCompare(b.theme))
    .slice(0, limit);
}
