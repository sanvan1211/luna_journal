// Luna's Holland Lop. Used sparingly: loading, empty and insight states only.
// mood: 'awake' (eyes open) | 'resting' (eyes closed, for "nothing yet" states)

export function bunny({ mood = 'awake', bob = false, label = '' } = {}) {
  const eyes = mood === 'resting'
    ? `<path d="M43 55q4 3 8 0M69 55q4 3 8 0" fill="none" stroke="#1a2948" stroke-width="2.4" stroke-linecap="round"/>`
    : `<circle cx="47" cy="54" r="3.6" fill="#1a2948"/><circle cx="73" cy="54" r="3.6" fill="#1a2948"/>
       <circle cx="48.2" cy="52.8" r="1.1" fill="#f6efe4"/><circle cx="74.2" cy="52.8" r="1.1" fill="#f6efe4"/>`;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `
<svg class="mascot${bob ? ' mascot--bob' : ''}" viewBox="0 0 120 118" ${a11y}>
  <ellipse cx="60" cy="98" rx="38" ry="18" fill="#d9c6aa"/>
  <ellipse cx="60" cy="54" rx="34" ry="31" fill="#e8d9c2"/>
  <g transform="rotate(14 30 58)">
    <ellipse cx="30" cy="62" rx="13" ry="30" fill="#d9c6aa"/>
    <ellipse cx="31" cy="64" rx="7" ry="22" fill="#c9a08f"/>
  </g>
  <g transform="rotate(-14 90 58)">
    <ellipse cx="90" cy="62" rx="13" ry="30" fill="#d9c6aa"/>
    <ellipse cx="89" cy="64" rx="7" ry="22" fill="#c9a08f"/>
  </g>
  <ellipse cx="60" cy="30" rx="16" ry="7" fill="#d9c6aa"/>
  ${eyes}
  <ellipse cx="41" cy="64" rx="5" ry="3" fill="#e3bfae"/>
  <ellipse cx="79" cy="64" rx="5" ry="3" fill="#e3bfae"/>
  <path d="M57 63h6l-3 3.4z" fill="#c98585" stroke="#c98585" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M60 66.5v2.5M60 69q-3 2.6-6 1M60 69q3 2.6 6 1" fill="none" stroke="#8d6f5c" stroke-width="1.3" stroke-linecap="round"/>
  <ellipse cx="44" cy="110" rx="9" ry="5" fill="#e8d9c2"/>
  <ellipse cx="76" cy="110" rx="9" ry="5" fill="#e8d9c2"/>
</svg>`;
}
