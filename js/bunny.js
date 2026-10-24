// Luna's mascot: a Holland Lop in silhouette, sitting and facing right, with one ear
// hanging down. A thin "cut" line (the background color) separates the ear from the head.
// Shown on the home page and in loading and empty states; the logo uses the same shape.
export const LOP_SHAPE = `
  <circle cx="13" cy="57" r="6.5"/>
  <path d="M10 66C10 50 24 40 42 40C52 40 58 43 62 47L70 46C74 54 74 66 72 78H14C11 75 10 71 10 66Z"/>
  <ellipse cx="65" cy="37" rx="14.5" ry="13"/>
  <ellipse cx="74.5" cy="40.5" rx="8" ry="7.2"/>
  <ellipse cx="72" cy="76" rx="9" ry="3.6"/>
  <path class="cut" d="M63 25.5C54 22.5 46.5 28 45.5 37C44.6 46 46.5 55 51 57.5C55.5 60 58.5 54 58 47C57.6 40 58.5 32 63.5 28.8Z"/>
  <circle class="eye" cx="69.5" cy="35.5" r="1.9"/>`;

export function bunny(size = "") {
  return `<svg class="bunny ${size}" viewBox="0 18 92 62" role="img" aria-label="Luna the bunny"><g class="hop">${LOP_SHAPE}</g></svg>`;
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
