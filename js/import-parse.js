// Turns exported notes (Notion, Google Docs, Obsidian, plain files) into Luna entries.
// Pure functions only, so it can be tested without a browser.

export const MAX_FILES = 1000;
export const MAX_CHARS = 100000;

const NOTE = /\.(md|markdown|txt)$/i;
export const isNote = (name) => NOTE.test(name) && !/(^|\/)(__MACOSX|\.)/.test(name);

/** Simple YAML front matter: `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines. */
function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  let listKey = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && listKey) { meta[listKey].push(unquote(item[1])); continue; }
    const kv = line.match(/^([\w -]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase(), value = kv[2].trim();
    if (value === "") { meta[key] = []; listKey = key; continue; }
    listKey = null;
    meta[key] = value.startsWith("[") ? value.slice(1, -1).split(",").map((v) => unquote(v.trim())).filter(Boolean) : unquote(value);
  }
  return { meta, body: text.slice(m[0].length) };
}
const unquote = (s) => s.replace(/^["']|["']$/g, "");

const validDate = (v) => {
  if (!v) return null;
  let str = String(Array.isArray(v) ? v[0] : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += "T12:00:00"; // a bare date means that day, in local time
  const d = new Date(str);
  return isNaN(d) || d.getFullYear() < 1970 || d > new Date(Date.now() + 864e5) ? null : d;
};

// Notion puts page properties as "Name: value" lines right under the title.
const NOTION_DATE = /^(created|created time|date|date created|created at):\s*(.+)$/i;
const NOTION_TAGS = /^(tags|tag):\s*(.+)$/i;

/**
 * @param {string} path      file name, possibly with folders ("Vault/Daily/2025-03-01.md")
 * @param {string} text      file contents
 * @param {number} modified  file's last-modified time (ms), used when nothing better is found
 * @returns {{title, content, tags, created_at, trimmed} | null}
 */
export function noteToEntry(path, text, modified) {
  let { meta, body } = frontMatter(text.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, ""));
  const file = path.split("/").pop().replace(NOTE, "");

  let title = typeof meta.title === "string" ? meta.title : "";
  const h1 = body.match(/^\s*#\s+(.+)\n?/);
  // Use the first heading as the title, unless the front matter already named it something else.
  if (h1 && (!title || h1[1].trim() === title)) { title = h1[1].trim(); body = body.slice(h1[0].length); }
  // Notion adds a 32-character id to exported file names.
  title = (title || file.replace(/\s+[0-9a-f]{32}$/i, "")).trim().slice(0, 140);

  let date = validDate(meta.date) || validDate(meta.created) || validDate(meta.created_at);
  let tags = Array.isArray(meta.tags) ? meta.tags : typeof meta.tags === "string" ? meta.tags.split(/[,\s]+/) : [];
  const lines = body.replace(/^\n+/, "").split("\n");
  let i = 0;
  for (; i < Math.min(lines.length, 8); i++) {
    const d = lines[i].match(NOTION_DATE), t = lines[i].match(NOTION_TAGS);
    if (d) { date = date || validDate(d[2]); continue; }
    if (t) { tags = tags.concat(t[2].split(",")); continue; }
    break;
  }
  body = lines.slice(i).join("\n").trim();
  date = date || validDate(file.match(/\d{4}-\d{2}-\d{2}/)?.[0]) || new Date(modified || Date.now());

  if (!body) return null; // nothing written, nothing to import
  const trimmed = body.length > MAX_CHARS;
  return {
    title: title || "Untitled",
    content: trimmed ? body.slice(0, MAX_CHARS) : body,
    tags: [...new Set(tags.map((t) => String(t).replace(/^#/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 10),
    created_at: date.toISOString(),
    trimmed,
  };
}
