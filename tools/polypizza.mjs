// Scrape poly.pizza pages: node polypizza.mjs <url> [filterRegex]
const [url, filter = '.'] = process.argv.slice(2);
let html = await (await fetch(url)).text();
html = html.replace(/\\u002F/g, '/');
const re = /"title":"([^"]+)"[^{}]*?"creator":\{[^}]*\}[^{}]*?"previewUrl":"([^"]+)"[^{}]*?"publicID":"([^"]+)"[^{}]*?"licence":"([^"]+)"/g;
const f = new RegExp(filter, 'i');
const seen = new Set();
let m, n = 0;
while ((m = re.exec(html))) {
  n++;
  const [, title, prev, id, lic] = m;
  if (seen.has(id) || !f.test(title)) continue;
  seen.add(id);
  const uuid = prev.split('/').pop().replace(/\.(webp|jpg|png)$/, '');
  console.log(`${title} | ${id} | ${uuid} | ${lic}`);
}
console.log('total', n);
