// Captures showcase screenshots: node tools/showcase.mjs <outDir>
import { chromium } from 'playwright-core';
const out = process.argv[2] || 'tools/shots';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5179/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/s0_title.png` });
await page.evaluate(() => document.querySelector('#btn-tutorial').click());
await page.waitForTimeout(700);
await page.evaluate(() => {
  const g = window.game;
  g.tutStep = 0; // Step 1/5: Crack Wild 3D Geodes
  const n0 = g.nodes[0];
  if (n0) {
    g.player.pos.set(n0.pos.x, 0, n0.pos.z + 2.2);
    g.player.yaw = Math.PI;
    g.cam.yaw = 0.25;
    g.cam.pitch = 0.24;
    g.cam.dist = 6.2;
    g.hitGeode(g.player, n0, 1.2);
  }
});
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/s0_tutorial.png` });
console.log('shot s0_tutorial');

await page.evaluate(() => {
  const g = window.game;
  g.player.inv.wood = 4;
  g.player.inv.rock = 4;
  g.player.inv.flint = 3;
  g.player.inv.amber = 2;
  g.player.inv.bone = 3;
  g.player.inv.vine = 3;
  g.player.inv.gold = 3;
  g.player.inv.metal = 3;
  g.player.inv.opal = 2;
  g.player.inv.lava_stone = 3;
  g.player.inv.obsidian = 3;
  g.player.inv.ruby = 1;
  g.player.inv.lapis_stone = 2;
  g.player.inv.basic_handle = 1;
  g.player.inv.sealed_handle = 1;
  g.player.inv.basic_lava_handle = 1;
  g.player.inv.gleam_bound_alloy = 1;
  g.tutStep = 1; // Step 2/5: Forge Stone Club
  g.ui.togglePanel('craft');
});
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/s9_craft.png` });
console.log('shot s9_craft');

await page.evaluate(() => {
  const g = window.game;
  g.ui.closePanels();
  g.player.gear.club_stone = 1;
  g.player.refreshWeapon();
  g.tutStep = 4;
  const james = g.actors[1];
  const c = james.camp;
  james.pos.copy(c.center).add(c.entranceDir.clone().multiplyScalar(14.5));
  james.unbankedDust = 160;
  james.unbankedItems = { amber: 2, rock: 2 };
  g.player.pos.set(james.pos.x, james.pos.y, james.pos.z + 1.5);
  g.player.yaw = Math.PI;
  g.cam.yaw = 0.35;
  g.cam.pitch = 0.22;
  g.cam.dist = 5.6;
  g.resolveHit(g.player);
});
await page.waitForTimeout(350);
await page.screenshot({ path: `${out}/s11_dizzy_bonk.png` });
console.log('shot s11_dizzy_bonk');

await page.evaluate(() => {
  const g = window.game;
  g.completeTutorial();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/s10_victory.png` });
console.log('shot s10_victory');

await page.evaluate(() => {
  const g = window.game;
  g.switchMode('valley', true);
  const c = g.player.camp;
  [0, 1, 2].forEach((i) => c.unlockShrine(i));
  g.player.treasures = { cave_treasure: 1, jungle_treasure: 1, runes_treasure: 1 };
  g.player.gear.scimitar_joaquim = 1;
  g.player.gear.suit_warrior = 1;
  g.player.refreshWeapon();
  g.player.refreshSuit();
  document.getElementById('toasts').style.display = 'none';
});
const shot = async (name, fn, wait = 900) => {
  await page.evaluate(fn);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
await shot('s1_camp', () => { const g = window.game; const c = g.player.camp; g.player.pos.copy(c.center).add(c.entranceDir.clone().multiplyScalar(2)); g.player.yaw = Math.atan2(-c.entranceDir.x, -c.entranceDir.z); g.cam.yaw = Math.atan2(c.entranceDir.x, c.entranceDir.z); g.cam.pitch = 0.42; g.cam.dist = 13; });
await shot('s2_dinos', () => { const g = window.game; const c = g.player.camp; const n = c.nests[1]; g.player.pos.copy(n.world).add(c.entranceDir.clone().multiplyScalar(3.2)); g.player.yaw = Math.atan2(-c.entranceDir.x, -c.entranceDir.z); g.cam.yaw = Math.atan2(c.entranceDir.x, c.entranceDir.z) + 0.5; g.cam.pitch = 0.22; g.cam.dist = 7; });
await shot('s3_volcano', () => {
  const g = window.game;
  g.player.pos.set(24.5, 0, 2.2);
  g.player.yaw = Math.atan2(2.5, -2.2);
  if (g.actors[1]) {
    g.actors[1].pos.set(26.5, 0, -2.4);
    g.actors[1].yaw = 0.3;
    g.actors[1].say('👋 Welcome to Booga Town Forge!', 5);
  }
  if (g.actors[2]) {
    g.actors[2].pos.set(23.5, 0, -1.8);
    g.actors[2].yaw = 1.2;
    g.actors[2].say('🔥 Forging Iron Gear here!', 5);
  }
  g.triggerEmote(g.player, 2);
  g.cam.yaw = -0.75;
  g.cam.pitch = 0.22;
  g.cam.dist = 8.2;
});
await shot('s4_jungle', () => {
  const g = window.game;
  const boss = g.bosses.find((b) => b.biome === 'jungle');
  if (boss) {
    if (!boss.alive) g.activateBoss(boss, false);
    if (g.actors[1]) {
      g.actors[1].pos.set(boss.pos.x + 2.4, 0, boss.pos.z + 1.8);
      g.hitBoss(g.actors[1], boss);
    }
    g.player.pos.set(boss.pos.x - 3.2, 0, boss.pos.z + 2.2);
    g.player.yaw = Math.atan2(boss.pos.x - g.player.pos.x, boss.pos.z - g.player.pos.z);
    g.cam.yaw = g.player.yaw + Math.PI - 0.25;
    g.cam.pitch = 0.2;
    g.cam.dist = 7.5;
    g.hitBoss(g.player, boss);
  }
});
await shot('s5_lava', () => {
  const g = window.game;
  const boss = g.bosses.find((b) => b.biome === 'lava');
  if (boss) {
    if (!boss.alive) g.activateBoss(boss, false);
    boss.slamWindup = 0.55;
    g.hitBoss(g.player, boss);
    g.player.pos.set(boss.pos.x + 2.5, 0, boss.pos.z + 3.2);
    g.player.yaw = Math.atan2(boss.pos.x - g.player.pos.x, boss.pos.z - g.player.pos.z);
    g.cam.yaw = g.player.yaw + Math.PI - 0.25;
    g.cam.pitch = 0.22;
    g.cam.dist = 8.0;
  }
});
await shot('s6_frost', () => {
  const g = window.game;
  const n = g.nodes.find((nd) => nd.biome === 'frost' && nd.alive);
  if (n) {
    g.hitGeode(g.player, n, 0.8);
    g.player.pos.set(n.pos.x + 2.2, 0, n.pos.z + 2.2);
    g.player.yaw = Math.atan2(n.pos.x - g.player.pos.x, n.pos.z - g.player.pos.z);
    g.cam.yaw = g.player.yaw + Math.PI - 0.2;
    g.cam.pitch = 0.22;
    g.cam.dist = 6.5;
  }
});
await shot('s7_badlands', () => {
  const g = window.game;
  const n = g.nodes.find((nd) => nd.biome === 'badlands' && nd.alive);
  if (n) {
    g.hitGeode(g.player, n, 0.9);
    g.player.pos.set(n.pos.x - 2.2, 0, n.pos.z + 2.2);
    g.player.yaw = Math.atan2(n.pos.x - g.player.pos.x, n.pos.z - g.player.pos.z);
    g.cam.yaw = g.player.yaw + Math.PI + 0.2;
    g.cam.pitch = 0.22;
    g.cam.dist = 6.5;
  }
});
await shot('s8_trail', () => {
  const g = window.game;
  g.player.inv.desert_coin = 3;
  g.player.pos.set(-24.5, 0, 2.2);
  g.player.yaw = -Math.PI / 2;
  g.cam.yaw = 0.8;
  g.cam.pitch = 0.22;
  g.cam.dist = 7.5;
  g.ui.togglePanel('treasure');
});

// Mobile viewport + touch controls verification shot
await page.setViewportSize({ width: 844, height: 390 });
await page.evaluate(() => {
  const g = window.game;
  g.ui.closePanels();
  g.isTouch = true;
  document.body.classList.add('is-touch');
  const n = g.nodes.find((nd) => nd.alive);
  if (n) {
    g.player.pos.set(n.pos.x, 0, n.pos.z + 1.8);
    g.player.yaw = Math.PI;
    g.cam.yaw = 0.25;
    g.cam.pitch = 0.25;
    g.cam.dist = 6.5;
  }
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/s12_mobile.png` });
console.log('shot s12_mobile');

await browser.close();
