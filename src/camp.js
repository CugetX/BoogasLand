import * as THREE from 'three';
import { BAL, DINOS, TROPHY_SHRINES, BOSSES, ITEMS, BASE_UPGRADES } from './config.js';
import { campCenter, heightAt, isTutorialMap, rand } from './world.js';
import { makeBoss, makeChest, makeBoogasaurus, animateBoogasaurus } from './props.js';
import { spawn, tint } from './assets.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export const GAP = 0.36; // half-angle of the entrance gap (radians)
const MAX_NESTS = 4;

export class Camp {
  constructor(scene, index, color, ownerName) {
    this.scene = scene;
    this.index = index;
    this.color = color;
    this.ownerName = ownerName;
    this.owner = null;
    this.center = campCenter(index);
    this.center.y = heightAt(this.center.x, this.center.z);
    this.R = BAL.campRadius;

    // Entrance faces Booga Town Plaza (60, 240) for Rok, or toward the main continent road
    const targetX = isTutorialMap ? 0 : (index === 0 ? 60 : 0);
    const targetZ = isTutorialMap ? 0 : (index === 0 ? 240 : 40);
    this.entranceAngle = Math.atan2(targetZ - this.center.z, targetX - this.center.x);
    this.entranceDir = new THREE.Vector3(Math.cos(this.entranceAngle), 0, Math.sin(this.entranceAngle));

    this.level = 1;
    this.gateMaxHp = BASE_UPGRADES[0].gateMaxHp;
    this.gateHp = this.gateMaxHp;
    this.lockedUntil = 0;
    this.gateRegenTimer = 0;
    this.alarmUntil = 0;
    this.raidCooldownUntil = 0;
    this.turretCooldown = 0;
    this.turretWindup = 0;
    this.turretWindupMax = 1.35;
    this.turretTargetPos = new THREE.Vector3();
    this.traps = [];
    this.trapRespawnTimer = 0;

    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    scene.add(this.group);

    this.wallSegments = [];
    this.tierProps = { lv2: [], lv3: [], lv4: [], lv5: [] };
    this.turretMeshes = [];
    this.dinoGuards = [];

    this.nests = [];
    this.buildVisuals();
    for (let i = 0; i < MAX_NESTS; i++) this.nests.push(this.makeNest(i));
    this.setNestCount(MAX_NESTS);
    this.setLevel(1);
  }

  get upgradeCfg() {
    return BASE_UPGRADES[Math.min(BASE_UPGRADES.length - 1, (this.level || 1) - 1)] || BASE_UPGRADES[0];
  }

  get nextUpgradeCfg() {
    return BASE_UPGRADES[this.level] || null;
  }

  get effectiveGateMaxHp() {
    const baseHp = this.upgradeCfg?.gateMaxHp || 120;
    const bonusRanks = this.owner?.gear?.gate1 || 0;
    return baseHp + bonusRanks * 150;
  }

  get activeDinoCount() {
    const crafted = this.owner?.gear?.dino_guard || 0;
    const baseFree = !this.isMine && !isTutorialMap ? Math.max(0, (this.level || 1) - 2) : 0;
    return Math.min(3, crafted + baseFree);
  }

  angleOf(x, z) { return Math.atan2(z - this.center.z, x - this.center.x); }
  inside(p, margin = 0) { return Math.hypot(p.x - this.center.x, p.z - this.center.z) < this.R - margin; }
  isLocked(now) { return now < this.lockedUntil && this.gateHp > 0; }

  entrancePoint(outside = true) {
    const d = outside ? this.R + 3 : this.R - 3;
    const x = this.center.x + this.entranceDir.x * d;
    const z = this.center.z + this.entranceDir.z * d;
    return new THREE.Vector3(x, heightAt(x, z), z);
  }

  boulderWorldPos() {
    return new THREE.Vector3(
      this.center.x + Math.cos(this.entranceAngle) * this.R,
      this.center.y + 1.0,
      this.center.z + Math.sin(this.entranceAngle) * this.R
    );
  }

  setLevel(lvl) {
    this.level = Math.max(1, Math.min(BASE_UPGRADES.length, lvl));
    const cfg = this.upgradeCfg;
    this.gateMaxHp = cfg.gateMaxHp || 120;
    this.gateHp = this.gateMaxHp;

    // Scale palisade walls taller & sturdier as Base Level increases!
    const wallScaleY = 1 + (this.level - 1) * 0.16;
    for (const seg of this.wallSegments) {
      seg.scale.y = seg.userData.baseSy * wallScaleY;
    }

    this.tierProps.lv2.forEach((o) => (o.visible = this.level >= 2));
    this.tierProps.lv3.forEach((o) => (o.visible = this.level >= 3));
    this.tierProps.lv4.forEach((o) => (o.visible = this.level >= 4));
    this.tierProps.lv5.forEach((o) => (o.visible = this.level >= 5));

    if (this.nameEl) {
      this.nameEl.textContent = `${this.ownerName.toUpperCase()} CAMP · LV.${this.level}`;
    }
  }

  buildVisuals() {
    const g = this.group;
    const ea = this.entranceAngle;
    const back = new THREE.Vector3(-Math.cos(ea), 0, -Math.sin(ea));
    const side = new THREE.Vector3(-Math.sin(ea), 0, Math.cos(ea));

    // Palisade wall ring
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let d = Math.abs(a - ((ea + Math.PI * 2) % (Math.PI * 2)));
      d = Math.min(d, Math.PI * 2 - d);
      if (d < GAP + 0.06) continue;
      const seg = i % 2 === 0
        ? spawn('palisade_wall', 2.85 + (rand() - 0.5) * 0.25)
        : spawn('wood_wall', 2.65 + (rand() - 0.5) * 0.2);
      if (i % 2 === 0) {
        seg.scale.x = 0.42;
        seg.scale.z = 0.85;
      } else {
        seg.scale.x = 0.52;
        seg.scale.z = 1.8;
      }
      seg.userData.baseSy = seg.scale.y;
      seg.position.set(Math.cos(a) * this.R, -0.1, Math.sin(a) * this.R);
      seg.rotation.y = -a + Math.PI / 2;
      g.add(seg);
      this.wallSegments.push(seg);
    }

    // Gate banners & torches
    for (const s of [-1, 1]) {
      const a = ea + s * (GAP + 0.05);
      const ban = tint(spawn('banner', 3.8), this.color, {}, /main/i);
      ban.position.set(Math.cos(a) * (this.R + 0.3), 0, Math.sin(a) * (this.R + 0.3));
      ban.rotation.y = -ea + Math.PI / 2;
      g.add(ban);

      const tr = tint(spawn('torch_wood', 2.2), '#ff9a2a', { emissive: '#ff6a00', emissiveIntensity: 2.2 }, /yellow/i);
      const ta = ea + s * (GAP + 0.14);
      tr.position.set(Math.cos(ta) * (this.R - 0.6), 0, Math.sin(ta) * (this.R - 0.6));
      g.add(tr);
    }

    // Level 2 Props: Twin Watchtowers & In-Base Forge Anvil
    const towerAngle1 = ea + Math.PI + 0.42;
    const tower1 = tint(spawn('watch_tower', 5.4), this.color, {}, /main/i);
    tower1.position.set(Math.cos(towerAngle1) * (this.R + 1.6), 0, Math.sin(towerAngle1) * (this.R + 1.6));
    tower1.rotation.y = -ea - Math.PI / 2;
    g.add(tower1);

    const towerAngle2 = ea + Math.PI - 0.45;
    const tower2 = spawn('watch_tower_2', 5.0);
    tower2.position.set(Math.cos(towerAngle2) * (this.R + 1.7), 0, Math.sin(towerAngle2) * (this.R + 1.7));
    tower2.rotation.y = -ea - Math.PI / 2;
    g.add(tower2);
    this.tierProps.lv2.push(tower1, tower2);

    // Helper to build a glowing Crystal Auto-Bonk Guard Turret (Levels 2, 3, 5)
    // Raiders can BONK a Guard Turret (80 HP) to disable it for 25s!
    const makeGuardTurret = (angleOffset, tierKey, idx) => {
      const tGrp = new THREE.Group();
      const ta = ea + angleOffset;
      const localPos = new THREE.Vector3(Math.cos(ta) * (this.R - 1.6), 0, Math.sin(ta) * (this.R - 1.6));
      tGrp.position.copy(localPos);
      const base = spawn('magic_rock', 2.6);
      tGrp.add(base);
      const orbMat = new THREE.MeshStandardMaterial({
        color: '#00f5ff',
        emissive: '#00c8ff',
        emissiveIntensity: 2.6,
        roughness: 0.15,
      });
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 1), orbMat);
      orb.position.y = 2.9;
      tGrp.add(orb);

      const tLblEl = document.createElement('div');
      tLblEl.className = 'lbl lbl-small hidden';
      const tLbl = new CSS2DObject(tLblEl);
      tLbl.position.y = 3.85;
      tGrp.add(tLbl);

      g.add(tGrp);
      this.tierProps[tierKey].push(tGrp);
      this.turretMeshes.push({
        idx,
        grp: tGrp,
        orb,
        orbMat,
        tierKey,
        localPos,
        worldPos: localPos.clone().add(this.center),
        hp: 80,
        maxHp: 80,
        disabledUntil: 0,
        lblEl: tLblEl,
        lblObj: tLbl,
      });
    };

    makeGuardTurret(GAP + 0.25, 'lv2', 0);
    makeGuardTurret(-(GAP + 0.25), 'lv3', 1);
    makeGuardTurret(Math.PI, 'lv5', 2);

    // 3D Expanding Red Telegraph Ring for Guard Turret Lock-On (gives raiders 1.35s to dodge or smash turret!)
    const warnGrp = new THREE.Group();
    const warnOuter = new THREE.Mesh(
      new THREE.RingGeometry(2.75, 3.2, 32),
      new THREE.MeshBasicMaterial({ color: '#ff2a1f', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    warnOuter.rotation.x = -Math.PI / 2;
    warnOuter.position.y = 0.12;
    const warnFill = new THREE.Mesh(
      new THREE.CircleGeometry(3.15, 32),
      new THREE.MeshBasicMaterial({ color: '#ff2a1f', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    warnFill.rotation.x = -Math.PI / 2;
    warnFill.position.y = 0.09;
    warnGrp.add(warnOuter, warnFill);
    warnGrp.visible = false;
    this.scene.add(warnGrp);
    this.turretWarnRing = warnGrp;
    this.turretWarnFill = warnFill;

    // Level 4 Golden Bastion Hoards
    for (const s of [-1, 1]) {
      const hoard = spawn('coin_piles', 0.85);
      hoard.position.copy(side.clone().multiplyScalar(s * 2.4)).add(back.clone().multiplyScalar(1.2));
      g.add(hoard);
      this.tierProps.lv4.push(hoard);
    }

    // Level 5 Sovereign Citadel Forcefield Crown Ring
    const crownDome = new THREE.Mesh(
      new THREE.RingGeometry(this.R - 0.6, this.R + 0.5, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd615', transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    crownDome.rotation.x = -Math.PI / 2;
    crownDome.position.y = 4.2;
    g.add(crownDome);
    this.tierProps.lv5.push(crownDome);

    // 3 Sculpted 3D Boogasaurus Camp Guardians (0: Raptor, 1: Trike, 2: T-Rex)
    const dinoNames = ['Raptor Helper', 'Trike Helper', 'T-Rex Helper'];
    for (let i = 0; i < 3; i++) {
      const dMesh = makeBoogasaurus(i, this.color);
      dMesh.visible = false;
      const dLblEl = document.createElement('div');
      dLblEl.className = 'lbl lbl-small hidden';
      const dLbl = new CSS2DObject(dLblEl);
      dLbl.position.y = 2.05;
      dMesh.add(dLbl);
      this.scene.add(dMesh);
      const startAng = ea + (i - 1) * 1.1;
      const startPos = new THREE.Vector3(
        this.center.x + Math.cos(startAng) * 4.5,
        this.center.y,
        this.center.z + Math.sin(startAng) * 4.5
      );
      dMesh.position.copy(startPos);
      this.dinoGuards.push({
        idx: i,
        name: dinoNames[i],
        mesh: dMesh,
        pos: startPos,
        angle: startAng,
        atkCd: 0,
        chasing: false,
        lblEl: dLblEl,
        lblObj: dLbl,
      });
    }

    // Cartoon boulder gate (slides into the gap when locked — can be BONKED by raiders!)
    this.boulder = spawn('rock_m1', 3.6, 'max');
    this.boulderBaseScale = this.boulder.scale.clone();
    this.boulderOpen = new THREE.Vector3(Math.cos(ea + GAP + 0.32) * (this.R + 1.2), -0.15, Math.sin(ea + GAP + 0.32) * (this.R + 1.2));
    this.boulderClosed = new THREE.Vector3(Math.cos(ea) * this.R, -0.15, Math.sin(ea) * this.R);
    this.boulder.position.copy(this.boulderOpen);
    g.add(this.boulder);

    this.barrier = new THREE.Mesh(
      new THREE.CylinderGeometry(this.R, this.R, 3.0, 24, 1, true, Math.PI / 2 - ea - GAP, GAP * 2),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.barrier.position.y = 1.5;
    this.barrier.visible = false;
    g.add(this.barrier);

    // Lock slab
    const sp = new THREE.Vector3(Math.cos(ea) * (this.R - 3.2), 0, Math.sin(ea) * (this.R - 3.2));
    sp.add(side.clone().multiplyScalar(3.2));
    this.slabLocal = sp;
    this.slabWorld = sp.clone().add(this.center);
    const slab = spawn('rock_path_wide', 2.4, 'max');
    slab.position.copy(sp).setY(0.02);
    g.add(slab);
    this.slabMat = new THREE.MeshStandardMaterial({ color: '#44ff66', emissive: '#22dd44', emissiveIntensity: 1.3, roughness: 0.2 });
    this.slabGlow = spawn('crystal', 0.75);
    this.slabGlow.traverse((o) => { if (o.isMesh) o.material = this.slabMat; });
    this.slabGlow.position.copy(sp).setY(0.08);
    g.add(this.slabGlow);
    const slabLbl = document.createElement('div');
    slabLbl.className = 'lbl lbl-small';
    this.slabLabelEl = slabLbl;
    const sl = new CSS2DObject(slabLbl);
    this.slabLblObj = sl;
    sl.position.copy(sp).setY(1.4);
    g.add(sl);

    // Base Upgrade Anvil / Builder Totem inside the Base (Opposite the Lock Slab!)
    const upPos = new THREE.Vector3(Math.cos(ea) * (this.R - 3.2), 0, Math.sin(ea) * (this.R - 3.2));
    upPos.add(side.clone().multiplyScalar(-3.2));
    this.upgradeLocal = upPos;
    this.upgradeWorld = upPos.clone().add(this.center);
    const upGrp = new THREE.Group();
    upGrp.position.copy(upPos);
    const upPad = spawn('rock_path_wide', 2.2, 'max');
    upPad.position.y = 0.02;
    upGrp.add(upPad);
    const upCauldron = tint(spawn('cauldron', 0.9), '#ffd615', { emissive: '#ff9d00', emissiveIntensity: 1.6 }, /orange|soup/i);
    upCauldron.position.y = 0.06;
    upGrp.add(upCauldron);
    const upRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.55, 28),
      new THREE.MeshBasicMaterial({ color: '#ffd615', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
    );
    upRing.rotation.x = -Math.PI / 2;
    upRing.position.y = 0.06;
    upGrp.add(upRing);
    g.add(upGrp);
    const upLblEl = document.createElement('div');
    upLblEl.className = 'lbl lbl-small';
    this.upgradeLabelEl = upLblEl;
    const upLbl = new CSS2DObject(upLblEl);
    this.upLblObj = upLbl;
    upLbl.position.copy(upPos).setY(1.85);
    g.add(upLbl);

    // Prehistoric camp monument
    const totem = new THREE.Group();
    const mon = tint(spawn('monument', 4.6), this.color, {}, /main/i);
    totem.add(mon);
    const topSkull = spawn('skull_horned', 1.05);
    topSkull.position.set(0, 4.25, 0.35);
    totem.add(topSkull);
    totem.position.copy(back.clone().multiplyScalar(this.R - 1.2));
    totem.lookAt(totem.position.clone().sub(back));
    g.add(totem);

    const nameEl = document.createElement('div');
    nameEl.className = 'lbl lbl-camp';
    nameEl.style.setProperty('--c', this.color);
    nameEl.textContent = `${this.ownerName.toUpperCase()} CAMP · LV.1`;
    this.nameEl = nameEl;
    const nl = new CSS2DObject(nameEl);
    this.nameLblObj = nl;
    nl.position.copy(totem.position).setY(5.8);
    g.add(nl);

    // Base Loot Vault Chest in the center of the Base
    const vp = back.clone().multiplyScalar(0.8);
    this.vaultLocal = vp;
    this.vaultWorld = vp.clone().add(this.center);
    const vaultGroup = new THREE.Group();
    vaultGroup.position.copy(vp);
    vaultGroup.rotation.y = ea;
    const vaultBase = spawn('rock_path_wide', 2.1, 'max');
    vaultBase.position.y = 0.03;
    vaultGroup.add(vaultBase);
    const vaultChest = makeChest(this.color);
    if (vaultChest.userData?.beam) vaultChest.userData.beam.visible = false;
    vaultChest.position.y = 0.08;
    vaultGroup.add(vaultChest);
    const vaultRing = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.85, 32),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
    );
    vaultRing.rotation.x = -Math.PI / 2;
    vaultRing.position.y = 0.06;
    vaultGroup.add(vaultRing);
    this.vaultGroup = vaultGroup;
    this.vaultRingMat = vaultRing.material;
    g.add(vaultGroup);

    const vaultEl = document.createElement('div');
    vaultEl.className = 'lbl lbl-nest';
    this.vaultEl = vaultEl;
    const vl = new CSS2DObject(vaultEl);
    this.vaultLblObj = vl;
    vl.position.copy(vp).setY(2.65);
    g.add(vl);

    // Campfire (uses zero-cost emissive glow disc instead of PointLight to avoid WebGL NUM_POINT_LIGHTS shader recompiles!)
    const fire = new THREE.Group();
    fire.add(spawn('bonfire_stones', 0.48));
    this.flame = spawn('bonfire', 1.45);
    fire.add(this.flame);
    const fireGlowMat = new THREE.MeshBasicMaterial({
      color: '#ff8a2a',
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fireGlow = new THREE.Mesh(new THREE.CircleGeometry(2.1, 20), fireGlowMat);
    fireGlow.rotation.x = -Math.PI / 2;
    fireGlow.position.y = 0.05;
    fire.add(fireGlow);
    this.fireGlowMat = fireGlowMat;
    fire.position.copy(side.clone().multiplyScalar(-3.8)).add(back.clone().multiplyScalar(2.0));
    g.add(fire);
    this.fireLocal = fire.position.clone();
  }

  nestLocalPos(i) {
    const count = 4;
    const spread = 2.15;
    const a = this.entranceAngle + Math.PI + (i - (count - 1) / 2) * (spread / (count - 1));
    const r = this.R - 3.4;
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  makeNest(i) {
    const shrine = TROPHY_SHRINES[i] || TROPHY_SHRINES[0];
    const lp = this.nestLocalPos(i);
    const grp = new THREE.Group();
    grp.position.copy(lp);
    grp.rotation.y = Math.atan2(-lp.x, -lp.z);
    const plinth = spawn('rock_path_wide', 1.65, 'max');
    plinth.position.y = 0.05;
    grp.add(plinth);
    const holder = new THREE.Group();
    holder.position.y = 0.18;
    grp.add(holder);
    const el = document.createElement('div');
    el.className = 'lbl lbl-nest';
    const lbl = new CSS2DObject(el);
    lbl.position.y = 2.85;
    grp.add(lbl);
    this.group.add(grp);
    return {
      i,
      shrine,
      grp,
      holder,
      el,
      lbl,
      content: null,
      stored: 0,
      world: lp.clone().add(this.center),
      mesh: null,
      active: true,
    };
  }

  setNestCount(n) {
    this.nestCount = Math.min(MAX_NESTS, n);
    this.nests.forEach((ns, i) => {
      ns.active = i < this.nestCount;
      ns.grp.visible = ns.active;
    });
  }

  freeNest() { return this.nests.find((n) => n.active && !n.content); }
  occupiedNests() { return this.nests.filter((n) => n.active && n.content); }
  shrineCount() { return this.occupiedNests().length; }

  unlockShrine(idx) {
    const n = this.nests[idx];
    if (!n || n.content) return false;
    const shrine = TROPHY_SHRINES[idx] || TROPHY_SHRINES[0];
    this.place(n, { kind: 'shrine', shrineIdx: idx, dino: ['raptor', 'trike', 'ptero', 'runerex'][idx] || 'raptor', id: shrine.id });
    return true;
  }

  place(nest, content) {
    if (!nest) return;
    nest.content = { ...content };
    nest.stored = 0;
    this.refreshNestMesh(nest);
  }

  clear(nest) {
    const c = nest.content;
    nest.content = null;
    nest.stored = 0;
    this.refreshNestMesh(nest);
    return c;
  }

  refreshNestMesh(nest) {
    if (nest.mesh) nest.holder.remove(nest.mesh);
    nest.mesh = null;
    if (!nest.content) return;
    const shrine = nest.shrine || TROPHY_SHRINES[nest.i] || TROPHY_SHRINES[0];
    const bossCfg = BOSSES.find((b) => b.id === shrine.bossId) || BOSSES[0];

    const trophyGroup = new THREE.Group();
    const statue = makeBoss(bossCfg);
    statue.scale.setScalar(0.68);
    trophyGroup.add(statue);

    const chest = spawn('chest_gold', 0.65);
    chest.position.set(0.55, 0, 0.45);
    trophyGroup.add(chest);

    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1.25, 32),
      new THREE.MeshBasicMaterial({
        color: shrine.color || '#ffd615',
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.05;
    trophyGroup.add(glow);

    nest.mesh = trophyGroup;
    nest.holder.add(nest.mesh);
  }

  incomeRate() { return 0; }

  /**
   * Spawn physical 3D Vine Traps guarding the path from the entrance gate to the Camp Vault Chest.
   * Raiders can either step around them or BONK them (1 swing) to disarm!
   */
  spawnDefenseTraps(count = 1) {
    // Clear existing traps first
    for (const tr of this.traps) {
      if (tr.mesh) this.scene.remove(tr.mesh);
    }
    this.traps = [];
    const ea = this.entranceAngle;
    const fwd = new THREE.Vector3(Math.cos(ea), 0, Math.sin(ea));
    const side = new THREE.Vector3(-Math.sin(ea), 0, Math.cos(ea));
    const offsets = [
      { f: 4.8, s: 0.0 },
      { f: 2.9, s: 2.1 },
      { f: 2.9, s: -2.1 },
    ];
    for (let i = 0; i < Math.min(3, count); i++) {
      const off = offsets[i];
      const pos = this.center.clone()
        .add(fwd.clone().multiplyScalar(off.f))
        .add(side.clone().multiplyScalar(off.s));
      pos.y = heightAt(pos.x, pos.z);
      const mesh = new THREE.Group();
      mesh.add(tint(spawn('bear_trap', 1.25, 'max'), '#557a46'));
      const cl = spawn('clover', 0.3);
      cl.scale.set(1.6, 1, 1.6);
      mesh.add(cl);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.65, 0.9, 20),
        new THREE.MeshBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      mesh.add(ring);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.traps.push({ pos, mesh });
    }
  }

  hasActiveTurret(now) {
    const maxT = this.upgradeCfg?.turrets || 0;
    for (let i = 0; i < maxT && i < this.turretMeshes.length; i++) {
      const tm = this.turretMeshes[i];
      if (tm && tm.grp.visible && now >= (tm.disabledUntil || 0)) return true;
    }
    return false;
  }

  update(dt, now, mult, t, showLabelsFor) {
    if (this.turretCooldown > 0) this.turretCooldown = Math.max(0, this.turretCooldown - dt);
    const effMaxHp = this.effectiveGateMaxHp;
    if (this.gateMaxHp !== effMaxHp) {
      const diff = effMaxHp - this.gateMaxHp;
      this.gateMaxHp = effMaxHp;
      if (diff > 0) this.gateHp = Math.min(effMaxHp, this.gateHp + diff);
    }

    // Scale Boulder Door physically bigger as Heavy Boulder Door+ (gate1) stacks increase!
    if (this.boulder && this.boulderBaseScale) {
      const gateRank = this.owner?.gear?.gate1 || 0;
      const bScale = 1 + gateRank * 0.08;
      this.boulder.scale.copy(this.boulderBaseScale).multiplyScalar(bScale);
    }

    // Rival camps automatically re-seal their Boulder Gate 38s after being breached!
    if (!this.isMine && !isTutorialMap) {
      if (this.gateRegenTimer > 0) {
        this.gateRegenTimer = Math.max(0, this.gateRegenTimer - dt);
        if (this.gateRegenTimer <= 0) {
          this.gateHp = this.gateMaxHp;
          this.lockedUntil = Infinity;
        }
      }
      // Respawn disarmed/triggered rival camp traps after 45s
      const targetTraps = Math.max(1, Math.min(3, (this.level || 2) - 1));
      if (this.traps.length < targetTraps) {
        this.trapRespawnTimer += dt;
        if (this.trapRespawnTimer >= 45) {
          this.trapRespawnTimer = 0;
          this.spawnDefenseTraps(targetTraps);
        }
      } else {
        this.trapRespawnTimer = 0;
      }
    }

    const locked = this.isLocked(now);
    const target = locked ? this.boulderClosed : this.boulderOpen;
    this.boulder.position.lerp(target, Math.min(1, dt * 5));
    this.barrier.visible = locked;
    this.barrier.material.opacity = 0.25 + Math.sin(t * 5) * 0.08;
    this.slabMat.color.set(locked ? '#ff4040' : '#44ff66');
    this.slabMat.emissive.set(locked ? '#dd2222' : '#22dd44');
    this.slabGlow.rotation.y += dt * 1.4;

    // Update 3D Boogasaurus Camp Guardians (Patrol & Chase Animation)
    const dinoCount = this.activeDinoCount;
    for (let i = 0; i < this.dinoGuards.length; i++) {
      const dg = this.dinoGuards[i];
      const active = i < dinoCount;
      dg.mesh.visible = active;
      if (!active) {
        if (dg.lblObj) dg.lblObj.visible = false;
        continue;
      }
      if (dg.atkCd > 0) dg.atkCd = Math.max(0, dg.atkCd - dt);
      if (!dg.chasing) {
        // Idle circular patrol inside the Camp perimeter
        dg.angle += dt * (0.65 + i * 0.12);
        const r = 4.6;
        const tx = this.center.x + Math.cos(dg.angle) * r;
        const tz = this.center.z + Math.sin(dg.angle) * r;
        const dx = tx - dg.pos.x;
        const dz = tz - dg.pos.z;
        dg.pos.x += dx * Math.min(1, dt * 4);
        dg.pos.z += dz * Math.min(1, dt * 4);
        dg.pos.y = heightAt(dg.pos.x, dg.pos.z);
        dg.mesh.position.copy(dg.pos);
        if (Math.hypot(dx, dz) > 0.02) {
          dg.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      animateBoogasaurus(dg.mesh, dt, t + i * 1.3, dg.chasing);
      const showD = showLabelsFor(dg.pos, 9.0);
      dg.lblEl.classList.toggle('hidden', !showD);
      if (dg.lblObj) dg.lblObj.visible = showD;
      if (showD) {
        const dHtml = `<b style="color:#42f54b">🦖 ${dg.name.toUpperCase()}</b>`;
        if (dg.lblEl._lastHtml !== dHtml) {
          dg.lblEl._lastHtml = dHtml;
          dg.lblEl.innerHTML = dHtml;
        }
      }
    }

    const maxT = this.upgradeCfg?.turrets || 0;
    for (let i = 0; i < this.turretMeshes.length; i++) {
      const tm = this.turretMeshes[i];
      const unlockedTier = i < maxT;
      tm.grp.visible = unlockedTier;
      if (unlockedTier) {
        const disabled = now < (tm.disabledUntil || 0);
        if (disabled) {
          tm.orbMat.color.set('#555b66');
          tm.orbMat.emissive.set('#22252b');
          tm.orb.position.y = 2.55;
        } else {
          if (tm.hp <= 0) tm.hp = tm.maxHp;
          const charging = this.turretWindup > 0;
          tm.orbMat.color.set(charging ? '#ff2a1f' : '#00f5ff');
          tm.orbMat.emissive.set(charging ? '#ff4500' : '#00c8ff');
          tm.orb.rotation.y += dt * (charging ? 8.5 : 2.5);
          tm.orb.position.y = 2.9 + Math.sin(t * 4) * 0.15;
        }
        const showT = !this.isMine && showLabelsFor(tm.worldPos, 8.5);
        tm.lblEl.classList.toggle('hidden', !showT);
        if (tm.lblObj) tm.lblObj.visible = showT;
        if (showT) {
          const tHtml = disabled
            ? `<span class="dim">TURRET DISABLED · ${Math.ceil(tm.disabledUntil - now)}s</span>`
            : `<b style="color:#00f5ff">GUARD TURRET (${tm.hp}/${tm.maxHp} HP)</b><br><small style="color:#ffd615">Bonk to Disable (25s)</small>`;
          if (tm.lblEl._lastHtml !== tHtml) {
            tm.lblEl._lastHtml = tHtml;
            tm.lblEl.innerHTML = tHtml;
          }
        }
      } else if (tm.lblObj) {
        tm.lblObj.visible = false;
      }
    }

    if (this.turretWarnRing) {
      if (this.turretWindup > 0) {
        this.turretWarnRing.visible = true;
        this.turretWarnRing.position.set(this.turretTargetPos.x, heightAt(this.turretTargetPos.x, this.turretTargetPos.z), this.turretTargetPos.z);
        const prog = 1 - this.turretWindup / Math.max(0.2, this.turretWindupMax || 1.35);
        const s = 0.25 + prog * 0.75;
        if (this.turretWarnFill) this.turretWarnFill.scale.set(s, s, 1);
      } else {
        this.turretWarnRing.visible = false;
      }
    }

    const boulderPos = this.boulderWorldPos();
    const showSlab = this.isMine ? showLabelsFor(this.slabWorld, 6.5) : showLabelsFor(boulderPos, 9.5);
    this.slabLabelEl.classList.toggle('hidden', !showSlab);
    if (this.slabLblObj) {
      this.slabLblObj.visible = showSlab;
      if (showSlab && !this.isMine) {
        this.slabLblObj.position.copy(this.boulderClosed).setY(2.85);
      }
    }
    const showName = showLabelsFor(this.center, 22);
    if (this.nameEl) this.nameEl.classList.toggle('hidden', !showName);
    if (this.nameLblObj) this.nameLblObj.visible = showName;
    if (showSlab) {
      const sHtml = this.isMine
        ? locked
          ? `GATE LOCKED · ${Math.ceil(this.lockedUntil - now)}s (${this.gateHp} HP)`
          : 'STEP TO LOCK GATE'
        : locked
          ? `<b style="color:#ff6b6b">BOULDER GATE LOCKED (${this.gateHp}/${this.gateMaxHp} HP)</b><br><small style="color:#ffd615">Click / Bonk Gate to Breach!</small>`
          : `<b style="color:#42f54b">GATE BREACHED · ${Math.ceil(this.gateRegenTimer || 0)}s WINDOW</b>`;
      if (this.slabLabelEl._lastHtml !== sHtml) {
        this.slabLabelEl._lastHtml = sHtml;
        this.slabLabelEl.innerHTML = sHtml;
      }
      this.slabLabelEl.classList.toggle('locked', locked);
    }

    if (this.upgradeLabelEl) {
      const showUp = this.isMine && showLabelsFor(this.upgradeWorld, 6.5);
      this.upgradeLabelEl.classList.toggle('hidden', !showUp);
      if (this.upLblObj) this.upLblObj.visible = showUp;
      if (showUp) {
        const nxt = this.nextUpgradeCfg;
        const uHtml = nxt
          ? `<b style="color:#ffd615">UPGRADE CAMP [U]</b><br><small>Lv.${nxt.level} ${nxt.name} · ${nxt.cost} Dust</small>`
          : `<b style="color:#42f54b">MAX CAMP · LV.5</b>`;
        if (this.upgradeLabelEl._lastHtml !== uHtml) {
          this.upgradeLabelEl._lastHtml = uHtml;
          this.upgradeLabelEl.innerHTML = uHtml;
        }
      }
    }

    if (this.fireGlowMat) {
      this.fireGlowMat.opacity = 0.24 + Math.sin(t * 11) * 0.06;
    }

    if (this.vaultEl) {
      const showVault = showLabelsFor(this.vaultWorld, 6.5);
      this.vaultEl.classList.toggle('hidden', !showVault);
      if (this.vaultLblObj) this.vaultLblObj.visible = showVault;
      if (showVault) {
        const vaultDust = Math.floor(this.owner ? this.owner.dust : 0);
        const onCd = now < this.raidCooldownUntil;
        const vHtml = this.isMine
          ? `<b style="color:${this.color}">CAMP VAULT · ${fmt(vaultDust)} DUST</b><br><small style="color:#42f54b">Safe Storage</small>`
          : `<b style="color:${this.color}">${this.ownerName.toUpperCase()} VAULT (LV.${this.level} · ${fmt(vaultDust)} DUST)</b><br>${
              locked
                ? `<span style="color:#ff6b6b">BREACH GATE FIRST (${this.gateHp} HP)</span>`
                : onCd
                  ? `<span class="dim">COOLDOWN ${Math.ceil(this.raidCooldownUntil - now)}s</span>`
                  : `<span style="color:#42f54b">HOLD [E] TO CRACK VAULT (3.2s)</span>`
            }`;
        if (this.vaultEl._lastHtml !== vHtml) {
          this.vaultEl._lastHtml = vHtml;
          this.vaultEl.innerHTML = vHtml;
        }
      }
    }

    for (const n of this.nests) {
      if (!n.active) {
        n.el.classList.add('hidden');
        if (n.lbl) n.lbl.visible = false;
        continue;
      }
      const c = n.content;
      const shrine = n.shrine || TROPHY_SHRINES[n.i] || TROPHY_SHRINES[0];
      if (c && n.mesh) {
        n.mesh.rotation.y = Math.sin(t * 1.2 + n.i) * 0.25;
      }
      const show = showLabelsFor(n.world, 3.8);
      n.el.classList.toggle('hidden', !show);
      if (n.lbl) n.lbl.visible = show;
      if (show) {
        const nHtml = !c
          ? `<span class="dim"><b>${shrine.name}</b><br><small>Slay ${(BOSSES.find((b) => b.id === shrine.bossId) || {}).name || 'Boss'} or 3x ${ITEMS[shrine.coin]?.name || 'Biome Coin'}</small></span>`
          : `<b style="color:${shrine.color}">${shrine.name}</b><br><span class="rate" style="color:#42f54b">${shrine.buffText}</span>`;
        if (n.el._lastHtml !== nHtml) {
          n.el._lastHtml = nHtml;
          n.el.innerHTML = nHtml;
        }
      }
    }
    for (const tr of this.traps) tr.mesh.rotation.y += dt;
  }
}

export function fmt(n) {
  if (n < 1000) return String(Math.floor(n * 10) / 10).replace(/\.0$/, '');
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 2 : 1).replace(/\.?0+$/, '') + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
}
