import { api } from '../api.js';

// The home scene: a full moon rising over a hill under a cloudy night sky,
// drawn with SVG noise filters so it reads as painted, not flat.
const SCENE = `
<svg class="scene" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <filter id="sky-clouds" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0032 0.0065" numOctaves="5" seed="14"/>
      <feColorMatrix values="0 0 0 0 0.62  0 0 0 0 0.68  0 0 0 0 0.76  0 0 0 1.25 -0.52"/>
    </filter>
    <filter id="moon-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="38"/>
    </filter>
    <filter id="moon-skin" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="4" seed="3"/>
      <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.58  0 0 0 0 0.66  0 0 0 0.9 -0.32"/>
    </filter>
    <filter id="hill-grass" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="4" seed="9"/>
      <feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.13  0 0 0 0 0.06  0 0 0 1.1 -0.38"/>
    </filter>
    <filter id="blur-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="blur-edge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="haze" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
    <clipPath id="moon-clip"><circle cx="600" cy="360" r="300"/></clipPath>
    <clipPath id="hill-clip"><path d="M-20 600 Q 300 470 600 478 T 1220 560 V 780 H -20 Z"/></clipPath>
  </defs>

  <rect width="1200" height="760" fill="#1f2733"/>
  <rect width="1200" height="760" filter="url(#sky-clouds)" opacity=".55"/>

  <circle cx="600" cy="360" r="360" fill="#c9d0db" opacity=".5" filter="url(#moon-glow)"/>
  <circle cx="600" cy="360" r="318" fill="#dfe3ea" opacity=".55" filter="url(#blur-soft)"/>
  <circle cx="600" cy="360" r="300" fill="#e6e9ee" filter="url(#blur-edge)"/>
  <g clip-path="url(#moon-clip)">
    <rect x="300" y="60" width="600" height="600" filter="url(#moon-skin)" opacity=".5"/>
    <g filter="url(#blur-soft)" opacity=".45">
      <ellipse cx="510" cy="250" rx="60" ry="48" fill="#c4cad4"/>
      <ellipse cx="700" cy="310" rx="38" ry="30" fill="#c9ced8"/>
      <ellipse cx="640" cy="190" rx="22" ry="18" fill="#cdd2db"/>
      <ellipse cx="460" cy="400" rx="44" ry="30" fill="#cbd0d9"/>
    </g>
  </g>

  <path d="M-20 600 Q 300 470 600 478 T 1220 560" fill="none" stroke="#9fb3a0" stroke-width="18" opacity=".22" filter="url(#haze)"/>
  <path d="M-20 600 Q 300 470 600 478 T 1220 560 V 780 H -20 Z" fill="#2c5a30"/>
  <g clip-path="url(#hill-clip)">
    <rect y="440" width="1200" height="340" filter="url(#hill-grass)" opacity=".9"/>
  </g>
</svg>`;

const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.5c-5 0-9 3.2-9 7.3 0 2.2 1.2 4.2 3.1 5.5L5.3 20l4.3-2.2c.8.2 1.6.3 2.4.3 5 0 9-3.2 9-7.3S17 3.5 12 3.5z"/><circle cx="8" cy="10.8" r="1.2" fill="#000"/><circle cx="12" cy="10.8" r="1.2" fill="#000"/><circle cx="16" cy="10.8" r="1.2" fill="#000"/></svg>';
const NOTE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 3.5h9.5L19 7v5M15.5 3.5V7H19M19 15.5l-5.5 5.5H11v-2.5l5.5-5.5zM6 3.5A1.5 1.5 0 0 0 4.5 5v14A1.5 1.5 0 0 0 6 20.5h3M8 9h7M8 12.5h5"/></svg>';

export async function render(el) {
  // "welcome back" only if there's something to come back to.
  const { entries } = await api.entries().catch(() => ({ entries: [] }));
  el.innerHTML = `
    <section class="home" aria-labelledby="home-title">
      ${SCENE}
      <div class="home-content">
        <h1 id="home-title">Hey, welcome ${entries.length ? 'back ' : ''}to luna</h1>
        <div class="home-actions">
          <a class="pill-btn" href="#/ask">${CHAT_ICON}<span>chat with luna</span></a>
          <a class="pill-btn" href="#/new">${NOTE_ICON}<span>new journal</span></a>
        </div>
      </div>
    </section>`;
}
