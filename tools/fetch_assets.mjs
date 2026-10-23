// Downloads the CC0 Quaternius models (via poly.pizza static CDN) used by the game.
// Usage: node tools/fetch_assets.mjs
import fs from 'fs';
import path from 'path';

export const ASSETS = {
  // dinos (animated)
  dino_raptor: 'c1f0c4cb-c84f-415c-8323-d8cb871a2126',
  dino_trike: '6aa1f3ff-b9b3-4bb5-9d85-b2ffa514f0cc',
  dino_stego: '6f8f4ac6-f9e8-488d-97a8-220b9b2fd02a',
  dino_para: '47b9d0bd-cddb-49be-b072-12201def24a9',
  dino_rex: '34eed102-48f0-43dd-bc6f-ef7a6dfddfbb',
  dino_apato: '7b873860-f23f-4266-b341-5c5e6770cfa0',
  // trees
  tree_1: '7bf2aa94-cc44-40d9-a93c-9489eb09e008',
  tree_2: '856b5db4-21c1-406b-a800-d96843d1ec69',
  tree_3: '2c5938cb-4005-4958-829b-e191be39b3b9',
  tree_4: '24cf9df9-435f-408e-971b-640d670ce973',
  tree_5: '7f84a768-ac30-48d4-9c5d-f760492e7867',
  palm_1: null, // filled from list by id
  pine_1: 'be462d46-2e48-401e-8da9-2f4d9bc9df0c',
  pine_2: 'c55b8641-4679-4a85-8bd8-2a20e79abecd',
  pine_3: '082c2026-56af-4e3f-bea7-9ae5de71101f',
  dead_1: '4db29f97-8e10-413d-be54-39ecda1a7c8d',
  dead_2: 'd12c21bd-a5d1-41c9-b370-28e3708e61cc',
  dead_3: '41121684-abaa-4298-a42e-5b538184d11e',
  // rocks
  rock_m1: 'be5fef3a-4fa1-4d08-b2d4-82e02284588d',
  rock_m2: 'aaf0aaa7-c244-430a-908b-2ac57567d81c',
  rock_m3: '73b7e249-300d-4d4b-9c31-a610b8a1ffec',
  // plants
  fern: 'f94d836f-4eb4-4db0-aa53-3ecdddffa527',
  grass_1: '0a84d74b-eb09-4794-ad58-dd10eed6b11e',
  grass_tall: '83f8e6d6-fa7e-4cd8-a0ef-8c51d0ff4e88',
  grass_wispy: '12298e95-47ef-4af3-bfde-1241dd5ecbb9',
  flowers_1: '89f163b2-af28-4dd7-bd09-ed7b80fde2b7',
  flowers_2: '48045fd1-cc1b-410d-871e-3501db7262fd',
  plant_1: null,
  plant_2: null,
  bush_flowers: 'af83abca-9b41-4229-9652-e336a5f5eaba',
  mushroom_s: 'abade6e4-375f-457a-898e-66644673f54e',
  mushroom_l: '65e92d92-b597-4719-b759-866b8d6a8f5d',
  clover: null,
  // props
  bonfire: null,
  logs: '3acb6479-f0af-42cf-a8ad-ba2742e4bde7',
  tent: 'fc8d560d-91b5-439c-88bf-4cbddb7eadbb',
  chest: null,
  skull: null,
  bone: 'dfefb65d-139f-4230-8038-9929ce237343',
  ribs: 'dc066333-7257-425b-bbc0-7d93403d019d',
  cactus_1: 'c9bfa77b-fc43-402a-aee4-f34b2581b0f6',
  cactus_2: '380be193-f268-4c87-9ad7-af1070f3448a',
  pine_snow: '1e077c40-f8df-4322-9faf-964faecc5860',
  rock_snow: '3d9f39ed-af7d-491a-90a3-957036099b1d',
  bush_snow: '84e3f229-b276-4766-8846-a8d70beef332',
  dead_snow: '4cfe60b4-042a-44fa-881d-0a3ed5adce04',
  stump: 'f6caf11a-75ff-4a6e-9d87-28b44f685803',
  crystal_big: 'f2bbae6a-f84c-493e-8a39-7498e90fbd49',
  crystal: '3b886302-8856-461c-9472-dc34459a21de',
  axe_stone: '7287fa2f-db78-49bb-a857-b3b0c7eef4c0',
  // cartoon camp, gate, shrine, props & weapons (replacing all procedural blocky meshes)
  wood_wall: '43bf4a38-5d5d-4704-860c-ea13a894ff09',
  wood_gate_open: '5a70ad27-93f3-42d7-95ff-4997bb274e8a',
  watch_tower: '8bec6466-329a-4f83-99d9-600a00e2c437',
  monument: '5e754dc8-8969-4934-8a00-f2715c58ac92',
  hut: '76843ec7-2056-43ed-853e-d32d0b8253c4',
  banner: 'db6f6643-649f-40cb-9a30-9f8295a2d3cb',
  arch: 'b4f2ce7f-e692-4b4c-aa2e-0d6b6e42d552',
  arch_round: '550d94ae-da60-4e00-a236-fa29541dceb5',
  pedestal: 'a2286c68-df68-4d2c-9446-ca223e07086c',
  torch_wood: 'e5d33174-f51a-4981-9cfc-67e70486cba2',
  cloud: 'd9268957-7e64-408f-8bb7-14125af33081',
  hay: '8ab0043c-9a54-47b1-9b46-31b98d2f6ed8',
  vines: '92825e3a-bd92-4617-8c05-8bf99e55069a',
  bear_trap: '22c9d9eb-3079-4254-8b50-ebd35ccdad48',
  hammer: '97f342bf-7e3b-4155-a306-91b35e321c7b',
  axe_double: '0c2955b1-c314-42d3-bae0-175cc4cb0423',
  axe_small: '654d4ee5-e217-4c23-b8e1-92e16226b21a',
  bat_barbed: '15d6d0a7-f748-42e7-b0ef-013f63f12194',
  crown: '1381b02a-8310-437b-a2a7-82cab0a94a4c',
  star: 'da14b872-e62f-42f7-bbc3-ef37031d5530',
  rock_path_wide: '141c00d2-f62c-45e3-b9b7-4048b4d566af',
  pebble_round: '15475cf5-3def-4aa4-bebe-d7afc7851f41',
  bags: '5a6e6186-ab59-4c81-a5e1-9beb5e1bb8e9',
  bucket: 'ab9720c1-bfc4-4afc-a4d5-349fc725f6ae',
  cauldron: '8c6e4cbc-300b-4e73-b898-3ef4d0ca5672',
  wood_log_moss: '5283865a-f61a-4787-b02d-28b5b76df7b9',
  // volcano & new cartoon world/camp assets
  volcano_1: 'c4fa7319-37ee-4e47-a29c-520605832f86',
  volcano_2: '8801c52d-2572-432d-816b-61a7efc5dc26',
};

// assets referenced by poly.pizza public id (uuid resolved from tools/quaternius_list.txt)
const BY_ID = {
  palm_1: 'nr1B5DbICA', plant_1: 'NrJN7UcgIF', plant_2: 'xH5gNIQxAZ', clover: 'u5SOgBFiut',
  bonfire: 'k1e0cOzi8A', chest: 'O72u4Drp8k', skull: 'EAsVEJwsv7',
  rock_b1: 'b7gRkv0cEa', rock_b2: 'HtpdTh3Ld6', rock_b3: '34W5ymEePk', rock_b4: '54jZKTAt5p', rock_b5: 'li0YBlBEMz',
  rock_g1: 'RtLRqYjfMs', rock_g2: 'JmFMh7ztL9', rock_g3: '4MUaQTcDdc',
  bush_1: 'ooG6CkLyE8', bush_moss: '92EytlU1El', mushroom_red: 'db1tjMhmiA', reeds: 'AkGoA1SaHA',
  tree_acacia: '2paAm1ja4w',
  // mountains & biome flora/rocks
  mountains: 'w9VBrh7Nz0', mountain_group: 'a52gSEEq8X', mountain_1: '7HYR2s9JVi', mountain_2: 'XY4ej3Zg3I',
  tree_lava_1: '9gRfmVKx9W', tree_lava_2: 'sTYjmQObr1', tree_lava_3: 'wkLmuxEbMW',
  tree_twisted_1: '8oraKn9m0x', tree_twisted_2: '7PDBpElkQr',
  tree_blob_1: 'QHYRrAnKzW', tree_spikes_1: 'a6Vo1seJw9', tree_spiral_1: 'poFJzEWCk8',
  rock_moss: 'Oar39tFugM', rock_canyon_1: 'd2VWOdthtR', rock_canyon_2: 'R2UjZAX3By',
  gold_rocks: 'r93I0pFAE7', magic_rock: 'K6ROPQj7PX',
  // camp palisades, tribal buildings & props
  palisade_wall: 'L0TxLurnES', palisade_gate: 'SiSjNL8GtO',
  fence_rustic_1: 'UXmKfG81fG', fence_rustic_2: 'U7g0Wxpt63',
  temple_1: 'YrK9bureMV', temple_wood: 'HVg79yHQTm',
  hut_2: '4MJWbyd6vw', hut_storage: 'BsTn4bKSGb',
  watch_tower_2: 'f2J0aSLVi4', guard_tower: 'sbaM8I229r',
  bonfire_stones: 'Azj9hJwwwG',
  chest_gold: '4jqKCGHpUO', chest_gold_2: 'haqf9qoiOG',
  coin_piles: '9OWkKczINo', gold_bag: 'vFFblhnHtb',
  gem_blue: 'QgQ4rESqNc', gem_green: 'kbgiCMzdxg', gem_pink: 'PJnKvWluqs',
  skull_crossbones: 'ExZmhOIjka', skull_horned: 'EHHwZ17lWD', skeleton_1: 'aOPA4hZeE9',
  stag_statue: 'cKloIsNcT8', fox_statue: 'abxyXID5EA',
  well: 'QlqncKYxXb', cart: 'l7bDe7ak6j', cart_broken: 'NBDHe8J7f9',
  bridge_small: 'j4KsIuJYnq', sign_wood: '4MSsNFk5fc', sign_arrow: 'dwmvPHHCdq',
  mushroom_king: 'grnFTziU8u', egg_poly: 'ngjyRi84lk',
};

const list = fs.readFileSync(path.resolve('tools/quaternius_list.txt'), 'utf8').split(/\r?\n/);
const idToUuid = {};
for (const l of list) {
  const p = l.split('|').map((s) => s.trim());
  if (p.length >= 3) idToUuid[p[1]] = p[2];
}
for (const [k, id] of Object.entries(BY_ID)) ASSETS[k] = idToUuid[id];

const out = path.resolve('public/models/cc0');
fs.mkdirSync(out, { recursive: true });
let total = 0;
await Promise.all(Object.entries(ASSETS).map(async ([name, uuid]) => {
  if (!uuid) { console.log('MISSING', name); return; }
  const f = path.join(out, name + '.glb');
  if (fs.existsSync(f)) { total += fs.statSync(f).size; return; }
  const r = await fetch(`https://static.poly.pizza/${uuid}.glb`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) { console.log('FAIL', name, r.status); return; }
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, b);
  total += b.length;
}));
console.log('done', Object.keys(ASSETS).length, 'models', (total / 1e6).toFixed(1), 'MB');
