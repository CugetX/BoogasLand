import * as THREE from 'three';
import { rand } from './world.js';
import { DINOS, NODES } from './config.js';
import { spawn, tint } from './assets.js';

// ---------- Hand-Illustrated 2.5D Geodes (7 Crack Stages + Split-Open Crystal Interior Animation!) ----------
const VARIANT_TINTS = {
  coprolite:   '#d4a87a',
  fauna:       '#f5b895',
  whisperleaf: '#8fff98',
  bone:        '#fff8eb',
  ironwood:    '#d9b38c',
  ember:       '#ff9466',
  sunstone:    '#ffe066',
  terracotta:  '#f09c78',
  tar:         '#9e8c7a',
};

export function makeGeode(type = 'quartz', scale = 1, initialStage = 1) {
  const cfg = NODES[type] || NODES.quartz;
  const folder = cfg.stageFolder || 'quartz';
  const g = new THREE.Group();
  g.userData.geodeType = type;
  g.userData.stageFolder = folder;

  // 1. Sculpted 3D mineral vein outcrop & crystal cluster cradle
  const baseRing = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({
    color: cfg.shell || '#5c6473',
    roughness: 0.88,
    flatShading: true,
  });
  const crystalCol = cfg.crystal || cfg.vein || '#5fd4ff';
  const shardMat = new THREE.MeshStandardMaterial({
    color: crystalCol,
    emissive: crystalCol,
    emissiveIntensity: 0.65,
    roughness: 0.22,
    flatShading: true,
  });

  // 5 jagged bedrock boulders cradling the Geode
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.25;
    const rk = spawn(i % 2 === 0 ? 'rock_b1' : 'rock_g2', 0.62 + (i % 3) * 0.14, 'max');
    rk.traverse((o) => {
      if (o.isMesh) o.material = rockMat;
    });
    rk.position.set(Math.cos(a) * 0.78, -0.04, Math.sin(a) * 0.78);
    rk.rotation.set((i % 2) * 0.18, a, ((i + 1) % 2) * 0.15);
    baseRing.add(rk);
  }

  // 3 glowing 3D crystal shards erupting from the rock cradle
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    const sh = spawn('crystal', 0.58 + (i % 2) * 0.18);
    sh.traverse((o) => {
      if (o.isMesh) o.material = shardMat;
    });
    sh.position.set(Math.cos(a) * 0.72, 0.05, Math.sin(a) * 0.72);
    sh.rotation.z = -Math.cos(a) * 0.38;
    sh.rotation.x = Math.sin(a) * 0.38;
    baseRing.add(sh);
  }

  const auraMat = new THREE.MeshBasicMaterial({
    color: crystalCol,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.05, 24), auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.04;
  baseRing.add(aura);
  g.add(baseRing);
  g.userData.auraMat = auraMat;
  g.userData.baseRing = baseRing;

  // 2. Geode body holder with real hand-illustrated Geode artwork sprite
  const body = new THREE.Group();
  body.position.y = 1.02;
  g.add(body);
  g.userData.body = body;

  const tintHex = VARIANT_TINTS[type] || '#ffffff';
  const initUrl = typeof initialStage === 'string'
    ? `/assets/geodes/${folder}/${initialStage}.png`
    : `/assets/geodes/${folder}/stage_${Math.max(1, Math.min(7, Math.floor(initialStage)))}.png`;
  const spriteMat = new THREE.SpriteMaterial({
    map: tex(initUrl),
    color: tintHex,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2.25, 2.25, 1);
  body.add(sprite);
  g.userData.sprite = sprite;
  g.userData.spriteMat = spriteMat;
  g.userData.baseSpriteScale = 2.25;

  g.scale.setScalar(scale);
  g.userData.radius = 0.95;
  setGeodeStage(g, initialStage);
  return g;
}

// Updates a Geode's crack stage (1 = intact .. 7 = deep vertical crack) or split-open frame ('split_1'..'split_4', 'open')
export function setGeodeStage(g, stage = 1) {
  const folder = g.userData.stageFolder || 'quartz';
  const sprite = g.userData.sprite;
  const spriteMat = g.userData.spriteMat;
  const baseScale = g.userData.baseSpriteScale || 2.25;
  if (!sprite || !spriteMat) return;

  if (typeof stage === 'string') {
    g.userData.stage = stage;
    const nextTex = tex(`/assets/geodes/${folder}/${stage}.png`, spriteMat);
    if (spriteMat.map !== nextTex) {
      spriteMat.map = nextTex;
      spriteMat.needsUpdate = true;
    }
    // Open geode frames are slightly wider (two halves side-by-side)
    const wide = stage === 'open' || stage === 'split_3' || stage === 'split_4' ? 1.18 : 1.05;
    sprite.scale.set(baseScale * wide, baseScale * wide, 1);
    if (g.userData.auraMat) g.userData.auraMat.opacity = 0.65;
    return;
  }

  const st = Math.max(1, Math.min(7, Math.floor(stage)));
  g.userData.stage = st;
  const k = (st - 1) / 6;
  const nextTex = tex(`/assets/geodes/${folder}/stage_${st}.png`, spriteMat);
  if (spriteMat.map !== nextTex) {
    spriteMat.map = nextTex;
    spriteMat.needsUpdate = true;
  }
  sprite.scale.set(baseScale, baseScale, 1);
  if (g.userData.auraMat) {
    g.userData.auraMat.opacity = 0.18 + k * 0.42;
  }
}

export function makeNode(type, biome) {
  return makeGeode(type, 1.05, 1);
}

// ---------- Prime Geodes on the Volcano Ring & Carried Geodes ----------
export function makeEgg(cfg, scale = 1) {
  const gType = (cfg && cfg.geodeType) || 'quartz';
  return makeGeode(gType, scale * 0.72, 'split_1'); // Cracked open down the middle with glowing crystal core peeking out!
}

// ---------- Awakened Crystal Geode Cores on Camp Pedestals ----------
export function makeDino(id) {
  const cfg = DINOS[id] || DINOS.raptor;
  const gType = cfg.geodeType || 'quartz';
  const g = new THREE.Group();

  // Wide-open split Geode halves revealing the full hand-illustrated crystal interior!
  const cradle = makeGeode(gType, 0.95, 'open');
  if (cradle.userData.body) {
    cradle.userData.body.position.y = 1.12;
    cradle.userData.body.userData.float = true;
  }
  g.add(cradle);
  return g;
}

export function animateDino(g, dt) {
  g.userData.t = (g.userData.t || 0) + dt;
  for (const c of g.children) {
    const body = c.userData && c.userData.body;
    if (body && body.userData.float) {
      body.position.y = 1.12 + Math.sin(g.userData.t * 2.8) * 0.1;
    }
  }
}

// ---------- 4 Biome Bosses in 3D (Cave Bat, Shaman Cyborg, Ancient Mummy, Cyborg Leader) ----------
export function makeBoss(cfg) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;

  const mainMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.35, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1e1b24', roughness: 0.5, flatShading: true });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#ff2a1f', emissive: '#ff2a1f', emissiveIntensity: 2.4, flatShading: true });

  if (cfg.id === 'bat') {
    // Giant Cave Bat Boss (flapping 3D wings, fangs, ears, glowing eyes)
    body.position.y = 1.9;
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.68, 9, 8), darkMat);
    torso.scale.set(1, 1.15, 0.9);
    body.add(torso);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 5), mainMat);
      ear.position.set(s * 0.38, 0.72, 0.1);
      ear.rotation.z = -s * 0.3;
      body.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), glowMat);
      eye.position.set(s * 0.25, 0.22, 0.58);
      body.add(eye);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 4), new THREE.MeshStandardMaterial({ color: '#fff' }));
      fang.rotation.x = Math.PI;
      fang.position.set(s * 0.16, -0.15, 0.62);
      body.add(fang);
      const wing = new THREE.Group();
      const membrane = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.85), mainMat);
      membrane.position.x = s * 0.82;
      wing.add(membrane);
      wing.position.set(s * 0.45, 0.15, 0);
      body.add(wing);
      if (s === -1) g.userData.leftWing = wing;
      else g.userData.rightWing = wing;
    }
  } else {
    // Armored Boss Titan (Shaman Cyborg, Ancient Mummy, or Cyborg Leader)
    const torsoColor = cfg.id === 'ancient_mummy' ? '#e8d8b0' : cfg.id === 'shaman_cyborg' ? '#2c5e3b' : '#3a3f4d';
    const torsoMat = new THREE.MeshStandardMaterial({ color: torsoColor, roughness: 0.45, flatShading: true });
    const visorColor = cfg.id === 'ancient_mummy' ? '#00f5d4' : cfg.id === 'shaman_cyborg' ? '#7dff42' : '#ff1e1e';
    const visorMat = new THREE.MeshStandardMaterial({ color: visorColor, emissive: visorColor, emissiveIntensity: 2.5, flatShading: true });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.58, 1.55, 8), torsoMat);
    torso.position.y = 1.1;
    body.add(torso);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), torsoMat);
    head.position.y = 2.25;
    body.add(head);

    // Cyber Visor / Glowing Mummy Eyes
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.35), visorMat);
    visor.position.set(0, 2.28, 0.38);
    body.add(visor);

    // Chest Core (Magic Firefly Core / Gold Ankh / Ruby Core)
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), visorMat);
    core.position.set(0, 1.25, 0.65);
    body.add(core);
    g.userData.core = core;

    // Crown / Horns
    const crown = tint(spawn('skull_horned', 1.1), cfg.color);
    crown.position.set(0, 2.65, 0.05);
    body.add(crown);

    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 1.1, 7), mainMat);
      arm.position.set(s * 0.92, 1.15, 0.2);
      arm.rotation.x = -0.4;
      body.add(arm);
      if (s === -1) g.userData.leftArm = arm;
      else g.userData.rightArm = arm;
    }
  }

  // Boss ground aura ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.85, 28),
    new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);

  // Telegraphed Shockwave Slam danger ring (hidden until Boss winds up an AoE attack!)
  const slamGroup = new THREE.Group();
  const slamBorder = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 4.1, 36),
    new THREE.MeshBasicMaterial({ color: '#ff2a1f', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  slamBorder.rotation.x = -Math.PI / 2;
  slamBorder.position.y = 0.08;
  const slamFill = new THREE.Mesh(
    new THREE.CircleGeometry(4.0, 36),
    new THREE.MeshBasicMaterial({ color: '#ff3b1f', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  slamFill.rotation.x = -Math.PI / 2;
  slamFill.position.y = 0.05;
  slamGroup.add(slamBorder, slamFill);
  slamGroup.visible = false;
  g.add(slamGroup);
  g.userData.slamGroup = slamGroup;
  g.userData.slamFill = slamFill;

  g.traverse((o) => { if (o.isMesh && o !== slamBorder && o !== slamFill) o.castShadow = true; });
  return g;
}

export function animateBoss(boss, dt, t) {
  const m = boss.mesh;
  if (!m) return;
  const body = m.userData.body;
  if (m.userData.hitT > 0) {
    m.userData.hitT = Math.max(0, m.userData.hitT - dt);
    const s = 1 + Math.sin(m.userData.hitT * 40) * 0.12;
    if (body) body.scale.set(s, 2 - s, s);
  } else if (body) {
    body.scale.set(1, 1, 1);
  }
  const slamMax = boss.slamWindupMax || 2.0;
  const atkMax = boss.atkWindupMax || 1.15;
  const windupProg = boss.slamWindup > 0
    ? 1 - boss.slamWindup / slamMax
    : boss.atkWindup > 0
      ? 1 - boss.atkWindup / atkMax
      : 0;
  if (body) {
    const swing = boss.swingT > 0 ? Math.sin((1 - boss.swingT / 0.45) * Math.PI) * 1.35 : 0;
    const windupLift = (boss.slamWindup > 0 || boss.atkWindup > 0) ? Math.sin(windupProg * Math.PI * 0.5) * 0.95 : 0;
    if (boss.cfg.id === 'bat') {
      body.position.y = 1.9 + Math.sin(t * 5) * 0.22 + windupLift * 0.5 - swing * 0.55;
      if (m.userData.leftWing) m.userData.leftWing.rotation.z = Math.sin(t * 12) * 0.55 - windupLift * 0.5 + swing * 0.4;
      if (m.userData.rightWing) m.userData.rightWing.rotation.z = -Math.sin(t * 12) * 0.55 + windupLift * 0.5 - swing * 0.4;
    } else {
      body.position.y = Math.abs(Math.sin(t * 3.5)) * 0.14 + (boss.slamWindup > 0 ? Math.sin(windupProg * Math.PI) * 0.85 : 0);
      if (m.userData.core) m.userData.core.rotation.y += dt * 3;
      if (m.userData.leftArm) m.userData.leftArm.rotation.x = -0.4 - windupLift * 1.1 - swing + Math.sin(t * 4) * 0.15;
      if (m.userData.rightArm) m.userData.rightArm.rotation.x = -0.4 - windupLift * 1.1 - swing - Math.sin(t * 4) * 0.15;
    }
  }
  if (m.userData.slamGroup) {
    if (boss.slamWindup > 0) {
      m.userData.slamGroup.visible = true;
      m.userData.slamGroup.scale.setScalar(1.0);
      const p = 1 - boss.slamWindup / slamMax;
      m.userData.slamFill.scale.setScalar(0.15 + p * 0.85);
      m.userData.slamFill.material.opacity = 0.2 + p * 0.45;
    } else if (boss.atkWindup > 0) {
      m.userData.slamGroup.visible = true;
      m.userData.slamGroup.scale.setScalar(0.76);
      const p = 1 - boss.atkWindup / atkMax;
      m.userData.slamFill.scale.setScalar(0.2 + p * 0.8);
      m.userData.slamFill.material.opacity = 0.16 + p * 0.36;
    } else {
      m.userData.slamGroup.visible = false;
    }
  }
}

// ---------- Dust crystal (billboard sprite of the real art) ----------
const texLoader = new THREE.TextureLoader();
const texCache = {};
export function tex(url, matToUpdate = null) {
  if (!texCache[url]) {
    const t = texLoader.load(url, (loaded) => {
      loaded.needsUpdate = true;
      if ( loaded._mats ) {
        for (const m of loaded._mats) m.needsUpdate = true;
      }
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t._mats = new Set();
    texCache[url] = t;
  }
  if (matToUpdate && texCache[url]._mats) {
    texCache[url]._mats.add(matToUpdate);
  }
  return texCache[url];
}

// Prewarm only the 6 Camp Pedestal 'open' Geode textures so mobile tunnels aren't flooded
for (const f of ['quartz', 'amber', 'lapis_lazuli', 'opal', 'gold', 'space_rock']) {
  tex(`/assets/geodes/${f}/open.png`);
  tex(`/assets/geodes/${f}/split_1.png`);
}
export function makeDustSprite(variant, size = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(`/assets/dust/dust_${variant}.png`), depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}
export function makeIconSprite(url, size = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(url), depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

// ---------- Treasure chest (CC0 gold chest + coin piles + gems + light beam) ----------
export function makeChest(color) {
  const g = new THREE.Group();
  g.add(spawn('chest_gold', 1.15));
  const coins = spawn('coin_piles', 0.42);
  coins.position.set(0.65, 0, 0.45);
  g.add(coins);
  const bag = spawn('gold_bag', 0.48);
  bag.position.set(-0.62, 0, 0.38);
  g.add(bag);
  const gem = tint(spawn('gem_pink', 0.38), color, { emissive: color, emissiveIntensity: 1.4 });
  gem.position.set(0.25, 0.05, 0.65);
  g.add(gem);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 30, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = 15;
  g.add(beam);
  const glow = new THREE.PointLight(color, 6, 6, 2);
  glow.position.y = 1.2;
  g.add(glow);
  g.userData.beam = beam;
  return g;
}

// ---------- Text sprite (cheap world label) ----------
export function makeTextSprite(text, color = '#fff', size = 1) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 48px "Lilita One", sans-serif';
  const w = g.measureText(text).width + 30;
  c.width = w; c.height = 70;
  g.font = 'bold 48px "Lilita One", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.8)';
  g.strokeText(text, w / 2, 36);
  g.fillStyle = color;
  g.fillText(text, w / 2, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set((w / 70) * size, size, 1);
  return s;
}

// ---------- Sculpted 3D Boogasaurus Camp Guardians (0: Raptor, 1: Triceratops, 2: Apex T-Rex) ----------
export function makeBoogasaurus(idx = 0, campColor = '#ffd23f') {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;

  const presets = [
    { name: 'Raptor Guardian', hide: '#32b846', belly: '#b9f59d', crest: '#ff9d00', scale: 1.0 },
    { name: 'Trike Guardian',  hide: '#d97724', belly: '#ffe0a3', crest: '#ffd615', scale: 1.15 },
    { name: 'T-Rex Guardian',  hide: '#c92a2a', belly: '#ffc9b5', crest: '#ffd615', scale: 1.3 },
  ];
  const cfg = presets[idx % presets.length];
  const hideMat = new THREE.MeshStandardMaterial({ color: cfg.hide, roughness: 0.55, flatShading: true });
  const bellyMat = new THREE.MeshStandardMaterial({ color: cfg.belly, roughness: 0.7, flatShading: true });
  const crestMat = new THREE.MeshStandardMaterial({ color: cfg.crest, emissive: cfg.crest, emissiveIntensity: 0.45, roughness: 0.35, flatShading: true });
  const collarMat = new THREE.MeshStandardMaterial({ color: campColor, emissive: campColor, emissiveIntensity: 0.6, roughness: 0.3, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffe04a' });
  const toothMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.58, 1.05), hideMat);
  torso.position.set(0, 0.78, 0);
  torso.rotation.x = -0.12;
  body.add(torso);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.92), bellyMat);
  belly.position.set(0, 0.54, 0.02);
  body.add(belly);

  // Tribe Collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14), collarMat);
  collar.position.set(0, 0.96, 0.42);
  collar.rotation.x = Math.PI / 3;
  body.add(collar);

  // Head & Snout
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0.58);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.44, 0.58), hideMat);
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.46), hideMat);
  snout.position.set(0, -0.04, 0.42);
  head.add(snout);

  // Jaws & Fangs
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), eyeMat);
    eye.position.set(s * 0.25, 0.08, 0.16);
    head.add(eye);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), toothMat);
    fang.rotation.x = Math.PI;
    fang.position.set(s * 0.14, -0.18, 0.52);
    head.add(fang);
  }

  if (idx === 1) {
    // Horned Triceratops Frill
    const horns = spawn('skull_horned', 0.68);
    horns.position.set(0, 0.12, 0.18);
    head.add(horns);
  }
  body.add(head);
  g.userData.head = head;

  // Dorsal Spikes & Swinging Tail
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 4), crestMat);
    sp.position.set(0, 1.12 - i * 0.06, 0.2 - i * 0.28);
    sp.rotation.x = -0.25;
    body.add(sp);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.95, 6), hideMat);
  tail.rotation.x = -Math.PI / 2 + 0.18;
  tail.position.set(0, 0.76, -0.88);
  body.add(tail);
  g.userData.tail = tail;

  // Articulated Legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.28, 0.58, 0.05);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.48, 0.28), hideMat);
    thigh.position.y = -0.22;
    leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.38), crestMat);
    foot.position.set(0, -0.48, 0.08);
    leg.add(foot);
    body.add(leg);
    if (s === -1) g.userData.leftLeg = leg;
    else g.userData.rightLeg = leg;
  }

  g.scale.setScalar(cfg.scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function animateBoogasaurus(g, dt, t, sprinting = false) {
  const spd = sprinting ? 14 : 6.5;
  const amp = sprinting ? 0.55 : 0.28;
  if (g.userData.leftLeg) g.userData.leftLeg.rotation.x = Math.sin(t * spd) * amp;
  if (g.userData.rightLeg) g.userData.rightLeg.rotation.x = -Math.sin(t * spd) * amp;
  if (g.userData.tail) g.userData.tail.rotation.z = Math.sin(t * spd * 0.8) * 0.25;
  if (g.userData.head) g.userData.head.rotation.x = Math.sin(t * spd * 0.5) * 0.1;
  if (g.userData.body) g.userData.body.position.y = Math.abs(Math.sin(t * spd)) * (sprinting ? 0.12 : 0.05);
}
