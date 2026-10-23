import * as THREE from 'three';
import { BAL, GEAR, EGGS } from './config.js';
import { Booga } from './character.js';
import { heightAt, getVolcanoPos, VOLCANO_R, rand } from './world.js';
import { makeEgg, makeDino, animateDino } from './props.js';
import { spawn, tint } from './assets.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GAP } from './camp.js';

const WEAPON_ORDER = Object.keys(GEAR)
  .filter((k) => GEAR[k].kind === 'weapon')
  .sort((a, b) => (GEAR[b].tierRank || 0) - (GEAR[a].tierRank || 0));

const SUIT_ORDER = ['suit_warrior', 'suit_shaman', 'suit_hunter', 'suit_nomad'];

function makeClub(id) {
  const g = new THREE.Group();
  const leatherMat = new THREE.MeshStandardMaterial({ color: '#422411', roughness: 0.9, flatShading: true });
  const barkMat = new THREE.MeshStandardMaterial({ color: '#633a16', roughness: 0.88, flatShading: true });

  // 1. Nerd Laser (Ruby Laser Saber!)
  if (id === 'nerd_laser') {
    const hiltMat = new THREE.MeshStandardMaterial({ color: '#24262e', metalness: 0.7, roughness: 0.25, flatShading: true });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.32, 10), hiltMat);
    grip.position.y = 0.16;
    g.add(grip);
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.055, 0.08, 10), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.8, roughness: 0.2 }));
    emitter.position.y = 0.34;
    g.add(emitter);
    const coreBlade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, 0.92, 10),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    coreBlade.position.y = 0.82;
    g.add(coreBlade);
    const glowBlade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.072, 0.95, 10),
      new THREE.MeshBasicMaterial({ color: '#ff1e38', transparent: true, opacity: 0.68 })
    );
    glowBlade.position.y = 0.82;
    g.add(glowBlade);
    return g;
  }

  // 2. Blades, Swords & Scimitar of Joaquim
  if (['machete', 'sword_gold', 'blade_copper', 'dagger_sunstone', 'scimitar_joaquim'].includes(id)) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), leatherMat);
    grip.position.y = 0.14;
    g.add(grip);
    const guardCol = id === 'sword_gold' ? '#ffd615' : id === 'scimitar_joaquim' ? '#3b2e3d' : '#7a6855';
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.09), new THREE.MeshStandardMaterial({ color: guardCol, metalness: 0.5, roughness: 0.35, flatShading: true }));
    guard.position.y = 0.29;
    g.add(guard);

    const bladeColors = {
      machete: { col: '#b8c4d0', em: '#000000', emI: 0 },
      sword_gold: { col: '#ffd615', em: '#ff9d00', emI: 0.65 },
      blade_copper: { col: '#ff6a2b', em: '#ff3300', emI: 1.4 },
      dagger_sunstone: { col: '#ffae00', em: '#ff6a00', emI: 1.1 },
      scimitar_joaquim: { col: '#f5d77f', em: '#9ef3ff', emI: 0.95 },
    }[id];
    const bladeMat = new THREE.MeshStandardMaterial({
      color: bladeColors.col,
      emissive: bladeColors.em,
      emissiveIntensity: bladeColors.emI,
      metalness: 0.55,
      roughness: 0.22,
      flatShading: true,
    });
    const len = id === 'dagger_sunstone' ? 0.58 : 0.84;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, len, 0.032), bladeMat);
    blade.position.y = 0.32 + len * 0.5;
    if (id === 'scimitar_joaquim') blade.rotation.z = -0.12;
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 4), bladeMat);
    tip.position.y = 0.32 + len + 0.09;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);
    return g;
  }

  // 3. Hammers, Mauls & Axes
  if (['hammer_flint', 'hammer_magma', 'maul_sunstone', 'axe_bone', 'tomahawk_amber'].includes(id)) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.96, 8), barkMat);
    shaft.position.y = 0.48;
    g.add(shaft);
    const headColors = {
      hammer_flint: { col: '#69758c', em: '#000000', emI: 0 },
      hammer_magma: { col: '#3d231e', em: '#ff4500', emI: 1.6 },
      maul_sunstone: { col: '#ffb700', em: '#ff6a00', emI: 1.3 },
      axe_bone: { col: '#f5eedc', em: '#000000', emI: 0 },
      tomahawk_amber: { col: '#291a12', em: '#ff8c00', emI: 0.9 },
    }[id];
    const headMat = new THREE.MeshStandardMaterial({
      color: headColors.col,
      emissive: headColors.em,
      emissiveIntensity: headColors.emI,
      roughness: 0.35,
      flatShading: true,
    });
    if (id === 'axe_bone' || id === 'tomahawk_amber') {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.38, 5), headMat);
      blade.rotation.z = -Math.PI / 2;
      blade.scale.set(1, 1, 0.35);
      blade.position.set(0.16, 0.84, 0);
      g.add(blade);
    } else {
      const hammerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.46, 8), headMat);
      hammerHead.rotation.z = Math.PI / 2;
      hammerHead.position.y = 0.88;
      g.add(hammerHead);
    }
    return g;
  }

  // 4. Staves, Wands & Spears
  if (['staff_shaman', 'wand_opal', 'spear_lapis', 'spear_glass'].includes(id)) {
    const len = id === 'spear_lapis' || id === 'spear_glass' ? 1.22 : 1.05;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, len, 8), barkMat);
    shaft.position.y = len * 0.5;
    g.add(shaft);
    const tipColors = {
      staff_shaman: { col: '#7dff42', em: '#42f54b', emI: 2.0 },
      wand_opal: { col: '#f5b8ff', em: '#7ae7ff', emI: 1.6 },
      spear_lapis: { col: '#1c42b0', em: '#ffd615', emI: 0.9 },
      spear_glass: { col: '#8ffcff', em: '#00d9ff', emI: 1.3 },
    }[id];
    const tipMat = new THREE.MeshStandardMaterial({
      color: tipColors.col,
      emissive: tipColors.em,
      emissiveIntensity: tipColors.emI,
      roughness: 0.2,
      flatShading: true,
    });
    const orb = new THREE.Mesh(
      id.startsWith('spear') ? new THREE.ConeGeometry(0.11, 0.38, 6) : new THREE.OctahedronGeometry(0.18, 0),
      tipMat
    );
    orb.position.y = len + 0.12;
    g.add(orb);
    return g;
  }

  // 5. Sculpted Prehistoric Caveman Clubs (Wooden Club, Stone Club, Meat Club, Amber Club, Ironclaw Bat, Marble Morningstar)
  const palette = {
    club_wood:          { barrel: '#8f5926', stud: '#633a16', em: '#000000', emI: 0 },
    club_stone:         { barrel: '#7a828f', stud: '#525863', em: '#000000', emI: 0 },
    club_meat:          { barrel: '#c93b2b', stud: '#f7f0de', em: '#4a0d08', emI: 0.25 },
    club_amber:         { barrel: '#8f5926', stud: '#ff9d00', em: '#ff6a00', emI: 1.4 },
    bat_ironclaw:       { barrel: '#4a3d5c', stud: '#9d6bff', em: '#6e4aff', emI: 1.1 },
    morningstar_marble: { barrel: '#ede6d6', stud: '#ffd615', em: '#ffae00', emI: 0.9 },
  }[id] || { barrel: '#8f5926', stud: '#633a16', em: '#000000', emI: 0 };

  const barrelMat = new THREE.MeshStandardMaterial({ color: palette.barrel, roughness: 0.72, flatShading: true });
  const ringMat = new THREE.MeshStandardMaterial({ color: '#cfa063', roughness: 0.75, flatShading: true });
  const studMat = new THREE.MeshStandardMaterial({
    color: palette.stud,
    emissive: palette.em,
    emissiveIntensity: palette.emI,
    roughness: 0.4,
    flatShading: true,
  });

  // Pommel knob at base of grip
  const pommel = new THREE.Mesh(new THREE.DodecahedronGeometry(0.062, 0), barkMat);
  pommel.scale.set(1, 0.72, 1);
  pommel.position.y = 0.03;
  g.add(pommel);

  // Leather-wrapped grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.25, 8), leatherMat);
  grip.position.y = 0.17;
  g.add(grip);
  for (const gy of [0.1, 0.17, 0.24]) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 6, 10), barkMat);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = gy;
    g.add(wrap);
  }

  // Flared lower shaft & bulbous caveman club barrel
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.05, 0.32, 8), barrelMat);
  lower.position.y = 0.45;
  g.add(lower);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.105, 0.44, 9), barrelMat);
  upper.position.y = 0.8;
  g.add(upper);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.172, 9, 6), barrelMat);
  cap.scale.set(1, 0.55, 1);
  cap.position.y = 1.02;
  g.add(cap);
  const grain = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.02, 9), ringMat);
  grain.position.y = 1.1;
  g.add(grain);

  const studCount = id === 'club_wood' ? 5 : 6;
  for (let i = 0; i < studCount; i++) {
    const a = (i / studCount) * Math.PI * 2 + (i % 2) * 0.3;
    const h = 0.68 + (i % 3) * 0.11;
    const r = 0.125 + ((h - 0.6) / 0.44) * 0.045;
    let stud;
    if (id === 'club_wood') {
      stud = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.046, 0.085, 6), studMat);
      const knotTip = new THREE.Mesh(new THREE.CircleGeometry(0.027, 6), ringMat);
      knotTip.rotation.x = -Math.PI / 2;
      knotTip.position.y = 0.043;
      stud.add(knotTip);
    } else {
      stud = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.16, 6), studMat);
    }
    stud.position.set(Math.cos(a) * r, h, Math.sin(a) * r);
    stud.rotation.z = -Math.cos(a) * (Math.PI / 2 - 0.2);
    stud.rotation.x = Math.sin(a) * (Math.PI / 2 - 0.2);
    g.add(stud);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export class Actor {
  constructor(game, { name, color, camp, isPlayer = false }) {
    this.game = game;
    this.name = name;
    this.color = color;
    this.camp = camp;
    camp.owner = this;
    this.isPlayer = isPlayer;
    this.booga = new Booga({ shirt: color, name });
    this.root = this.booga.root;
    game.scene.add(this.root);
    this.pos = this.root.position;
    this.prev = new THREE.Vector3();
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.onGround = true;
    this.yaw = 0;
    this.turnRate = 0;
    this.moveSpeed = 0;
    this.dust = BAL.startDust;
    this.inv = {};
    this.unbankedDust = 0;
    this.unbankedItems = {};
    // Every Booga starts with the Default Wooden Club (Never Breaks!)
    this.gear = { club_wood: 1 };
    this.traps = 0;
    this.treasures = {};
    this.carrying = null;
    this.carryMesh = null;
    this.stun = 0;
    this.attackCd = 0;
    this.pendingHit = -1;
    this.hold = null;
    this.knock = new THREE.Vector3();
    this.weaponMesh = null;
    this.weaponId = null;
    this.suitId = null;
    this.isKing = false;
    this.graduated = false;
    this.speechT = 0;

    // nametag + speech bubble + dizzy countdown tag + unbanked loot bounty tag
    const el = document.createElement('div');
    el.className = 'lbl lbl-name' + (isPlayer ? ' me' : '');
    el.style.setProperty('--c', color);
    el.innerHTML = `<span class="dizzy-tag hidden"></span><span class="bounty-tag hidden"></span><span class="speech hidden"></span><b>${name}</b>`;
    this.tagEl = el;
    this.dizzyEl = el.querySelector('.dizzy-tag');
    this.bountyEl = el.querySelector('.bounty-tag');
    this.speechEl = el.querySelector('.speech');
    const tag = new CSS2DObject(el);
    this.tagObj = tag;
    tag.position.y = 2.4;
    this.root.add(tag);

    // 3D Unbanked Loot Backpack Stack (Compact Gold Pouch on the Booga's back!)
    this.lootPack = new THREE.Group();
    this.lootPack.position.set(0, 0.92, -0.26);
    const sack = spawn('gold_bag', 0.32);
    sack.position.set(0, 0, 0);
    sack.rotation.x = -0.2;
    this.lootPack.add(sack);
    const gem1 = tint(spawn('gem_pink', 0.16), '#c77dff', { emissive: '#9d4edd', emissiveIntensity: 1.4 });
    gem1.position.set(0.08, 0.18, -0.02);
    const gem2 = tint(spawn('gem_pink', 0.15), '#ffd615', { emissive: '#ff9d00', emissiveIntensity: 1.4 });
    gem2.position.set(-0.08, 0.17, -0.02);
    this.lootPack.add(gem1, gem2);
    this.lootPack.visible = false;
    this.root.add(this.lootPack);

    // 3D King Crown (shown when #1 on Leaderboard)
    this.crown = new THREE.Group();
    const crownMat = new THREE.MeshStandardMaterial({ color: '#ffd615', emissive: '#ff9d00', emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.4, flatShading: true });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.16, 8, 1, true), crownMat);
    this.crown.add(band);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), crownMat);
      spike.position.set(Math.cos(a) * 0.29, 0.16, Math.sin(a) * 0.29);
      this.crown.add(spike);
    }
    this.crown.position.y = 2.15;
    this.crown.visible = false;
    this.root.add(this.crown);

    // 3D Dizzy Halo Ring + 5 Orbiting Cartoon Stars (shown during 5s dizzy stun)
    this.stars = new THREE.Group();
    const haloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.025, 6, 28),
      new THREE.MeshBasicMaterial({ color: '#ffe04a', transparent: true, opacity: 0.75 })
    );
    haloRing.rotation.x = Math.PI / 2;
    this.stars.add(haloRing);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const s = tint(spawn('star', 0.28), i % 2 === 0 ? '#ffe04a' : '#5fd4ff', { emissive: i % 2 === 0 ? '#ffc400' : '#00a8e8', emissiveIntensity: 1.4 });
      s.position.set(Math.cos(a) * 0.54, (i % 2) * 0.06, Math.sin(a) * 0.54);
      s.rotation.y = -a;
      this.stars.add(s);
    }
    this.stars.position.y = 2.08;
    this.stars.visible = false;
    this.root.add(this.stars);
    this.hand = this.booga.bones.RightHand;
    this.refreshWeapon();
  }

  say(text, dur = 3.0) {
    if (!this.speechEl) return;
    this.speechEl.textContent = text;
    this.speechEl.classList.remove('hidden');
    this.speechT = dur;
  }

  get weapon() {
    for (const w of WEAPON_ORDER) if (this.gear[w]) return w;
    return 'club_wood';
  }
  get suit() {
    for (const s of SUIT_ORDER) if (this.gear[s]) return s;
    return null;
  }
  get geodePower() {
    const w = GEAR[this.weapon] || GEAR.club_wood;
    let dmg = w.geodeDmg || 25;
    if (this.camp?.upgradeCfg?.dmgBonus) dmg *= 1 + this.camp.upgradeCfg.dmgBonus;
    if (this.treasures?.cave_treasure || this.camp?.nests?.[0]?.content) dmg *= 1.15;
    if (this.treasures?.desert_treasure || this.camp?.nests?.[3]?.content) dmg *= 1.15;
    return Math.round(dmg);
  }
  get ascensionStep() {
    const rank = GEAR[this.weapon]?.tierRank || 1;
    if (rank >= 13) return 4;
    if (rank >= 9) return 3;
    if (rank >= 4) return 2;
    return 1;
  }
  get isInSafeHub() {
    const hx = this.game?.mode === 'tutorial' ? 0 : 60;
    const hz = this.game?.mode === 'tutorial' ? 0 : 240;
    return Math.hypot(this.pos.x - hx, this.pos.z - hz) < 58 && !this.raidedFrom;
  }
  get isInSafeZone() {
    return (this.camp && this.camp.inside(this.pos, 0) && this.camp.isLocked(this.game?.now || 0));
  }
  get fameScore() {
    const wPower = (GEAR[this.weapon]?.geodeDmg || 25) * 4;
    const sBonus = (GEAR[this.suit]?.suitRank || 0) * 140;
    const baseBonus = ((this.camp?.level || 1) - 1) * 200;
    const shrines = (this.camp?.shrineCount ? this.camp.shrineCount() : 0) * 260;
    const feats = (this.geodesCracked || 0) * 28 + (this.bossKills || 0) * 220 + (this.pvpBonks || 0) * 55;
    const banked = Math.max(0, Math.floor(this.dust * 0.45));
    return Math.round(wPower + sBonus + baseBonus + shrines + feats + banked);
  }
  get speed() {
    if (this.isPlayer) {
      let s = BAL.run * 1.12;
      if (this.gear.boots) s *= 1.2;
      if (this.treasures?.jungle_treasure || this.camp?.nests?.[1]?.content) s *= 1.15;
      if (this.suit && GEAR[this.suit]) s *= 1 + (GEAR[this.suit].speedBonus || 0);
      if (this.carrying) s *= BAL.carryMul;
      if (this.game?.activeCampRaider) s *= 1.18; // Pursuit adrenaline boost when chasing a Camp Raider!
      return s;
    }
    // Rival bots move noticeably slower than the player so you can always chase & catch them!
    let botSpeed = BAL.run * 0.72;
    if (this.suit && GEAR[this.suit]) botSpeed *= 1 + Math.min(0.06, (GEAR[this.suit].speedBonus || 0) * 0.35);
    if (this.carrying) botSpeed *= BAL.carryMul;
    if (this.unbankedDust > 0 || this.unbankedItemCount > 0) botSpeed *= 0.88; // Weighed down by carried Loot Bag
    if (this.raidedFrom) botSpeed *= 0.78; // Heavy stolen Vault haul slows raiders down so you can catch them!
    return Math.min(botSpeed, BAL.run * 0.76);
  }
  get incomeMult() {
    let m = 1 + 0.25 * (this.gear.totem || 0);
    if (this.camp?.upgradeCfg?.dustBonus) m += this.camp.upgradeCfg.dustBonus;
    m += 0.1 * Object.keys(this.treasures).length;
    if (this.treasures?.runes_treasure || this.camp?.nests?.[2]?.content) m += 0.25;
    if (this.suit && GEAR[this.suit]) m += GEAR[this.suit].dustBonus || 0;
    if (this.isKing) m += 0.2;
    if (this.graduated) m += 0.1;
    if (this.game && this.game.activeEvent && this.game.activeEvent.kind === 'frenzy') m *= 2;
    return m;
  }
  get lockTime() {
    return BAL.lockTime + 25 * (this.gear.gate1 || 0) + (this.camp?.upgradeCfg?.lockBonus || 0);
  }

  get unbankedItemCount() {
    let tot = 0;
    for (const k in this.unbankedItems) tot += this.unbankedItems[k] || 0;
    return tot;
  }

  /**
   * Add an item. If gathered in the field (unbanked = true) outside the actor's own Camp,
   * it goes strictly into `unbankedItems` (Carried Loot Bag) and can be stolen until banked at Camp!
   */
  addItem(id, n = 1, unbanked = true) {
    if (unbanked && !(this.camp && this.camp.inside(this.pos, 0))) {
      this.unbankedItems[id] = (this.unbankedItems[id] || 0) + n;
    } else {
      this.inv[id] = (this.inv[id] || 0) + n;
    }
  }

  /**
   * Add Dust gathered in the wild. Unless the actor is already inside their own Camp,
   * 100% of field Dust goes into `unbankedDust` (Carried Loot Bag) and must be extracted to Camp!
   */
  addFieldDust(v) {
    if (!(this.camp && this.camp.inside(this.pos, 0))) {
      this.unbankedDust = (this.unbankedDust || 0) + v;
    } else {
      this.dust += v;
    }
  }

  refreshWeapon() {
    this.gear.club_wood = 1; // Default Wooden Club is always owned
    const w = this.weapon;
    if (w !== this.weaponId) {
      this.weaponId = w;
      if (this.weaponMesh && this.weaponMesh.parent) this.weaponMesh.parent.remove(this.weaponMesh);
      this.weaponMesh = null;
      if (w && this.hand) {
        const club = makeClub(w);
        const ws = new THREE.Vector3();
        this.hand.updateWorldMatrix(true, false);
        this.hand.getWorldScale(ws);
        const rs = new THREE.Vector3();
        this.root.getWorldScale(rs);
        const s = rs.x / ws.x;
        club.scale.setScalar(s);
        // Align club shaft (+Y) with the fist's grip axis (+X of RightHand, thumb-up -> points UP and FORWARD)
        club.rotation.set(0.15, 0, -Math.PI / 2 + 0.22);
        club.position.set(-0.14 * s, 0.08 * s, 0.04 * s);
        club.visible = !this.carrying;
        this.hand.add(club);
        this.weaponMesh = club;
      }
    }
    const st = this.suit;
    if (st !== this.suitId) {
      this.suitId = st;
      const col = st && GEAR[st] ? GEAR[st].shirtColor : this.color;
      this.booga.model.traverse((o) => {
        if (o.isMesh && /^Shirt/.test(o.name)) {
          o.material.color.set(col);
        }
      });
    }
  }

  refreshSuit() {
    this.refreshWeapon();
  }

  setCarry(item) {
    this.carrying = item;
    if (this.weaponMesh) this.weaponMesh.visible = !item;
    if (this.carryMesh) this.root.remove(this.carryMesh);
    this.carryMesh = null;
    if (!item) return;
    this.carryMesh = item.kind === 'egg' ? makeEgg(EGGS.find((e) => e.id === item.egg), 1.0) : makeDino(item.dino);
    this.carryMesh.position.set(0, 2.05, 0.1);
    if (item.kind === 'dino') this.carryMesh.scale.setScalar(0.7);
    this.root.add(this.carryMesh);
  }

  /** desired move direction (normalized x,z), jump flag */
  physics(dt, dx, dz, jump) {
    this.prev.copy(this.pos);
    const g = this.game;
    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt);
      dx = dz = 0;
      jump = false;
      this.vx = 0;
      this.vz = 0;
      this.hold = null;
      this.pendingHit = -1;
      if (this.stun <= 0) this.stars.visible = false;
    }
    if (this.hold) { dx = dz = 0; }
    const sp = this.speed;
    const len = Math.hypot(dx, dz);
    let tvx = 0, tvz = 0;
    let dYaw = 0;
    if (len > 0.01) {
      tvx = (dx / len) * sp;
      tvz = (dz / len) * sp;
      const targetYaw = Math.atan2(tvx, tvz);
      let d = targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = d * (1 - Math.exp(-13 * dt));
      this.yaw += step;
      dYaw = step / Math.max(dt, 1e-4);
    }
    this.turnRate += (dYaw - this.turnRate) * (1 - Math.exp(-12 * dt));
    const accel = 1 - Math.exp(-16 * dt);
    this.vx += (tvx - this.vx) * accel;
    this.vz += (tvz - this.vz) * accel;
    const vx = this.vx + this.knock.x;
    const vz = this.vz + this.knock.z;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const gh = heightAt(this.pos.x, this.pos.z);
    if (jump && this.onGround && !this.carrying) { this.vy = BAL.jump; this.onGround = false; }
    this.vy -= BAL.gravity * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= gh) { this.pos.y = gh; this.vy = 0; this.onGround = true; }
    else if (this.pos.y > gh + 0.05) this.onGround = this.onGround && this.pos.y - gh < 0.05;
    g.resolveCollisions(this);
    this.moveSpeed = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / Math.max(dt, 1e-4);
    this.root.rotation.y = this.yaw;
  }

  animate(dt, t) {
    const b = this.booga;
    b.carrying = !!this.carrying;
    b.hasWeapon = !!this.weaponMesh;
    b.airborne = !this.onGround;
    b.stunned = this.stun;
    b.gatherT = this.hold && this.hold.kind === 'gather' ? 1 : -1;
    if (this.weaponMesh) this.weaponMesh.visible = !this.carrying;
    b.update(dt, this.stun > 0 ? 0 : this.moveSpeed, this.turnRate, this.vy);
    if (this.carryMesh) {
      this.carryMesh.position.y = 2.02 + b.body.position.y;
      if (this.carrying.kind === 'dino') animateDino(this.carryMesh, dt);
    }
    if (this.stun > 0) {
      this.stars.visible = true;
      this.stars.rotation.y += dt * 7.5;
      this.stars.rotation.z = Math.sin(t * 6) * 0.22;
      this.stars.position.y = 2.08 + Math.sin(t * 8) * 0.05;
      if (this.dizzyEl) {
        this.dizzyEl.textContent = `STUNNED ${this.stun.toFixed(1)}s`;
        this.dizzyEl.classList.remove('hidden');
      }
    } else if (this.dizzyEl) {
      this.dizzyEl.classList.add('hidden');
    }
    if (this.crown) {
      this.crown.visible = !!this.isKing && this.stun <= 0;
      if (this.crown.visible) {
        this.crown.rotation.y += dt * 2.2;
        this.crown.position.y = 2.15 + Math.sin(t * 4) * 0.05;
      }
    }
    const ubDust = Math.floor(this.unbankedDust || 0);
    const ubItems = this.unbankedItemCount;
    const hasUnbanked = ubDust > 0 || ubItems > 0;
    if (this.lootPack) {
      this.lootPack.visible = hasUnbanked && !this.carrying;
      if (this.lootPack.visible) {
        const packScale = Math.min(1.05, 0.72 + (ubDust / 400) * 0.2 + ubItems * 0.025);
        this.lootPack.scale.setScalar(packScale);
        this.lootPack.position.y = 0.92 + (b.body ? b.body.position.y * 0.5 : 0);
      }
    }
    if (this.bountyEl) {
      const showBounty = !this.isPlayer && hasUnbanked && this.stun <= 0 && (!this.game?.player || this.pos.distanceTo(this.game.player.pos) < 42);
      if (showBounty) {
        this.bountyEl.textContent = `LOOT BAG: ${ubDust > 0 ? ubDust + ' Dust' : ''}${ubDust > 0 && ubItems > 0 ? ' + ' : ''}${ubItems > 0 ? ubItems + ' Items' : ''}`;
        this.bountyEl.classList.remove('hidden');
      } else {
        this.bountyEl.classList.add('hidden');
      }
    }
    if (this.speechT > 0) {
      this.speechT -= dt;
      if (this.speechT <= 0 && this.speechEl) this.speechEl.classList.add('hidden');
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.pendingHit >= 0) {
      this.pendingHit -= dt;
      if (this.pendingHit < 0) this.game.resolveHit(this);
    }
  }

  tryAttack() {
    if (this.attackCd > 0 || this.stun > 0 || this.carrying) return false;
    this.attackCd = 0.62;
    this.booga.attack();
    this.pendingHit = 0.16;
    return true;
  }
}

// ---------------- Bot brain ----------------
export class BotBrain {
  constructor(actor) {
    this.a = actor;
    this.goal = null;
    this.task = 'idle';
    this.think = 0;
    this.hubTimer = 14 + rand() * 18;
    this.hubStay = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.side = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.target = null;
    this.wantLock = false;
    this.age = 0;
    this.chatT = 4 + rand() * 6;
  }

  update(dt, now) {
    const a = this.a, g = a.game;
    this.age += dt;
    this.chatT -= dt;

    // Tutorial Island: James hangs out between the Volcano Forge Hub & Frontier Geodes so Rok can emote with him and BONK him!
    if (g.mode === 'tutorial') {
      if (a.stun > 0) { a.physics(dt, 0, 0, false); return; }
      this.think -= dt;
      if (this.think <= 0 || !this.goal) {
        this.think = 3.5;
        const c = a.camp;
        const pts = [
          c.center.clone().add(c.entranceDir.clone().multiplyScalar(5.5)),
          new THREE.Vector3(24, 0, 4),
          c.center.clone().add(new THREE.Vector3(-c.entranceDir.z * 4, 0, c.entranceDir.x * 4)),
        ];
        this.goal = pts[Math.floor(rand() * pts.length)];
        // Ensure James carries some unbanked loot in tutorial step 3+ so bonking him spills a big Piñata!
        if (g.tutStep >= 3 && (a.unbankedDust || 0) < 45) {
          a.unbankedDust = 60;
          a.unbankedItems = { rock: 2, amber: 1 };
        }
      }
      if (this.chatT <= 0) {
        this.chatT = 6 + rand() * 5;
        const lines = g.tutStep >= 3
          ? ['Carrying 60 Unbanked Dust! Hope Rok doesn\'t BONK me!', 'Heading to the Volcano Forge Hub to bank!', 'My backpack is full of Geode crystals!']
          : ['Meet me at the Volcano Forge Social Hub!', 'Crack Cave Geodes for Rock & Flint!', 'Press [1]-[4] to emote with the tribe!'];
        a.say(lines[Math.floor(rand() * lines.length)], 3.5);
      }
      const dx = this.goal.x - a.pos.x, dz = this.goal.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      a.physics(dt, d > 0.6 ? dx * 0.45 : 0, d > 0.6 ? dz * 0.45 : 0, false);
      return;
    }

    this.hubTimer -= dt;
    if (this.hubStay > 0) this.hubStay -= dt;

    // Bots progressively forge better weapons, suits & Base Upgrades!
    if (this.age > 42 && !a.gear.club_stone && a.camp && a.camp.inside(a.pos, 0)) {
      a.gear.club_stone = 1;
      a.refreshWeapon();
      if (a.camp && a.camp.level < 2) a.camp.setLevel(2);
      a.say('Forged Stone Club & upgraded Camp to Lv.2', 3.2);
    }
    if (this.age > 110 && !a.gear.club_amber && a.camp && a.camp.inside(a.pos, 0)) {
      a.gear.club_amber = 1;
      a.gear.suit_nomad = 1;
      a.refreshWeapon();
      if (a.camp && a.camp.level < 3) a.camp.setLevel(3);
      a.say('Upgraded to Amber Club & Lv.3 Turret Camp', 3.2);
    }
    if (this.age > 210 && !a.gear.sword_gold && a.camp && a.camp.inside(a.pos, 0)) {
      a.gear.sword_gold = 1;
      a.gear.suit_hunter = 1;
      a.refreshWeapon();
      if (a.camp && a.camp.level < 4) a.camp.setLevel(4);
      a.say('Forged Gold Sword & Lv.4 Stronghold', 3.4);
    }
    if (this.age > 320 && a.name === 'Joaquim' && !a.gear.scimitar_joaquim && a.camp && a.camp.inside(a.pos, 0)) {
      a.gear.scimitar_joaquim = 1;
      a.gear.suit_warrior = 1;
      a.refreshWeapon();
      if (a.camp && a.camp.level < 5) a.camp.setLevel(5);
      a.say('Forged the Scimitar of Joaquim & Lv.5 Citadel', 3.6);
    }

    this.think -= dt;
    if (this.think <= 0) { this.think = 0.35; this.decide(now); }

    let dx = 0, dz = 0;
    if (this.goal && a.stun <= 0 && !a.hold) {
      const wp = this.navigate(this.goal);
      dx = wp.x - a.pos.x; dz = wp.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) { dx = dz = 0; }
      this.stuckT += dt;
      if (this.stuckT > 1) {
        if (a.pos.distanceTo(this.lastPos) < 0.6 && d > 1) { this.sideT = 0.8; this.side.set(-dz, 0, dx).normalize().multiplyScalar(rand() < 0.5 ? 1 : -1); }
        this.lastPos.copy(a.pos);
        this.stuckT = 0;
      }
      if (this.sideT > 0) { this.sideT -= dt; dx = this.side.x + dx * 0.2; dz = this.side.z + dz * 0.2; }
    }
    this.act(now);
    a.physics(dt, dx, dz, false);
  }

  decide(now) {
    const a = this.a, g = a.game, camp = a.camp;
    a.defendingCamp = false;
    if (a.carrying) { this.task = 'home'; this.goal = camp.center.clone(); return; }

    // 0. Active Camp Defense: If our Camp Alarm is triggered or a raider is breaching/inside our Camp or fleeing with our Vault loot, rush to defend!
    const raider = g.actors.find(
      (o) =>
        o !== a &&
        o.stun <= 0 &&
        !o.isInSafeZone &&
        (o.raidedFrom === camp ||
          camp.inside(o.pos, -3.5) ||
          (now < (camp.alarmUntil || 0) && o.pos.distanceTo(camp.center) < 34))
    );
    if (raider && a.pos.distanceTo(camp.center) < 230) {
      a.defendingCamp = true;
      if (this.task !== 'chase' || this.target !== raider) {
        a.say(
          raider.raidedFrom === camp
            ? `Give back my Vault loot, ${raider.name}!`
            : `Camp Alarm! Defending my Camp from ${raider.name}!`,
          3.4
        );
      }
      this.task = 'chase';
      this.target = raider;
      this.goal = raider.pos.clone();
      return;
    }

    // 1. Vacuum up nearby physical 3D Loot Piñata drops on the ground!
    if (g.lootDrops && g.lootDrops.length) {
      let bestDrop = null, bestDD = 14;
      for (const ld of g.lootDrops) {
        if (ld.lockT > 0 && ld.owner && ld.owner !== a) continue;
        const d = ld.pos.distanceTo(a.pos);
        if (d < bestDD) { bestDD = d; bestDrop = ld; }
      }
      if (bestDrop) {
        this.task = 'loot';
        this.target = bestDrop;
        this.goal = bestDrop.pos.clone();
        return;
      }
    }

    // 2. Bank fat unbanked loot hauls or raided Vault loot at OUR CAMP VAULT (& lock our gate)!
    if ((a.unbankedDust >= 85 || a.unbankedItemCount >= 4 || a.raidedFrom) && !camp.inside(a.pos, 0.8)) {
      if (this.task !== 'home') {
        a.say(a.raidedFrom ? `Heading to my Camp with ${a.raidedFrom.ownerName}'s loot` : `Extracting ${Math.floor(a.unbankedDust)} Dust to my Camp`, 3.0);
      }
      this.task = 'home';
      this.goal = camp.vaultWorld ? camp.vaultWorld.clone() : camp.center.clone();
      return;
    }

    // 2b. If we are inside our own Camp and our Gate is UNLOCKED while we have >= 160 Dust in our Vault, lock the gate!
    if (camp.inside(a.pos, 0.5) && !camp.isLocked(now) && a.dust >= 160 && rand() < 0.72) {
      this.task = 'lock';
      this.goal = camp.slabWorld.clone();
      return;
    }

    // 3. PvP Frontier Ambush: Hunt rivals carrying Unbanked Loot or Raided Vault Loot outside Locked Camps!
    if (!a.isInSafeZone) {
      const prey = g.actors.find(
        (o) =>
          o !== a &&
          o.stun <= 0 &&
          !o.isInSafeZone &&
          (o.raidedFrom || o.unbankedDust >= 40 || o.unbankedItemCount >= 2) &&
          o.pos.distanceTo(a.pos) < 55
      );
      if (prey) {
        if (this.task !== 'chase') a.say(prey.raidedFrom ? `Stop Vault Raider ${prey.name}` : `Taking that loot bag, ${prey.name}`, 2.8);
        this.task = 'chase';
        this.target = prey;
        this.goal = prey.pos.clone();
        return;
      }
    }

    // 3b. Base Vault Raid: If a rival's Camp Gate is UNLOCKED and their Camp Vault has >= 170 Dust, sneak in to raid their Vault Chest!
    if (this.task === 'raid' && this.target && !this.target.isLocked(now) && now >= (this.target.raidCooldownUntil || 0)) {
      this.goal = this.target.vaultWorld.clone();
      return;
    }
    if (g.mode === 'valley' && rand() < 0.28) {
      const openRivalCamp = g.camps.find(
        (c) =>
          c !== camp &&
          !c.isLocked(now) &&
          now >= (c.raidCooldownUntil || 0) &&
          c.owner &&
          c.owner.dust >= 170 &&
          c.center.distanceTo(a.pos) < 340
      );
      if (openRivalCamp) {
        this.task = 'raid';
        this.target = openRivalCamp;
        this.goal = openRivalCamp.vaultWorld.clone();
        a.say(`${openRivalCamp.ownerName}'s Camp Gate is open — raiding their Vault`, 3.2);
        return;
      }
    }

    // 4. Hang out in the Booga Town & Volcano Forge Plaza periodically to socialize & craft!
    if (this.hubStay > 0) {
      this.task = 'hub';
      if (this.chatT <= 0) {
        this.chatT = 7 + rand() * 6;
        const lines = [
          `Crafting at the Volcano Forge (${GEAR[a.weapon]?.name || 'Club'})`,
          `Always extract your Loot Bag to your Camp before rivals bonk you`,
          `Lock your Camp Gate before heading out into the biomes`,
          `Whose Camp Gate is unlocked?`,
        ];
        a.say(lines[Math.floor(rand() * lines.length)], 3.4);
      }
      return;
    }
    if (this.hubTimer <= 0) {
      this.hubTimer = 38 + rand() * 28;
      this.hubStay = 6.5 + rand() * 4;
      this.task = 'hub';
      const ang = (a.camp.index - 1) * 0.45 + (rand() - 0.5) * 0.3;
      const r = 16;
      this.goal = new THREE.Vector3(60 + Math.cos(ang) * r, 0, 240 + Math.sin(ang) * r);
      return;
    }

    if (this.task === 'boss' && this.target && this.target.alive && this.goalAge < 16) {
      this.goalAge += 0.35; this.goal = this.target.pos.clone(); return;
    }
    if (this.task === 'mine' && this.target && this.target.alive && this.goalAge < 10) {
      this.goalAge += 0.35; this.goal = this.target.pos.clone(); return;
    }
    if (this.task === 'dust' && this.target && this.target.alive && this.goalAge < 12) {
      this.goalAge += 0.35; this.goal = this.target.pos.clone(); return;
    }

    // 5. Rally to fight an active Contested Biome Boss for #1 Damage Loot!
    const activeBoss = g.bosses && g.bosses.find((b) => b.alive && (b.pos.distanceTo(a.pos) < 240 || b.hp < b.maxHp));
    if (activeBoss && rand() < 0.68) {
      this.task = 'boss';
      this.target = activeBoss;
      this.goalAge = 0;
      this.goal = activeBoss.pos.clone();
      if (rand() < 0.35) a.say(`Rallying on ${activeBoss.cfg.name} for #1 Damage`, 3.0);
      return;
    }

    // 6. Mine a 3D Geode in the Wild Frontier (preferring Geodes matching our current Step)!
    let bestG = null, bgd = 1e9;
    const maxStep = Math.min(4, a.ascensionStep + 1);
    for (const n of g.nodes) {
      if (!n.alive) continue;
      const nStep = n.step || 1;
      const stepPenalty = nStep > maxStep ? 90 : 0;
      const d = n.pos.distanceTo(a.pos) + stepPenalty;
      if (d < bgd) { bgd = d; bestG = n; }
    }
    if (bestG) {
      this.task = 'mine';
      this.target = bestG;
      this.goalAge = 0;
      this.goal = bestG.pos.clone();
      return;
    }

    // 7. Gather wild Dust crystals
    let bestC = null, bd = 1e9;
    for (const c of g.crystals) {
      if (!c.alive) continue;
      const d = c.pos.distanceTo(a.pos);
      if (d < bd) { bd = d; bestC = c; }
    }
    if (bestC) { this.task = 'dust'; this.target = bestC; this.goalAge = 0; this.goal = bestC.pos.clone(); return; }
    this.task = 'hub';
    this.goal = new THREE.Vector3(60, 0, 240);
  }

  act(now) {
    const a = this.a, g = a.game;
    if (a.stun > 0) { a.hold = null; return; }
    if (this.task === 'raid' && this.target) {
      const c = this.target;
      if (c.isLocked(now) || now < (c.raidCooldownUntil || 0)) {
        this.task = 'idle';
        this.target = null;
        a.hold = null;
        return;
      }
      if (c.vaultWorld.distanceTo(a.pos) < 2.8 && !a.hold) {
        a.hold = { kind: 'raid_vault', camp: c, t: 0, need: 2.2 };
      }
    }
    if (this.task === 'chase' && this.target) {
      if (this.target.isInSafeZone) {
        this.task = 'idle';
        this.target = null;
        return;
      }
      const d = this.target.pos.distanceTo(a.pos);
      if (d < (a.weapon ? GEAR[a.weapon].range : 2.5) - 0.2) {
        a.yaw = Math.atan2(this.target.pos.x - a.pos.x, this.target.pos.z - a.pos.z);
        a.tryAttack();
      }
      this.goal = this.target.pos.clone();
    }
    if (this.task === 'boss' && this.target && this.target.alive) {
      const b = this.target;
      const d = b.pos.distanceTo(a.pos);
      if (b.slamWindup > 0 && b.slamWindup < 0.48 && d < 4.3 && a.onGround && rand() < 0.65) {
        a.vy = 8.8;
        a.onGround = false;
      }
      if (d < 3.2) {
        a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
        a.tryAttack();
      }
      this.goal = b.pos.clone();
    }
    if (this.task === 'mine' && this.target && this.target.alive) {
      const d = this.target.pos.distanceTo(a.pos);
      if (d < 2.6) {
        a.yaw = Math.atan2(this.target.pos.x - a.pos.x, this.target.pos.z - a.pos.z);
        a.tryAttack();
      }
    }
    if (this.task === 'hub' && a.isInSafeHub && g.player && g.player.pos.distanceTo(a.pos) < 9) {
      a.yaw = Math.atan2(g.player.pos.x - a.pos.x, g.player.pos.z - a.pos.z);
    }
  }

  /** returns a waypoint toward goal, avoiding the volcano and using camp entrances */
  navigate(goal) {
    const a = this.a, g = a.game, p = a.pos;
    const myCamp = g.camps.find((c) => c.inside(p, -0.6));
    const goalCamp = g.camps.find((c) => c.inside(goal, 0.5));
    if (myCamp && myCamp !== goalCamp) {
      const inner = myCamp.entrancePoint(false), outer = myCamp.entrancePoint(true);
      const ad = angDiff(myCamp.angleOf(p.x, p.z), myCamp.entranceAngle);
      if (ad > GAP * 0.6 && Math.hypot(p.x - myCamp.center.x, p.z - myCamp.center.z) > 3) return inner;
      return outer;
    }
    if (goalCamp && goalCamp !== myCamp) {
      const outer = goalCamp.entrancePoint(true);
      const ad = angDiff(goalCamp.angleOf(p.x, p.z), goalCamp.entranceAngle);
      const dc = Math.hypot(p.x - goalCamp.center.x, p.z - goalCamp.center.z);
      if (!(ad < GAP * 0.7 && dc < goalCamp.R + 4)) goal = outer;
      else goal = goalCamp.entrancePoint(false).distanceTo(p) > 1.5 && dc > goalCamp.R - 2 ? goalCamp.entrancePoint(false) : goal;
    }
    const vp = getVolcanoPos();
    const avoidR = VOLCANO_R + 4;
    const sx = p.x - vp.x, sz = p.z - vp.z, ex = goal.x - p.x, ez = goal.z - p.z;
    const L2 = ex * ex + ez * ez;
    let t = L2 > 0 ? -(sx * ex + sz * ez) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = sx + ex * t, cz = sz + ez * t;
    if (Math.hypot(cx, cz) < avoidR && Math.hypot(goal.x - vp.x, goal.z - vp.z) > avoidR) {
      const ap = Math.atan2(sz, sx), ag = Math.atan2(goal.z - vp.z, goal.x - vp.x);
      const d = Math.atan2(Math.sin(ag - ap), Math.cos(ag - ap));
      const r = Math.max(avoidR + 3, Math.hypot(sx, sz));
      const na = ap + Math.sign(d || 1) * 0.6;
      return new THREE.Vector3(vp.x + Math.cos(na) * r, 0, vp.z + Math.sin(na) * r);
    }
    return goal;
  }
}

function angDiff(a, b) {
  let d = a - b;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.abs(d);
}
