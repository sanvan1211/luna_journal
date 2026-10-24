// Luna's mascot: a chubby Holland Lop in a loose sketchbook style: white fur,
// a thin brown line that leaves small gaps, pink blush, head turned slightly.
// Shown on the home page and in loading and empty states.
const INK = "#3a2b2b", FUR = "#fbf7f2", BLUSH = "#e2a7a0";

export function bunny(size = "") {
  return `<svg class="bunny ${size}" viewBox="0 0 120 110" role="img" aria-label="Luna the bunny">
  <defs><filter id="luna-sketch" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="5"/>
    <feDisplacementMap in="SourceGraphic" scale="1.6"/>
  </filter></defs>
  <ellipse cx="68" cy="104" rx="32" ry="3.6" fill="#000" opacity=".18"/>
  <g class="hop"><g filter="url(#luna-sketch)">
    <path d="M41 64C36 74 37 90 45 97C56 103 72 103 82 100C92 96 97 87 95 76C93 65 84 57 74 52C64 50 48 56 41 64Z" fill="${FUR}"/>
    <path d="M64 26C74 24 83 33 83.5 45C84 55 80.5 61.5 76.5 61C72.5 60.5 72 52 73 44Z" fill="${FUR}"/>
    <ellipse cx="54" cy="42" rx="22" ry="19.5" fill="${FUR}"/>
    <ellipse cx="68" cy="50.5" rx="6" ry="4.4" fill="${BLUSH}" opacity=".6"/>
    <ellipse cx="81" cy="52" rx="2.2" ry="5" fill="${BLUSH}" opacity=".35"/>
    <path d="M46 25C36 23 29 32 29 44C29 54 31 63 35 66C39 69 42 64 42 57C42 48 43 38 50 31Z" fill="${FUR}"/>
    <ellipse cx="36" cy="56" rx="3.4" ry="5.5" fill="${BLUSH}" opacity=".35"/>
    <g fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M47.5 24C55 21 66 22.5 72 29.5M74.6 35C77.2 41 77 49 73.2 55M70 58.4C64 62 56 63 49 61"/>
      <path d="M66 24.8C76 23.2 84 32 83.6 45C83.2 55 80.5 61.4 76.6 61"/>
      <path d="M46 25C36 23 29 32 29 44C29 54 31 63 35 66C39 69 42 64 42 57C42 50 42.6 43 45 37"/>
      <path d="M33.4 46C33.2 53 34 58.5 36 62" stroke-width="1" opacity=".5"/>
      <path d="M75.5 58.4C84 58 93 65 95 76C97 87 92 96 82 100M77 101.2C68 103 57 102 48 99M44.5 96.5C37.5 89 36.5 74 41 64.5"/>
      <path d="M50.5 99.5C49.5 94.5 53.5 92.5 57 94.4M60.5 99.8C60.5 95 64.5 93.2 67.6 95.2"/>
      <path d="M78.5 96C77 88.5 81.5 83 88 84.5M81 100.6C86.5 101.4 91.5 100.2 93.8 97.5"/>
      <path d="M49 66.5Q51.2 69.2 48.4 72" stroke-width="1.1" opacity=".6"/>
      <path d="M57 50.4Q55.8 51.9 54.2 51.2M57 50.4Q58.3 51.9 60 51.2" stroke-width="1.2"/>
    </g>
  </g>
  <ellipse cx="57" cy="48.6" rx="1.3" ry=".9" fill="#c98880"/>
  <ellipse cx="49.5" cy="42.5" rx="1.9" ry="2.4" fill="${INK}"/>
  <ellipse cx="64.5" cy="41.5" rx="1.7" ry="2.2" fill="${INK}"/></g>
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
