import { esc } from './api.js';

// A deliberately small markdown renderer for journal text: headings, lists,
// checkboxes, quotes, dividers, code, bold and italic. Everything is escaped
// first, so journal content can never inject markup.

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function renderMarkdown(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  let inCode = false;
  let code = [];

  const closePara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const openList = (type) => {
    if (list !== type) {
      closeList();
      out.push(`<${type}>`);
      list = type;
    }
  };

  for (const raw of lines) {
    if (inCode) {
      if (raw.trim() === '```') {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        inCode = false;
        code = [];
      } else code.push(raw);
      continue;
    }
    const line = raw.trim();
    let m;
    if (line === '```') {
      closePara(); closeList(); inCode = true;
    } else if (!line) {
      closePara(); closeList();
    } else if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      closePara(); closeList();
      const level = m[1].length + 1; // # → h2 so the page keeps one h1
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      closePara(); closeList(); out.push('<hr>');
    } else if ((m = /^[-*]\s+\[([ xX])\]\s*(.*)$/.exec(line))) {
      closePara(); openList('ul');
      const checked = m[1] !== ' ';
      out.push(`<li class="task${checked ? ' done' : ''}"><span class="box" aria-hidden="true"></span><span class="visually-hidden">${checked ? 'Done: ' : 'To do: '}</span>${inline(m[2])}</li>`);
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      closePara(); openList('ul'); out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      closePara(); openList('ol'); out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      closePara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else {
      closeList(); para.push(line);
    }
  }
  if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  closePara();
  closeList();
  return out.join('\n');
}

export function toMarkdownFile(entry) {
  const meta = [
    `Date: ${entry.date}`,
    entry.mood ? `Mood: ${entry.mood}` : null,
    entry.tags?.length ? `Tags: ${entry.tags.join(', ')}` : null,
  ].filter(Boolean).join('\n');
  const title = `${entry.icon ? `${entry.icon} ` : ''}${entry.title || 'Untitled'}`;
  return `# ${title}\n\n${meta}\n\n${entry.content ?? ''}\n`;
}
