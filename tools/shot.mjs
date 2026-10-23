// Usage: node tools/shot.mjs <url> <out.png> [waitFlag=__ready] [timeoutMs] [w] [h]
import { chromium } from 'playwright-core';
const [url, out, flag = '__ready', timeout = '60000', w = '900', h = '600'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction((f) => window[f], flag, { timeout: +timeout });
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
