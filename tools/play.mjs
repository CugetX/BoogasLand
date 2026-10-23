// Automated smoke test: loads the game, presses play, walks around, grabs screenshots.
import { chromium } from 'playwright-core';
const out = process.argv[2] || '.';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { console.log('[console]', m.type(), m.text()); } });
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
await page.goto('http://localhost:5179/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01_title.png` });
await page.click('#btn-play');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/02_start.png` });
// walk toward the volcano (forward)
await page.keyboard.down('KeyW');
await page.waitForTimeout(3500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/03_walk.png` });
const info = await page.evaluate(() => {
  const g = window.game;
  return { pos: g.player.pos.toArray().map((v) => v.toFixed(1)), dust: g.player.dust, trail: g.trail.length, bots: g.bots.map((b) => b.task), fps: 0 };
});
console.log('state', JSON.stringify(info));
// teleport to the egg trail near an egg & buy it
await page.evaluate(() => {
  const g = window.game;
  g.player.dust = 200;
  const e = g.trail.find((e) => e.cfg.cost <= g.player.dust) || g.trail[0];
  g.player.pos.set(e.pos.x * 1.08, 0, e.pos.z * 1.08);
  g.cam.yaw = Math.atan2(g.player.pos.x, g.player.pos.z);
  g.cam.pitch = 0.3;
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/04_trail.png` });
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/05_bought.png` });
console.log('carrying', await page.evaluate(() => JSON.stringify(window.game.player.carrying && window.game.player.carrying.egg)));
// teleport home -> deliver
await page.evaluate(() => { const g = window.game; const c = g.player.camp; g.player.pos.copy(c.center); g.cam.yaw = Math.atan2(c.entranceDir.x, c.entranceDir.z) ; g.cam.pitch = 0.6; g.cam.dist = 14; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/06_home.png` });
// rival camp
await page.evaluate(() => { const g = window.game; const c = g.camps[3]; g.player.pos.copy(c.nests[1].world).add(c.entranceDir.clone().multiplyScalar(1.2)); g.cam.yaw = Math.atan2(c.entranceDir.x, c.entranceDir.z); g.cam.pitch = 0.45; g.cam.dist = 9; });
await page.waitForTimeout(800);
await page.keyboard.down('KeyE');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/07_stealing.png` });
await page.waitForTimeout(1200);
await page.keyboard.up('KeyE');
console.log('carrying2', await page.evaluate(() => JSON.stringify(window.game.player.carrying && window.game.player.carrying.dino)));
await page.screenshot({ path: `${out}/08_stolen.png` });
// jungle
await page.evaluate(() => { const g = window.game; g.player.setCarry(null); g.player.pos.set(75, 0, 4); g.cam.yaw = Math.PI / 2; g.cam.pitch = 0.35; });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/09_jungle.png` });
await page.evaluate(() => { const g = window.game; g.player.pos.set(-4, 0, -75); g.cam.yaw = -Math.PI / 2 + 0.5; });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/10_lava.png` });
await page.evaluate(() => { const g = window.game; g.player.pos.set(-75, 0, 4); g.cam.yaw = -Math.PI / 2 - 0.3; });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/11_frost.png` });
await page.evaluate(() => { const g = window.game; g.player.inv = { wood: 10, hemp: 8, rock: 6, flint: 2, vine: 5 }; g.ui.togglePanel('craft'); });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/12_craft.png` });
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; f(); }));
console.log('fps', fps, 'errors', errors.length);
// club close-up
await page.evaluate(() => { const g = window.game; g.ui.closePanels(); g.player.gear.club_bone = 1; g.player.refreshWeapon(); g.player.pos.set(30, 0, 30); g.cam.yaw = Math.PI / 4 + 0.6; g.cam.pitch = 0.15; g.cam.dist = 4; g.player.tryAttack(); });
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/13_club.png` });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/14_club_idle.png` });
// fast simulation of bots for 4 minutes of game time
const sim = await page.evaluate(() => {
  const g = window.game;
  g.player.pos.set(0, 0, 40);
  const log = [];
  for (let i = 0; i < 4800; i++) {
    g.update(0.05);
    if (i % 600 === 0) log.push(g.bots.map((b) => `${b.a.name}:${b.task}:${Math.floor(b.a.dust)}:${b.a.camp.occupiedNests().length}:${b.a.pos.x.toFixed(0)},${b.a.pos.z.toFixed(0)}`).join(' | '));
  }
  return { log, playerNests: g.player.camp.occupiedNests().length, trail: g.trail.map((e) => e.cfg.id).join(',') };
});
console.log(JSON.stringify(sim, null, 1));
await page.screenshot({ path: `${out}/15_after_sim.png` });
console.log('errors', errors.length);
await browser.close();
