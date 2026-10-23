import { ICON, TREASURE_ICON, GEODE_STAGE_ICON, ITEMS, RECIPES, GEAR, TREASURES, TROPHY_SHRINES, BOOGA_ZONES, BASE_UPGRADES, BAL, DINOS, EGGS, NODES } from './config.js';
import { fmt } from './camp.js';
import { CAMP_ANGLES, BIOME_COLORS, zoneAt, isTutorialMap } from './world.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);

const TUT_STEPS = [
  { stepNum: 1, icon: '/assets/geodes/quartz/stage_4.png', cardTitle: '1. Crack a Geode', title: 'STEP 1 OF 5', text: 'Walk to the Quartz Geode & <b>Click</b> to fill your Loot Bag', reward: '+35 Dust' },
  { stepNum: 2, icon: '/assets/items/dust_icon.png', cardTitle: '2. Extract to Your Camp', title: 'STEP 2 OF 5', text: 'Carry your Loot Bag inside <b>Your Camp</b> to bank it safely', reward: '+35 Dust' },
  { stepNum: 3, icon: '/assets/items/rock.png', cardTitle: '3. Lock Your Camp Gate', title: 'STEP 3 OF 5', text: 'Step on the <b>Green Lock Pad</b> at your gate to secure your Vault', reward: '+35 Dust' },
  { stepNum: 4, icon: '/assets/weapons/StoneClub.png', cardTitle: '4. Forge Stone Club', title: 'STEP 4 OF 5', text: 'Press <b>[R]</b> to craft a <b>Stone Club</b> from banked materials', reward: '+35 Dust' },
  { stepNum: 5, icon: '/assets/treasures/cave_coin.png', cardTitle: '5. Raid a Rival Camp', title: 'STEP 5 OF 5', text: 'Follow the Arrow to James\'s Camp & <b>Hold [E]</b> on his Vault', reward: 'Graduation Pack' },
  { stepNum: 6, icon: '/assets/treasures/cave_coin.png', cardTitle: 'Complete', title: 'COMPLETE', text: 'Explore all 12 Biomes & World Bosses', reward: 'Master Miner' },
];

function gearIcon(id) {
  const g = GEAR[id];
  if (!g) return `<span class="gicon"><img src="${ICON('rock')}"></span>`;
  if (g.weaponImg) {
    return `<span class="gicon weapon-art"><img src="${g.weaponImg}" alt="${g.name}"></span>`;
  }
  const main = g.icon || 'rock';
  const badge = g.badge || 'wood';
  return `<span class="gicon"><img src="${ICON(main)}"><img class="badge" src="${ICON(badge)}"></span>`;
}

export class UI {
  constructor(game) {
    this.g = game;
    this.panel = null;
    this.craftFilter = 'recommended';
    this.toasts = $('#toasts');
    this.mm = $('#minimap');
    this.mmc = this.mm.getContext('2d');
    this.lastDust = -1;
    $('#btn-play').onclick = () => { $('#title').classList.add('hidden'); game.start('valley'); };
    const btnTut = $('#btn-tutorial');
    if (btnTut) btnTut.onclick = () => { $('#title').classList.add('hidden'); game.start('tutorial'); };
    const btnSwitch = $('#btn-map-switch');
    if (btnSwitch) btnSwitch.onclick = () => {
      game.switchMode(game.mode === 'tutorial' ? 'valley' : 'tutorial', game.tutGraduated);
    };
    const btnVicValley = $('#btn-vic-valley');
    if (btnVicValley) btnVicValley.onclick = () => {
      this.closePanels();
      game.switchMode('valley', true);
    };
    const btnVicStay = $('#btn-vic-stay');
    if (btnVicStay) btnVicStay.onclick = () => this.closePanels();
    $('#btn-reset').onclick = () => { if (confirm('Reset all progress?')) game.reset(); };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => this.closePanels()));
    document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => this.togglePanel(b.dataset.open)));
    if (this.mm) {
      this.mm.style.cursor = 'pointer';
      this.mm.title = 'Click/Tap to open the Boogas World Map & Fast-Travel [M]';
      this.mm.onclick = () => this.togglePanel('map');
    }
    const hbBase = $('#hb-base');
    if (hbBase) {
      hbBase.onclick = () => {
        if (this.g.upgradeBase(this.g.player)) this.refreshPanels();
      };
    }
    this.mapImg = new Image();
    this.mapImg.src = '/assets/booga_map.png';
    this.mapImg.onload = () => this.buildBg();
    const ch = $('#clickhint');
    if (ch) ch.classList.add('hidden');
    this.buildBg();
    this.updateModeButton();
  }

  updateModeButton() {
    const btn = $('#btn-map-switch');
    if (!btn) return;
    btn.textContent = this.g.mode === 'tutorial' ? 'Full Continent [J]' : 'Geode Academy [J]';
  }

  get panelOpen() { return !!this.panel; }

  showHud() {
    $('#hud').classList.remove('hidden');
    this.updateModeButton();
  }

  togglePanel(name) {
    if (this.panel === name) return this.closePanels();
    this.closePanels();
    this.panel = name;
    $(`#panel-${name}`).classList.remove('hidden');
    this.refreshPanels();
  }
  closePanels() {
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
    this.panel = null;
  }

  refreshPanels() {
    if (this.panel === 'craft') this.renderCraft();
    if (this.panel === 'treasure') this.renderTreasure();
    if (this.panel === 'map') this.renderMap();
  }

  renderMap() {
    const g = this.g;
    const p = g.player;
    const pinsEl = $('#booga-map-pins');
    const sideEl = $('#booga-map-sidebar');
    if (!pinsEl || !sideEl) return;

    const curZone = zoneAt(p.pos.x, p.pos.z);
    const activeBoss = g.bosses ? g.bosses.find((b) => b.alive) : null;

    // 1. Render clickable pins for all 12 Playable Biomes directly over booga_map.png
    let pinsHtml = BOOGA_ZONES.map((zn) => {
      const isHere = curZone && curZone.id === zn.id;
      const hasBoss = activeBoss && activeBoss.zoneId === zn.id;
      const camp = zn.campIdx !== undefined ? g.camps[zn.campIdx] : null;
      const campTag = camp
        ? (camp.isMine ? 'YOUR CAMP' : `${camp.ownerName.toUpperCase()} CAMP · LV.${camp.level}`)
        : '';
      const firstGeode = (zn.geodes && zn.geodes[0]) || 'quartz';
      const gCfg = NODES[firstGeode] || NODES.quartz;
      return `<button class="map-zone-pin ${isHere ? 'here' : ''} ${hasBoss ? 'boss-here' : ''}" data-zone="${zn.id}" style="left:${(zn.u * 100).toFixed(1)}%; top:${(zn.v * 100).toFixed(1)}%; --zcol:${zn.color}">
        <span class="mz-head"><img class="mz-geode-img" src="${GEODE_STAGE_ICON(gCfg.stageFolder, 1)}" alt=""><span class="mz-lbl">${zn.name}</span></span>
        ${hasBoss ? `<small class="mz-sub" style="color:#fff">BOSS ACTIVE</small>` : campTag ? `<small class="mz-sub">${campTag}</small>` : ''}
      </button>`;
    }).join('');

    // Live player position dot on map (2000m x 2000m continent span)
    const pu = Math.max(0.05, Math.min(0.95, p.pos.x / 2000 + 0.5));
    const pv = Math.max(0.05, Math.min(0.95, p.pos.z / 2000 + 0.5));
    pinsHtml += `<div class="map-you-dot" style="left:${(pu * 100).toFixed(1)}%; top:${(pv * 100).toFixed(1)}%;" title="YOU (${p.name})">YOU</div>`;

    pinsEl.innerHTML = pinsHtml;
    pinsEl.querySelectorAll('[data-zone]').forEach((btn) => {
      btn.onclick = () => g.travelToZone(btn.dataset.zone);
    });

    // 2. Render Camp Upgrade Card + 12-Biome Fast-Travel Cards in Sidebar
    const myCamp = p.camp;
    const nxt = myCamp?.nextUpgradeCfg;
    const canUp = nxt && p.dust >= nxt.cost;

    let sideHtml = `
      <div class="map-base-card">
        <div class="mbc-head">YOUR CAMP · LV.${myCamp.level} ${myCamp.upgradeCfg.name.toUpperCase()}</div>
        <div class="mbc-desc">${myCamp.upgradeCfg.desc}</div>
        ${nxt
          ? `<button id="btn-map-upbase" class="map-up-btn ${canUp ? 'ready' : ''}" ${canUp ? '' : 'disabled'}>
              Upgrade to Lv.${nxt.level} ${nxt.name} (${nxt.cost} Banked Dust)
            </button>`
          : `<div class="mbc-max">MAX LEVEL 5 CITADEL UNLOCKED</div>`
        }
      </div>
      <h3 style="margin:10px 0 6px;font-size:14px;color:#ffe082;letter-spacing:0.5px;">CONTINENT BIOMES (12 REGIONS)</h3>
      <div class="map-zone-list">
    `;

    for (const zn of BOOGA_ZONES) {
      const isHere = curZone && curZone.id === zn.id;
      const gIcons = (zn.geodes || []).slice(0, 4).map((gt) => {
        const cfg = NODES[gt] || NODES.quartz;
        return `<img src="${GEODE_STAGE_ICON(cfg.stageFolder, 1)}" title="${cfg.name}">`;
      }).join('');
      const camp = zn.campIdx !== undefined ? g.camps[zn.campIdx] : null;
      const raidBadge = camp && !camp.isMine
        ? `<span class="mz-raid-pill ${camp.isLocked(g.now) ? 'locked' : 'open'}">${camp.isLocked(g.now) ? `Siege ${camp.ownerName} Lv.${camp.level} (${camp.gateHp} Gate HP)` : `Raid ${camp.ownerName} (${fmt(camp.owner?.dust || 0)} Dust)`}</span>`
        : '';
      sideHtml += `
        <div class="map-zone-row ${isHere ? 'active' : ''}">
          <div class="mzr-info">
            <b>${zn.name} <small style="color:${zn.color}">· Step ${zn.step}</small></b>
            <small>${zn.subtitle || zn.desc}</small>
            <div class="mzr-geodes">${gIcons} ${raidBadge}</div>
          </div>
          <button class="mzr-warp" data-warp="${zn.id}">${isHere ? 'Current' : 'Travel'}</button>
        </div>
      `;
    }
    sideHtml += `</div>`;
    sideEl.innerHTML = sideHtml;

    const btnMapUp = $('#btn-map-upbase');
    if (btnMapUp) {
      btnMapUp.onclick = () => {
        if (g.upgradeBase(p)) this.renderMap();
      };
    }
    sideEl.querySelectorAll('[data-warp]').forEach((btn) => {
      btn.onclick = () => g.travelToZone(btn.dataset.warp);
    });
  }

  renderCraft() {
    const p = this.g.player;
    const camp = p.camp;
    const hasUpgradedWeapon = (GEAR[p.weapon]?.tierRank || 1) > 1;
    const isCraftTut = !hasUpgradedWeapon && ((this.g.mode === 'tutorial' && this.g.tutStep <= 4) || this.g.bountyIdx <= 3);
    const tutBanner = $('#craft-tut-banner');
    const matStrip = $('#forge-mat-strip');
    const ubCount = p.unbankedItemCount || 0;
    const ubDust = Math.floor(p.unbankedDust || 0);
    const rec = this.g.getRecommendedUpgrades ? this.g.getRecommendedUpgrades() : { weapon: null, suit: null, utility: null, list: [] };

    // 1. Top Horizontal Strip: Banked Camp Vault Dust + Banked Materials (no separate cluttered sidebar!)
    if (matStrip) {
      const invEntries = Object.entries(p.inv).filter(([, q]) => q > 0);
      const chips = invEntries.length
        ? invEntries
            .slice(0, 10)
            .map(([id, q]) => `<span class="fm-chip" title="${ITEMS[id]?.name || id} (Banked in Camp)"><img src="${ICON(id)}"><b>${q}</b></span>`)
            .join('')
        : `<span class="fm-empty">Crack Geodes &amp; step inside Camp to bank materials</span>`;
      const unbWarn = ubCount > 0 || ubDust > 0
        ? `<span class="fm-unb-pill" title="Step inside your Camp to bank your Loot Bag!">🎒 In Bag: ${ubDust > 0 ? `${ubDust} Dust ` : ''}${ubCount > 0 ? `+${ubCount} Mats` : ''}</span>`
        : '';
      matStrip.innerHTML = `
        <span class="fm-dust"><img src="${ICON('dust_icon')}"><b>${fmt(Math.floor(p.dust))}</b> <small>Vault Dust</small></span>
        <div class="fm-mats">${chips}</div>
        ${unbWarn}
      `;
    }

    // 2. Clean 4-Tab Bar
    if (tutBanner) {
      tutBanner.innerHTML = `
        <div class="craft-tabs clean-tabs">
          <button class="c-tab ${this.craftFilter === 'recommended' ? 'active' : ''}" data-cfilter="recommended">★ Ready &amp; Next</button>
          <button class="c-tab ${this.craftFilter === 'camp' ? 'active' : ''}" data-cfilter="camp">🛡️ Camp Barricades &amp; Dinos</button>
          <button class="c-tab ${this.craftFilter === 'weapons' ? 'active' : ''}" data-cfilter="weapons">⚔️ Weapons</button>
          <button class="c-tab ${this.craftFilter === 'suits' ? 'active' : ''}" data-cfilter="suits">🧥 Suits &amp; All (${RECIPES.length})</button>
        </div>
      `;
      tutBanner.querySelectorAll('[data-cfilter]').forEach((btn) => {
        btn.onclick = () => {
          this.craftFilter = btn.dataset.cfilter;
          this.renderCraft();
        };
      });
    }

    // Helper to render compact ingredient chips
    const renderIngChips = (plan) =>
      plan.displayInputs
        .map((inp) => {
          const inBag = p.unbankedItems?.[inp.id] || 0;
          return `<span class="ing-pill ${inp.ok ? 'ok' : 'no'}" title="${ITEMS[inp.id]?.name || inp.id}">
            <img src="${ICON(inp.id)}"><b>${inp.have}/${inp.need}</b><span>${ITEMS[inp.id]?.name || inp.id}${inBag > 0 && !inp.ok ? ` (+${inBag} bag)` : ''}</span>
          </span>`;
        })
        .join('');

    // Helper to build the 4 Camp Barricade & Helper cards
    const renderCampBarricadesSection = () => {
      const gateRank = p.gear.gate1 || 0;
      const gateMaxed = gateRank >= 5;
      const gateRecipe = RECIPES.find((r) => r.gear && r.out === 'gate1');
      const gatePlan = this.g.getSmartCraftPlan(gateRecipe, p.inv);
      const gateDustCost = 110 + gateRank * 85;
      const gateCan = !gateMaxed && (gatePlan.canCraft || p.dust >= gateDustCost);

      const dinoRank = p.gear.dino_guard || 0;
      const dinoMaxed = dinoRank >= 3;
      const dinoRecipe = RECIPES.find((r) => r.gear && r.out === 'dino_guard');
      const dinoPlan = this.g.getSmartCraftPlan(dinoRecipe, p.inv);
      const dinoDustCost = 160 + dinoRank * 130;
      const dinoCan = !dinoMaxed && (dinoPlan.canCraft || p.dust >= dinoDustCost);
      const nextDinoName = ['Raptor Stalker', 'Horned Triceratops', 'Apex T-Rex'][Math.min(2, dinoRank)];

      const trapCount = camp.traps.length;
      const trapMaxed = trapCount >= 6;
      const trapRecipe = RECIPES.find((r) => r.gear && r.out === 'trap');
      const trapPlan = this.g.getSmartCraftPlan(trapRecipe, p.inv);
      const trapDustCost = 80;
      const trapCan = !trapMaxed && (trapPlan.canCraft || p.dust >= trapDustCost);

      const nxtFort = camp.nextUpgradeCfg;
      const fortMaxed = !nxtFort;
      const fortCan = nxtFort && p.dust >= nxtFort.cost;

      return `
        <div class="forge-sec-head">
          <span>🛡️ CAMP BARRICADES &amp; BOOGASAURUS HELPERS</span>
          <small>Protect your Camp Vault with longer Boulder Lock time, Gate Traps &amp; 3D Boogasaurus Guards</small>
        </div>
        <div class="barricade-grid">
          <div class="b-card ${gateCan ? 'can' : ''} ${gateMaxed ? 'maxed' : ''}">
            <div class="b-ico"><img src="${ICON('rock')}"></div>
            <div class="b-info">
              <div class="b-top-row">
                <b>Heavy Boulder Door+</b>
                <span class="b-rank">Lv.${gateRank}/5</span>
              </div>
              <div class="b-stat">Lock Time: <b>${p.lockTime}s</b> (+25s/Lv) · Gate: <b>${camp.effectiveGateMaxHp} HP</b></div>
              <div class="b-ings">${gateMaxed ? '<span class="b-max-lbl">MAX BOULDER DOOR</span>' : renderIngChips(gatePlan)}</div>
            </div>
            <button class="b-btn" data-barricade="boulder" ${gateCan ? '' : 'disabled'}>
              ${gateMaxed ? 'MAXED' : gatePlan.canCraft ? 'FORGE +25s' : `BUY (${gateDustCost} Dust)`}
            </button>
          </div>

          <div class="b-card ${dinoCan ? 'can' : ''} ${dinoMaxed ? 'maxed' : ''}">
            <div class="b-ico"><img src="${ICON('claws')}"></div>
            <div class="b-info">
              <div class="b-top-row">
                <b>Boogasaurus Helper</b>
                <span class="b-rank">${camp.activeDinoCount}/3 Active</span>
              </div>
              <div class="b-stat">${dinoMaxed ? 'Raptor + Triceratops + T-Rex guarding Camp!' : `Next: <b>${nextDinoName}</b> (Chomps raiders for 3.2s Stun)`}</div>
              <div class="b-ings">${dinoMaxed ? '<span class="b-max-lbl">ALL 3 DINOS ACTIVE</span>' : renderIngChips(dinoPlan)}</div>
            </div>
            <button class="b-btn" data-barricade="dino" ${dinoCan ? '' : 'disabled'}>
              ${dinoMaxed ? 'MAXED' : dinoPlan.canCraft ? 'SUMMON DINO' : `BUY (${dinoDustCost} Dust)`}
            </button>
          </div>

          <div class="b-card ${trapCan ? 'can' : ''} ${trapMaxed ? 'maxed' : ''}">
            <div class="b-ico"><img src="${ICON('vine')}"></div>
            <div class="b-info">
              <div class="b-top-row">
                <b>Gate Vine Traps (x2)</b>
                <span class="b-rank">${trapCount}/6 Armed</span>
              </div>
              <div class="b-stat">Auto-places <b>2 Vine Traps</b> at your Gate (5s Raider Stun)</div>
              <div class="b-ings">${trapMaxed ? '<span class="b-max-lbl">6/6 GATE TRAPS ARMED</span>' : renderIngChips(trapPlan)}</div>
            </div>
            <button class="b-btn" data-barricade="trap" ${trapCan ? '' : 'disabled'}>
              ${trapMaxed ? '6/6 ARMED' : trapPlan.canCraft ? 'ARM +2 TRAPS' : `BUY (${trapDustCost} Dust)`}
            </button>
          </div>

          <div class="b-card ${fortCan ? 'can' : ''} ${fortMaxed ? 'maxed' : ''}">
            <div class="b-ico"><img src="${ICON('gold')}"></div>
            <div class="b-info">
              <div class="b-top-row">
                <b>${nxtFort ? `Lv.${nxtFort.level} ${nxtFort.name}` : `Lv.5 Sovereign Citadel`}</b>
                <span class="b-rank">Lv.${camp.level}/5</span>
              </div>
              <div class="b-stat">${nxtFort ? nxtFort.desc : camp.upgradeCfg.desc}</div>
              <div class="b-ings">
                ${nxtFort
                  ? `<span class="ing-pill ${fortCan ? 'ok' : 'no'}"><img src="${ICON('dust_icon')}"><b>${fmt(Math.floor(p.dust))}/${nxtFort.cost}</b><span>Vault Dust</span></span>`
                  : '<span class="b-max-lbl">MAX CITADEL FORTIFICATION</span>'}
              </div>
            </div>
            <button class="b-btn" data-barricade="fort" ${fortCan ? '' : 'disabled'}>
              ${fortMaxed ? 'MAXED' : `UPGRADE (${nxtFort.cost} Dust)`}
            </button>
          </div>
        </div>
      `;
    };

    // Helper to render a clean, easy-to-scan Recipe Card
    const renderCleanRecipeCard = (r) => {
      const plan = this.g.getSmartCraftPlan(r, p.inv);
      const can = plan.canCraft;
      let maxed = false;
      const g = r.gear ? GEAR[r.out] : null;
      if (g) {
        if ((g.kind === 'weapon' || g.kind === 'suit' || g.kind === 'passive') && p.gear[r.out]) maxed = true;
        if (g.kind === 'stack' && (p.gear[r.out] || 0) >= g.max) maxed = true;
      }
      const highlight = isCraftTut && r.out === 'club_stone' && !maxed;
      const name = g ? g.name : ITEMS[r.out]?.name || r.out;
      const icon = r.gear ? gearIcon(r.out) : `<span class="gicon"><img src="${ICON(r.out)}"></span>`;
      const statTxt = g
        ? g.kind === 'weapon'
          ? `⚔️ ${g.geodeDmg || g.geodePower || 35} Geode DMG · 💥 ${g.stun || 5}s Raider Stun`
          : g.desc
        : `Sub-Part (Auto-crafted when forging Weapons/Suits) · Owned: x${p.inv[r.out] || 0}`;

      return `
        <div class="ez-card ${can && !maxed ? 'can' : ''} ${maxed ? 'maxed' : ''} ${highlight ? 'tut-highlight' : ''}">
          <div class="ez-ico">${icon}</div>
          <div class="ez-body">
            <div class="ez-title-row">
              <b class="ez-name">${name}</b>
              ${g?.step ? `<span class="ez-step">Step ${g.step}</span>` : ''}
            </div>
            <div class="ez-stat">${statTxt}</div>
            <div class="ez-ings">${maxed ? '<span class="b-max-lbl">✅ OWNED &amp; EQUIPPED</span>' : renderIngChips(plan)}</div>
          </div>
          <button class="ez-btn" data-recipe="${RECIPES.indexOf(r)}" ${can && !maxed ? '' : 'disabled'}>
            ${maxed ? 'OWNED' : can ? 'FORGE' : 'Locked'}
          </button>
        </div>
      `;
    };

    let html = '';
    if (this.craftFilter === 'camp') {
      html += renderCampBarricadesSection();
    } else if (this.craftFilter === 'recommended') {
      html += renderCampBarricadesSection();
      const recList = rec.list.map((it) => it.recipe);
      html += `
        <div class="forge-sec-head" style="margin-top:14px">
          <span>⚒️ RECOMMENDED WEAPONS &amp; SUITS FOR YOUR STEP</span>
          <small>1-Click Forge automatically crafts any required Handles, Alloys &amp; Armor Pieces</small>
        </div>
        <div class="ez-grid">
          ${recList.map((r) => renderCleanRecipeCard(r)).join('')}
        </div>
      `;
    } else if (this.craftFilter === 'weapons') {
      const weapons = RECIPES.filter((r) => r.gear && GEAR[r.out]?.kind === 'weapon');
      html += `
        <div class="forge-sec-head">
          <span>⚔️ ALL 20 TRIBE WEAPONS (STEPS 1–4)</span>
          <small>Higher Geode DMG cracks Geodes, Rival Gates &amp; Guard Turrets faster</small>
        </div>
        <div class="ez-grid">
          ${weapons.map((r) => renderCleanRecipeCard(r)).join('')}
        </div>
      `;
    } else {
      const suitsAndAll = RECIPES.filter((r) => !(r.gear && GEAR[r.out]?.kind === 'weapon'));
      html += `
        <div class="forge-sec-head">
          <span>🧥 TRIBE SUITS, UTILITY &amp; SUB-PARTS</span>
          <small>Wearable Suits boost Movement Speed &amp; Geode Dust multipliers</small>
        </div>
        <div class="ez-grid">
          ${suitsAndAll.map((r) => renderCleanRecipeCard(r)).join('')}
        </div>
      `;
    }

    $('#recipe-list').innerHTML = html;
    document.querySelectorAll('[data-recipe]').forEach((b) => {
      b.onclick = () => {
        if (this.g.craft(RECIPES[+b.dataset.recipe])) this.renderCraft();
      };
    });
    document.querySelectorAll('[data-barricade]').forEach((b) => {
      b.onclick = () => {
        if (this.g.upgradeCampBarricade(b.dataset.barricade)) this.renderCraft();
      };
    });
  }

  renderTreasure() {
    const p = this.g.player;
    $('#treasure-grid').innerHTML = TROPHY_SHRINES.map((sh, idx) => {
      const n = p.treasures[sh.id] || 0;
      const unlocked = !!(p.camp.nests[idx] && p.camp.nests[idx].content);
      const coinQty = p.inv[sh.coin] || 0;
      const canTrade = !unlocked && coinQty >= 3;
      return `<div class="treasure ${unlocked || n ? 'found' : ''}">
        <img src="${TREASURE_ICON(sh.id + '_icon')}">
        <div>
          <b>${sh.name} <small style="color:#5fd4ff">· Step ${sh.step}</small></b>
          <small>${unlocked || n ? `✅ Awakened in Camp · ${sh.buffText}` : `Slay Boss, Open Relic Chest, or Trade 3 Coins (${coinQty}/3) · ${sh.buffText}`}</small>
        </div>
        ${canTrade
          ? `<button class="shrine-trade-btn" data-shrine="${sh.id}">Awaken (3 Coins)</button>`
          : `<img class="coin" src="${TREASURE_ICON(sh.coin)}" title="${coinQty}/3 Coins">`
        }
      </div>`;
    }).join('');
    document.querySelectorAll('[data-shrine]').forEach((btn) => {
      btn.onclick = () => {
        const sh = TROPHY_SHRINES.find((s) => s.id === btn.dataset.shrine);
        if (sh && (p.inv[sh.coin] || 0) >= 3) {
          p.inv[sh.coin] -= 3;
          this.g.unlockTrophyFor(p, sh.id);
          this.renderTreasure();
        }
      };
    });
    const s = this.g.stats;
    $('#stats').innerHTML = `3D Geodes cracked: <b>${s.geodesCracked || s.gathered || 0}</b> · Bosses slain: <b>${s.bosses || 0}</b> · Trophy Shrines: <b>${p.camp.shrineCount()}/4</b> · Rivals bonked: <b>${s.bonks || 0}</b> · Total Dust: <b>${fmt(s.collected)}</b>`;
  }

  toast(text, icon = null, kind = '', big = false) {
    const el = document.createElement('div');
    el.className = `toast ${kind} ${big ? 'big' : ''}`;
    const src = icon ? (icon.includes('treasure') ? TREASURE_ICON(icon) : ICON(icon)) : null;
    el.innerHTML = (src ? `<img src="${src}">` : '') + `<span>${text}</span>`;
    this.toasts.prepend(el);
    while (this.toasts.children.length > 5) this.toasts.lastChild.remove();
    setTimeout(() => el.classList.add('out'), big ? 4200 : 2600);
    setTimeout(() => el.remove(), big ? 4700 : 3100);
  }

  banner(title, sub, color) {
    const b = $('#banner');
    b.innerHTML = `<b style="color:${color}">${title}</b><small>${sub}</small>`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  treasurePopup(tr, coin, isNew) {
    const el = $('#treasure-pop');
    const sh = TROPHY_SHRINES.find((s) => s.id === tr.id);
    el.innerHTML = `<img src="${TREASURE_ICON(tr.id + '_icon')}"><b>${isNew ? '🏆 TROPHY SHRINE AWAKENED!' : 'Relic Chest Claimed!'}</b><span>${tr.name}</span><div class="coinrow"><img src="${TREASURE_ICON(tr.coin)}">+${fmt(coin)} Dust</div>${sh ? `<small>${sh.buffText}</small>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  flash() {
    const f = $('#hitflash');
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  canCraftAny() {
    const p = this.g.player;
    return RECIPES.some((r) => {
      if (!r.gear) return false;
      const g = GEAR[r.out];
      if (!g) return false;
      if ((g.kind === 'weapon' || g.kind === 'suit' || g.kind === 'passive') && p.gear[r.out]) return false;
      if (g.kind === 'stack' && (p.gear[r.out] || 0) >= g.max) return false;
      if (g.kind === 'consumable' && p.traps >= 3) return false;
      return this.g.getSmartCraftPlan ? this.g.getSmartCraftPlan(r, p.inv).canCraft : r.in.every(([id, q]) => (p.inv[id] || 0) >= q);
    });
  }

  update(dt) {
    const g = this.g, p = g.player;
    if (!g.started) return;
    const setHtml = (el, html) => {
      if (el && el._lastHtml !== html) {
        el._lastHtml = html;
        el.innerHTML = html;
      }
    };
    // Camp Vault Dust (safe banked Dust)
    const d = Math.floor(p.dust);
    if (d !== this.lastDust) {
      $('#dust-amt').textContent = fmt(d);
      if (d > this.lastDust && this.lastDust >= 0) { const e = $('#dust'); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }
      this.lastDust = d;
    }

    // Loot Bag HUD pill in #topleft (shows Unbanked Dust & Items that can be stolen until taken to Camp)
    let bagHud = $('#bag-hud');
    if (!bagHud) {
      bagHud = document.createElement('div');
      bagHud.id = 'bag-hud';
      bagHud.className = 'bag-hud hidden';
      $('#topleft').appendChild(bagHud);
    }
    const ubDust = Math.floor(p.unbankedDust || 0);
    const ubItems = p.unbankedItemCount || 0;
    const inCamp = p.camp && p.camp.inside(p.pos, 0.8);
    if (ubDust > 0 || ubItems > 0) {
      const bagKey = `${ubDust}:${ubItems}:${p.raidedFrom ? p.raidedFrom.ownerName : 0}`;
      if (this._lastBagKey !== bagKey) {
        this._lastBagKey = bagKey;
        const tagTxt = p.raidedFrom ? `RAID LOOT · BANK AT CAMP` : `LOOT BAG · AT RISK`;
        bagHud.innerHTML = `<span class="bh-tag">${tagTxt}</span><span class="bh-val">${ubDust > 0 ? `${fmt(ubDust)} Dust` : ''}${ubDust > 0 && ubItems > 0 ? ' + ' : ''}${ubItems > 0 ? `${ubItems} Items` : ''}</span>`;
      }
      bagHud.classList.remove('hidden');
      bagHud.classList.toggle('raided', !!p.raidedFrom);
    } else if (inCamp) {
      if (this._lastBagKey !== 'safe') {
        this._lastBagKey = 'safe';
        bagHud.innerHTML = `<span class="bh-tag safe">CAMP SAFE</span><span class="bh-val">Vaulted</span>`;
      }
      bagHud.classList.remove('hidden', 'raided');
    } else {
      this._lastBagKey = '';
      bagHud.classList.add('hidden');
    }

    const curStep = g.mode === 'tutorial' ? (g.tutStep + 1) : (g.bountyIdx + 1);
    const inStarterSteps = curStep <= 5;
    const drEl = $('#dust-rate');
    if (drEl) drEl.classList.add('hidden');
    const mapSwitchBtn = $('#btn-map-switch');
    if (mapSwitchBtn) mapSwitchBtn.classList.add('hidden');
    const lk = $('#lock');
    if (lk) lk.classList.add('hidden');
    // hotbar (progressively reveal buttons as tutorial cards introduce them)
    const w = p.weapon;
    setHtml($('#hb-weapon'), w ? `${gearIcon(w)}<em>${GEAR[w].name}</em>` : `<span class="fist">Club</span><em>Club</em>`);
    const bonkImg = document.querySelector('#btn-touch-bonk .t-img');
    if (bonkImg) {
      const wSrc = w && GEAR[w]?.weaponImg ? GEAR[w].weaponImg : '/assets/weapons/WoodenClub.png';
      if (bonkImg.getAttribute('src') !== wSrc) bonkImg.setAttribute('src', wSrc);
    }
    const hbTrap = $('#hb-trap');
    if (hbTrap) {
      hbTrap.classList.toggle('hidden', curStep < 3 && p.traps <= 0);
      setHtml(hbTrap, `${gearIcon('trap')}<span>${p.traps}</span><em>${g.isTouch ? 'Traps' : 'Traps [G]'}</em>`);
    }
    const hbSuit = $('#hb-boots');
    if (hbSuit) {
      const activeSuit = p.suit || (p.gear.boots ? 'boots' : null);
      hbSuit.classList.toggle('hidden', !activeSuit);
      if (activeSuit && GEAR[activeSuit]) {
        setHtml(hbSuit, `${gearIcon(activeSuit)}<em>${GEAR[activeSuit].name}</em>`);
      }
    }
    const hbBase = $('#hb-base');
    const hbBaseLbl = $('#hb-base-lbl');
    if (hbBase && hbBaseLbl) {
      const nxt = p.camp?.nextUpgradeCfg;
      const canUp = nxt && p.dust >= nxt.cost;
      hbBase.classList.toggle('tut-pulse', !!canUp);
      hbBase.title = nxt ? `Upgrade Camp to Lv.${nxt.level} ${nxt.name} (${nxt.cost} Banked Dust) [Key U]` : 'Max Camp Level 5';
      const baseTxt = nxt ? (g.isTouch ? `Lv.${p.camp.level} Camp` : `Lv.${p.camp.level} Camp [U]`) : `Lv.5 MAX`;
      if (hbBaseLbl.textContent !== baseTxt) hbBaseLbl.textContent = baseTxt;
    }
    const hbCraft = $('#hb-craft');
    if (hbCraft) {
      hbCraft.classList.remove('hidden');
      hbCraft.classList.toggle('tut-pulse', (g.mode === 'tutorial' && g.tutStep === 3) || (g.mode === 'valley' && curStep === 4));
      const em = hbCraft.querySelector('em');
      if (em) {
        const txt = g.isTouch ? 'Forge' : 'Forge [C]';
        if (em.textContent !== txt) em.textContent = txt;
      }
    }
    const hbMap = $('#hb-map');
    if (hbMap) {
      const em = hbMap.querySelector('em');
      if (em) {
        const txt = g.isTouch ? 'Map' : 'Map [M]';
        if (em.textContent !== txt) em.textContent = txt;
      }
    }
    const hbRelic = document.querySelector('[data-open="treasure"]');
    if (hbRelic) {
      hbRelic.classList.toggle('hidden', inStarterSteps);
      const em = hbRelic.querySelector('em');
      if (em) {
        const txt = g.isTouch ? 'Relics' : 'Relics [T]';
        if (em.textContent !== txt) em.textContent = txt;
      }
    }

    // Throttle recursive recipe checks to every 0.45s instead of 60 times/sec
    this._craftCheckT = (this._craftCheckT || 0) - dt;
    if (this._craftCheckT <= 0) {
      this._craftCheckT = 0.45;
      this._cachedCanCraft = this.canCraftAny();
      this._cachedQuickRecipe = g.getQuickCraftRecipe ? g.getQuickCraftRecipe() : null;
    }
    const craftBadge = $('#craft-badge');
    if (craftBadge) craftBadge.classList.toggle('hidden', !this._cachedCanCraft);

    // #bag-hud in #topleft already shows carried loot bag / raid status cleanly; keep #carry hidden so the center of the screen stays unobstructed
    const c = $('#carry');
    if (c) c.classList.add('hidden');

    // 1-Tap Quick-Forge HUD Pill (uses only Banked Camp Materials!)
    let qf = $('#quick-forge');
    if (!qf) {
      qf = document.createElement('button');
      qf.id = 'quick-forge';
      qf.className = 'quick-forge hidden';
      qf.onclick = () => {
        if (this.g.quickCraft()) {
          this._craftCheckT = 0;
          this.refreshPanels();
        }
      };
      $('#hud').appendChild(qf);
    }
    const qr = this._cachedQuickRecipe;
    if (qr && !this.panelOpen) {
      const qName = qr.gear ? GEAR[qr.out].name : ITEMS[qr.out].name;
      const qIcon = qr.gear && GEAR[qr.out].weaponImg ? GEAR[qr.out].weaponImg : ICON(qr.gear ? GEAR[qr.out].icon : qr.out);
      const qKey = qr.out + ':' + qName + ':' + (g.isTouch ? 1 : 0);
      if (this._lastQfKey !== qKey) {
        this._lastQfKey = qKey;
        qf.innerHTML = `<img src="${qIcon}"><span><b>${g.isTouch ? 'FORGE:' : 'FORGE [R]:'}</b> ${qName}</span>`;
      }
      qf.classList.remove('hidden');
    } else {
      qf.classList.add('hidden');
    }

    // prompt
    const it = g.currentInteraction;
    const pr = $('#prompt');
    let html = '';
    if (p.stun > 0) {
      html = `<div class="ptxt" style="color:#ffe04a">STUNNED (${p.stun.toFixed(1)}s) — Recovering...</div>`;
    } else if (p.hold) {
      const pct = Math.min(100, (p.hold.t / p.hold.need) * 100);
      const label = p.hold.kind === 'gather' && p.hold.node
        ? `Mining ${NODES[p.hold.node.type]?.name || 'Geode'} (Stage ${p.hold.node.stage || 1}/7)…`
        : p.hold.kind === 'raid_vault' && p.hold.camp
          ? `Raiding ${p.hold.camp.ownerName}'s Camp Vault…`
          : { gather: 'Mining Geode…', chest: 'Opening Relic Chest…' }[p.hold.kind] || 'Working…';
      html = `<div class="ptxt">${label}</div><div class="bar"><i style="width:${pct}%"></i></div>`;
    } else if (it && !g.isTouch) {
      if (it.kind === 'upgrade_base') {
        const nxt = p.camp?.nextUpgradeCfg;
        html = nxt
          ? `<div class="ptxt"><kbd>E</kbd> / <kbd>U</kbd> Upgrade Camp to <b>Lv.${nxt.level} ${nxt.name}</b> <span style="color:#ffd615">(${nxt.cost} Banked Dust · ${nxt.desc})</span></div>`
          : `<div class="ptxt">Camp is at <b>Max Level 5</b></div>`;
      } else if (it.kind === 'zone_portal') {
        html = `<div class="ptxt"><kbd>E</kbd> / <kbd>M</kbd> Open <b>Continent Map</b> (${it.zone.name} · Fast-Travel to 12 Biomes)</div>`;
      } else if (it.kind === 'forge_anvil') {
        html = `<div class="ptxt"><kbd>E</kbd> / <kbd>C</kbd> Open <b>Volcano Forge</b> <span style="color:#ffd615">(Uses Banked Camp Materials)</span></div>`;
      } else if (it.kind === 'relic_altar') {
        html = `<div class="ptxt"><kbd>E</kbd> Trade <b>3 Biome Coins</b> at Relic Altar to Awaken a Camp Trophy Shrine</div>`;
      } else if (it.kind === 'raid_vault') {
        const est = Math.max(95, Math.round((it.camp.owner?.dust || 0) * 0.25));
        html = `<div class="ptxt"><kbd>Hold E</kbd> Raid <b>${it.camp.ownerName}'s Unlocked Camp Vault</b> <span style="color:#ffd615">(Steal ~${est} Dust &amp; Gems)</span></div>`;
      } else if (it.kind === 'gather') {
        const cfg = NODES[it.node.type] || NODES.quartz;
        const stageImg = GEODE_STAGE_ICON(cfg.stageFolder, it.node.stage || 1);
        const drops = cfg.drops.map((dd) => `<img src="${ICON(dd[0])}" title="${ITEMS[dd[0]]?.name || dd[0]}">`).join('');
        html = `<div class="ptxt"><img src="${stageImg}" style="width:24px;height:24px;vertical-align:middle;margin-right:4px"><kbd>Click</kbd> / <kbd>Hold E</kbd> Mine <b>${cfg.name}</b> <span style="color:#ffd615">(Step ${cfg.step || 1} · Stage ${it.node.stage || 1}/7 · ${it.node.hp} HP)</span> ${drops}</div>`;
      } else if (it.kind === 'chest') {
        html = `<div class="ptxt"><kbd>Hold E</kbd> Open <b>Ancient Relic Chest</b> (Awakens Camp Trophy Shrine)</div>`;
      }
    }
    setHtml(pr, html);
    pr.classList.toggle('hidden', !html);

    // Update mobile touch action button state & label
    const actBtn = $('#btn-touch-act');
    const actLbl = $('#touch-act-lbl');
    if (actBtn && actLbl) {
      if (p.stun > 0) {
        actBtn.classList.remove('ready');
        actLbl.textContent = `${p.stun.toFixed(1)}s`;
      } else if (p.hold) {
        actBtn.classList.add('ready');
        actLbl.textContent = 'RAIDING…';
      } else if (it) {
        actBtn.classList.add('ready');
        actLbl.textContent = {
          upgrade_base: 'UPGRADE',
          zone_portal: 'MAP',
          forge_anvil: 'FORGE',
          relic_altar: 'RELICS',
          raid_vault: 'RAID',
          gather: 'MINE',
          chest: 'OPEN',
        }[it.kind] || 'ACT';
      } else {
        actBtn.classList.remove('ready');
        actLbl.textContent = 'ACT';
      }
    }

    // Quest / Tutorial Step Card (hide after the 5 tutorial cards are done)
    const qb = $('#quest-box');
    if (qb) {
      const stepObj = g.mode === 'tutorial'
        ? TUT_STEPS[Math.min(g.tutStep, TUT_STEPS.length - 1)]
        : g.getCurrentBounty();
      const isCard = inStarterSteps && stepObj;
      qb.classList.toggle('hidden', !isCard);
      qb.classList.toggle('starter-guide', !!isCard);
      if (isCard) {
        const sNum = stepObj.stepNum || curStep;
        const cardKey = `card:${g.mode}:${sNum}:${g.isTouch ? 1 : 0}`;
        if (this._lastQbKey !== cardKey) {
          this._lastQbKey = cardKey;
          const descTxt = g.isTouch
            ? (stepObj.text || '')
                .replace(/Click/g, 'Tap / BONK')
                .replace(/Press <b>\[R\]<\/b>/g, 'Tap <b>Forge [R]</b>')
                .replace(/Hold \[E\]/g, 'Hold ACT')
            : stepObj.text;
          qb.innerHTML = `
            <div class="tut-card-inner">
              <img class="tut-card-img" src="${stepObj.icon || '/assets/geodes/quartz/stage_4.png'}" alt="">
              <div class="tut-card-body">
                <div class="tut-card-title">${stepObj.cardTitle || stepObj.title}</div>
                <div class="tut-card-desc">${descTxt}</div>
              </div>
            </div>`;
          qb.classList.remove('card-pop');
          void qb.offsetWidth;
          qb.classList.add('card-pop');
        }
      }
    }

    const eb = $('#event-bar');
    if (eb) {
      const raider = g.activeCampRaider;
      if (raider) {
        const dist = Math.round(raider.pos.distanceTo(p.pos));
        const rKey = `raider:${raider.name}:${dist}:${raider.raidedFrom === p.camp ? 1 : 0}`;
        if (this._lastEbKey !== rKey) {
          this._lastEbKey = rKey;
          eb.innerHTML = `<span class="raider-alert-pill">🚨 CAMP RAIDER ALERT · FOLLOW RED ARROW</span> <b>${raider.name}</b> ${raider.raidedFrom === p.camp ? `stole ${Math.floor(raider.unbankedDust || 0)} Dust from your Camp` : 'is inside your Camp'} (${dist}m away) — Smash them once to recover 100% of your loot!`;
        }
        eb.classList.remove('hidden');
        eb.classList.add('raider-active');
      } else {
        this._lastEbKey = '';
        eb.classList.add('hidden');
        eb.classList.remove('raider-active');
      }
    }

    const lb = $('#leaderboard');
    if (lb) lb.classList.add('hidden');

    this.drawMinimap();
  }

  buildBg() {
    const S = 180;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const sc = isTutorialMap ? (S / (60 * 2.12)) : (S / 2000);
    x.save();
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    x.clip();
    if (!isTutorialMap && this.mapImg && this.mapImg.complete && this.mapImg.naturalWidth > 0) {
      x.drawImage(this.mapImg, 0, 0, S, S);
    } else {
      x.fillStyle = '#287bd1';
      x.fillRect(0, 0, S, S);
      x.fillStyle = '#' + BIOME_COLORS.meadow.getHexString();
      x.beginPath();
      x.arc(S / 2, S / 2, 65, 0, Math.PI * 2);
      x.fill();
    }
    x.restore();
    this.mmBg = c;
    this.mmScale = sc;
  }

  drawMinimap() {
    const g = this.g, x = this.mmc, S = 180, sc = this.mmScale;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, S, S);
    x.drawImage(this.mmBg, 0, 0);
    x.translate(S / 2, S / 2);
    const P = (v) => [v.x * sc, v.z * sc];
    for (const c of g.camps) {
      const [cx, cz] = P(c.center);
      x.fillStyle = '#c7a477';
      x.strokeStyle = c.isLocked(g.now) ? '#ff3b3b' : c.color;
      x.lineWidth = 2.5;
      x.beginPath(); x.arc(cx, cz, Math.max(4, c.R * sc), 0, Math.PI * 2); x.fill(); x.stroke();
    }
    for (const ch of g.chests) if (ch.alive) {
      const [cx, cz] = P(ch.pos);
      x.fillStyle = '#ffd84a'; x.strokeStyle = '#000'; x.lineWidth = 1;
      x.fillRect(cx - 2.5, cz - 2.5, 5, 5); x.strokeRect(cx - 2.5, cz - 2.5, 5, 5);
    }
    if (g.bosses) {
      for (const b of g.bosses) if (b.alive) {
        const [bx, bz] = P(b.pos);
        const pulse = 5.5 + Math.sin(g.t * 6) * 2.2;
        x.strokeStyle = b.cfg.color || '#ff3b3b';
        x.lineWidth = 2;
        x.beginPath();
        x.arc(bx, bz, pulse, 0, Math.PI * 2);
        x.stroke();
        x.fillStyle = b.cfg.color || '#ff3b3b';
        x.strokeStyle = '#000';
        x.lineWidth = 1.5;
        x.beginPath();
        x.arc(bx, bz, 4.2, 0, Math.PI * 2);
        x.fill();
        x.stroke();
      }
    }
    for (const a of g.actors) {
      const [cx, cz] = P(a.pos);
      if (g.activeCampRaider === a) {
        const [px, pz] = P(g.player.pos);
        x.save();
        x.strokeStyle = '#ff121e';
        x.lineWidth = 2.5;
        x.setLineDash([4, 3]);
        x.beginPath();
        x.moveTo(px, pz);
        x.lineTo(cx, cz);
        x.stroke();
        x.setLineDash([]);
        x.beginPath();
        x.arc(cx, cz, 7 + Math.sin(g.t * 10) * 2, 0, Math.PI * 2);
        x.stroke();
        x.restore();
      }
      x.save();
      x.translate(cx, cz);
      x.rotate(-a.yaw + Math.PI);
      x.fillStyle = g.activeCampRaider === a ? '#ff121e' : a.color;
      x.strokeStyle = a.isPlayer ? '#fff' : '#000';
      x.lineWidth = a.isPlayer ? 2 : 1;
      const s = a.isPlayer || g.activeCampRaider === a ? 6.5 : 4.5;
      x.beginPath(); x.moveTo(0, -s); x.lineTo(s * 0.8, s); x.lineTo(-s * 0.8, s); x.closePath(); x.fill(); x.stroke();
      x.restore();
    }
  }
}
