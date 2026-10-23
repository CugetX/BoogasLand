import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BoogaEngine } from './engine.js';
import { BAL, EGGS, DINOS, NODES, GEAR, RECIPES, ITEMS, TREASURES, RARITY, BOSSES, TROPHY_SHRINES, BOOGA_ZONES, BASE_UPGRADES, ICON, GEODE_STAGE_ICON, rollGeodeDust } from './config.js';
import { buildWorld, heightAt, biomeAt, zoneAt, isLandAt, sdfAt, getVolcanoPos, campCenter, rand, VOLCANO_R, setTutorialMap, isTutorialMap } from './world.js';
import { makeEgg, makeNode, makeDustSprite, makeIconSprite, makeChest, setGeodeStage, makeBoss, animateBoss } from './props.js';
import { spawn, tint } from './assets.js';
import { Camp, GAP, fmt } from './camp.js';
import { Actor, BotBrain } from './actors.js';
import { sfx } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'boogas_vault_v5';
const PLAYERS = [
  { name: 'Rok', color: '#ffd23f' },
  { name: 'James', color: '#ff5d5d' },
  { name: 'Joaquim', color: '#4dabf7' },
  { name: 'Cuget', color: '#63e06b' },
];

function makeGuideArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: '#ff3b1f',
    emissive: '#ff6a00',
    emissiveIntensity: 0.65,
    roughness: 0.25,
    flatShading: true,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#ffd615',
    emissive: '#ff9d00',
    emissiveIntensity: 0.55,
    roughness: 0.25,
    flatShading: true,
  });
  // Bold Mario-style red & gold 3D arrow pointing toward +Z in local space
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.8, 6), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.45;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.65, 6), goldMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.22;
  g.add(head, shaft);
  return g;
}

function makeGuideRing() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd615', transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.55, 28), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  g.userData.mat = mat;
  return g;
}

function makeRaidPursuitArrow() {
  const g = new THREE.Group();
  const crimsonMat = new THREE.MeshStandardMaterial({
    color: '#ff121e',
    emissive: '#ff0018',
    emissiveIntensity: 1.1,
    roughness: 0.2,
    flatShading: true,
  });
  const darkRedMat = new THREE.MeshStandardMaterial({
    color: '#ff3b3b',
    emissive: '#d60015',
    emissiveIntensity: 0.85,
    roughness: 0.25,
    flatShading: true,
  });
  // Large, unmissable Crimson Pursuit Arrow pointing toward +Z in local space
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.15, 6), crimsonMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.65;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.65, 6), darkRedMat);
  fin.rotation.x = Math.PI / 2;
  fin.position.z = 0.05;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.85, 6), darkRedMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.35;
  g.add(head, fin, shaft);

  const el = document.createElement('div');
  el.className = 'lbl lbl-raider-arrow';
  el.innerHTML = `<span>🚨 FOLLOW RAIDER</span>`;
  const lbl = new CSS2DObject(el);
  lbl.position.set(0, 0.9, 0.2);
  g.add(lbl);
  g.userData.lblEl = el;
  g.visible = false;
  return g;
}

function makeRaidPursuitRing() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: '#ff121e', transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.85, 28), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  g.add(ring);
  g.userData.mat = mat;
  g.visible = false;
  return g;
}

export class Game {
  constructor(canvasHost) {
    this.host = canvasHost;
    this.t = 0;
    this.now = 0;
    this.sfx = sfx;

    // Unified Mobile & Web 3D Engine (Renderer, Adaptive DPR/Quality, Spatial Physics, Zone Streamer & Touch/Web Input)
    this.engine = new BoogaEngine(canvasHost);
    this.renderer = this.engine.renderer;
    this.labels = this.engine.labels;
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;
    this.composer = this.engine.composer;
    this.clock = this.engine.clock;
    this.isTouch = this.engine.isTouch;

    this.cam = { yaw: Math.PI, pitch: 0.38, dist: 9 };

    const urlMode = new URLSearchParams(location.search).get('mode');
    this.initWorld(urlMode === 'tutorial' ? 'tutorial' : 'valley');

    this.ui = new UI(this);
    this.input = this.engine.attachGame(this);
    if (this.mode === 'valley') this.load();
    this.saveT = 0;
  }

  initWorld(mode = 'valley') {
    this.mode = mode;
    this.tutStep = 0;
    this.camPunch = 0;
    this.bountyIdx = 0;
    this.lastRank = -1;
    this.eventTimer = 38;
    this.activeEvent = null;
    setTutorialMap(mode === 'tutorial');
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    if (this.labels && this.labels.domElement) this.labels.domElement.innerHTML = '';

    this.world = buildWorld(this.scene, this.engine.isMobile);
    this.colliders = this.world.colliders;
    this.engine.physics.buildStaticGrid(this.colliders);
    const activePlayers = mode === 'tutorial' ? PLAYERS.slice(0, 2) : PLAYERS;
    this.camps = activePlayers.map((p, i) => new Camp(this.scene, i, p.color, p.name));
    this.camps.forEach((c) => (c.onHatch = (camp, nest, cfg) => this.onHatch(camp, nest, cfg)));
    this.actors = activePlayers.map((p, i) => new Actor(this, { ...p, camp: this.camps[i], isPlayer: i === 0 }));
    this.player = this.actors[0];
    this.bots = this.actors.slice(1).map((a) => new BotBrain(a));
    this.actors.forEach((a, i) => {
      const c = a.camp;
      const dist = mode === 'tutorial' && i > 0 ? 1.5 : 4;
      a.pos.copy(c.center).add(c.entranceDir.clone().multiplyScalar(dist));
      a.yaw = Math.atan2(c.entranceDir.x, c.entranceDir.z);
      if (i >= 2 && mode === 'valley') c.unlockShrine(0);
      if (i > 0) {
        if (mode === 'valley') {
          // Fortify rival Camps by default so Camp Raiding is a tactical siege!
          const startLvl = Math.min(4, i + 1); // James Lv.2, Joaquim Lv.3, Cuget Lv.4
          c.setLevel(startLvl);
          c.lockedUntil = Infinity;
          c.spawnDefenseTraps(i); // 1, 2, 3 Vine Traps guarding the Vault path
          if (i === 1) { a.gear.club_stone = 1; }
          if (i === 2) { a.gear.club_amber = 1; a.gear.suit_nomad = 1; }
          if (i === 3) { a.gear.sword_gold = 1; a.gear.suit_hunter = 1; }
          a.refreshWeapon();
          if (a.refreshSuit) a.refreshSuit();
        }
        a.dust = 280 + i * 160;
        a.inv = { rock: 3, wood: 3, amber: 2, gold: 2, bone: 2, opal: 1, cave_coin: 1 };
        a.unbankedDust = 45 + i * 20;
        a.unbankedItems = { rock: 1, amber: 1 };
      }
    });
    this.cam.yaw = this.player.yaw + Math.PI;

    this.trail = [];
    this.trailSpawnT = 0;
    this.nodes = [];
    this.bosses = [];
    this.crystals = [];
    this.chests = [];
    this.lootDrops = [];
    this.floaters = [];
    this.hubLabels = [];
    this.stats = { steals: 0, gathered: 0, collected: 0, bonks: 0, bosses: 0, emoted: 0 };

    this.spawnSocialHubProps();
    if (mode === 'tutorial') {
      this.spawnTutorialProps();
    } else {
      this.spawnNodes();
      this.spawnBosses();
      this.spawnCrystals();
      this.spawnChests();
    }
    this.camps[0].isMine = true;

    this.guideArrow = makeGuideArrow();
    this.guideRing = makeGuideRing();
    this.raidArrow = makeRaidPursuitArrow();
    this.raidRing = makeRaidPursuitRing();
    this.activeCampRaider = null;
    this.scene.add(this.guideArrow, this.guideRing, this.raidArrow, this.raidRing);
  }

  spawnSocialHubProps() {
    const hubX = isTutorialMap ? BAL.trailRadius : 60;
    const hubZ = isTutorialMap ? 0 : 240;
    this.forgePos = new THREE.Vector3(hubX + (isTutorialMap ? 0 : -9), heightAt(hubX + (isTutorialMap ? 0 : -9), hubZ), hubZ);
    this.hubAltarPos = new THREE.Vector3(hubX + (isTutorialMap ? -BAL.trailRadius * 2 : 9), heightAt(hubX + (isTutorialMap ? -BAL.trailRadius * 2 : 9), hubZ), hubZ);

    // 1. Grand Volcano Forge Anvil in Booga Town Plaza
    const forgeGrp = new THREE.Group();
    forgeGrp.position.copy(this.forgePos);
    const anvilBase = spawn('rock_path_wide', 2.4, 'max');
    forgeGrp.add(anvilBase);
    const cauldron = tint(spawn('cauldron', 1.25), '#ff6a00', { emissive: '#ff3b00', emissiveIntensity: 1.8 }, /orange|soup/i);
    cauldron.position.set(0, 0.05, 0);
    forgeGrp.add(cauldron);
    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.06;
    forgeGrp.add(glowRing);
    const fEl = document.createElement('div');
    fEl.className = 'lbl lbl-camp';
    fEl.style.setProperty('--c', '#ff7a1a');
    fEl.innerHTML = `<b>VOLCANO FORGE [C]</b>`;
    const fLbl = new CSS2DObject(fEl);
    fLbl.position.y = 3.6;
    forgeGrp.add(fLbl);
    this.scene.add(forgeGrp);
    this.hubLabels.push({ pos: this.forgePos, el: fEl, lbl: fLbl, maxD: 16 });

    // 2. Booga Town Relic Exchange Altar
    const townGrp = new THREE.Group();
    townGrp.position.copy(this.hubAltarPos);
    const relicChest = spawn('chest_gold', 1.15);
    relicChest.position.set(0, 0.08, 0);
    townGrp.add(relicChest);
    const tRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: '#42f54b', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
    );
    tRing.rotation.x = -Math.PI / 2;
    tRing.position.y = 0.06;
    townGrp.add(tRing);
    const tEl = document.createElement('div');
    tEl.className = 'lbl lbl-camp';
    tEl.style.setProperty('--c', '#42f54b');
    tEl.innerHTML = `<b>RELIC ALTAR [T]</b>`;
    const tLbl = new CSS2DObject(tEl);
    tLbl.position.y = 3.6;
    townGrp.add(tLbl);
    this.scene.add(townGrp);
    this.hubLabels.push({ pos: this.hubAltarPos, el: tEl, lbl: tLbl, maxD: 16 });

    // 3. 12 Zone Waypoint Labels on the Booga Continent
    if (!isTutorialMap) {
      for (const zn of BOOGA_ZONES) {
        const sp = new THREE.Vector3(zn.x, heightAt(zn.x, zn.z), zn.z);
        const sGrp = new THREE.Group();
        sGrp.position.copy(sp);
        const sEl = document.createElement('div');
        sEl.className = 'lbl lbl-small';
        sEl.innerHTML = `<b style="color:${zn.color}">${zn.name.toUpperCase()} · STEP ${zn.step} [M]</b>`;
        const sLbl = new CSS2DObject(sEl);
        sLbl.position.y = 4.8;
        sGrp.add(sLbl);
        this.scene.add(sGrp);
        this.hubLabels.push({ pos: sp, el: sEl, lbl: sLbl, maxD: 22 });
      }
    }
  }

  switchMode(mode, keepGradPack = false) {
    if (this.mode === mode && this.started && !keepGradPack) return;
    if (this.ui) this.ui.closePanels();
    this.initWorld(mode);
    if (mode === 'valley') {
      this.load();
      if (keepGradPack || this.tutGraduated) {
        const p = this.player;
        p.graduated = true;
        p.dust = Math.max(p.dust, 300);
        p.gear.club_stone = 1;
        p.traps = Math.max(p.traps, 2);
        p.refreshWeapon();
        this.save();
      }
    }
    if (this.ui) {
      this.ui.buildBg();
      this.ui.updateModeButton();
      if (keepGradPack) {
        this.ui.banner('GRADUATE BONUS ACTIVE', '+250 Dust · Stone Club · 2 Traps · +10% Loot Bonus', '#ffd615');
      } else {
        this.ui.toast(mode === 'tutorial' ? 'Welcome to Geode Academy. Follow the Guide Arrow.' : 'Welcome to the Boogas Continent.', 'dust_icon', 'good', true);
      }
    }
  }

  createGeodeNode(type, biome, pos, scale = 1) {
    const cfg = NODES[type] || NODES.quartz;
    const mesh = makeNode(type, biome);
    mesh.position.copy(pos);
    mesh.rotation.y = rand() * Math.PI * 2;
    mesh.scale.setScalar(scale);
    const el = document.createElement('div');
    el.className = 'lbl lbl-geode hidden';
    el.innerHTML = `<b style="color:${cfg.vein}">${cfg.name}</b><div class="g-hp"><i style="width:100%"></i></div>`;
    const lbl = new CSS2DObject(el);
    lbl.position.y = 2.0;
    mesh.add(lbl);
    this.scene.add(mesh);
    const node = {
      type,
      biome,
      step: cfg.step || 1,
      pos,
      mesh,
      r: mesh.userData.radius * scale,
      alive: true,
      respawn: 0,
      scale,
      hp: cfg.hp || 100,
      maxHp: cfg.hp || 100,
      stage: 1,
      shake: 0,
      dmgBy: {},
      el,
      lbl,
      stageImg: el.querySelector('.g-stage-img'),
      stageSpan: el.querySelector('.g-st'),
      dmgSpan: el.querySelector('.g-dmg'),
      hpBar: el.querySelector('.g-hp i'),
    };
    this.nodes.push(node);
    return node;
  }

  spawnTutorialProps() {
    const c = this.camps[0];
    const dir = c.entranceDir.clone();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // Breadcrumb trail of 7 Dust crystals from Rok's Camp gate straight to the Prime Geode Ring
    for (let i = 0; i < 7; i++) {
      const dist = c.R + 2.2 + i * 1.5;
      const p = c.center.clone().add(dir.clone().multiplyScalar(dist));
      p.y = heightAt(p.x, p.z);
      const sprite = makeDustSprite(1, 0.9);
      this.scene.add(sprite);
      this.crystals.push({ pos: p, sprite, value: 8, alive: true, base: p.y + 0.65, ph: i * 0.7, respawn: 0 });
    }
    // 4 starter 3D Geodes right beside Rok's camp gate (Quartz, Wood, Amber, Whisperleaf)
    const starterNodes = [
      ['quartz', 4.5, 5.5],
      ['wood', -4.5, 5.5],
      ['amber', 6.8, 2.5],
      ['whisperleaf', -6.8, 2.5],
    ];
    for (const [type, sx, dz] of starterNodes) {
      const p = c.center.clone().add(dir.clone().multiplyScalar(c.R + dz)).add(side.clone().multiplyScalar(sx));
      p.y = heightAt(p.x, p.z);
      this.createGeodeNode(type, 'meadow', p, 1.05);
    }
    // 1 glowing Treasure Chest right outside your camp
    const cp = c.center.clone().add(side.clone().multiplyScalar(c.R + 4.8));
    cp.y = heightAt(cp.x, cp.z);
    const chMesh = makeChest('#ffd166');
    chMesh.position.copy(cp);
    this.scene.add(chMesh);
    this.chests.push({ tr: TREASURES[0], alive: true, respawn: 0, mesh: chMesh, pos: cp });
  }

  // ---------------- spawning ----------------
  randomPoint(filter, tries = 80) {
    if (isTutorialMap) {
      for (let i = 0; i < tries; i++) {
        const a = rand() * Math.PI * 2, r = 20 + Math.sqrt(rand()) * 34;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(r - BAL.trailRadius) < 4.5) continue;
        if (this.camps.some((c) => Math.hypot(x - c.center.x, z - c.center.z) < c.R + 4)) continue;
        if (filter && !filter(x, z)) continue;
        return new THREE.Vector3(x, heightAt(x, z), z);
      }
      return null;
    }
    const vp = getVolcanoPos();
    for (let i = 0; i < tries; i++) {
      const x = (rand() - 0.5) * 1680;
      const z = (rand() - 0.5) * 1680;
      if (sdfAt(x, z) < 2.5) continue;
      if (Math.hypot(x - vp.x, z - vp.z) < VOLCANO_R + 5) continue;
      if (this.camps.some((c) => Math.hypot(x - c.center.x, z - c.center.z) < c.R + 6)) continue;
      if (BOOGA_ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < 7.0)) continue;
      if (filter && !filter(x, z)) continue;
      return new THREE.Vector3(x, heightAt(x, z), z);
    }
    return null;
  }

  spawnNodes() {
    // 1. 2 starter Geodes (50 HP = 2 hits) right outside Rok's Camp gate in Booga Town
    const myCamp = this.camps[0];
    if (myCamp) {
      const dir = myCamp.entranceDir.clone();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      for (const [type, sx, dz] of [['quartz', 3.2, 5.5], ['wood', -3.2, 5.5]]) {
        const p = myCamp.center.clone().add(dir.clone().multiplyScalar(myCamp.R + dz)).add(side.clone().multiplyScalar(sx));
        p.y = heightAt(p.x, p.z);
        const nd = this.createGeodeNode(type, 'meadow', p, 1.12);
        if (nd) { nd.hp = 50; nd.maxHp = 50; }
      }
    }

    // 2. Populate every single one of the 12 expansive Booga Biomes with 18-22 sculpted Geode veins (~225 Geodes across the continent)
    const vp = getVolcanoPos();
    for (const zn of BOOGA_ZONES) {
      const types = zn.geodes || ['quartz', 'wood', 'dust'];
      const count = zn.id === 'jungle' || zn.id === 'desert' ? 22 : 18;
      for (let i = 0; i < count; i++) {
        const type = types[i % types.length];
        let placed = false;
        // First 4 Geodes spawn in an inner ring (16m-36m) near the landmark; remaining 14-18 spread across the full 150m-210m biome expanse!
        const isInner = i < 4;
        for (let tr = 0; tr < 55 && !placed; tr++) {
          const ang = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.85;
          const dist = isInner
            ? 16 + rand() * 20
            : 38 + rand() * ((zn.radius || 165) * 0.65);
          const x = zn.x + Math.cos(ang) * dist;
          const z = zn.z + Math.sin(ang) * dist;
          if (sdfAt(x, z) < 2.2) continue;
          if (Math.hypot(x - vp.x, z - vp.z) < VOLCANO_R + 5) continue;
          if (this.camps.some((c) => Math.hypot(x - c.center.x, z - c.center.z) < c.R + 6)) continue;
          if (this.nodes.some((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < 12.5)) continue;
          const pos = new THREE.Vector3(x, heightAt(x, z), z);
          const s = 1.04 + rand() * 0.32;
          const nd = this.createGeodeNode(type, zn.biome, pos, s);
          if (nd) nd.zoneId = zn.id;
          placed = true;
        }
      }
    }
  }

  spawnBosses() {
    const bossZoneMap = {
      bat: 'haunted_woods',
      shaman_cyborg: 'jungle',
      ancient_mummy: 'ancient_runes',
      cyborg_leader: 'lost_island',
    };
    for (const cfg of BOSSES) {
      const zId = bossZoneMap[cfg.id] || 'jungle';
      const zn = BOOGA_ZONES.find((z) => z.id === zId) || BOOGA_ZONES[4];
      const x = zn.x + 22, z = zn.z + 16;
      const home = new THREE.Vector3(x, heightAt(x, z), z);
      const mesh = makeBoss(cfg);
      mesh.position.copy(home);
      mesh.scale.setScalar(cfg.scale || 1.5);
      mesh.visible = false;
      const el = document.createElement('div');
      el.className = 'lbl lbl-boss hidden';
      el.innerHTML = `<b style="color:${cfg.color}">BOSS · ${cfg.name.toUpperCase()}</b><div class="g-hp boss-hp"><i style="width:100%"></i></div>`;
      const lbl = new CSS2DObject(el);
      lbl.position.y = 3.35;
      mesh.add(lbl);
      this.scene.add(mesh);
      this.bosses.push({
        cfg,
        biome: cfg.biome,
        zoneId: zId,
        zoneName: zn.name,
        home,
        pos: home.clone(),
        patrolAngle: 0,
        r: 1.85,
        mesh,
        el,
        lbl,
        hpBar: el.querySelector('.boss-hp i'),
        dmgEl: el.querySelector('.boss-dmg'),
        hp: cfg.hp,
        maxHp: cfg.hp,
        dmgBy: {},
        alive: false,
        respawn: 0,
        atkCd: 1.5,
        slamCd: 5.0,
        slamWindup: 0,
        swingT: 0,
      });
    }
    this.bossSpawnTimer = 22;
    this.spawnRandomBoss(null, false);
  }

  activateBoss(b, announce = true) {
    if (!b) return null;
    for (const o of this.bosses) {
      if (o !== b && o.alive) {
        o.alive = false;
        o.mesh.visible = false;
        if (o.el) o.el.classList.add('hidden');
      }
    }
    const zn = BOOGA_ZONES.find((z) => z.id === b.zoneId) || BOOGA_ZONES[4];
    const ang = rand() * Math.PI * 2;
    const dist = 20 + rand() * 28;
    const bx = zn.x + Math.cos(ang) * dist;
    const bz = zn.z + Math.sin(ang) * dist;
    b.home.set(bx, heightAt(bx, bz), bz);
    b.pos.copy(b.home);
    b.mesh.position.copy(b.pos);
    b.hp = b.maxHp;
    b.dmgBy = {};
    b.alive = true;
    b.mesh.visible = true;
    b.atkCd = 2.4;
    b.slamCd = 6.5;
    b.slamWindup = 0;
    b.atkWindup = 0;
    b.recoverT = 0;
    b.swingT = 0;
    if (b.hpBar) b.hpBar.style.width = '100%';
    this.puff(b.pos, b.cfg.color || '#ff5a36');
    if (announce && this.ui && this.started) {
      sfx.alarm();
      this.ui.banner(
        `WORLD BOSS · ${b.cfg.name.toUpperCase()}`,
        `Sighted in ${b.zoneName || b.cfg.locationName} [M] — Top Damage claims the Shrine & Loot`,
        b.cfg.color || '#ff5a36'
      );
    }
    return b;
  }

  spawnRandomBoss(forceBiome = null, announce = true) {
    if (!this.bosses || !this.bosses.length) return null;
    if (forceBiome) {
      const fb = this.bosses.find((b) => b.biome === forceBiome);
      if (fb) return this.activateBoss(fb, announce);
    }
    const dead = this.bosses.filter((b) => !b.alive);
    const pool = dead.length ? dead : this.bosses;
    const pick = pool[Math.floor(rand() * pool.length)];
    return this.activateBoss(pick, announce);
  }

  spawnCrystals() {
    const count = isTutorialMap ? BAL.dustCrystals : 130;
    for (let i = 0; i < count; i++) this.spawnCrystal();
  }
  spawnCrystal(c) {
    const p = this.randomPoint(() => true);
    if (!p) return;
    const variant = 1 + Math.floor(rand() * 5);
    const value = { 1: 10, 2: 8, 3: 5, 4: 3, 5: 3 }[variant];
    if (c) {
      this.scene.remove(c.sprite);
      c.sprite = makeDustSprite(variant, 0.5 + value * 0.055);
      c.value = value; c.pos.copy(p); c.alive = true; c.base = p.y + 0.6;
      this.scene.add(c.sprite);
      return;
    }
    const sprite = makeDustSprite(variant, 0.5 + value * 0.055);
    this.scene.add(sprite);
    this.crystals.push({ pos: p, sprite, value, alive: true, base: p.y + 0.6, ph: rand() * 6, respawn: 0 });
  }

  spawnChests() {
    for (const tr of TREASURES) {
      const ch = { tr, alive: false, respawn: 2 + rand() * 6, mesh: null, pos: new THREE.Vector3() };
      this.chests.push(ch);
    }
  }
  placeChest(ch) {
    const p = this.randomPoint((x, z) => biomeAt(x, z) === ch.tr.biome && !this.nodes.some((n) => Math.hypot(n.pos.x - x, n.pos.z - z) < 3.5));
    if (!p) { ch.respawn = 5; return; }
    const colors = { cave_treasure: '#ffb347', desert_treasure: '#ffd166', jungle_treasure: '#7dff6a', runes_treasure: '#7ae7ff' };
    ch.mesh = makeChest(colors[ch.tr.id]);
    ch.mesh.position.copy(p);
    ch.mesh.rotation.y = rand() * 6;
    this.scene.add(ch.mesh);
    ch.pos.copy(p);
    ch.alive = true;
  }

  spawnEgg(angle = 0.02, forceId = null) {
    let cfg;
    if (typeof forceId === 'string') cfg = EGGS.find((e) => e.id === forceId);
    else {
      const pool = typeof forceId === 'number' ? EGGS.slice(0, forceId) : EGGS;
      const tot = pool.reduce((s, e) => s + e.weight, 0);
      let r = rand() * tot;
      cfg = pool.find((e) => (r -= e.weight) < 0) || pool[0];
    }
    const mesh = makeEgg(cfg, 1.35);
    this.scene.add(mesh);
    const el = document.createElement('div');
    el.className = 'lbl lbl-egg hidden';
    el.innerHTML = `<b style="color:var(--r-${cfg.rarity})">${cfg.name}</b><small style="color:var(--r-${cfg.rarity})">${RARITY[cfg.rarity].name}</small><span class="cost"><img src="/assets/items/dust_icon.png">${fmt(cfg.cost)}</span><small class="rate">${DINOS[cfg.dino].name} · +${fmt(DINOS[cfg.dino].rate)}/s</small>`;
    const lbl = new CSS2DObject(el);
    lbl.position.y = 2.4;
    mesh.add(lbl);
    // rarity glow ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 24), new THREE.MeshBasicMaterial({ color: RARITY[cfg.rarity].color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    mesh.add(ring);
    const egg = { cfg, a: angle, traveled: angle, mesh, el, alive: true, pos: new THREE.Vector3() };
    this.trail.push(egg);
    if (['epic', 'legendary', 'mythic'].includes(cfg.rarity) && this.ui) {
      this.ui.banner(`${RARITY[cfg.rarity].name.toUpperCase()} GEODE on the Volcano Ring!`, cfg.name, RARITY[cfg.rarity].color);
    }
    return egg;
  }

  // ---------------- actions ----------------
  buyEgg(actor, egg) {
    if (!egg.alive || actor.carrying || actor.stun > 0) return false;
    if (actor.dust < egg.cfg.cost) { if (actor.isPlayer) { sfx.error(); this.ui.toast('Not enough Dust!', 'dust_icon', 'bad'); } return false; }
    if (!actor.camp.freeNest()) { if (actor.isPlayer) { sfx.error(); this.ui.toast('Your camp is full! Craft a Nest Expansion.', 'clay', 'bad'); } return false; }
    actor.dust -= egg.cfg.cost;
    egg.alive = false;
    this.scene.remove(egg.mesh);
    egg.el.remove();
    actor.setCarry({ kind: 'egg', egg: egg.cfg.id, from: null });
    if (actor.isPlayer) { sfx.buy(); this.ui.toast(`Acquired ${egg.cfg.name}! Carry it to a Camp Pedestal.`, 'dust_icon'); }
    return true;
  }

  steal(actor, camp, nest) {
    if (!nest.content || actor.carrying) return;
    const item = camp.clear(nest);
    actor.setCarry({ ...item, from: camp, fromNest: nest.i });
    const name = item.kind === 'dino' ? DINOS[item.dino].name : EGGS.find((e) => e.id === item.egg).name;
    if (actor.isPlayer) { sfx.steal(); this.ui.toast(`GEODE HEIST! You grabbed ${camp.ownerName}'s ${name}! RUN!`, 'claws'); }
    if (camp.owner.isPlayer) { sfx.alarm(); this.ui.banner(`${actor.name} stole your ${name}!`, 'Bonk them (5s Dizzy) before they escape!', '#ff4d4d'); }
  }

  deliver(actor) {
    let nest = actor.camp.freeNest();
    if (!nest && !actor.isPlayer) {
      const worst = actor.camp.occupiedNests().sort((x, y) => (x.content.kind === 'dino' ? this.dinoValue(x.content.dino) : 0) - (y.content.kind === 'dino' ? this.dinoValue(y.content.dino) : 0))[0];
      if (worst) actor.camp.clear(worst);
      nest = actor.camp.freeNest();
    }
    if (!nest) return false;
    const item = actor.carrying;
    let initT = item.t;
    if (item.kind === 'egg' && this.mode === 'tutorial') {
      const cfg = EGGS.find((e) => e.id === item.egg);
      initT = Math.max(0, (cfg ? cfg.hatch : 5) - 2.2);
    }
    actor.camp.place(nest, { kind: item.kind, egg: item.egg, dino: item.dino, t: initT });
    actor.setCarry(null);
    if (actor.isPlayer) {
      sfx.pickup();
      if (item.from) {
        const baseVal = item.kind === 'dino' ? DINOS[item.dino].rate * 30 : 50;
        const heistBonus = Math.max(60, Math.round(baseVal * (this.activeEvent?.kind === 'heist' ? 2 : 1)));
        actor.dust += heistBonus;
        this.stats.steals++;
        this.puff(nest.world, '#ffd615');
        this.floatText(nest.world, `GEODE HEIST! +${fmt(heistBonus)}`, '#ffd615', '/assets/items/dust_icon.png');
        this.ui.toast(`Geode Heist complete! +${fmt(heistBonus)} Dust Bonus & ${DINOS[item.dino] ? DINOS[item.dino].name : 'Prime Geode'} is yours!`, 'cave_coin', 'good', true);
      } else {
        this.ui.toast('Prime Geode placed on pedestal. Cracking open…', 'dust_icon');
      }
    }
    if (item.from && item.from.owner.isPlayer) this.ui.toast(`${actor.name} got away with your Geode Core…`, 'claws', 'bad');
    return true;
  }

  dropCarry(actor) {
    const item = actor.carrying;
    if (!item) return;
    actor.setCarry(null);
    if (item.from) {
      const c = item.from;
      const n = c.nests[item.fromNest] && !c.nests[item.fromNest].content && c.nests[item.fromNest].active ? c.nests[item.fromNest] : c.freeNest();
      if (n) c.place(n, { kind: item.kind, egg: item.egg, dino: item.dino, t: item.t });
      if (c.owner.isPlayer) this.ui.toast('Your Geode Core returned to its pedestal!', 'bone', 'good');
      if (actor.isPlayer) this.ui.toast('Dropped it! The Geode Core returned to its pedestal.', 'bone', 'bad');
    } else {
      // a bought prime geode returns to the owner's pedestal
      const n = actor.camp.freeNest();
      if (n) actor.camp.place(n, { kind: item.kind, egg: item.egg, dino: item.dino, t: 0 });
    }
  }

  hitGeode(att, n, dmgMult = 1) {
    if (!n || !n.alive) return false;
    const cfg = NODES[n.type] || NODES.quartz;
    const dmg = Math.max(12, Math.round((att.geodePower || 20) * dmgMult * (this.mode === 'tutorial' ? 1.75 : 1)));
    if (!n.dmgBy) n.dmgBy = {};
    n.dmgBy[att.name] = (n.dmgBy[att.name] || 0) + dmg;
    n.hp = Math.max(0, n.hp - dmg);
    n.shake = 0.24;
    const pctLost = 1 - (n.hp / n.maxHp);
    const newStage = n.hp <= 0 ? 7 : Math.min(6, 1 + Math.floor(pctLost * 6));
    if (newStage !== n.stage) {
      n.stage = newStage;
      setGeodeStage(n.mesh, newStage);
      if (n.stageImg) n.stageImg.src = GEODE_STAGE_ICON(cfg.stageFolder, newStage);
      if (n.stageSpan) n.stageSpan.textContent = String(newStage);
    }
    if (n.hpBar) n.hpBar.style.width = `${Math.max(0, (n.hp / n.maxHp) * 100)}%`;
    if (n.dmgSpan) {
      const rank = Object.entries(n.dmgBy).sort((a, b) => b[1] - a[1]);
      n.dmgSpan.style.display = 'block';
      n.dmgSpan.textContent = rank.map(([nm, d], idx) => `${idx === 0 ? '🥇' : '⚔️'} ${nm}:${d}`).join(' · ');
    }

    if (att.isPlayer) {
      sfx.gather();
      this.camPunch = Math.max(this.camPunch, 0.14);
      this.puff(n.pos, cfg.crystal || '#ffe04a');
      if (n.hp > 0) {
        this.floatText(
          n.pos,
          `-${dmg} HP · STAGE ${n.stage}/7`,
          cfg.crystal || '#ffe04a',
          GEODE_STAGE_ICON(cfg.stageFolder, n.stage)
        );
      }
    }
    if (n.hp <= 0) {
      this.shatterGeode(att, n);
    }
    return true;
  }

  spawnLootPinata(originPos, { dust = 0, items = [], owner = null, lockT = 0.9, color = '#ffd615' } = {}) {
    if (!this.lootDrops) this.lootDrops = [];
    const entries = [];
    if (dust > 0) {
      const gemCount = Math.min(8, Math.max(3, Math.ceil(dust / 18)));
      const perGem = Math.max(2, Math.round(dust / gemCount));
      for (let i = 0; i < gemCount; i++) {
        entries.push({ kind: 'dust', val: perGem });
      }
    }
    for (const [id, q] of items) {
      const cnt = Math.min(4, Math.max(1, q));
      for (let i = 0; i < cnt; i++) {
        entries.push({ kind: 'item', id, qty: 1 });
      }
    }
    const tot = entries.length;
    entries.forEach((ent, idx) => {
      const grp = new THREE.Group();
      const ringCol = ent.kind === 'dust' ? '#c77dff' : color;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.38, 16),
        new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.35;
      grp.add(ring);

      const sp = ent.kind === 'dust'
        ? makeDustSprite(1 + (idx % 3), 0.72)
        : makeIconSprite(ICON(ent.id), 0.76);
      grp.add(sp);

      const ang = (idx / Math.max(1, tot)) * Math.PI * 2 + (rand() - 0.5) * 0.45;
      const spd = 2.2 + rand() * 3.2;
      const pos = new THREE.Vector3(originPos.x, heightAt(originPos.x, originPos.z) + 0.85, originPos.z);
      grp.position.copy(pos);
      this.scene.add(grp);
      this.lootDrops.push({
        ...ent,
        mesh: grp,
        pos,
        vx: Math.cos(ang) * spd,
        vz: Math.sin(ang) * spd,
        vy: 5.2 + rand() * 3.8,
        age: 0,
        ttl: 28,
        owner,
        lockT,
      });
    });
  }

  triggerEmote(actor = this.player, slot = 1) {
    if (!actor || actor.stun > 0) return;
    const wName = GEAR[actor.weapon]?.name || 'Wooden Club';
    const sName = actor.suit && GEAR[actor.suit] ? ` & ${GEAR[actor.suit].name}` : '';
    const activeBoss = this.bosses ? this.bosses.find((b) => b.alive) : null;
    const bossTxt = activeBoss ? `${activeBoss.cfg.name} in ${activeBoss.cfg.locationName}` : 'the next World Boss';
    const messages = {
      1: `👋 Yo Boogas! Meet me at the Volcano Forge Hub!`,
      2: `💪 Flexing my ${wName}${sName} (${actor.geodePower} DMG)!`,
      3: `⚔️ Rally on ${bossTxt}! Team up for loot!`,
      4: `🔥 Come fight me in the Wild Frontier if you dare!`,
    };
    const msg = messages[slot] || messages[1];
    actor.say(msg, 4.0);
    if (actor.onGround) {
      actor.vy = 6.2;
      actor.onGround = false;
    }
    if (actor.booga && (slot === 2 || slot === 4)) actor.booga.attackT = 0;
    this.puff(actor.pos, slot === 2 ? '#ffd615' : slot === 3 ? '#42f54b' : slot === 4 ? '#ff5a36' : '#5fd4ff');

    if (actor.isPlayer) {
      sfx.pickup();
      this.stats.emoted = (this.stats.emoted || 0) + 1;
      // Nearby Boogas respond socially & rally with you!
      for (const b of this.bots) {
        const bot = b.a;
        if (bot.stun > 0) continue;
        const dist = bot.pos.distanceTo(actor.pos);
        if (dist < 42) {
          setTimeout(() => {
            if (bot.stun > 0) return;
            bot.yaw = Math.atan2(actor.pos.x - bot.pos.x, actor.pos.z - bot.pos.z);
            if (bot.onGround) { bot.vy = 5.5; bot.onGround = false; }
            if (slot === 1) {
              bot.say(`👋 Yo ${actor.name}! Safe travels in the Frontier!`, 3.5);
            } else if (slot === 2) {
              bot.say(`🔥 Sick ${wName}, ${actor.name}! Check out my ${GEAR[bot.weapon]?.name || 'Club'}!`, 3.5);
            } else if (slot === 3) {
              bot.say(`⚔️ I'm with you ${actor.name}! Charging ${bossTxt}!`, 3.8);
              if (activeBoss) {
                b.task = 'boss';
                b.target = activeBoss;
                b.goalAge = 0;
                b.goal = activeBoss.pos.clone();
              }
            } else if (slot === 4) {
              bot.say(`😤 Watch your Loot Pack outside the Hub, ${actor.name}!`, 3.5);
            }
          }, 350 + Math.floor(rand() * 450));
        }
      }
    }
  }

  unlockTrophyFor(actor, treasureId) {
    if (!actor || !treasureId) return false;
    const isNew = !actor.treasures[treasureId];
    actor.treasures[treasureId] = (actor.treasures[treasureId] || 0) + 1;
    const shrineCfg = TROPHY_SHRINES.find((s) => s.id === treasureId);
    if (shrineCfg && actor.camp) {
      actor.camp.unlockShrine(shrineCfg.idx);
    }
    return isNew;
  }

  /**
   * Spill 100% of `victim`'s Unbanked Carried Loot Bag onto the ground as physical 3D loot drops!
   * Drops ONLY what the victim was actually carrying in their Loot Bag — zeroing it out immediately
   * so smashing them again drops nothing until they gather more loot.
   */
  spillUnbankedLoot(victim, attacker = null, wasThief = false) {
    const lostDust = Math.floor(victim.unbankedDust || 0);
    victim.unbankedDust = 0;

    const spilledItems = [];
    for (const id in victim.unbankedItems) {
      const have = victim.unbankedItems[id] || 0;
      if (have <= 0) continue;
      spilledItems.push([id, have]);
    }
    victim.unbankedItems = {};
    victim.raidedFrom = null;

    const totalPinataDust = lostDust;
    if (totalPinataDust > 0 || spilledItems.length > 0) {
      this.spawnLootPinata(victim.pos, {
        dust: totalPinataDust,
        items: spilledItems,
        owner: attacker,
        lockT: attacker ? 1.1 : 0.4,
        color: wasThief ? '#ff3b3b' : '#ffe04a',
      });
    }
    return { lostDust, totalPinataDust, spilledItems };
  }

  shatterGeode(att, n) {
    if (!n || !n.alive) return;
    const cfg = NODES[n.type] || NODES.quartz;
    n.alive = false;
    n.respawn = this.mode === 'tutorial' ? 4.5 : 38 + rand() * 20;
    n.crackAnim = 1.75; // Play the hand-drawn split-open crystal interior animation before fading out
    n.stage = 'split_1';
    setGeodeStage(n.mesh, 'split_1');
    if (n.el) n.el.classList.add('hidden');

    // Whoever dealt the MOST DAMAGE to this Geode wins the primary claim
    const rank = Object.entries(n.dmgBy || {}).sort((a, b) => b[1] - a[1]);
    const winnerName = rank.length ? rank[0][0] : att.name;
    const topDmg = rank.length ? rank[0][1] : 100;
    const winner = this.actors.find((a) => a.name === winnerName) || att;
    const playerDealt = (n.dmgBy && n.dmgBy[this.player.name]) || 0;
    winner.geodesCracked = (winner.geodesCracked || 0) + 1;

    // Spreadsheet weighted Dust roll (60%->1, 20%->2, 10%->3, 6%->4, 4%->5) scaled by Biome Step
    const rawDustRoll = rollGeodeDust(rand);
    const suitMult = winner.incomeMult || 1;
    const dustGain = Math.max(14, Math.round(rawDustRoll * (cfg.dustMult || 1) * suitMult * 12));
    winner.addFieldDust(dustGain);

    const got = [];
    for (const [id, mn, mx, ch] of cfg.drops) {
      if (this.mode === 'tutorial' || rand() < ch) {
        const q = mn + Math.floor(rand() * (mx - mn + 1));
        winner.addItem(id, q, true);
        got.push([id, q]);
      }
    }
    if (got.length === 0 && cfg.drops.length > 0) {
      const [id, mn] = cfg.drops[0];
      winner.addItem(id, mn, true);
      got.push([id, mn]);
    }
    // StarterGeode guarantee: ensure Rock + Wood are in the Loot Bag for Step 1->4 progression
    if (this.bountyIdx === 0 && winner.isPlayer) {
      if ((winner.unbankedItems.rock || 0) + (winner.inv.rock || 0) < 2) winner.addItem('rock', 2, true);
      if ((winner.unbankedItems.wood || 0) + (winner.inv.wood || 0) < 2) winner.addItem('wood', 2, true);
    }

    // Erupt physical 3D crystal & material drops around the cracked Geode
    this.spawnLootPinata(n.pos, {
      dust: Math.max(10, Math.round(dustGain * 0.5)),
      items: got.slice(0, 2).map(([id]) => [id, 1]),
      owner: winner,
      lockT: 0.9,
      color: cfg.crystal || '#5fd4ff',
    });

    if (winner.isPlayer) {
      sfx.hatch();
      this.puff(n.pos, cfg.crystal || '#5fd4ff');
      this.puff(n.pos, '#ffd615');
      this.stats.gathered++;
      this.stats.geodesCracked = (this.stats.geodesCracked || 0) + 1;
      if ((n.step || 1) >= 2) this.stats.jungleOrHigherCracked = (this.stats.jungleOrHigherCracked || 0) + 1;
      const contested = rank.length > 1;
      this.floatText(
        n.pos,
        contested ? `TOP DMG · +${dustGain} DUST (IN BAG)` : `+${dustGain} DUST · RETURN TO CAMP`,
        '#ffd615',
        GEODE_STAGE_ICON(cfg.stageFolder, 7)
      );
      got.forEach(([id, q], i) => {
        setTimeout(() => {
          if (ITEMS[id]) this.ui.toast(`+${q} ${ITEMS[id].name} added to Loot Bag — Extract to Camp`, id, 'good');
        }, i * 110);
      });
      this.ui.refreshPanels();
    } else if (playerDealt > 0) {
      sfx.error();
      this.floatText(n.pos, `${winner.name} Claimed Geode (${topDmg} DMG)`, '#ff5d5d');
      this.ui.toast(`${winner.name} dealt top damage (${topDmg}). Bonk ${winner.name} before they reach their Camp!`, 'wood', 'bad', true);
    }
  }

  hitBoss(att, b) {
    if (!b) return false;
    if (!b.alive) this.activateBoss(b, false);
    const dmg = Math.max(16, Math.round((att.geodePower || 20) * 1.15));
    if (!b.dmgBy) b.dmgBy = {};
    b.dmgBy[att.name] = (b.dmgBy[att.name] || 0) + dmg;
    b.hp = Math.max(0, b.hp - dmg);
    b.mesh.userData.hitT = 0.25;
    if (b.hpBar) b.hpBar.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;

    const rank = Object.entries(b.dmgBy).sort((x, y) => y[1] - x[1]);
    if (b.dmgEl) {
      b.dmgEl.textContent = rank
        .slice(0, 3)
        .map(([nm, d], idx) => `#${idx + 1} ${nm}: ${d}`)
        .join(' · ');
    }

    if (att.isPlayer) {
      sfx.bonk();
      this.camPunch = 0.24;
      this.puff(b.pos, b.cfg.color || '#ff5a36');
      this.floatText(b.pos, `-${dmg} HP (${b.dmgBy[att.name]} Total)`, b.cfg.color || '#ff5a36');
    } else if (this.player.pos.distanceTo(b.pos) < 28) {
      this.floatText(b.pos, `${att.name}: -${dmg} HP`, att.color || '#fff');
    }

    if (b.hp <= 0) {
      b.alive = false;
      b.respawn = 0;
      b.mesh.visible = false;
      if (b.el) b.el.classList.add('hidden');
      this.bossSpawnTimer = 26 + rand() * 16;

      // Whoever dealt the MOST DAMAGE wins the Boss Loot Jackpot (in their Carried Bag!)
      const winnerName = rank.length ? rank[0][0] : att.name;
      const topDmg = rank.length ? rank[0][1] : dmg;
      const winner = this.actors.find((a) => a.name === winnerName) || att;

      winner.bossKills = (winner.bossKills || 0) + 1;
      winner.addItem(b.cfg.drop, 2, true);
      if (b.cfg.coin) winner.addItem(b.cfg.coin, 2, true);
      const bossDust = b.cfg.dustReward || 240;
      winner.addFieldDust(bossDust);
      if (b.cfg.treasureId) this.unlockTrophyFor(winner, b.cfg.treasureId);

      // Boss 3D Loot drops on the ground
      const bossPinataItems = [[b.cfg.drop, 1]];
      if (b.cfg.coin) bossPinataItems.push([b.cfg.coin, 1]);
      this.spawnLootPinata(b.pos, {
        dust: Math.round(bossDust * 0.6),
        items: bossPinataItems,
        owner: winner,
        lockT: 1.2,
        color: b.cfg.color || '#ffd615',
      });

      this.puff(b.pos, '#ffd615');
      this.puff(b.pos, b.cfg.color || '#ff5a36');

      if (winner.isPlayer) {
        sfx.victory();
        this.stats.bosses = (this.stats.bosses || 0) + 1;
        this.ui.banner(
          `${b.cfg.name.toUpperCase()} DEFEATED`,
          `Top Damage (${topDmg}) — Extract your Boss Loot Bag to your Camp before rivals ambush you`,
          '#ffd615'
        );
        this.ui.refreshPanels();
      } else {
        sfx.alarm();
        this.ui.banner(
          `${winner.name.toUpperCase()} CLAIMED ${b.cfg.name.toUpperCase()}`,
          `Intercept ${winner.name} now to steal their Boss Loot Bag before they reach their Camp`,
          winner.color || '#ff5d5d'
        );
      }
    }
    return true;
  }

  resolveHit(att) {
    const w = att.weapon ? GEAR[att.weapon] : GEAR.club_wood;
    const fwd = new THREE.Vector3(Math.sin(att.yaw), 0, Math.cos(att.yaw));
    let hit = false;
    for (const o of this.actors) {
      if (o === att) continue;
      const d = new THREE.Vector3().subVectors(o.pos, att.pos);
      d.y = 0;
      const dist = d.length();
      if (dist > w.range + 0.5) continue;
      d.normalize();
      if (d.dot(fwd) < 0.12 && dist > 1.0) continue;

      // Cannot repeatedly smash a character who is already knocked down!
      if (o.stun > 0) {
        if (att.isPlayer && this.now - (o._downWarnT || 0) > 1.1) {
          o._downWarnT = this.now;
          this.floatText(o.pos, 'ALREADY DOWN · ALL LOOT DROPPED', '#a8b8d0');
        }
        continue;
      }

      // Only an actor inside their OWN LOCKED CAMP is safe from PvP bonks!
      if (o.isInSafeZone) {
        if (att.isPlayer) {
          this.floatText(o.pos, 'PROTECTED BY LOCKED CAMP', '#42f54b');
        }
        continue;
      }

      const wasThief = (o.carrying && o.carrying.from === att.camp) || att.camp.inside(o.pos, -1) || o.raidedFrom === att.camp;
      o.stun = Math.max(o.stun, w.stun || 5.0);
      o.hold = null;
      o.pendingHit = -1;
      if (o.booga) o.booga.attackT = -1;
      o.knock.copy(d).multiplyScalar(w.knock);
      o.vy = 4.2; o.onGround = false;
      if (o.carrying) this.dropCarry(o);
      hit = true;
      att.pvpBonks = (att.pvpBonks || 0) + 1;
      if (att.isPlayer || o.isPlayer) sfx.bonk();
      this.puff(o.pos, '#ffe04a');
      this.puff(o.pos, '#5fd4ff');

      // Spill 100% of victim's Unbanked Carried Loot Bag onto the ground in ONE hit!
      const spill = this.spillUnbankedLoot(o, att, wasThief);
      const hadLoot = spill.lostDust > 0 || spill.spilledItems.length > 0;

      if (att.isPlayer) {
        this.camPunch = 0.28;
        this.stats.bonks = (this.stats.bonks || 0) + 1;
        this.floatText(
          o.pos,
          hadLoot
            ? `ALL LOOT DROPPED · +${spill.totalPinataDust} DUST${spill.spilledItems.length ? ` + ${spill.spilledItems.length} ITEMS` : ''}`
            : `STUNNED 5s · LOOT BAG EMPTY`,
          hadLoot ? '#ffe04a' : '#a8b8d0',
          hadLoot ? '/assets/items/dust_icon.png' : null
        );
        this.ui.toast(
          hadLoot
            ? `Smashed ${o.name} — 100% of their Loot Bag (${spill.lostDust} Dust) dropped at once!`
            : `Knocked down ${o.name} (5s Stun) — their Loot Bag was already empty.`,
          'dust_icon',
          hadLoot ? 'good' : 'info',
          true
        );
        o.say(hadLoot ? 'All my loot dropped at once!' : 'My bag is already empty!', 4.0);
      } else if (hadLoot) {
        this.floatText(o.pos, `LOOT BAG DROPPED (-${spill.lostDust || 0} DUST)`, '#ff5d5d');
      } else {
        this.floatText(o.pos, `STUNNED 5s`, '#ff5d5d');
      }
      if (o.isPlayer) {
        this.ui.flash();
        this.ui.toast(
          hadLoot
            ? `${att.name} knocked you down! 100% of your unbanked Loot Bag spilled onto the ground!`
            : `${att.name} stunned you for 5s!`,
          'wood',
          'bad',
          true
        );
      }
    }

    // Also check Biome Bosses in swing arc
    if (this.bosses) {
      for (const b of this.bosses) {
        if (!b.alive) continue;
        const d = new THREE.Vector3().subVectors(b.pos, att.pos);
        d.y = 0;
        const dist = d.length();
        if (dist > w.range + b.r + 0.9) continue;
        d.normalize();
        if (d.dot(fwd) < 0.05 && dist > 1.5) continue;
        if (this.hitBoss(att, b)) hit = true;
      }
    }

    // Also crack the closest 3D Geode in swing arc
    let bestGeode = null, bestGD = 1e9;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const d = new THREE.Vector3().subVectors(n.pos, att.pos);
      d.y = 0;
      const dist = d.length();
      if (dist > w.range + n.r + 0.85) continue;
      const dir = d.clone().normalize();
      if (dir.dot(fwd) < 0.05 && dist > 1.35) continue;
      if (dist < bestGD) { bestGD = dist; bestGeode = n; }
    }
    if (bestGeode) {
      if (this.hitGeode(att, bestGeode, 1.0)) hit = true;
    }

    // Also allow BONKING a rival's LOCKED Boulder Gate, Guard Turrets, or Vine Traps during a Camp Siege!
    for (const c of this.camps) {
      if (c === att.camp) continue;

      // 1. Breach Rival Locked Boulder Gate
      if (c.isLocked(this.now)) {
        const gp = c.boulderWorldPos();
        const d = Math.hypot(gp.x - att.pos.x, gp.z - att.pos.z);
        if (d <= w.range + 2.8) {
          const siegeDmg = Math.max(25, att.geodePower || 25);
          const wasFull = c.gateHp >= c.gateMaxHp;
          c.gateHp = Math.max(0, c.gateHp - siegeDmg);
          c.alarmUntil = Math.max(c.alarmUntil || 0, this.now + 28);
          hit = true;
          this.puff(gp, '#ffd615');
          if (att.isPlayer) {
            sfx.bonk();
            this.camPunch = 0.22;
            if (wasFull && c.owner && c.owner.stun <= 0) {
              c.owner.say(`${att.name} is battering my Camp Gate!`, 3.5);
            }
            if (c.gateHp <= 0) {
              c.lockedUntil = 0;
              c.gateRegenTimer = 38;
              this.puff(gp, '#ff4500');
              this.floatText(gp, `GATE BREACHED · 38s RAID WINDOW`, '#42f54b');
              this.ui.banner(
                `BREACHED ${c.ownerName.toUpperCase()}'S GATE (38s WINDOW)`,
                `Watch out for Guard Turrets & Vine Traps — Bonk them or dodge to crack the Vault Chest!`,
                '#ffd615'
              );
            } else {
              this.floatText(gp, `-${siegeDmg} GATE HP (${c.gateHp}/${c.gateMaxHp})`, '#ffd615');
            }
          }
        }
      }

      // 2. Smash Rival Guard Turrets (80 HP -> Disabled for 25s!)
      const maxT = c.upgradeCfg?.turrets || 0;
      for (let i = 0; i < maxT && i < c.turretMeshes.length; i++) {
        const tm = c.turretMeshes[i];
        if (!tm || !tm.grp.visible || this.now < (tm.disabledUntil || 0)) continue;
        const d = Math.hypot(tm.worldPos.x - att.pos.x, tm.worldPos.z - att.pos.z);
        if (d <= w.range + 2.3) {
          const tDmg = Math.max(28, att.geodePower || 25);
          tm.hp = Math.max(0, tm.hp - tDmg);
          c.alarmUntil = Math.max(c.alarmUntil || 0, this.now + 28);
          hit = true;
          this.puff(tm.worldPos.clone().setY(tm.worldPos.y + 2.4), '#00f5ff');
          if (att.isPlayer) {
            sfx.bonk();
            this.camPunch = 0.2;
            if (tm.hp <= 0) {
              tm.disabledUntil = this.now + 25;
              if (!c.hasActiveTurret(this.now)) c.turretWindup = 0;
              this.puff(tm.worldPos.clone().setY(tm.worldPos.y + 2.6), '#ff4500');
              this.floatText(tm.worldPos, `TURRET OVERLOADED · DISABLED 25s`, '#42f54b');
              this.ui.toast(`Disabled ${c.ownerName}'s Guard Turret for 25s! Crack the Vault Chest now!`, 'diamond', 'good');
            } else {
              this.floatText(tm.worldPos, `-${tDmg} TURRET HP (${tm.hp}/${tm.maxHp})`, '#00f5ff');
            }
          }
        }
      }

      // 3. Disarm Rival Vine Traps (1 swing smashes a trap before stepping on it!)
      for (let i = c.traps.length - 1; i >= 0; i--) {
        const tr = c.traps[i];
        const d = Math.hypot(tr.pos.x - att.pos.x, tr.pos.z - att.pos.z);
        if (d <= w.range + 1.85) {
          this.scene.remove(tr.mesh);
          c.traps.splice(i, 1);
          c.alarmUntil = Math.max(c.alarmUntil || 0, this.now + 28);
          hit = true;
          this.puff(tr.pos, '#7dff6a');
          if (att.isPlayer) {
            sfx.bonk();
            this.floatText(tr.pos, `VINE TRAP DISARMED`, '#42f54b');
          }
        }
      }
    }

    return hit;
  }

  upgradeBase(actor = this.player) {
    if (!actor || !actor.camp) return false;
    const camp = actor.camp;
    const nxt = camp.nextUpgradeCfg;
    if (!nxt) {
      if (actor.isPlayer) this.ui.toast('Your Camp is at Max Level 5 (Sovereign Citadel).', 'gold', 'good');
      return false;
    }
    if (actor.dust < nxt.cost) {
      if (actor.isPlayer) {
        sfx.error();
        const extraNote = actor.unbankedDust > 0 ? ` (Bank your ${Math.floor(actor.unbankedDust)} carried Dust at Camp first!)` : '';
        this.ui.toast(`Need ${nxt.cost} Banked Dust for Lv.${nxt.level} ${nxt.name} (Vault: ${Math.floor(actor.dust)})${extraNote}`, 'dust_icon', 'bad');
      }
      return false;
    }
    actor.dust -= nxt.cost;
    camp.setLevel(nxt.level);
    this.stats.baseUpgrades = (this.stats.baseUpgrades || 0) + 1;
    sfx.victory();
    for (const col of ['#ffd615', '#42f54b', '#5fd4ff']) {
      this.puff(camp.center.clone().add(new THREE.Vector3(0, 2, 0)), col);
    }
    if (actor.isPlayer) {
      this.floatText(actor.pos, `CAMP UPGRADED · LV.${nxt.level}`, '#ffd615', '/assets/items/dust_icon.png');
      this.ui.banner(`CAMP UPGRADED · LV.${nxt.level} ${nxt.name.toUpperCase()}`, nxt.desc, '#ffd615');
      this.save();
    }
    return true;
  }

  travelToZone(zoneId) {
    const p = this.player;
    if (!p || p.stun > 0) return false;
    if (p.raidedFrom) {
      sfx.error();
      this.ui.toast(`Fast-Travel locked during an active Camp Heist! Extract ${p.raidedFrom.ownerName}'s Vault loot on foot to your Camp!`, 'cave_coin', 'bad', true);
      return false;
    }
    const zn = BOOGA_ZONES.find((z) => z.id === zoneId);
    if (!zn) return false;
    if (this.ui && this.ui.panelOpen) this.ui.closePanels();
    const tx = zn.x + 8.5, tz = zn.z + 11.5;
    const ty = heightAt(tx, tz);
    p.pos.set(tx, ty, tz);
    p.prev.copy(p.pos);
    p.vx = p.vz = p.vy = 0;
    p.yaw = Math.PI;
    this.cam.yaw = 0.25;
    this.currentZoneId = zn.id;
    sfx.stepClear();
    this.puff(p.pos, zn.color || '#ffd615');
    const geodeNames = (zn.geodes || []).slice(0, 4).map((g) => NODES[g]?.name.replace(' Geode', '') || g).join(' · ');
    this.ui.banner(
      `${zn.name.toUpperCase()} · STEP ${zn.step}`,
      `${zn.subtitle || zn.desc} — Native Geodes: ${geodeNames}`,
      zn.color || '#ffd615'
    );
    return true;
  }

  placeTrap(actor, autoAtGate = false) {
    if (actor.stun > 0) return false;
    if (actor.traps <= 0) {
      actor.isPlayer && (sfx.error(), this.ui.toast('No Vine Traps in bag. Craft or buy some in [C] Forge!', 'vine', 'bad'));
      return false;
    }
    const camp = actor.camp;
    if (camp.traps.length >= 6) {
      actor.isPlayer && this.ui.toast('Max 6 active Vine Traps in your Camp!', 'vine', 'bad');
      return false;
    }
    let pos;
    if (!autoAtGate && camp.inside(actor.pos, 1)) {
      pos = actor.pos.clone();
    } else if (autoAtGate || actor.isPlayer) {
      // Automatically place along the Camp Gate -> Vault path
      const slot = camp.traps.length;
      const side = new THREE.Vector3(-camp.entranceDir.z, 0, camp.entranceDir.x);
      const fwdDist = camp.R - 2.3 - Math.floor(slot / 2) * 1.65;
      const latOffset = (slot % 2 === 0 ? -1 : 1) * (0.95 + Math.floor(slot / 2) * 0.25);
      pos = camp.center
        .clone()
        .add(camp.entranceDir.clone().multiplyScalar(fwdDist))
        .add(side.multiplyScalar(latOffset));
      pos.y = heightAt(pos.x, pos.z);
    } else {
      return false;
    }
    actor.traps--;
    const mesh = new THREE.Group();
    mesh.add(tint(spawn('bear_trap', 1.15, 'max'), '#557a46'));
    const cl = spawn('clover', 0.28);
    cl.scale.set(1.6, 1, 1.6);
    mesh.add(cl);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    camp.traps.push({ pos: pos.clone(), mesh });
    sfx.craft();
    if (actor.isPlayer) {
      this.ui.toast(`Barricade Vine Trap armed at Camp (${camp.traps.length}/6 active)!`, 'vine', 'good');
      this.ui.refreshPanels();
    }
    return true;
  }

  upgradeCampBarricade(kind) {
    const p = this.player;
    const camp = p?.camp;
    if (!p || !camp) return false;

    if (kind === 'fort') {
      const ok = this.upgradeBase(p);
      if (ok && this.ui) this.ui.refreshPanels();
      return ok;
    }

    const cfgMap = {
      boulder: { gearId: 'gate1', dustCost: 110 + (p.gear.gate1 || 0) * 85 },
      dino: { gearId: 'dino_guard', dustCost: 160 + (p.gear.dino_guard || 0) * 130 },
      trap: { gearId: 'trap', dustCost: 80 },
    };
    const entry = cfgMap[kind];
    if (!entry) return false;

    const gearCfg = GEAR[entry.gearId];
    const recipe = RECIPES.find((r) => r.gear && r.out === entry.gearId);
    if (gearCfg.kind === 'stack' && (p.gear[entry.gearId] || 0) >= gearCfg.max) {
      this.ui.toast(`${gearCfg.name} is already at Max Rank (${gearCfg.max}/${gearCfg.max})!`, gearCfg.icon, 'good');
      return false;
    }
    if (kind === 'trap' && camp.traps.length >= 6 && p.traps >= 4) {
      this.ui.toast('Camp Gate already has 6/6 active Vine Traps!', 'vine', 'good');
      return false;
    }

    // 1. Prefer crafting from Banked Materials if available
    if (recipe && this.getSmartCraftPlan(recipe, p.inv).canCraft) {
      const ok = this.craft(recipe);
      if (ok && this.ui) this.ui.refreshPanels();
      return ok;
    }

    // 2. Otherwise allow instant purchase with Banked Camp Dust!
    if (p.dust < entry.dustCost) {
      sfx.error();
      this.ui.toast(`Need ${entry.dustCost} Banked Dust (or materials) for ${gearCfg.name}!`, 'dust_icon', 'bad');
      return false;
    }
    p.dust -= entry.dustCost;

    if (kind === 'trap') {
      p.traps += 2;
      while (p.traps > 0 && camp.traps.length < 6) {
        this.placeTrap(p, true);
      }
      this.ui.toast(`Armed +2 Barricade Vine Traps (${camp.traps.length}/6 at Camp Gate)!`, 'vine', 'good', true);
    } else if (kind === 'boulder') {
      p.gear.gate1 = (p.gear.gate1 || 0) + 1;
      camp.gateMaxHp = camp.effectiveGateMaxHp;
      camp.gateHp = camp.gateMaxHp;
      camp.lockedUntil = this.now + p.lockTime;
      this.puff(camp.boulderWorldPos(), '#ffd615');
      this.ui.toast(`Boulder Door Lv.${p.gear.gate1}/5! Lock Time is now ${p.lockTime}s (${camp.gateMaxHp} Gate HP)!`, 'rock', 'good', true);
    } else if (kind === 'dino') {
      p.gear.dino_guard = (p.gear.dino_guard || 0) + 1;
      const dNames = ['Raptor Stalker', 'Horned Triceratops', 'Apex T-Rex'];
      const dName = dNames[Math.min(2, p.gear.dino_guard - 1)];
      this.puff(camp.center, '#42f54b');
      this.ui.banner(`🦖 ${dName.toUpperCase()} SUMMONED!`, `Patrolling your Camp (${camp.activeDinoCount}/3 Boogasaurus Helpers active)`, '#42f54b');
    }

    sfx.craft();
    this.stats.crafted = (this.stats.crafted || 0) + 1;
    this.save();
    if (this.ui) this.ui.refreshPanels();
    return true;
  }

  // E pressed: instant interactions (Forge Anvil, Relic Altar, Base Upgrade, Zone Portal)
  interactPress() {
    const p = this.player;
    if (this.ui.panelOpen || p.stun > 0) return;
    const it = this.findInteraction(p);
    if (!it) return;
    if (it.kind === 'buy') this.buyEgg(p, it.egg);
    else if (it.kind === 'upgrade_base') this.upgradeBase(p);
    else if (it.kind === 'zone_portal') this.ui.togglePanel('map');
    else if (it.kind === 'forge' || it.kind === 'forge_anvil') this.ui.togglePanel('craft');
    else if (it.kind === 'altar' || it.kind === 'relic_altar') {
      const shrine = TROPHY_SHRINES.find((s) => (p.inv[s.coin] || 0) >= 3 && !p.treasures[s.id]);
      if (shrine) {
        p.inv[shrine.coin] -= 3;
        this.unlockTrophyFor(p, shrine.id);
        p.dust += 250;
        sfx.victory();
        this.puff(p.pos, shrine.color || '#ffd615');
        this.ui.banner(`🏆 ${shrine.name.toUpperCase()} AWAKENED!`, `${shrine.buffText} · +250 Dust!`, shrine.color || '#ffd615');
        this.ui.refreshPanels();
      } else {
        this.ui.togglePanel('treasure');
      }
    }
  }

  findInteraction(a) {
    if (a.stun > 0) return null;
    if (a.carrying) return null;
    let best = null, bd = 1e9;
    if (a.camp && a.camp.upgradeWorld) {
      const du = Math.hypot(a.camp.upgradeWorld.x - a.pos.x, a.camp.upgradeWorld.z - a.pos.z);
      if (du < 2.8 && du < bd && a.camp.nextUpgradeCfg) {
        bd = du;
        best = { kind: 'upgrade_base', camp: a.camp };
      }
    }
    if (this.forgePos) {
      const df = Math.hypot(this.forgePos.x - a.pos.x, this.forgePos.z - a.pos.z);
      if (df < 3.6 && df < bd) { bd = df; best = { kind: 'forge_anvil' }; }
    }
    if (this.hubAltarPos) {
      const da = Math.hypot(this.hubAltarPos.x - a.pos.x, this.hubAltarPos.z - a.pos.z);
      if (da < 3.6 && da < bd) { bd = da; best = { kind: 'relic_altar' }; }
    }
    if (!isTutorialMap) {
      for (const zn of BOOGA_ZONES) {
        const dz = Math.hypot(zn.x - a.pos.x, zn.z - a.pos.z);
        if (dz < 3.5 && dz < bd) {
          bd = dz;
          best = { kind: 'zone_portal', zone: zn };
        }
      }
    }
    if (best) return best;
    for (const c of this.camps) {
      if (c === a.camp || c.isLocked(this.now) || this.now < (c.raidCooldownUntil || 0)) continue;
      if (c.vaultWorld) {
        const dv = c.vaultWorld.distanceTo(a.pos);
        if (dv < 3.2 && dv < bd) { bd = dv; best = { kind: 'raid_vault', camp: c }; }
      }
    }
    if (best) return best;
    for (const ch of this.chests) {
      if (!ch.alive) continue;
      const d = ch.pos.distanceTo(a.pos);
      if (d < 2.4 && d < bd) { bd = d; best = { kind: 'chest', chest: ch }; }
    }
    if (best) return best;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const d = Math.hypot(n.pos.x - a.pos.x, n.pos.z - a.pos.z) - n.r;
      if (d < 1.4 && d < bd) { bd = d; best = { kind: 'gather', node: n }; }
    }
    return best;
  }

  raidBaseVault(raider, targetCamp) {
    if (!raider || !targetCamp || targetCamp === raider.camp || targetCamp.isLocked(this.now)) return false;
    const victim = targetCamp.owner;
    if (!victim) return false;
    targetCamp.raidCooldownUntil = this.now + 32;
    targetCamp.alarmUntil = this.now + 32;
    const minHaul = 110 + (targetCamp.level || 1) * 35;
    const stolenDust = Math.max(minHaul, Math.round((victim.dust || 0) * 0.30));
    victim.dust = Math.max(40, (victim.dust || 0) - Math.round((victim.dust || 0) * 0.30));

    const stolenItems = [];
    const gemPool = ['amber', 'gold', 'rock', 'bone', 'opal', 'cave_coin', 'sunstone', 'lapis_stone'];
    for (const id of gemPool) {
      if ((victim.inv[id] || 0) > 0 && stolenItems.length < 3) {
        victim.inv[id] = Math.max(0, victim.inv[id] - 1);
        stolenItems.push([id, 1]);
      }
    }
    if (stolenItems.length === 0) {
      stolenItems.push(['amber', 1], ['rock', 1]);
    }

    raider.addFieldDust(stolenDust);
    for (const [id, q] of stolenItems) raider.addItem(id, q, true);
    raider.raidedFrom = targetCamp;

    this.spawnLootPinata(targetCamp.vaultWorld || targetCamp.center, {
      dust: Math.round(stolenDust * 0.45),
      items: [[stolenItems[0][0], 1]],
      owner: raider,
      lockT: 1.1,
      color: '#ffd615',
    });

    this.puff(targetCamp.vaultWorld || targetCamp.center, '#ffd615');
    this.puff(targetCamp.vaultWorld || targetCamp.center, '#ff2a1f');

    if (raider.isPlayer) {
      sfx.steal();
      this.stats.steals = (this.stats.steals || 0) + 1;
      this.floatText(raider.pos, `VAULT CRACKED · +${stolenDust} DUST (IN BAG)`, '#ffd615', '/assets/items/dust_icon.png');
      this.ui.banner(
        `CRACKED ${targetCamp.ownerName.toUpperCase()}'S LV.${targetCamp.level} VAULT`,
        `Stolen +${stolenDust} Dust (Fast-Travel Locked) — Outrun ${targetCamp.ownerName} to YOUR CAMP!`,
        '#ffd615'
      );
      if (victim.stun <= 0) {
        victim.say(`${raider.name} cracked my Camp Vault — hunting them down!`, 4.0);
        const bot = this.bots.find((b) => b.a === victim);
        if (bot) {
          bot.task = 'chase';
          bot.target = raider;
          bot.goal = raider.pos.clone();
        }
      }
    } else if (victim.isPlayer) {
      sfx.alarm();
      this.ui.banner(
        `${raider.name.toUpperCase()} RAIDED YOUR CAMP VAULT`,
        `Stolen: ${stolenDust} Dust — Knock down ${raider.name} before they reach their Camp`,
        '#ff2a1f'
      );
      this.ui.toast(`${raider.name} raided your unlocked Camp Vault! Knock them down to recover your loot.`, 'claws', 'bad', true);
    }
    return true;
  }

  completeHold(a) {
    const h = a.hold;
    a.hold = null;
    if (h.kind === 'raid_vault') {
      this.raidBaseVault(a, h.camp);
    } else if (h.kind === 'gather') {
      const n = h.node;
      if (!n || !n.alive) return;
      if (this.mode === 'tutorial') {
        a.addItem('rock', 1, true);
        a.addItem('wood', 1, true);
      }
      this.shatterGeode(a, n);
    } else if (h.kind === 'chest') {
      const ch = h.chest;
      if (!ch.alive) return;
      ch.alive = false;
      this.scene.remove(ch.mesh);
      ch.respawn = 70 + rand() * 50;
      const coin = Math.round(220 + rand() * 320);
      a.addFieldDust(coin);
      const isNew = this.unlockTrophyFor(a, ch.tr.id);
      if (a.isPlayer) {
        sfx.chest();
        this.ui.treasurePopup(ch.tr, coin, isNew);
        this.ui.refreshPanels();
      }
    }
  }

  /**
   * Smart 1-Click Auto-Craft Planner:
   * Keeps all 37 recipes in RECIPES intact, but automatically resolves intermediate sub-parts
   * (Handles, Volcano Alloys, Suit Tops & Suit Bottoms) from raw Geode materials so the player
   * can craft any Weapon or Suit in a single click without hunting through sub-menus!
   */
  getSmartCraftPlan(recipe, inv = this.player?.inv || {}) {
    const consumeMap = {};
    const autoSubNames = [];
    const addNeed = (id, q) => {
      consumeMap[id] = (consumeMap[id] || 0) + q;
    };

    for (const [id, q] of recipe.in) {
      const haveDirect = inv[id] || 0;
      if (haveDirect >= q) {
        addNeed(id, q);
      } else {
        const subR = recipe.gear ? RECIPES.find((r) => !r.gear && r.out === id) : null;
        if (subR) {
          if (haveDirect > 0) addNeed(id, haveDirect);
          const deficit = q - haveDirect;
          autoSubNames.push(ITEMS[id]?.name || id);
          for (const [rawId, rawQ] of subR.in) {
            addNeed(rawId, rawQ * deficit);
          }
        } else {
          addNeed(id, q);
        }
      }
    }

    const displayInputs = Object.entries(consumeMap).map(([id, need]) => {
      const have = inv[id] || 0;
      return { id, need, have, ok: have >= need };
    });

    const canCraft = displayInputs.every((inp) => inp.ok);
    let haveUnits = 0;
    let needUnits = 0;
    for (const inp of displayInputs) {
      haveUnits += Math.min(inp.need, inp.have);
      needUnits += inp.need;
    }
    const readiness = needUnits > 0 ? haveUnits / needUnits : 0;

    return {
      canCraft,
      consumeMap,
      displayInputs,
      autoSubNames,
      haveUnits,
      needUnits,
      readiness,
    };
  }

  /**
   * Returns the 3 Featured "Recommended Next Upgrades" for the simplified Volcano Forge UI:
   * 1. Best Next Weapon Upgrade
   * 2. Next Wearable Tribe Suit
   * 3. Best Camp Defense / Miner Utility
   */
  getRecommendedUpgrades() {
    const p = this.player;
    const curWeaponRank = GEAR[p.weapon]?.tierRank || 1;

    // 1. Weapon Upgrade Candidates (higher tierRank than current equipped weapon)
    const weaponCandidates = RECIPES
      .filter((r) => r.gear && GEAR[r.out]?.kind === 'weapon' && !p.gear[r.out] && (GEAR[r.out]?.tierRank || 1) > curWeaponRank)
      .map((r) => ({ recipe: r, gear: GEAR[r.out], plan: this.getSmartCraftPlan(r, p.inv) }));
    weaponCandidates.sort((a, b) => {
      if (a.plan.canCraft !== b.plan.canCraft) return a.plan.canCraft ? -1 : 1;
      if (Math.abs(b.plan.readiness - a.plan.readiness) > 0.15) return b.plan.readiness - a.plan.readiness;
      return (a.gear.tierRank || 1) - (b.gear.tierRank || 1);
    });

    // 2. Suit Upgrade Candidates
    const suitCandidates = RECIPES
      .filter((r) => r.gear && GEAR[r.out]?.kind === 'suit' && !p.gear[r.out])
      .map((r) => ({ recipe: r, gear: GEAR[r.out], plan: this.getSmartCraftPlan(r, p.inv) }));
    suitCandidates.sort((a, b) => {
      if (a.plan.canCraft !== b.plan.canCraft) return a.plan.canCraft ? -1 : 1;
      if (Math.abs(b.plan.readiness - a.plan.readiness) > 0.15) return b.plan.readiness - a.plan.readiness;
      return (a.gear.suitRank || 1) - (b.gear.suitRank || 1);
    });

    // 3. Camp & Raid Utility Candidates
    const utilCandidates = RECIPES
      .filter((r) => {
        if (!r.gear) return false;
        const g = GEAR[r.out];
        if (!g || g.kind === 'weapon' || g.kind === 'suit') return false;
        if (g.kind === 'passive' && p.gear[r.out]) return false;
        if (g.kind === 'stack' && (p.gear[r.out] || 0) >= g.max) return false;
        return true;
      })
      .map((r) => ({ recipe: r, gear: GEAR[r.out], plan: this.getSmartCraftPlan(r, p.inv) }));
    utilCandidates.sort((a, b) => {
      if (a.plan.canCraft !== b.plan.canCraft) return a.plan.canCraft ? -1 : 1;
      return b.plan.readiness - a.plan.readiness;
    });

    return {
      weapon: weaponCandidates[0] || null,
      suit: suitCandidates[0] || null,
      utility: utilCandidates[0] || null,
      list: [
        ...weaponCandidates.slice(0, 4),
        ...suitCandidates.slice(0, 2),
        ...utilCandidates.slice(0, 2),
      ],
    };
  }

  craft(recipe) {
    const p = this.player;
    if (!recipe) return false;
    if (recipe.gear) {
      const g = GEAR[recipe.out];
      if (g.kind === 'weapon' || g.kind === 'suit' || g.kind === 'passive') { if (p.gear[recipe.out]) return false; }
      if (g.kind === 'stack' && (p.gear[recipe.out] || 0) >= g.max) return false;
    }
    const plan = this.getSmartCraftPlan(recipe, p.inv);
    if (!plan.canCraft) return false;

    for (const [id, q] of Object.entries(plan.consumeMap)) {
      p.inv[id] = Math.max(0, (p.inv[id] || 0) - q);
    }

    const autoNote = plan.autoSubNames.length
      ? ` (Auto-assembled ${plan.autoSubNames.join(' + ')})`
      : '';

    if (recipe.gear) {
      const g = GEAR[recipe.out];
      if (g.kind === 'consumable') {
        p.traps += recipe.qty || 2;
        while (p.traps > 0 && p.camp.traps.length < 6) {
          this.placeTrap(p, true);
        }
      } else {
        p.gear[recipe.out] = (p.gear[recipe.out] || 0) + 1;
      }
      if (recipe.out === 'gate1' && p.camp) {
        p.camp.gateMaxHp = p.camp.effectiveGateMaxHp;
        p.camp.gateHp = p.camp.gateMaxHp;
        p.camp.lockedUntil = this.now + p.lockTime;
      }
      p.refreshWeapon();
      if (p.refreshSuit) p.refreshSuit();
      this.ui.toast(`Forged ${g.name}${autoNote}!`, g.icon, 'good', true);
    } else {
      p.addItem(recipe.out, recipe.qty || 1, false);
      this.ui.toast(`Forged ${ITEMS[recipe.out].name}`, recipe.out, 'good');
    }
    sfx.craft();
    this.puff(p.pos, '#ffd615');
    this.stats.crafted = (this.stats.crafted || 0) + 1;
    if (this.mode === 'tutorial' && this.tutStep === 3 && ((GEAR[p.weapon]?.tierRank || 1) > 1 || this.stats.crafted > 0)) {
      setTimeout(() => { if (this.ui.panel === 'craft') this.ui.closePanels(); }, 450);
    }
    this.save();
    return true;
  }

  getQuickCraftRecipe() {
    const p = this.player;
    const curWeaponRank = GEAR[p.weapon]?.tierRank || 1;
    // Only suggest actual Gear upgrades (Weapons, Suits, Camp/Miner Utility) on the HUD [R] button,
    // using Smart Auto-Crafting so sub-parts are automatically assembled in 1 tap!
    const craftable = RECIPES.filter((r) => {
      if (!r.gear) return false;
      const g = GEAR[r.out];
      if (!g) return false;
      if ((g.kind === 'weapon' || g.kind === 'suit' || g.kind === 'passive') && p.gear[r.out]) return false;
      if (g.kind === 'weapon' && (g.tierRank || 1) <= curWeaponRank) return false;
      if (g.kind === 'stack' && (p.gear[r.out] || 0) >= g.max) return false;
      if (g.kind === 'consumable' && p.traps >= 3) return false;
      return this.getSmartCraftPlan(r, p.inv).canCraft;
    });
    if (!craftable.length) return null;
    craftable.sort((a, b) => {
      const ga = GEAR[a.out];
      const gb = GEAR[b.out];
      const score = (g) => {
        if (g.kind === 'weapon') return 1000 + (g.tierRank || 1) * 10;
        if (g.kind === 'suit') return 800 + (g.suitRank || 1) * 20;
        return 300;
      };
      return score(gb) - score(ga);
    });
    return craftable[0];
  }

  quickCraft() {
    const r = this.getQuickCraftRecipe();
    if (!r) return false;
    return this.craft(r);
  }

  dinoValue(id) { return DINOS[id].rate; }

  onHatch(camp, nest, cfg) {
    if (camp.owner && camp.owner.isPlayer) {
      if (this.mode === 'tutorial') nest.stored = Math.max(nest.stored, 12);
      sfx.hatch();
      this.ui.toast(`${cfg.name} cracked into ${DINOS[cfg.dino].name}! +${fmt(DINOS[cfg.dino].rate)}/s`, 'dust_icon', 'good', true);
      this.puff(nest.world, RARITY[cfg.rarity].color);
    }
  }

  onRaidStart(bot, camp) {
    if (camp.owner.isPlayer) {
      this.ui.toast(`${bot.name} is raiding your Geode Pedestals! Lock your gate or BONK them!`, 'war_paint', 'bad', true);
      sfx.alarm();
    }
  }

  // ---------------- physics (SpatialHashGrid Engine) ----------------
  resolveCollisions(a) {
    this.engine.physics.resolveActorCollisions(a, {
      nodes: this.nodes,
      actors: this.actors,
      camps: this.camps,
      now: this.now,
      isTutorialMap,
      sdfAt,
    });
  }

  // ---------------- fx ----------------
  floatText(pos, text, color = '#fff', icon = null) {
    const el = document.createElement('div');
    el.className = 'float';
    el.style.color = color;
    el.innerHTML = (icon ? `<img src="${icon}">` : '') + text;
    const o = new CSS2DObject(el);
    o.position.copy(pos).add(new THREE.Vector3(0, 2.6, 0));
    this.scene.add(o);
    this.floaters.push({ o, t: 0 });
  }

  puff(pos, color) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, transparent: true, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), m);
      s.userData.v = new THREE.Vector3((rand() - 0.5) * 5, 3 + rand() * 4, (rand() - 0.5) * 5);
      g.add(s);
    }
    g.position.copy(pos).setY(pos.y + 0.8);
    this.scene.add(g);
    this.floaters.push({ g, t: 0 });
  }

  rewardStep(title, sub, dustReward = 25) {
    const p = this.player;
    p.dust += dustReward;
    sfx.stepClear();
    this.puff(p.pos, '#42f54b');
    this.puff(p.pos, '#ffd615');
    this.floatText(p.pos, `★ ${title} +${dustReward} ★`, '#42f54b', '/assets/items/dust_icon.png');
    this.ui.banner(title, sub, '#42f54b');
  }

  completeTutorial() {
    const p = this.player;
    this.tutGraduated = true;
    p.graduated = true;
    p.dust += 250;
    p.gear.club_stone = 1;
    p.traps += 2;
    p.refreshWeapon();
    sfx.victory();
    for (const col of ['#ffd615', '#42f54b', '#5fd4ff', '#ff4fd8']) {
      this.puff(p.pos.clone().add(new THREE.Vector3((rand() - 0.5) * 5, 1, (rand() - 0.5) * 5)), col);
    }
    this.ui.banner('🏆 GEODE ACADEMY COMPLETE! 🏆', 'You unlocked the Master Geode Miner Graduation Pack!', '#ffd615');
    setTimeout(() => { if (this.mode === 'tutorial') this.ui.togglePanel('victory'); }, 600);
  }

  // ---------------- main update ----------------
  start(mode = null) {
    if (mode && mode !== this.mode) this.switchMode(mode);
    this.started = true;
    document.body.classList.add('playing');
    this.ui.showHud();
    if (!this.isTouch) this.renderer.domElement.requestPointerLock && this.renderer.domElement.requestPointerLock();
    sfx.unlock();
  }

  updateGuide(dt, t, now) {
    const p = this.player;
    if (!this.guideArrow || !this.guideRing) return;
    let targetPos = null;

    if (this.mode === 'tutorial') {
      // 5-Step Geode Academy (1. Crack Geode -> 2. Bank Loot at Camp -> 3. Lock Gate -> 4. Forge Stone Club -> 5. Raid James!)
      if (this.tutStep === 0 && (this.stats.geodesCracked || 0) >= 1) {
        if ((p.unbankedItems.rock || 0) + (p.inv.rock || 0) < 2) p.addItem('rock', 2, true);
        if ((p.unbankedItems.wood || 0) + (p.inv.wood || 0) < 2) p.addItem('wood', 2, true);
        this.tutStep = 1;
        this.rewardStep('STEP 1 COMPLETE', 'Carry your Loot Bag inside YOUR CAMP to bank your Dust & Materials!', 35);
      }
      if (this.tutStep === 1 && p.camp.inside(p.pos, 0.8)) {
        if ((p.inv.rock || 0) < 2) p.inv.rock = 2;
        if ((p.inv.wood || 0) < 2) p.inv.wood = 2;
        this.tutStep = 2;
        this.rewardStep('STEP 2 COMPLETE', 'Step on the GREEN LOCK PAD at your gate so rivals cannot raid your Camp!', 35);
      }
      if (this.tutStep === 2 && p.camp.isLocked(now)) {
        this.tutStep = 3;
        this.rewardStep('STEP 3 COMPLETE', 'Press [R] 1-Tap Forge or [C] to craft your STONE CLUB!', 35);
      }
      if (this.tutStep === 3 && ((GEAR[p.weapon]?.tierRank || 1) > 1 || (this.stats.crafted || 0) > 0)) {
        this.tutStep = 4;
        this.rewardStep('STEP 4 COMPLETE', 'Run to James\'s Camp, knock down James, or Hold [E] on his Camp Vault to raid it!', 40);
      }
      if (this.tutStep === 4 && ((this.stats.bonks || 0) >= 1 || (this.stats.steals || 0) >= 1)) {
        this.tutStep = 5;
        this.completeTutorial();
      }

      if (this.tutStep === 0) {
        const node = this.nodes.find((n) => n.alive && n.type === 'quartz') || this.nodes.find((n) => n.alive);
        if (node) targetPos = node.pos;
      } else if (this.tutStep === 1) {
        targetPos = p.camp.vaultWorld || p.camp.center;
      } else if (this.tutStep === 2) {
        targetPos = p.camp.slabWorld;
      } else if (this.tutStep === 3) {
        targetPos = this.forgePos || p.camp.vaultWorld;
      } else if (this.tutStep === 4) {
        const james = this.actors[1];
        if (james) targetPos = james.camp.vaultWorld || james.pos;
      }
    } else {
      // Full Valley mode: Step 1->5 Guided Start first, then dynamic Camp Extraction / Biome / Boss guide arrow!
      const activeBoss = this.bosses ? this.bosses.find((b) => b.alive && b.pos.distanceTo(p.pos) < 120) : null;
      if (this.bountyIdx === 0) {
        // STEP 1 OF 5: Crack the starter Geode right outside your gate!
        const n0 = this.nodes.find((n) => n.alive && n.pos.distanceTo(p.camp.center) < 35) || this.nodes.find((n) => n.alive);
        if (n0) targetPos = n0.pos;
      } else if (this.bountyIdx === 1) {
        // STEP 2 OF 5: Walk back inside your Camp to bank your Loot Bag!
        targetPos = p.camp.vaultWorld || p.camp.center;
      } else if (this.bountyIdx === 2) {
        // STEP 3 OF 5: Step on your glowing Green Lock Pad!
        targetPos = p.camp.slabWorld;
      } else if (this.bountyIdx === 3) {
        // STEP 4 OF 5: Press [R] to forge Stone Club (or visit Volcano Forge Anvil)
        targetPos = this.forgePos || p.camp.vaultWorld;
      } else if (this.bountyIdx === 4) {
        // STEP 5 OF 5: Breach a Rival Camp Gate & Crack their Vault Chest!
        const rivalCamp = this.camps[1] || this.camps.find((c) => c !== p.camp);
        if (rivalCamp) {
          targetPos = rivalCamp.isLocked(now) ? rivalCamp.boulderWorldPos() : (rivalCamp.vaultWorld || rivalCamp.center);
        }
      } else if ((p.unbankedDust >= 45 || p.unbankedItemCount >= 3 || p.raidedFrom) && !p.camp.inside(p.pos, 0.8)) {
        // Point directly to YOUR CAMP VAULT to extract & bank your Carried Loot Bag!
        targetPos = p.camp.vaultWorld || p.camp.center;
      } else if (activeBoss && p.ascensionStep >= (activeBoss.cfg.step || 1)) {
        targetPos = activeBoss.pos;
      } else {
        // Guide toward the nearest alive Geode matching our current Step!
        let bestN = null, bd = 1e9;
        const targetStep = p.ascensionStep;
        for (const n of this.nodes) {
          if (!n.alive) continue;
          const stepDiff = Math.abs((n.step || 1) - targetStep);
          const d = n.pos.distanceTo(p.pos) + stepDiff * 40;
          if (d < bd) { bd = d; bestN = n; }
        }
        if (bestN && bd < 160) targetPos = bestN.pos;
      }
    }

    // Check if any rival is currently raiding YOUR CAMP or fleeing with your Camp's stolen loot!
    const campRaider = this.actors.find(
      (o) =>
        o !== p &&
        (o.raidedFrom === p.camp ||
          (o.carrying && o.carrying.from === p.camp) ||
          (p.camp.inside(o.pos, 1.5) && o.stun <= 0) ||
          (o.hold && o.hold.kind === 'raid_vault' && o.hold.camp === p.camp))
    );
    this.activeCampRaider = campRaider || null;

    if (campRaider && this.started && this.raidArrow && this.raidRing) {
      const rdx = campRaider.pos.x - p.pos.x;
      const rdz = campRaider.pos.z - p.pos.z;
      const rDist = Math.hypot(rdx, rdz);
      const rnx = rDist > 0.01 ? rdx / rDist : 0;
      const rnz = rDist > 0.01 ? rdz / rDist : 1;
      this.raidArrow.visible = true;
      this.raidArrow.position.set(
        p.pos.x + rnx * 2.1,
        p.pos.y + 2.15 + Math.sin(t * 9) * 0.16,
        p.pos.z + rnz * 2.1
      );
      this.raidArrow.lookAt(campRaider.pos.x, this.raidArrow.position.y, campRaider.pos.z);
      const pulse = 1 + Math.sin(t * 10) * 0.14;
      this.raidArrow.scale.set(pulse, pulse, pulse);
      if (this.raidArrow.userData.lblEl) {
        const statusTxt = campRaider.raidedFrom === p.camp
          ? `🚨 CHASE ${campRaider.name.toUpperCase()} (${Math.round(rDist)}m)`
          : `🚨 ${campRaider.name.toUpperCase()} RAIDING CAMP (${Math.round(rDist)}m)`;
        if (this.raidArrow.userData.lblEl.textContent !== statusTxt) {
          this.raidArrow.userData.lblEl.innerHTML = `<span>${statusTxt}</span>`;
        }
      }
      this.raidRing.visible = true;
      this.raidRing.position.set(campRaider.pos.x, heightAt(campRaider.pos.x, campRaider.pos.z) + 0.12, campRaider.pos.z);
      const rs = 1.05 + Math.sin(t * 9) * 0.2;
      this.raidRing.scale.set(rs, 1, rs);
      this.guideArrow.visible = false;
      this.guideRing.visible = false;
      return;
    } else if (this.raidArrow && this.raidRing) {
      this.raidArrow.visible = false;
      this.raidRing.visible = false;
    }

    if (targetPos && this.started) {
      const dx = targetPos.x - p.pos.x, dz = targetPos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.2) {
        this.guideArrow.visible = true;
        const nx = dx / dist, nz = dz / dist;
        this.guideArrow.position.set(p.pos.x + nx * 1.9, p.pos.y + 1.85 + Math.sin(t * 5) * 0.14, p.pos.z + nz * 1.9);
        this.guideArrow.lookAt(targetPos.x, this.guideArrow.position.y, targetPos.z);
        this.guideRing.visible = true;
        this.guideRing.position.set(targetPos.x, heightAt(targetPos.x, targetPos.z) + 0.08, targetPos.z);
        const s = 1 + Math.sin(t * 5) * 0.15;
        this.guideRing.scale.set(s, 1, s);
      } else {
        this.guideArrow.visible = false;
        this.guideRing.visible = true;
        this.guideRing.position.set(targetPos.x, heightAt(targetPos.x, targetPos.z) + 0.08, targetPos.z);
      }
    } else {
      this.guideArrow.visible = false;
      this.guideRing.visible = false;
    }
  }

  update(dt) {
    this.t += dt;
    this.now += dt;
    const t = this.t, now = this.now;
    const p = this.player;

    // --- player input (Unified Desktop + Mobile Touch + Tap-to-Act Engine) ---
    if (this.started && !this.ui.panelOpen) {
      const { dx, dz, jump, manualMove } = this.engine.input.sampleMovement(dt);
      if (manualMove && p.hold) p.hold = null;
      p.physics(dt, dx, dz, jump);
      // hold interactions
      const it = this.findInteraction(p);
      this.currentInteraction = it;
      if (this.input.eHeld && it && !['buy', 'forge', 'forge_anvil', 'altar', 'relic_altar', 'upgrade_base', 'zone_portal'].includes(it.kind) && !p.hold) {
        const need = it.kind === 'raid_vault'
          ? 3.2
          : it.kind === 'steal'
            ? BAL.stealHold
            : it.kind === 'chest'
              ? 1.6
              : Math.max(0.7, (it.node.hp / Math.max(18, p.geodePower || 20)) * 0.44);
        if (it.kind === 'raid_vault' && it.camp) {
          it.camp.alarmUntil = Math.max(it.camp.alarmUntil || 0, now + 28);
        }
        p.hold = { kind: it.kind, camp: it.camp, nest: it.nest, node: it.node, chest: it.chest, t: 0, need };
      }
      if (p.hold && !this.input.eHeld) p.hold = null;
    } else {
      p.physics(dt, 0, 0, false);
    }

    // --- bots ---
    for (const b of this.bots) b.update(dt, now);

    // --- holds, auto actions for all actors ---
    for (const a of this.actors) {
      if (a.hold) {
        const h = a.hold;
        // validate
        let ok = a.stun <= 0 && !a.carrying;
        if (h.kind === 'raid_vault') {
          ok = ok && h.camp && !h.camp.isLocked(now) && now >= (h.camp.raidCooldownUntil || 0) && h.camp.vaultWorld.distanceTo(a.pos) < 3.5;
        }
        if (h.kind === 'steal') ok = ok && !!h.nest.content && h.nest.world.distanceTo(a.pos) < 2.2;
        if (h.kind === 'gather') ok = ok && h.node.alive;
        if (h.kind === 'chest') ok = ok && h.chest.alive;
        if (!ok) a.hold = null;
        else {
          h.t += dt;
          if (h.kind === 'gather' && Math.floor(h.t / 0.42) !== Math.floor((h.t - dt) / 0.42)) {
            if (a.booga) a.booga.attackT = 0;
            if (this.mode === 'tutorial' && a.isPlayer && h.node.hp <= (a.geodePower || 20) * 1.8) {
              a.addItem('rock', 1);
              a.addItem('wood', 1);
            }
            this.hitGeode(a, h.node, 0.95);
            if (!h.node.alive) {
              a.hold = null;
              continue;
            }
          }
          if (h.t >= h.need) this.completeHold(a);
        }
      }
      // deliver when carrying into own camp
      if (a.carrying && a.camp.inside(a.pos, 1.2)) {
        if (!this.deliver(a) && a.isPlayer && !a._fullWarned) { a._fullWarned = true; this.ui.toast('No free shrine!', 'clay', 'bad'); }
      } else a._fullWarned = false;

      // Bank Unbanked Field Loot & Raided Vault Loot ONLY when stepping inside YOUR OWN CAMP!
      if (a.isPlayer && a.camp.inside(a.pos, 0.8) && (this.stats.geodesCracked || 0) >= 1) {
        this.stats.bankedInBase = 1;
      }
      if ((a.unbankedDust > 0 || a.unbankedItemCount > 0 || a.raidedFrom) && a.camp.inside(a.pos, 0.8)) {
        const bDust = Math.floor(a.unbankedDust || 0);
        const bItems = a.unbankedItemCount;
        const wasRaid = a.raidedFrom;
        const heistBonus = wasRaid ? (this.activeEvent?.kind === 'heist' ? 200 : 100) : 0;
        const bonus = (bDust >= 50 ? Math.round(bDust * 0.15) : 0) + heistBonus;

        // Transfer 100% of Unbanked Carried Loot Bag into Safe Camp Vault & Inventory!
        a.dust += bDust + bonus;
        for (const id in a.unbankedItems) {
          const qty = a.unbankedItems[id] || 0;
          if (qty > 0) a.inv[id] = (a.inv[id] || 0) + qty;
        }
        a.unbankedDust = 0;
        a.unbankedItems = {};
        a.raidedFrom = null;

        if (a.isPlayer) {
          this.stats.bankedInBase = 1;
          this.ui.refreshPanels();
        }
        if (a.isPlayer && (bDust >= 5 || bItems >= 1 || wasRaid)) {
          sfx.buy();
          this.puff(a.pos, '#42f54b');
          this.puff(a.pos, '#ffd615');
          this.floatText(
            a.pos,
            wasRaid
              ? `HEIST BANKED · +${bDust + bonus} DUST`
              : `BANKED AT CAMP · ${bDust > 0 ? `+${bDust + bonus} DUST` : ''}${bDust > 0 && bItems > 0 ? ' · ' : ''}${bItems > 0 ? `+${bItems} ITEMS` : ''}`,
            '#42f54b',
            '/assets/items/dust_icon.png'
          );
          if (wasRaid) {
            this.ui.toast(`Banked ${wasRaid.ownerName}'s Vault haul (+${heistBonus} Bonus). Lock your Camp Gate to secure it.`, 'cave_coin', 'good', true);
          } else if (bDust >= 35 || bItems >= 2) {
            this.ui.toast(`Banked ${bDust} Dust${bonus > 0 ? ` (+${bonus} Bonus)` : ''} & ${bItems} Materials in your Camp Vault.`, 'dust_icon', 'good');
          }
        }
      }
      // lock slab
      if (a.stun <= 0 && !a.camp.isLocked(now) && a.camp.slabWorld.distanceTo(a.pos) < 1.3 && a.onGround) {
        a.camp.lockedUntil = now + a.lockTime;
        a.camp.gateHp = a.camp.gateMaxHp;
        if (a.isPlayer) {
          this.stats.lockedBase = 1;
          sfx.lock();
          this.ui.toast(`Camp Gate locked for ${a.lockTime}s (${a.camp.gateMaxHp} Gate HP).`, 'rock', 'good');
        }
      }
      // Vine Traps in other camps (raiders can BONK traps to disarm them, or get stunned 5.0s if they step on one!)
      for (const c of this.camps) {
        if (c === a.camp) continue;
        if (c.inside(a.pos, 0.5)) {
          c.alarmUntil = Math.max(c.alarmUntil || 0, now + 22);
        }
        for (let i = c.traps.length - 1; i >= 0; i--) {
          const tr = c.traps[i];
          if (tr.pos.distanceTo(a.pos) < 1.05) {
            a.stun = Math.max(a.stun, 5.0);
            a.hold = null;
            a.pendingHit = -1;
            if (a.booga) a.booga.attackT = -1;
            if (a.carrying) this.dropCarry(a);
            if (a.unbankedDust > 0 || a.unbankedItemCount > 0) this.spillUnbankedLoot(a, c.owner, true);
            this.scene.remove(tr.mesh);
            c.traps.splice(i, 1);
            this.floatText(a.pos, 'VINE TRAP · 5s STUN', '#7dff6a');
            if (c.owner.isPlayer) { sfx.bonk(); this.ui.toast(`${a.name} stepped on your Barricade Vine Trap (5s Stun) and dropped their Loot Bag!`, 'vine', 'good'); }
            if (a.isPlayer) {
              sfx.bonk();
              this.ui.flash();
              this.ui.toast(`Stepped on ${c.ownerName}'s Vine Trap (5s Stun)! (Tip: Bonk rival traps to disarm them!)`, 'vine', 'bad');
            }
          }
        }
      }
      a.animate(dt, t);
    }

    // --- 🦖 Boogasaurus Camp Helpers (Patrol inside Camp & sprint to chomp any Raider!) ---
    for (const c of this.camps) {
      const dinoCount = c.activeDinoCount || 0;
      if (dinoCount <= 0 || !c.dinoGuards) continue;
      const intruder = this.actors.find(
        (a) =>
          a.camp !== c &&
          a.stun <= 0 &&
          (c.inside(a.pos, 1.2) || (a.raidedFrom === c && a.pos.distanceTo(c.center) < c.R + 9))
      );
      for (let i = 0; i < dinoCount && i < c.dinoGuards.length; i++) {
        const dg = c.dinoGuards[i];
        if (!dg) continue;
        dg.biteCd = Math.max(0, (dg.biteCd || 0) - dt);
        if (intruder && dg.biteCd <= 0) {
          dg.chasing = true;
          const dx = intruder.pos.x - dg.pos.x;
          const dz = intruder.pos.z - dg.pos.z;
          const dist = Math.hypot(dx, dz);
          const step = Math.min(dist, 7.8 * dt);
          if (dist > 0.05) {
            dg.pos.x += (dx / dist) * step;
            dg.pos.z += (dz / dist) * step;
            dg.pos.y = heightAt(dg.pos.x, dg.pos.z);
            dg.mesh.position.copy(dg.pos);
            dg.mesh.rotation.y = Math.atan2(dx, dz);
          }
          if (dist < 1.75) {
            dg.biteCd = 4.2;
            intruder.stun = Math.max(intruder.stun, 3.2);
            intruder.hold = null;
            intruder.pendingHit = -1;
            if (intruder.booga) intruder.booga.attackT = -1;
            if (intruder.carrying) this.dropCarry(intruder);
            const push = new THREE.Vector3(dx, 0, dz).normalize();
            intruder.knock.copy(push).multiplyScalar(7.5);
            intruder.vy = 3.8;
            intruder.onGround = false;
            const spill = this.spillUnbankedLoot(intruder, c.owner, true);
            this.puff(intruder.pos, '#42f54b');
            this.puff(intruder.pos, '#ffe04a');
            this.floatText(intruder.pos, `🦖 ${dg.name.toUpperCase()} CHOMP · 3.2s STUN!`, '#42f54b');
            if (c.isMine) {
              sfx.bonk();
              this.ui.toast(
                `🦖 Your ${dg.name} chomped raider ${intruder.name} (3.2s Stun)${spill.lostDust > 0 ? ` and recovered ${spill.lostDust} Dust!` : '!'}`,
                'claws',
                'good',
                true
              );
            } else if (intruder.isPlayer) {
              sfx.bonk();
              this.ui.flash();
              this.ui.toast(`Chomped by ${c.ownerName}'s ${dg.name} (3.2s Stun)!`, 'claws', 'bad');
            }
          }
        } else {
          dg.chasing = false;
        }
      }
    }

    // --- Telegraphed Camp Guard Turrets (1.35s Expanding Red Ring -> Dodge Out or Bonk Turret to Disable!) ---
    for (const c of this.camps) {
      if (c.turretWindup > 0) {
        if (!c.hasActiveTurret(now)) {
          c.turretWindup = 0;
          continue;
        }
        c.turretWindup -= dt;
        if (c.turretWindup <= 0) {
          c.turretWindup = 0;
          c.turretCooldown = Math.max(4.5, 8.5 - (c.upgradeCfg?.turrets || 1) * 1.2);
          this.puff(c.turretTargetPos, '#00f5ff');
          this.puff(c.turretTargetPos, '#ff2a1f');
          let zappedAny = false;
          for (const a of this.actors) {
            if (a.camp === c) continue;
            const dist = Math.hypot(a.pos.x - c.turretTargetPos.x, a.pos.z - c.turretTargetPos.z);
            const airH = a.pos.y - heightAt(a.pos.x, a.pos.z);
            if (dist < 3.2 && airH < 0.65) {
              zappedAny = true;
              a.stun = Math.max(a.stun, 2.8);
              a.hold = null;
              a.pendingHit = -1;
              if (a.booga) a.booga.attackT = -1;
              if (a.unbankedDust > 0 || a.unbankedItemCount > 0) this.spillUnbankedLoot(a, c.owner, true);
              this.floatText(a.pos, `TURRET ZAP · 2.8s STUN`, '#00f5ff');
              if (a.isPlayer) {
                sfx.bonk();
                this.ui.flash();
                this.ui.toast(`Zapped by ${c.ownerName}'s Guard Turret! Dodge the red ring or BONK the Turret (80 HP) to disable it!`, 'diamond', 'bad');
              } else if (c.isMine) {
                sfx.bonk();
                this.ui.toast(`Your Camp Guard Turret zapped raider ${a.name} (2.8s Stun)!`, 'diamond', 'good');
              }
            }
          }
          if (!zappedAny && c.inside(p.pos, -2) && !c.isMine) {
            this.floatText(c.turretTargetPos, `DODGED TURRET ZAP!`, '#42f54b');
          }
        }
      } else if (c.turretCooldown <= 0 && c.hasActiveTurret(now)) {
        const intruder = this.actors.find((a) => a.camp !== c && a.stun <= 0 && c.inside(a.pos, 0.5));
        if (intruder) {
          c.turretWindupMax = 1.35;
          c.turretWindup = 1.35;
          c.turretTargetPos.copy(intruder.pos);
          c.alarmUntil = Math.max(c.alarmUntil || 0, now + 25);
          this.floatText(intruder.pos, `⚠️ TURRET LOCKING ON — DODGE OR BONK TURRET!`, '#ff2a1f');
          if (intruder.isPlayer) sfx.alarm();
        }
      }
    }

    // Track which of the 12 Booga Map Biomes the player is currently exploring!
    if (this.started && !isTutorialMap) {
      const zn = zoneAt(p.pos.x, p.pos.z);
      if (zn && zn.id !== this.currentZoneId) {
        const hadPrev = !!this.currentZoneId;
        this.currentZoneId = zn.id;
        if (hadPrev) {
          const geodeNames = (zn.geodes || []).slice(0, 3).map((g) => NODES[g]?.name.replace(' Geode', '') || g).join(' · ');
          this.ui.banner(
            `${zn.name.toUpperCase()} · STEP ${zn.step}`,
            `${zn.subtitle || zn.desc} — Native Geodes: ${geodeNames}`,
            zn.color || '#ffd615'
          );
        }
      }
    }

    // Update Social Hub 3D landmark label visibility
    if (this.hubLabels) {
      for (const hl of this.hubLabels) {
        const d = hl.pos.distanceTo(p.pos);
        hl.el.classList.toggle('hidden', d > (hl.maxD || 38));
      }
    }

    // --- Physical 3D Loot Piñata Drops (Bounce Physics + Magnetic Vacuum Pickup!) ---
    if (this.lootDrops && this.lootDrops.length) {
      for (let i = this.lootDrops.length - 1; i >= 0; i--) {
        const ld = this.lootDrops[i];
        ld.age += dt;
        ld.ttl -= dt;
        if (ld.lockT > 0) ld.lockT -= dt;
        if (ld.ttl <= 0) {
          this.scene.remove(ld.mesh);
          this.lootDrops.splice(i, 1);
          continue;
        }
        // Bounce physics
        ld.vy -= 22 * dt;
        ld.pos.x += ld.vx * dt;
        ld.pos.z += ld.vz * dt;
        ld.pos.y += ld.vy * dt;
        const gh = heightAt(ld.pos.x, ld.pos.z) + 0.45;
        if (ld.pos.y <= gh) {
          ld.pos.y = gh;
          if (Math.abs(ld.vy) > 1.2) {
            ld.vy = -ld.vy * 0.48;
            ld.vx *= 0.65;
            ld.vz *= 0.65;
          } else {
            ld.vy = 0;
            ld.vx *= 0.85;
            ld.vz *= 0.85;
          }
        }
        // Magnetic vacuum pull after initial 0.28s fountain burst
        let pickedBy = null;
        if (ld.age > 0.28) {
          let bestA = null, bestD = 5.2;
          for (const a of this.actors) {
            if (a.stun > 0) continue;
            if (ld.lockT > 0 && ld.owner && ld.owner !== a) continue;
            const d = Math.hypot(a.pos.x - ld.pos.x, a.pos.z - ld.pos.z);
            if (d < bestD) { bestD = d; bestA = a; }
          }
          if (bestA) {
            const pull = Math.min(1, dt * 13);
            ld.pos.x += (bestA.pos.x - ld.pos.x) * pull;
            ld.pos.z += (bestA.pos.z - ld.pos.z) * pull;
            ld.pos.y += (bestA.pos.y + 1.0 - ld.pos.y) * pull;
            if (bestD < 1.05) pickedBy = bestA;
          }
        }
        ld.mesh.position.set(ld.pos.x, ld.pos.y + Math.sin(t * 5 + i) * 0.08, ld.pos.z);
        if (pickedBy) {
          if (ld.kind === 'dust') {
            pickedBy.addFieldDust(ld.val);
            if (pickedBy.isPlayer) {
              sfx.dust();
              this.stats.collected += ld.val;
            }
          } else if (ld.kind === 'item') {
            pickedBy.addItem(ld.id, ld.qty, true);
            if (pickedBy.isPlayer) {
              sfx.pickup();
              this.floatText(pickedBy.pos, `+${ld.qty} ${ITEMS[ld.id]?.name || ld.id}`, '#ffe04a', ICON(ld.id));
              this.ui.refreshPanels();
            }
          }
          this.scene.remove(ld.mesh);
          this.lootDrops.splice(i, 1);
        }
      }
    }

    // --- crystals ---
    for (const c of this.crystals) {
      if (!c.alive) {
        c.respawn -= dt;
        if (c.respawn <= 0) this.spawnCrystal(c);
        continue;
      }
      c.sprite.position.set(c.pos.x, c.base + Math.sin(t * 2 + c.ph) * 0.15, c.pos.z);
      for (const a of this.actors) {
        const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z);
        if (d < 3.2 && a.isPlayer) {
          // magnet
          c.pos.x += (a.pos.x - c.pos.x) * Math.min(1, dt * 6);
          c.pos.z += (a.pos.z - c.pos.z) * Math.min(1, dt * 6);
        }
        if (d < 1.0) {
          a.addFieldDust(c.value);
          c.alive = false;
          c.respawn = 12 + rand() * 15;
          this.scene.remove(c.sprite);
          if (a.isPlayer) { sfx.dust(); this.floatText(c.pos, `+${c.value} IN BAG`, '#d9b3ff', '/assets/items/dust_icon.png'); this.stats.collected += c.value; }
          break;
        }
      }
    }

    // --- 3D Geode nodes respawn, shake, split-open animation & overhead stage UI ---
    const SPLIT_FRAMES = ['split_1', 'split_2', 'split_3', 'split_4', 'open'];
    for (const n of this.nodes) {
      if (!n.alive) {
        if (n.crackAnim > 0) {
          n.crackAnim = Math.max(0, n.crackAnim - dt);
          const prog = 1 - n.crackAnim / 1.75; // 0..1
          const fIdx = Math.min(4, Math.floor(prog * 6));
          const frameName = SPLIT_FRAMES[fIdx];
          if (n.stage !== frameName) {
            n.stage = frameName;
            setGeodeStage(n.mesh, frameName);
          }
          if (n.crackAnim <= 0) {
            n.mesh.visible = false;
          }
        }
        n.respawn -= dt;
        if (n.respawn <= 0) {
          n.alive = true;
          n.crackAnim = 0;
          n.hp = n.maxHp;
          n.dmgBy = {};
          n.stage = 1;
          setGeodeStage(n.mesh, 1);
          const cfg = NODES[n.type] || NODES.quartz;
          if (n.stageImg) n.stageImg.src = GEODE_STAGE_ICON(cfg.stageFolder, 1);
          if (n.stageSpan) n.stageSpan.textContent = '1';
          if (n.dmgSpan) { n.dmgSpan.style.display = 'none'; n.dmgSpan.textContent = ''; }
          if (n.hpBar) n.hpBar.style.width = '100%';
          n.mesh.visible = true;
          n.mesh.scale.setScalar(0.01);
          n.grow = 0;
        }
      } else {
        if (n.grow !== undefined) {
          n.grow += dt * 2;
          n.mesh.scale.setScalar(n.scale * Math.min(1, n.grow));
          if (n.grow >= 1) delete n.grow;
        }
        if (n.shake > 0) {
          n.shake = Math.max(0, n.shake - dt);
          const wob = Math.sin(t * 55) * n.shake * 0.35;
          n.mesh.rotation.z = wob;
          if (n.mesh.userData?.spriteMat) n.mesh.userData.spriteMat.rotation = wob;
          if (n.mesh.userData?.body) {
            const sq = 1 + Math.sin(t * 65) * n.shake * 0.25;
            n.mesh.userData.body.scale.set(sq, 2 - sq, 1);
          }
        } else {
          n.mesh.rotation.z = 0;
          if (n.mesh.userData?.spriteMat) n.mesh.userData.spriteMat.rotation = 0;
          if (n.mesh.userData?.body) n.mesh.userData.body.scale.set(1, 1, 1);
        }
        if (n.el) {
          const d = n.pos.distanceTo(p.pos);
          n.el.classList.toggle('hidden', d >= 4.8 && !(n.stage > 1 && d < 8.5));
          n.el.classList.toggle('damaged', n.stage > 1);
        }
      }
    }

    // --- Random Contested Biome Bosses (Fight Back + Most Damage Wins Loot!) ---
    if (this.bosses && this.bosses.length) {
      const aliveCount = this.bosses.filter((b) => b.alive).length;
      if (aliveCount === 0) {
        this.bossSpawnTimer = (this.bossSpawnTimer ?? 20) - dt;
        if (this.bossSpawnTimer <= 0) {
          this.bossSpawnTimer = 32 + rand() * 18;
          this.spawnRandomBoss(null, true);
        }
      }
      for (const b of this.bosses) {
        if (!b.alive) continue;
        if (b.atkCd > 0) b.atkCd -= dt;
        if (b.slamCd > 0) b.slamCd -= dt;
        if (b.recoverT > 0) b.recoverT = Math.max(0, b.recoverT - dt);
        if (b.swingT > 0) b.swingT = Math.max(0, b.swingT - dt);

        // Find closest or highest-damage Miner within aggro radius (32m)
        let targetMiner = null, bestScore = 1e9;
        for (const a of this.actors) {
          if (a.camp.inside(a.pos, 0)) continue;
          const dist = a.pos.distanceTo(b.pos);
          if (dist > 32) continue;
          const dealt = (b.dmgBy && b.dmgBy[a.name]) || 0;
          const score = dist - Math.min(10, dealt * 0.04);
          if (score < bestScore) {
            bestScore = score;
            targetMiner = a;
          }
        }

        // 1. Handle Telegraphed AoE Shockwave Slam countdown (2.0s windup — Boss stays planted!)
        if (b.slamWindup > 0) {
          b.slamWindup -= dt;
          if (b.slamWindup <= 0) {
            b.slamWindup = 0;
            b.swingT = 0.45;
            b.recoverT = 1.0; // Pause 1.0s after slamming so players can punish!
            this.puff(b.pos, '#ff2a1f');
            this.puff(b.pos, b.cfg.color || '#ffd615');
            if (p.pos.distanceTo(b.pos) < 24) {
              sfx.bonk();
              this.camPunch = Math.max(this.camPunch, 0.35);
            }
            for (const a of this.actors) {
              const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
              const airH = a.pos.y - heightAt(a.pos.x, a.pos.z);
              if (dist < 3.85 && airH < 0.55) {
                const pushDir = new THREE.Vector3(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
                if (pushDir.lengthSq() < 0.01) pushDir.set(1, 0, 0);
                pushDir.normalize();
                a.knock.copy(pushDir).multiplyScalar(10.5);
                a.vy = 5.4;
                a.onGround = false;
                a.stun = Math.max(a.stun, 2.2);
                a.hold = null;
                if (a.carrying) this.dropCarry(a);
                if (a.unbankedDust > 0 || a.unbankedItemCount > 0) this.spillUnbankedLoot(a, null, false);
                this.floatText(a.pos, 'BOSS SHOCKWAVE · LOOT DROPPED', '#ff2a1f');
                if (a.isPlayer) {
                  this.ui.flash();
                  this.ui.toast(`${b.cfg.name}'s Shockwave knocked you down and spilled your Loot Bag!`, b.cfg.drop, 'bad', true);
                }
              }
            }
          }
        } else if (b.atkWindup > 0) {
          // 2. Handle Telegraphed Melee Swipe countdown (1.15s windup — Boss stays planted so you can back out!)
          b.atkWindup -= dt;
          if (b.atkWindup <= 0) {
            b.atkWindup = 0;
            b.swingT = 0.45;
            b.recoverT = 0.85; // Pause 0.85s after swiping!
            this.puff(b.pos, b.cfg.color || '#ff5a36');
            for (const a of this.actors) {
              const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
              const airH = a.pos.y - heightAt(a.pos.x, a.pos.z);
              if (dist < 3.0 && airH < 0.65) {
                const pushDir = new THREE.Vector3(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
                if (pushDir.lengthSq() < 0.01) pushDir.set(1, 0, 0);
                pushDir.normalize();
                a.knock.copy(pushDir).multiplyScalar(8.0);
                a.vy = 3.8;
                a.onGround = false;
                a.stun = Math.max(a.stun, 1.2);
                a.hold = null;
                if (a.carrying) this.dropCarry(a);
                if (a.unbankedDust > 0 || a.unbankedItemCount > 0) this.spillUnbankedLoot(a, null, false);
                this.floatText(a.pos, `BOSS SWIPE · 1.2s STUN`, '#ff5a36');
                if (a.isPlayer) {
                  sfx.bonk();
                  this.camPunch = 0.22;
                  this.ui.flash();
                  this.ui.toast(`${b.cfg.name} swiped you and spilled your Loot Bag!`, b.cfg.drop, 'bad');
                }
              }
            }
          }
        } else if (targetMiner) {
          // Chase the target Miner (slower 3.6 speed & pauses during recovery!)
          const dx = targetMiner.pos.x - b.pos.x;
          const dz = targetMiner.pos.z - b.pos.z;
          const dist = Math.hypot(dx, dz);
          b.mesh.rotation.y = Math.atan2(dx, dz);
          if (dist > 2.4 && (!b.recoverT || b.recoverT <= 0)) {
            const spd = 3.6;
            b.pos.x += (dx / dist) * spd * dt;
            b.pos.z += (dz / dist) * spd * dt;
            // Keep within reasonable distance of spawn arena (max 36m leash)
            const dh = Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z);
            if (dh > 36) {
              b.pos.x = b.home.x + ((b.pos.x - b.home.x) / dh) * 36;
              b.pos.z = b.home.z + ((b.pos.z - b.home.z) / dh) * 36;
            }
          }
          // Trigger Telegraphed AoE Shockwave Slam (2.0s warning, 9.5s cooldown)
          if ((!b.recoverT || b.recoverT <= 0) && dist < 4.0 && b.slamCd <= 0) {
            b.slamWindupMax = 2.0;
            b.slamWindup = 2.0;
            b.slamCd = 9.5;
            b.atkCd = Math.max(b.atkCd || 0, 3.2);
            this.floatText(b.pos, `⚠️ ${b.cfg.name.toUpperCase()} SHOCKWAVE! (2s — DODGE OR JUMP!)`, '#ff2a1f');
            if (p.pos.distanceTo(b.pos) < 18) sfx.alarm();
          } else if ((!b.recoverT || b.recoverT <= 0) && dist < 3.1 && b.atkCd <= 0) {
            // Trigger Telegraphed Melee Swipe (1.15s warning, 3.8s cooldown — no more instant hits!)
            b.atkWindupMax = 1.15;
            b.atkWindup = 1.15;
            b.atkCd = 3.8;
            this.floatText(b.pos, `⚠️ BOSS WINDING UP! STEP BACK!`, '#ffb02e');
          }
        } else {
          // Idle patrol around random spawn point
          const ang = t * 0.45 + (b.patrolAngle || 0);
          const tx = b.home.x + Math.cos(ang) * 3.5;
          const tz = b.home.z + Math.sin(ang) * 3.5;
          b.pos.x += (tx - b.pos.x) * Math.min(1, dt * 3);
          b.pos.z += (tz - b.pos.z) * Math.min(1, dt * 3);
          b.mesh.rotation.y = -ang;
        }

        b.pos.y = heightAt(b.pos.x, b.pos.z);
        b.mesh.position.copy(b.pos);
        animateBoss(b, dt, t);
        if (b.el) {
          const d = b.pos.distanceTo(p.pos);
          b.el.classList.toggle('hidden', d >= 44);
        }
      }
    }

    // --- chests ---
    for (const ch of this.chests) {
      if (!ch.alive) {
        ch.respawn -= dt;
        if (ch.respawn <= 0) this.placeChest(ch);
      } else {
        ch.mesh.userData.beam.material.opacity = 0.14 + Math.sin(t * 3) * 0.06;
        ch.mesh.rotation.y += dt * 0.3;
      }
    }

    // --- camps ---
    const showLbl = (pos, maxD = 5.5) => pos.distanceTo(p.pos) < maxD;
    for (const c of this.camps) c.playerInside = c.inside(p.pos, -1);
    for (const c of this.camps) c.update(dt, now, c.owner.incomeMult, t, showLbl);

    // --- floaters ---
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.o) {
        f.o.position.y += dt * 1.6;
        f.o.element.style.opacity = String(1 - f.t);
        if (f.t > 1) { this.scene.remove(f.o); f.o.element.remove(); this.floaters.splice(i, 1); }
      } else {
        f.g.children.forEach((s) => { s.position.addScaledVector(s.userData.v, dt); s.userData.v.y -= 12 * dt; s.rotation.x += dt * 5; });
        f.g.children[0].material.opacity = 1 - f.t;
        if (f.t > 1) { this.scene.remove(f.g); this.floaters.splice(i, 1); }
      }
    }

    this.updateCompetitive(dt, now);
    this.updateGuide(dt, t, now);
    this.world.update(dt, p.pos, this.camera.position);
    this.engine.streamer.update(dt, p.pos, this);
    this.engine.updateAdaptiveQuality(dt);
    this.updateCamera(dt);
    this.ui.update(dt);
    if (this.mode === 'valley') {
      this.saveT += dt;
      if (this.saveT > 8) { this.saveT = 0; this.save(); }
    }
  }

  getCurrentBounty() {
    const p = this.player;
    const shrines = p.camp.shrineCount();
    const hasUpgradedWeapon = (GEAR[p.weapon]?.tierRank || 1) > 1;
    const core = [
      {
        isStarter: true,
        stepNum: 1,
        icon: '/assets/geodes/quartz/stage_4.png',
        cardTitle: '1. Crack a Geode',
        title: 'STEP 1 OF 5',
        text: 'Walk outside & <b>Click</b> the Quartz Geode to fill your Loot Bag',
        cur: Math.min(1, this.stats.geodesCracked || 0),
        max: 1,
        rewardTxt: '+60 Dust',
        claim: () => {
          p.addFieldDust(60);
          if ((p.unbankedItems.rock || 0) + (p.inv.rock || 0) < 2) p.addItem('rock', 2, true);
          if ((p.unbankedItems.wood || 0) + (p.inv.wood || 0) < 2) p.addItem('wood', 2, true);
        },
      },
      {
        isStarter: true,
        stepNum: 2,
        icon: '/assets/items/dust_icon.png',
        cardTitle: '2. Extract to Your Camp',
        title: 'STEP 2 OF 5',
        text: 'Carry your Loot Bag back inside <b>Your Camp</b> to bank it safely',
        cur: Math.min(1, this.stats.bankedInBase || (p.camp.inside(p.pos, 0.8) && (this.stats.geodesCracked || 0) >= 1 ? 1 : 0)),
        max: 1,
        rewardTxt: '+60 Dust',
        claim: () => {
          p.dust += 60;
          if ((p.inv.rock || 0) < 2) p.addItem('rock', 2, false);
          if ((p.inv.wood || 0) < 2) p.addItem('wood', 2, false);
        },
      },
      {
        isStarter: true,
        stepNum: 3,
        icon: '/assets/items/rock.png',
        cardTitle: '3. Lock Your Camp Gate',
        title: 'STEP 3 OF 5',
        text: 'Step on the <b>Green Lock Pad</b> at your gate to secure your Vault',
        cur: Math.min(1, this.stats.lockedBase || (p.camp.isLocked(this.now) ? 1 : 0)),
        max: 1,
        rewardTxt: '+70 Dust',
        claim: () => {
          p.dust += 70;
          p.traps += 1;
          if ((p.inv.rock || 0) < 2) p.addItem('rock', 2, false);
          if ((p.inv.wood || 0) < 2) p.addItem('wood', 2, false);
        },
      },
      {
        isStarter: true,
        stepNum: 4,
        icon: '/assets/weapons/StoneClub.png',
        cardTitle: '4. Forge Stone Club',
        title: 'STEP 4 OF 5',
        text: 'Press <b>[R]</b> to craft your <b>Stone Club</b> from banked materials',
        cur: hasUpgradedWeapon ? 1 : 0,
        max: 1,
        rewardTxt: '+100 Dust',
        claim: () => { p.dust += 100; },
      },
      {
        isStarter: true,
        stepNum: 5,
        icon: '/assets/treasures/cave_coin.png',
        cardTitle: '5. Breach & Raid a Camp',
        title: 'STEP 5 OF 5',
        text: 'Bonk a Rival\'s <b>Boulder Gate</b> (or Turret) & <b>Hold [E]</b> on their Vault Chest',
        cur: Math.min(1, (this.stats.steals || 0) + (this.stats.bonks || 0)),
        max: 1,
        rewardTxt: '+220 Dust',
        claim: () => { p.dust += 220; p.addItem('cave_coin', 2, false); },
      },
      {
        title: 'CHAPTER 6 · AWAKEN A TROPHY SHRINE',
        text: 'Slay a Biome Boss, open a Relic Chest, or trade 3 Coins at the Relic Altar to awaken a Camp Shrine.',
        cur: Math.min(1, shrines),
        max: 1,
        rewardTxt: '+250 Dust & 2 Gold',
        claim: () => { p.dust += 250; p.addItem('gold', 2, false); },
      },
      {
        title: 'CHAPTER 7 · WORLD BOSS HUNTER',
        text: 'Deal top damage & defeat a roaming Biome World Boss (Bat, Shaman, Mummy, or Cyborg).',
        cur: Math.min(1, this.stats.bosses || 0),
        max: 1,
        rewardTxt: '+320 Dust & 2 Diamonds',
        claim: () => { p.dust += 320; p.addItem('diamond', 2, false); },
      },
      {
        title: 'CHAPTER 8 · #1 MASTER OF THE CONTINENT',
        text: 'Ascend to Step 3+ Gear & climb to #1 Miner Fame on the Leaderboard.',
        cur: p.isKing && p.ascensionStep >= 2 ? 1 : 0,
        max: 1,
        rewardTxt: '+1,000 Dust & Golden Crown',
        claim: () => { p.dust += 1000; },
      },
    ];
    if (this.bountyIdx < core.length) return core[this.bountyIdx];
    const loopIdx = (this.bountyIdx - core.length) % 3;
    const tier = 1 + Math.floor((this.bountyIdx - core.length) / 3);
    if (loopIdx === 0) {
      const targetBosses = (this.bountyBaseSteals || 0) + 1;
      return {
        title: `CONTRACT · DEFEAT A WORLD BOSS`,
        text: 'Hunt down the active Biome Boss & extract the Boss Loot Bag to your Camp.',
        cur: Math.min(1, Math.max(0, (this.stats.bosses || 0) - (targetBosses - 1))),
        max: 1,
        rewardTxt: `+${450 * tier} Dust`,
        claim: () => { p.dust += 450 * tier; this.bountyBaseSteals = this.stats.bosses || 0; },
      };
    }
    if (loopIdx === 1) {
      const targetBonks = (this.bountyBaseBonks || 1) + 2;
      return {
        title: `CONTRACT · INTERCEPT 2 RIVALS`,
        text: 'Knock down 2 rivals in the wild to claim their unbanked Loot Bags.',
        cur: Math.min(2, Math.max(0, (this.stats.bonks || 0) - (targetBonks - 2))),
        max: 2,
        rewardTxt: `+${350 * tier} Dust`,
        claim: () => { p.dust += 350 * tier; this.bountyBaseBonks = this.stats.bonks || 0; },
      };
    }
    const targetGather = (this.bountyBaseGather || 0) + 3;
    return {
      title: `CONTRACT · CRACK 3 WILD GEODES`,
      text: 'Explore Steps 1–4 Biomes, crack 3 Geodes, and extract the haul to your Camp.',
      cur: Math.min(3, Math.max(0, (this.stats.geodesCracked || 0) - (targetGather - 3))),
      max: 3,
      rewardTxt: `+${300 * tier} Dust`,
      claim: () => { p.dust += 300 * tier; this.bountyBaseGather = this.stats.geodesCracked || 0; },
    };
  }

  updateCompetitive(dt, now) {
    // 1. Live Miner Fame Ranking & 3D King Crown
    const ranked = [...this.actors].sort((a, b) => {
      const fa = a.fameScore, fb = b.fameScore;
      if (fb !== fa) return fb - fa;
      return b.dust - a.dust;
    });
    this.rankedActors = ranked;
    ranked.forEach((a, idx) => {
      a.isKing = idx === 0 && a.fameScore >= 80;
    });
    const myRank = ranked.indexOf(this.player);
    if (this.started && this.lastRank !== -1 && myRank < this.lastRank) {
      sfx.rankUp();
      this.puff(this.player.pos, '#ffd615');
      if (myRank === 0) {
        this.ui.banner('#1 MINER FAME ON THE CONTINENT', 'Golden Crown Active (+20% Geode & Boss Dust)', '#ffd615');
      } else {
        this.ui.toast(`Rank Up: Climbed to #${myRank + 1} in Miner Fame`, 'dust_icon', 'good', true);
      }
    }
    if (this.started) this.lastRank = myRank;

    // 2. Valley Bounties (Full Valley Mode)
    if (this.started && this.mode === 'valley') {
      const b = this.getCurrentBounty();
      if (b && b.cur >= b.max) {
        b.claim();
        this.bountyBaseSteals = this.stats.bosses || 0;
        this.bountyBaseBonks = this.stats.bonks || 0;
        this.bountyBaseGather = this.stats.geodesCracked || 0;
        this.bountyIdx++;
        sfx.stepClear();
        this.puff(this.player.pos, '#42f54b');
        this.puff(this.player.pos, '#ffd615');
        const clearLbl = b.isStarter ? `STEP ${b.stepNum} COMPLETE · ${b.rewardTxt}` : `CHAPTER COMPLETE · ${b.rewardTxt}`;
        this.floatText(this.player.pos, clearLbl, '#42f54b', '/assets/items/dust_icon.png');
        if (!b.isStarter) {
          this.ui.banner('CHAPTER COMPLETE', `Reward: ${b.rewardTxt}`, '#ffd615');
        }
        this.ui.refreshPanels();
      }

      // 3. Dynamic Continent Events every 48s (only after the 5 Starter Steps are finished)
      if (this.bountyIdx >= 5) {
        if (this.activeEvent) {
          this.activeEvent.left -= dt;
          if (this.activeEvent.left <= 0) this.activeEvent = null;
        } else {
          this.eventTimer -= dt;
          if (this.eventTimer <= 0) {
            this.eventTimer = 48;
            const roll = Math.floor(rand() * 3);
            if (roll === 0) {
              this.activeEvent = { kind: 'frenzy', label: '2x GEODE RUSH ACTIVE', left: 22 };
              this.ui.banner('2x GEODE RUSH ACTIVE', 'All Wild Geodes & Bosses yield Double Dust for 22s', '#ffd615');
              sfx.rankUp();
            } else if (roll === 1) {
              this.activeEvent = { kind: 'boss_surge', label: 'WORLD BOSS BOUNTY SURGE', left: 22 };
              if (this.bossDirector && !this.bosses.some((bo) => bo.alive)) {
                this.bossDirector.cooldown = Math.min(this.bossDirector.cooldown, 1.5);
              }
              this.ui.banner('WORLD BOSS BOUNTY SURGE', 'Hunt the Biome Boss — Top Damage claims the Trophy Shrine & Loot', '#5fd4ff');
              sfx.hatch();
            } else {
              this.activeEvent = { kind: 'heist', label: '2x CAMP HEIST BONUS', left: 22 };
              this.ui.banner('2x CAMP HEIST BONUS', 'Raiding Rival Camps & Extracting Loot Bags pays Double Bonus for 22s', '#ff5a36');
              sfx.steal();
            }
          }
        }
      }
    }
  }

  updateCamera(dt) {
    const p = this.player.pos;
    const c = this.cam;
    if (this.camPunch > 0) this.camPunch = Math.max(0, this.camPunch - dt * 1.8);
    const shakeX = this.camPunch > 0 ? (Math.random() - 0.5) * this.camPunch * 1.2 : 0;
    const shakeY = this.camPunch > 0 ? (Math.random() - 0.5) * this.camPunch * 1.2 : 0;
    const target = new THREE.Vector3(p.x + shakeX, p.y + 1.7 + shakeY, p.z);
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
    const pos = target.clone().add(off);
    const gh = heightAt(pos.x, pos.z) + 0.6;
    if (pos.y < gh) pos.y = gh;
    if (!this.started) {
      // title orbit
      const a = this.t * 0.08;
      pos.set(p.x + Math.sin(a) * 14, p.y + 6, p.z + Math.cos(a) * 14);
    }
    this.camera.position.lerp(pos, Math.min(1, dt * 14));
    this.camera.lookAt(target);
  }

  render() {
    this.engine.render();
  }

  loop = () => {
    const dt = Math.min(0.05, this.clock.getDelta());
    try {
      this.update(dt);
    } catch (e) {
      if (!this._errLogged) { console.error(e); this._errLogged = true; }
    }
    this.render();
    requestAnimationFrame(this.loop);
  };

  // ---------------- save / load ----------------
  save() {
    const p = this.player;
    const data = {
      dust: p.dust, inv: p.inv, gear: p.gear, traps: p.traps, treasures: p.treasures, stats: this.stats,
      bountyIdx: this.bountyIdx, graduated: !!p.graduated,
      baseLevel: p.camp?.level || 1,
      shrines: p.camp.nests.map((n) => !!(n.content && n.content.kind === 'shrine')),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }
  load() {
    this.stats = { steals: 0, gathered: 0, collected: 0, bonks: 0, geodesCracked: 0, bosses: 0 };
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
    if (!d) return;
    const p = this.player;
    p.dust = d.dust ?? p.dust;
    p.inv = d.inv || {};
    p.gear = d.gear || {};
    p.traps = d.traps || 0;
    p.treasures = d.treasures || {};
    p.graduated = !!d.graduated;
    this.bountyIdx = d.bountyIdx || 0;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    if (d.baseLevel) p.camp.setLevel(d.baseLevel);
    p.camp.setNestCount(4);
    (d.shrines || []).forEach((unlocked, i) => {
      if (unlocked) p.camp.unlockShrine(i);
    });
    Object.keys(p.treasures).forEach((tid) => {
      if (p.treasures[tid] > 0) {
        const idx = TROPHY_SHRINES.findIndex((s) => s.id === tid);
        if (idx >= 0) p.camp.unlockShrine(idx);
      }
    });
    p.refreshWeapon();
    p.refreshSuit();
  }
  reset() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }
}

function segCircle(a, b, r) {
  // does the xz segment a->b pass within r of the origin?
  const ex = b.x - a.x, ez = b.z - a.z;
  const L2 = ex * ex + ez * ez;
  let t = L2 > 0 ? -(a.x * ex + a.z * ez) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + ex * t, a.z + ez * t) < r;
}

function pushOut(p, x, z, r) {
  const dx = p.x - x, dz = p.z - z;
  const d2 = dx * dx + dz * dz;
  if (d2 < r * r && d2 > 1e-6) {
    const d = Math.sqrt(d2);
    p.x = x + (dx / d) * r;
    p.z = z + (dz / d) * r;
  }
}
