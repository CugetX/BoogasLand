import { Game } from './game.js';
import { loadBoogaTemplate } from './character.js';
import { loadAssets } from './assets.js';

const fill = document.getElementById('loadfill');
const txt = document.getElementById('loadtxt');

async function boot() {
  try {
    let pa = 0, pb = 0;
    const prog = () => (fill.style.width = `${Math.round((pa * 0.5 + pb * 0.5) * 92)}%`);
    await Promise.all([
      loadBoogaTemplate('/models/booga_rok.glb', (p) => { pa = p; prog(); }),
      loadAssets((p) => { pb = p; prog(); }),
    ]);
    txt.textContent = 'Building the valley…';
    await new Promise((r) => setTimeout(r, 30));
    const game = new Game(document.getElementById('app'));
    window.game = game;
    fill.style.width = '100%';
    game.loop();
    setTimeout(() => {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('title').classList.remove('hidden');
      window.__ready = true;
    }, 250);
  } catch (e) {
    console.error(e);
    txt.textContent = 'Error: ' + e.message;
  }
}
boot();
