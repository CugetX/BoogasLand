// Downloads CC0 Poly Haven HDRI + terrain textures. Usage: node tools/fetch_polyhaven.mjs
import fs from 'fs';
import path from 'path';

const out = path.resolve('public/env');
fs.mkdirSync(out, { recursive: true });
const UA = { headers: { 'User-Agent': 'BoogasEggHeist/0.1' } };

async function files(id) {
  const r = await fetch(`https://api.polyhaven.com/files/${id}`, UA);
  if (!r.ok) throw new Error(id + ' ' + r.status);
  return r.json();
}
async function dl(url, name) {
  const f = path.join(out, name);
  if (fs.existsSync(f)) return;
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  console.log('saved', name);
}

const hdri = process.env.HDRI || 'kloofendal_48d_partly_cloudy_puresky';
const f = await files(hdri);
await dl(f.hdri['1k'].hdr.url, 'sky_1k.hdr');

const TEX = {
  grass: process.env.T_GRASS || 'aerial_grass_rock',
  jungle: process.env.T_JUNGLE || 'forrest_ground_01',
  sand: process.env.T_SAND || 'coast_sand_01',
  snow: process.env.T_SNOW || 'snow_02',
  lava: process.env.T_LAVA || 'aerial_rocks_02',
  dirt: process.env.T_DIRT || 'rocky_trail',
};
for (const [k, id] of Object.entries(TEX)) {
  try {
    const t = await files(id);
    const diff = t.Diffuse || t.diffuse;
    await dl(diff['1k'].jpg.url, `${k}_diff.jpg`);
  } catch (e) {
    console.log('FAIL', k, id, e.message);
  }
}
