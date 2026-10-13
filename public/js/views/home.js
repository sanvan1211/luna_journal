import { api } from '../api.js';

// The home scene: a full moon rising over a hill under a cloudy night sky.
// Every shape is a plain element; styles.css paints and places them.
const SCENE = `
<div class="scene" aria-hidden="true">
  <span class="cloud cloud--1"></span>
  <span class="cloud cloud--2"></span>
  <span class="cloud cloud--3"></span>
  <span class="cloud cloud--4"></span>
  <span class="moon">
    <span class="crater crater--1"></span>
    <span class="crater crater--2"></span>
    <span class="crater crater--3"></span>
    <span class="crater crater--4"></span>
  </span>
  <span class="hill hill--back"></span>
  <span class="hill hill--front"></span>
</div>`;

export async function render(el) {
  // "welcome back" only if there's something to come back to.
  const { entries } = await api.entries().catch(() => ({ entries: [] }));
  el.innerHTML = `
    <section class="home" aria-labelledby="home-title">
      ${SCENE}
      <div class="home-content">
        <h1 id="home-title">Hey, welcome ${entries.length ? 'back ' : ''}to luna</h1>
        <div class="home-actions">
          <a class="pill-btn" href="#/ask"><span class="ico ico--chat" aria-hidden="true"></span><span>chat with luna</span></a>
          <a class="pill-btn" href="#/new"><span class="ico ico--note" aria-hidden="true"></span><span>new journal</span></a>
        </div>
      </div>
    </section>`;
}
