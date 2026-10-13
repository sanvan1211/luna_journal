// Luna's Holland Lop, built from plain elements and styled in styles.css.
// Used sparingly: loading, empty and insight states only.
// mood: 'awake' (eyes open) | 'resting' (eyes closed, for "nothing yet" states)

const PARTS = [
  'body', 'head', 'ear bun-ear--l', 'ear bun-ear--r', 'tuft',
  'eye bun-eye--l', 'eye bun-eye--r', 'cheek bun-cheek--l', 'cheek bun-cheek--r',
  'nose', 'mouth', 'foot bun-foot--l', 'foot bun-foot--r',
].map((part) => `<span class="bun-${part}"></span>`).join('');

export function bunny({ mood = 'awake', bob = false, label = '' } = {}) {
  const classes = ['mascot', bob && 'mascot--bob', mood === 'resting' && 'mascot--resting'].filter(Boolean).join(' ');
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<span class="${classes}" ${a11y}>${PARTS}</span>`;
}
