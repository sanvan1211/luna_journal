// Markdown <-> editor blocks. Supports: # / ## headings, - bullets, > quotes,
// - [ ] checkboxes, **bold** and *italic*.
import { esc } from "./util.js";

export function parseBlocks(md = "") {
  const blocks = [];
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^#\s+(.*)$/))) blocks.push({ type: "h1", text: m[1] });
    else if ((m = line.match(/^#{2,6}\s+(.*)$/))) blocks.push({ type: "h2", text: m[1] });
    else if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s?(.*)$/))) blocks.push({ type: "todo", checked: m[1] !== " ", text: m[2] });
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) blocks.push({ type: "bullet", text: m[1] });
    else if ((m = line.match(/^>\s?(.*)$/))) blocks.push({ type: "quote", text: m[1] });
    else blocks.push({ type: "p", text: line });
  }
  return blocks.length ? blocks : [{ type: "p", text: "" }];
}

export function serializeBlocks(blocks) {
  const isList = (t) => t === "bullet" || t === "todo";
  let out = "";
  blocks.forEach((b, i) => {
    const text = b.text.trim();
    if (!text && b.type === "p") return;
    const line =
      b.type === "h1" ? `# ${text}` :
      b.type === "h2" ? `## ${text}` :
      b.type === "bullet" ? `- ${text}` :
      b.type === "todo" ? `- [${b.checked ? "x" : " "}] ${text}` :
      b.type === "quote" ? `> ${text}` : text;
    const prev = blocks.slice(0, i).reverse().find((x) => x.text.trim() || x.type !== "p");
    if (out) out += prev && isList(prev.type) && isList(b.type) ? "\n" : "\n\n";
    out += line;
  });
  return out;
}

export function inlineToHtml(text = "") {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>");
}

export function htmlToInline(node) {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) out += n.textContent;
    else if (n.nodeType === 1) {
      const tag = n.tagName;
      const inner = htmlToInline(n);
      const bold = tag === "B" || tag === "STRONG" || /font-weight:\s*(bold|[6-9]00)/.test(n.getAttribute("style") || "");
      const ital = tag === "I" || tag === "EM" || /font-style:\s*italic/.test(n.getAttribute("style") || "");
      if (tag === "BR") out += " ";
      else if (!inner.trim()) out += inner;
      else if (bold) out += `**${inner}**`;
      else if (ital) out += `*${inner}*`;
      else out += inner;
    }
  });
  return out.replace(/ /g, " ");
}
