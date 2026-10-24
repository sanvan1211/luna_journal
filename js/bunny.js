// Luna's mascot: a small Holland Lop. Used only in loading and empty states.
export function bunny(size = "") {
  return `<svg class="bunny ${size}" viewBox="0 0 120 100" role="img" aria-label="Luna the bunny">
  <ellipse cx="62" cy="94" rx="36" ry="4" fill="#0b1524"/>
  <g class="hop">
    <ellipse cx="72" cy="72" rx="32" ry="20" fill="#ead9bc"/>
    <circle cx="102" cy="66" r="7" fill="#f6eedd"/>
    <ellipse cx="80" cy="90" rx="10" ry="4.5" fill="#dcc6a2"/>
    <circle cx="46" cy="52" r="24" fill="#ead9bc"/>
    <ellipse cx="46" cy="31" rx="15" ry="6" fill="#d6bf98"/>
    <ellipse cx="24" cy="57" rx="8.5" ry="20" transform="rotate(12 24 57)" fill="#d6bf98"/>
    <ellipse cx="68" cy="57" rx="8.5" ry="20" transform="rotate(-12 68 57)" fill="#d6bf98"/>
    <ellipse cx="25" cy="60" rx="4" ry="13" transform="rotate(12 25 60)" fill="#e6b8a6"/>
    <circle cx="38" cy="52" r="3.3" fill="#0f1b2d"/>
    <circle cx="54" cy="52" r="3.3" fill="#0f1b2d"/>
    <circle cx="39.2" cy="50.8" r="1" fill="#ffffff"/>
    <circle cx="55.2" cy="50.8" r="1" fill="#ffffff"/>
    <ellipse cx="46" cy="60" rx="3" ry="2.1" fill="#e3a493"/>
    <path d="M43 63.5q3 2.6 6 0" fill="none" stroke="#b89a74" stroke-width="1.3" stroke-linecap="round"/>
    <ellipse cx="40" cy="89" rx="7" ry="4" fill="#f1e4cc"/>
    <ellipse cx="54" cy="90" rx="7" ry="4" fill="#f1e4cc"/>
  </g>
</svg>`;
}

export function emptyState({ title, text, actions = "", loading = false }) {
  return `<div class="state ${loading ? "loading" : ""}" ${loading ? 'role="status" aria-live="polite"' : ""}>
    ${bunny()}
    ${title ? `<h3>${title}</h3>` : ""}
    ${text ? `<p>${text}</p>` : ""}
    ${actions ? `<div class="actions">${actions}</div>` : ""}
  </div>`;
}

export const loadingState = (text = "Loading…") => emptyState({ text, loading: true });
