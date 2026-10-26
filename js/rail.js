// Collapsible sidebar (desktop only). Collapsed, the rail shrinks to icons; hovering it swaps the
// logo for the open-sidebar button. The choice is remembered per browser. An inline script in
// index.html applies the saved state before first paint, so the rail never animates on load.
import { $, $$ } from "./util.js";

const KEY = "luna-rail";
const root = document.documentElement;
const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘⇧S" : "Ctrl+Shift+S";

const collapsed = () => root.classList.contains("rail-collapsed");

function sync() {
  const c = collapsed(), label = c ? "Open sidebar" : "Close sidebar";
  const btn = $("#rail-toggle");
  btn.setAttribute("aria-expanded", String(!c));
  btn.setAttribute("aria-label", label);
  btn.title = `${label} (${SHORTCUT})`;
  // Labels are hidden when collapsed, so show them as tooltips instead.
  $$(".nav-list a").forEach((a) => (c ? (a.title = a.textContent.trim()) : a.removeAttribute("title")));
}

export function setCollapsed(c) {
  root.classList.toggle("rail-collapsed", c);
  try { c ? localStorage.setItem(KEY, "collapsed") : localStorage.removeItem(KEY); } catch {}
  sync();
}

export function initRail() {
  sync();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("rail-anim")));
  $("#rail-toggle").addEventListener("click", () => setCollapsed(!collapsed()));
  // Like ChatGPT: clicking empty space on the collapsed rail opens it.
  $("#rail").addEventListener("click", (e) => {
    if (collapsed() && !e.target.closest("a, button, [role=menu]")) setCollapsed(false);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s" && matchMedia("(min-width: 821px)").matches) {
      e.preventDefault();
      setCollapsed(!collapsed());
    }
  });
}
