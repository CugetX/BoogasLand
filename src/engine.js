import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GAP } from './camp.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uVig: { value: 0.32 },
    uWarm: { value: 0.025 },
  },
  vertexShader:
    'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVig, uWarm; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c += vec3(uWarm, uWarm * 0.4, -uWarm);
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * uVig * 2.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// ============================================================================
// 1. SPATIAL HASH GRID & PHYSICS ENGINE (O(1) Collisions & Queries)
// ============================================================================
export class SpatialPhysicsEngine {
  constructor(cellSize = 18) {
    this.cellSize = cellSize;
    this.staticGrid = new Map();
    this.colliders = [];
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  buildStaticGrid(colliders = []) {
    this.colliders = colliders;
    this.staticGrid.clear();
    const cs = this.cellSize;
    for (const c of colliders) {
      const r = (c.r || 1) + 1.5;
      const minX = Math.floor((c.x - r) / cs);
      const maxX = Math.floor((c.x + r) / cs);
      const minZ = Math.floor((c.z - r) / cs);
      const maxZ = Math.floor((c.z + r) / cs);
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const k = this._key(gx, gz);
          let bucket = this.staticGrid.get(k);
          if (!bucket) {
            bucket = [];
            this.staticGrid.set(k, bucket);
          }
          bucket.push(c);
        }
      }
    }
  }

  pushOut(p, x, z, r) {
    const dx = p.x - x;
    const dz = p.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = x + (dx / d) * r;
      p.z = z + (dz / d) * r;
    }
  }

  resolveActorCollisions(actor, { nodes, actors, camps, now, isTutorialMap, sdfAt }) {
    const p = actor.pos;
    const cs = this.cellSize;
    const gx = Math.floor(p.x / cs);
    const gz = Math.floor(p.z / cs);

    // 1. O(1) Static World Colliders via Spatial Hash Bucket
    const bucket = this.staticGrid.get(this._key(gx, gz));
    if (bucket) {
      for (let i = 0; i < bucket.length; i++) {
        const c = bucket[i];
        this.pushOut(p, c.x, c.z, c.r + 0.4);
      }
    }

    // 2. Nearby Active 3D Geode Nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.alive && Math.abs(n.pos.x - p.x) < 4 && Math.abs(n.pos.z - p.z) < 4) {
        this.pushOut(p, n.pos.x, n.pos.z, n.r + 0.35);
      }
    }

    // 3. Soft Actor-to-Actor Separation
    for (let i = 0; i < actors.length; i++) {
      const o = actors[i];
      if (o === actor) continue;
      const dx = p.x - o.pos.x;
      const dz = p.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 0.0001) {
        p.x += (dx / d) * (0.9 - d) * 0.5;
        p.z += (dz / d) * (0.9 - d) * 0.5;
      }
    }

    // 4. Camp Palisade Walls & Locked Boulder Gates
    for (let i = 0; i < camps.length; i++) {
      const c = camps[i];
      const dx = p.x - c.center.x;
      const dz = p.z - c.center.z;
      const d = Math.hypot(dx, dz);
      if (Math.abs(d - c.R) > 1.0) continue;
      let ad = Math.atan2(dz, dx) - c.entranceAngle;
      ad = Math.abs(Math.atan2(Math.sin(ad), Math.cos(ad)));
      const pd = Math.hypot(actor.prev.x - c.center.x, actor.prev.z - c.center.z);
      const wasInside = pd < c.R;
      let blocked = ad > GAP - 0.05;
      if (!blocked && c.isLocked(now) && c.owner !== actor && !wasInside) blocked = true;
      if (blocked) {
        const target = wasInside ? c.R - 1.0 : c.R + 1.0;
        p.x = c.center.x + (dx / d) * target;
        p.z = c.center.z + (dz / d) * target;
      } else {
        for (const s of [-1, 1]) {
          const ang = c.entranceAngle + s * (GAP + 0.03);
          this.pushOut(p, c.center.x + Math.cos(ang) * c.R, c.center.z + Math.sin(ang) * c.R, 0.95);
        }
      }
    }

    // 5. World Boundary & Continent SDF Shoreline Keep-On-Land
    if (isTutorialMap) {
      const r = Math.hypot(p.x, p.z);
      if (r > 56) {
        p.x *= 56 / r;
        p.z *= 56 / r;
      }
    } else {
      if (sdfAt(p.x, p.z) < -1.1) {
        p.x = actor.prev.x;
        p.z = actor.prev.z;
      }
      const r = Math.hypot(p.x, p.z);
      if (r > 960) {
        p.x *= 960 / r;
        p.z *= 960 / r;
      }
    }
  }
}

// ============================================================================
// 2. ZONE CHUNK STREAMER & CSS2D DOM CULLER (Mobile/Web GPU & DOM Booster)
// ============================================================================
export class ZoneChunkStreamer {
  constructor(isMobile = false) {
    this.activeMeshRadius = isMobile ? 195 : 265; // Stream 3D Geodes across the active biome vista
    this.activeCrystalRadius = isMobile ? 140 : 185;
    this.tick = 0;
  }

  update(dt, focusPos, { nodes, crystals, bosses, camps, hubLabels, actors }) {
    const fx = focusPos.x;
    const fz = focusPos.z;
    const maxNodeD2 = this.activeMeshRadius * this.activeMeshRadius;
    const maxCrysD2 = this.activeCrystalRadius * this.activeCrystalRadius;

    // 0. Cull distant Rival Actor nametags (> 38m) & meshes (> 165m)
    if (actors) {
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        if (a.isPlayer) continue;
        const dx = a.pos.x - fx;
        const dz = a.pos.z - fz;
        const d2 = dx * dx + dz * dz;
        a.root.visible = d2 < maxNodeD2;
        if (a.tagObj) a.tagObj.visible = d2 < 38 * 38;
      }
    }

    // 1. Stream 3D Geode Nodes & sync CSS2DObject.visible so CSS2DRenderer skips hidden DOM nodes!
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const dx = n.pos.x - fx;
      const dz = n.pos.z - fz;
      const d2 = dx * dx + dz * dz;
      const inChunk = d2 < maxNodeD2;
      if (n.alive || n.crackAnim > 0) {
        n.mesh.visible = inChunk;
      } else {
        n.mesh.visible = false;
      }
      if (n.lbl && n.el) {
        n.lbl.visible = inChunk && !n.el.classList.contains('hidden');
      }
    }

    // 2. Stream Dust Crystals
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      if (!c.alive || !c.sprite) continue;
      const dx = c.pos.x - fx;
      const dz = c.pos.z - fz;
      c.sprite.visible = dx * dx + dz * dz < maxCrysD2;
    }

    // 3. Sync Boss CSS2D labels
    if (bosses) {
      for (let i = 0; i < bosses.length; i++) {
        const b = bosses[i];
        if (b.lbl && b.el) {
          b.lbl.visible = b.alive && !b.el.classList.contains('hidden');
        }
      }
    }

    // 4. Sync Hub & Zone Waypoint CSS2D labels
    if (hubLabels) {
      for (let i = 0; i < hubLabels.length; i++) {
        const hl = hubLabels[i];
        if (hl.lbl && hl.el) {
          hl.lbl.visible = !hl.el.classList.contains('hidden');
        }
      }
    }

    // 5. Cull distant Camp point-lights & hidden CSS2D labels
    if (camps) {
      for (let i = 0; i < camps.length; i++) {
        const c = camps[i];
        const dx = c.center.x - fx;
        const dz = c.center.z - fz;
        const nearCamp = dx * dx + dz * dz < 140 * 140;
        if (c.fireLight) c.fireLight.visible = nearCamp;
        for (let j = 0; j < c.nests.length; j++) {
          const ns = c.nests[j];
          if (ns.lbl && ns.el) {
            ns.lbl.visible = nearCamp && !ns.el.classList.contains('hidden');
          }
        }
      }
    }
  }
}

// ============================================================================
// 3. UNIFIED DESKTOP + MOBILE TOUCH + TAP-TO-ACT INPUT ENGINE
// ============================================================================
export class UnifiedInputEngine {
  constructor(engine, game) {
    this.engine = engine;
    this.game = game;
    this.keys = {};
    this.mouseDown = false;
    this.eHeld = false;
    this.bonkHeld = false;
    this.joyX = 0;
    this.joyY = 0;
    this.touchJump = false;
    this.lastCamDragAt = -10;

    // Auto-pilot / Tap-to-Walk & Tap-to-Act state for Mobile & Web
    this.autoTarget = null; // { pos: Vector3, kind: 'move'|'geode'|'interact', ref: any }
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this._bindAll();
  }

  haptic(pattern = 10) {
    try {
      if (this.engine.isTouch && navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {
      /* ignore */
    }
  }

  clearAutoTarget() {
    this.autoTarget = null;
  }

  /** Magnetic target assist so club swings on Mobile & Web always face the nearest Geode/Boss/Raider! */
  applyMagneticAimAssist(player) {
    if (!player || player.stun > 0) return;
    const g = this.game;
    let bestPos = null;
    let bestScore = 3.6; // within 3.6m

    // 1. Check active Bosses
    if (g.bosses) {
      for (const b of g.bosses) {
        if (!b.alive) continue;
        const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) - b.r;
        if (d < bestScore) {
          bestScore = d;
          bestPos = b.pos;
        }
      }
    }

    // 2. Check Rival Actors (outside safe hub)
    if (!player.isInSafeHub) {
      for (const o of g.actors) {
        if (o === player || o.stun > 0 || o.isInSafeHub) continue;
        const d = Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z);
        if (d < bestScore) {
          bestScore = d;
          bestPos = o.pos;
        }
      }
    }

    // 3. Check 3D Geodes
    for (const n of g.nodes) {
      if (!n.alive) continue;
      const d = Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z) - n.r;
      if (d < bestScore) {
        bestScore = d;
        bestPos = n.pos;
      }
    }

    // 4. Check Rival Locked Boulder Gates, Guard Turrets & Vine Traps
    for (const c of g.camps) {
      if (c === player.camp) continue;
      if (c.isLocked(g.now)) {
        const gp = c.boulderWorldPos();
        const d = Math.hypot(gp.x - player.pos.x, gp.z - player.pos.z);
        if (d < bestScore + 0.8) {
          bestScore = d;
          bestPos = gp;
        }
      }
      const maxT = c.upgradeCfg?.turrets || 0;
      for (let i = 0; i < maxT && i < c.turretMeshes.length; i++) {
        const tm = c.turretMeshes[i];
        if (!tm || !tm.grp.visible || g.now < (tm.disabledUntil || 0)) continue;
        const d = Math.hypot(tm.worldPos.x - player.pos.x, tm.worldPos.z - player.pos.z);
        if (d < bestScore + 0.4) {
          bestScore = d;
          bestPos = tm.worldPos;
        }
      }
      for (const tr of c.traps) {
        const d = Math.hypot(tr.pos.x - player.pos.x, tr.pos.z - player.pos.z);
        if (d < bestScore) {
          bestScore = d;
          bestPos = tr.pos;
        }
      }
    }

    if (bestPos) {
      player.yaw = Math.atan2(bestPos.x - player.pos.x, bestPos.z - player.pos.z);
      player.root.rotation.y = player.yaw;
    }
  }

  /** Handle a 3D World Tap on Mobile or Click on Web to auto-walk & interact/bonk/move */
  handleWorldTap(clientX, clientY, allowGroundMove = true) {
    const g = this.game;
    if (!g.started || g.ui.panelOpen || !g.player || g.player.stun > 0) return false;

    this.ndc.x = (clientX / window.innerWidth) * 2 - 1;
    this.ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.engine.camera);

    const p = g.player;
    const ray = this.raycaster.ray;

    // 1. Check if the click/tap ray passes near any interactive 3D object (Geode, Rival, Boss, Gate, Vault, Upgrade Pad, Lock Slab, Forge)
    let bestTarget = null;
    let bestDist = 2.6; // Generous ray-to-sphere threshold for easy clicking/tapping

    const testSphere = (pos, radius, kind, ref) => {
      if (!pos || pos.distanceTo(p.pos) > 110) return;
      const center = new THREE.Vector3(pos.x, pos.y + 1.0, pos.z);
      const d = ray.distanceToPoint(center);
      if (d < radius && d < bestDist) {
        bestDist = d;
        bestTarget = { pos: pos.clone(), kind, ref };
      }
    };

    for (const n of g.nodes) {
      if (n.alive && n.mesh.visible) testSphere(n.pos, n.r + 1.25, 'geode', n);
    }
    if (!p.isInSafeHub) {
      for (const o of g.actors) {
        if (o !== p && o.stun <= 0 && !o.isInSafeHub) {
          testSphere(o.pos, 1.85, 'actor', o);
        }
      }
    }
    if (g.bosses) {
      for (const b of g.bosses) {
        if (b.alive) testSphere(b.pos, b.r + 1.5, 'boss', b);
      }
    }
    for (const ch of g.chests) {
      if (ch.alive) testSphere(ch.pos, 1.9, 'chest', ch);
    }
    if (p.camp) {
      if (p.camp.upgradeWorld) testSphere(p.camp.upgradeWorld, 2.1, 'upgrade_base', p.camp);
      if (p.camp.slabWorld) testSphere(p.camp.slabWorld, 2.1, 'lock_slab', p.camp);
    }
    for (const c of g.camps) {
      if (c === p.camp) continue;
      if (c.isLocked(g.now)) {
        testSphere(c.boulderWorldPos(), 2.3, 'boulder_gate', c);
      } else if (c.vaultWorld) {
        testSphere(c.vaultWorld, 2.3, 'raid_vault', c);
      }
    }
    if (g.forgePos) testSphere(g.forgePos, 2.5, 'forge', null);

    if (bestTarget) {
      this.autoTarget = bestTarget;
      g.puff(bestTarget.pos, '#ffd615');
      // If already within swing range of a clicked geode/actor/boss/gate, swing immediately too!
      if (
        ['geode', 'actor', 'boss', 'boulder_gate'].includes(bestTarget.kind) &&
        bestTarget.pos.distanceTo(p.pos) < 3.4
      ) {
        this.applyMagneticAimAssist(p);
        if (p.tryAttack()) g.sfx.whoosh();
      }
      return true;
    }

    // 2. If clicked/tapped on open ground, intersect ray with ground plane and walk there!
    if (allowGroundMove && ray.direction.y < -0.03) {
      const tPlane = (p.pos.y - ray.origin.y) / ray.direction.y;
      if (tPlane > 0.5 && tPlane < 140) {
        const hitX = ray.origin.x + ray.direction.x * tPlane;
        const hitZ = ray.origin.z + ray.direction.z * tPlane;
        const dx = hitX - p.pos.x;
        const dz = hitZ - p.pos.z;
        const d = Math.hypot(dx, dz);
        // If clicked very close to the player (< 2.6m), treat as an immediate club swing with aim assist
        if (d < 2.6) {
          this.applyMagneticAimAssist(p);
          if (p.tryAttack()) g.sfx.whoosh();
          return true;
        }
        const clampD = Math.min(d, 48);
        const dest = new THREE.Vector3(
          p.pos.x + (dx / d) * clampD,
          p.pos.y,
          p.pos.z + (dz / d) * clampD
        );
        this.autoTarget = { pos: dest, kind: 'move', ref: null };
        g.puff(dest, '#42f54b');
        return true;
      }
    }
    return false;
  }

  /** Compute frame movement vector (dx, dz) and jump state, blending keyboard, joystick, and tap auto-pilot */
  sampleMovement(dt) {
    const g = this.game;
    const p = g.player;
    const k = this.keys;

    let fx = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let sx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (this.joyX || this.joyY) {
      fx = THREE.MathUtils.clamp(fx - this.joyY, -1, 1);
      sx = THREE.MathUtils.clamp(sx + this.joyX, -1, 1);
    }

    const manualMove = Math.abs(fx) > 0.08 || Math.abs(sx) > 0.08;
    if (manualMove) {
      this.autoTarget = null;
      const yaw = g.cam.yaw;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      return {
        dx: fwd.x * fx + right.x * sx,
        dz: fwd.z * fx + right.z * sx,
        jump: !!k.Space || this.touchJump,
        manualMove: true,
      };
    }

    // If Click/Tap-to-Act Auto-Pilot is active, steer Rok toward the target and act on arrival!
    if (this.autoTarget && p && p.stun <= 0) {
      const t = this.autoTarget;
      if (t.kind === 'geode' && (!t.ref || !t.ref.alive)) {
        this.autoTarget = null;
      } else if (t.kind === 'boss' && (!t.ref || !t.ref.alive)) {
        this.autoTarget = null;
      } else if (t.kind === 'actor' && (!t.ref || t.ref.stun > 0 || t.ref.isInSafeHub)) {
        this.autoTarget = null;
      } else if (t.kind === 'boulder_gate' && (!t.ref || !t.ref.isLocked(g.now))) {
        this.autoTarget = null;
      } else {
        // Track moving targets dynamically (e.g. rival actors or bosses)
        if (t.kind === 'actor' && t.ref) t.pos.copy(t.ref.pos);
        if (t.kind === 'boss' && t.ref) t.pos.copy(t.ref.pos);
        const tx = t.pos.x - p.pos.x;
        const tz = t.pos.z - p.pos.z;
        const dist = Math.hypot(tx, tz);
        const stopDist =
          t.kind === 'move'
            ? 0.65
            : t.kind === 'geode'
              ? (t.ref?.r || 1.2) + 1.55
              : t.kind === 'actor'
                ? 2.15
                : t.kind === 'boss'
                  ? 2.6
                  : t.kind === 'boulder_gate'
                    ? 2.25
                    : t.kind === 'lock_slab'
                      ? 0.6
                      : 2.1;

        if (dist > stopDist) {
          return {
            dx: tx / dist,
            dz: tz / dist,
            jump: !!k.Space || this.touchJump,
            manualMove: false,
          };
        } else {
          // Arrived at clicked/tapped 3D object -> automatically BONK or INTERACT!
          if (t.kind === 'move') {
            this.autoTarget = null;
          } else {
            p.yaw = Math.atan2(tx, tz);
            p.root.rotation.y = p.yaw;
            if (t.kind === 'geode' || t.kind === 'boss' || t.kind === 'actor' || t.kind === 'boulder_gate') {
              if (p.tryAttack()) g.sfx.whoosh();
            } else if (t.kind === 'upgrade_base') {
              g.upgradeBase(p);
              this.autoTarget = null;
            } else if (t.kind === 'forge') {
              g.ui.togglePanel('craft');
              this.autoTarget = null;
            } else if (t.kind === 'lock_slab') {
              this.autoTarget = null;
            } else if (t.kind === 'raid_vault' || t.kind === 'chest') {
              this.eHeld = true;
              this.autoTarget = null;
            }
          }
        }
      }
    }

    return {
      dx: 0,
      dz: 0,
      jump: !!k.Space || this.touchJump,
      manualMove: false,
    };
  }

  _bindAll() {
    const g = this.game;
    const k = this.keys;
    const sfx = g.sfx;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      k[code] = true;
      if (!g.started) return;
      if (code === 'KeyC' || code === 'Tab') {
        e.preventDefault();
        g.ui.togglePanel('craft');
      }
      if (code === 'KeyM') {
        e.preventDefault();
        g.ui.togglePanel('map');
      }
      if (code === 'KeyU') {
        e.preventDefault();
        g.upgradeBase(g.player);
      }
      if (code === 'KeyT') g.ui.togglePanel('treasure');
      if (code === 'KeyH') g.ui.togglePanel('help');
      if (code === 'Escape') g.ui.closePanels();
      if (code === 'KeyF') {
        this.applyMagneticAimAssist(g.player);
        g.player.tryAttack() && sfx.whoosh();
      }
      if (code === 'KeyR') g.quickCraft();
      if (code === 'KeyG') g.placeTrap(g.player);
      if (code === 'Digit1') g.triggerEmote(g.player, 1);
      if (code === 'Digit2') g.triggerEmote(g.player, 2);
      if (code === 'Digit3') g.triggerEmote(g.player, 3);
      if (code === 'Digit4') g.triggerEmote(g.player, 4);
      if (code === 'KeyJ') g.switchMode(g.mode === 'tutorial' ? 'valley' : 'tutorial');
      if (code === 'KeyQ') this.engine.toggleQuality();
      if (code === 'KeyE') {
        this.eHeld = true;
        g.interactPress();
      }
    });

    addEventListener('keyup', (e) => {
      k[e.code] = false;
      if (e.code === 'KeyE') this.eHeld = false;
    });

    const el = this.engine.renderer.domElement;
    const lbl = this.engine.labels.domElement;

    // Free-Cursor Desktop & Web Mouse Controls:
    // - Never locks or hides the cursor!
    // - Click on any Geode, Rival, Boss, Camp Pad, or Ground to walk there & auto-mine/bonk/interact
    // - Drag (Left or Right mouse button) to orbit the camera whenever desired
    let isDraggingCam = false;
    let dragMoved = 0;
    let downX = 0;
    let downY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let downBtn = 0;

    const onDown = (e) => {
      if (g.isTouch) return;
      if (!g.started || g.ui.panelOpen) return;
      isDraggingCam = true;
      dragMoved = 0;
      downBtn = e.button;
      downX = lastMouseX = e.clientX;
      downY = lastMouseY = e.clientY;
      sfx.unlock();
    };

    el.addEventListener('mousedown', onDown);
    lbl.addEventListener('mousedown', onDown);
    addEventListener('contextmenu', (e) => {
      if (g.started && !g.ui.panelOpen) e.preventDefault();
    });

    addEventListener('mousemove', (e) => {
      if (!isDraggingCam || !g.started || g.ui.panelOpen) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      dragMoved += Math.hypot(dx, dy);
      if (dragMoved > 6) {
        this.lastCamDragAt = g.now || 0;
        g.cam.yaw -= dx * 0.0048;
        g.cam.pitch = THREE.MathUtils.clamp(g.cam.pitch + dy * 0.004, 0.12, 1.25);
      }
    });

    addEventListener('mouseup', (e) => {
      if (!isDraggingCam) return;
      isDraggingCam = false;
      if (g.isTouch || !g.started || g.ui.panelOpen) return;
      // Clean click (not a camera drag) -> Click-to-Move / Click-to-Mine / Click-to-Bonk!
      if (dragMoved <= 10 && downBtn === 0) {
        this.handleWorldTap(downX, downY, true);
      }
    });

    addEventListener(
      'wheel',
      (e) => {
        if (g.ui.panelOpen) return;
        g.cam.dist = THREE.MathUtils.clamp(g.cam.dist + Math.sign(e.deltaY) * 0.9, 4, 18);
      },
      { passive: true }
    );

    // --- Mobile & Multi-Touch Controls ---
    const markTouch = () => {
      if (!g.isTouch) {
        g.isTouch = true;
        this.engine.isTouch = true;
        document.body.classList.add('is-touch');
        const ch = document.getElementById('clickhint');
        if (ch) ch.classList.add('hidden');
      }
    };

    // 1. Virtual Joystick (#touch-joy) + Dynamic Left-Thumb Floating Zone
    const joyEl = document.getElementById('touch-joy');
    const stickEl = document.getElementById('touch-stick');
    let joyTouchId = null;
    let joyCenter = { x: 0, y: 0 };
    const maxJoyR = 38;
    const startJoyAt = (touch, floating = false) => {
      joyTouchId = touch.identifier;
      if (joyEl) {
        if (floating) {
          const half = joyEl.offsetWidth ? joyEl.offsetWidth / 2 : 45;
          joyEl.style.left = `${Math.max(8, Math.min(window.innerWidth * 0.42 - half, touch.clientX - half))}px`;
          joyEl.style.bottom = `${Math.max(8, Math.min(window.innerHeight * 0.48 - half, window.innerHeight - touch.clientY - half))}px`;
          joyCenter = { x: touch.clientX, y: touch.clientY };
        } else {
          const rect = joyEl.querySelector('.joy-ring').getBoundingClientRect();
          joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        joyEl.classList.add('active');
      }
      updateJoy(touch.clientX, touch.clientY);
    };
    const updateJoy = (clientX, clientY) => {
      const dx = clientX - joyCenter.x;
      const dy = clientY - joyCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, maxJoyR);
      const nx = dist > 0.001 ? dx / dist : 0;
      const ny = dist > 0.001 ? dy / dist : 0;
      this.joyX = (nx * clamped) / maxJoyR;
      this.joyY = (ny * clamped) / maxJoyR;
      if (stickEl) {
        stickEl.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
      }
    };
    const resetJoy = () => {
      joyTouchId = null;
      this.joyX = 0;
      this.joyY = 0;
      if (stickEl) stickEl.style.transform = 'translate(0px, 0px)';
      if (joyEl) {
        joyEl.classList.remove('active');
        joyEl.style.left = '';
        joyEl.style.bottom = '';
      }
    };
    if (joyEl) {
      joyEl.addEventListener(
        'touchstart',
        (e) => {
          markTouch();
          e.preventDefault();
          e.stopPropagation();
          sfx.unlock();
          startJoyAt(e.changedTouches[0], false);
        },
        { passive: false }
      );
      joyEl.addEventListener(
        'touchmove',
        (e) => {
          if (joyTouchId === null) return;
          for (const t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
              e.preventDefault();
              updateJoy(t.clientX, t.clientY);
              break;
            }
          }
        },
        { passive: false }
      );
      joyEl.addEventListener('touchend', (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyTouchId) {
            resetJoy();
            break;
          }
        }
      });
      joyEl.addEventListener('touchcancel', resetJoy);
    }

    // 2. Touch Camera Drag, Pinch-to-Zoom, Dynamic Left-Thumb Joystick & Tap-on-3D-World!
    let camTouchId = null;
    let lastCamX = 0;
    let lastCamY = 0;
    let camTouchMoved = 0;
    let camTouchStartX = 0;
    let camTouchStartY = 0;
    let camTouchStartTime = 0;
    let pinchStartDist = 0;
    let pinchStartCamDist = 9;

    addEventListener(
      'touchstart',
      (e) => {
        markTouch();
        if (!g.started || g.ui.panelOpen) return;
        if (e.touches.length === 2 && joyTouchId === null) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchStartDist = Math.hypot(dx, dy);
          pinchStartCamDist = g.cam.dist;
          return;
        }
        for (const t of e.changedTouches) {
          const tag =
            t.target && t.target.closest
              ? t.target.closest(
                  '#touch-joy, #touch-actions, #hotbar, #topleft, #quest-box, #minimap, #quick-forge, .panel'
                )
              : null;
          if (tag) continue;
          // Lower-left thumb zone automatically engages floating virtual joystick if not already active!
          if (
            joyTouchId === null &&
            t.clientX < window.innerWidth * 0.42 &&
            t.clientY > window.innerHeight * 0.56
          ) {
            sfx.unlock();
            startJoyAt(t, true);
            continue;
          }
          if (camTouchId === null) {
            camTouchId = t.identifier;
            lastCamX = camTouchStartX = t.clientX;
            lastCamY = camTouchStartY = t.clientY;
            camTouchMoved = 0;
            camTouchStartTime = performance.now();
            sfx.unlock();
            break;
          }
        }
      },
      { passive: true }
    );

    addEventListener(
      'touchmove',
      (e) => {
        if (!g.started || g.ui.panelOpen) return;
        if (joyTouchId !== null) {
          for (const t of e.changedTouches) {
            if (t.identifier === joyTouchId) {
              updateJoy(t.clientX, t.clientY);
              break;
            }
          }
        }
        if (e.touches.length === 2 && pinchStartDist > 10 && joyTouchId === null) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const curDist = Math.hypot(dx, dy);
          const ratio = pinchStartDist / Math.max(20, curDist);
          g.cam.dist = THREE.MathUtils.clamp(pinchStartCamDist * ratio, 4.5, 18);
          return;
        }
        if (camTouchId === null) return;
        for (const t of e.changedTouches) {
          if (t.identifier === camTouchId) {
            const dx = t.clientX - lastCamX;
            const dy = t.clientY - lastCamY;
            lastCamX = t.clientX;
            lastCamY = t.clientY;
            camTouchMoved += Math.hypot(dx, dy);
            if (camTouchMoved > 8) this.lastCamDragAt = g.now || 0;
            g.cam.yaw -= dx * 0.0058;
            g.cam.pitch = THREE.MathUtils.clamp(g.cam.pitch + dy * 0.0045, -0.25, 1.25);
            break;
          }
        }
      },
      { passive: true }
    );

    const endCamTouch = (e) => {
      if (e.touches.length < 2) pinchStartDist = 0;
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) {
          resetJoy();
        }
        if (t.identifier === camTouchId) {
          const dtMs = performance.now() - camTouchStartTime;
          // Quick tap on the 3D viewport -> Raycast Tap-to-Act / Auto-Bonk!
          if (camTouchMoved < 14 && dtMs < 320 && g.started && !g.ui.panelOpen) {
            if (!this.handleWorldTap(camTouchStartX, camTouchStartY)) {
              this.applyMagneticAimAssist(g.player);
              if (g.player.tryAttack()) {
                sfx.whoosh();
                this.haptic(10);
              }
            } else {
              this.haptic(8);
            }
          }
          camTouchId = null;
        }
      }
    };
    addEventListener('touchend', endCamTouch, { passive: true });
    addEventListener('touchcancel', endCamTouch, { passive: true });

    // 3. Touch Action Buttons (BONK with Hold-to-Auto-Swing, JUMP, ACT / HOLD [E], plus Trap hotbar slot & Prompt)
    const bindHoldBtn = (btn, onPress, onRelease) => {
      if (!btn) return;
      btn.addEventListener(
        'touchstart',
        (e) => {
          markTouch();
          e.preventDefault();
          e.stopPropagation();
          sfx.unlock();
          btn.classList.add('pressed');
          onPress();
        },
        { passive: false }
      );
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        if (onRelease) onRelease();
      };
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        sfx.unlock();
        btn.classList.add('pressed');
        onPress();
      });
      btn.addEventListener('mouseup', () => {
        btn.classList.remove('pressed');
        if (onRelease) onRelease();
      });
    };

    bindHoldBtn(
      document.getElementById('btn-touch-bonk'),
      () => {
        this.bonkHeld = true;
        if (g.started && !g.ui.panelOpen) {
          this.applyMagneticAimAssist(g.player);
          if (g.player.tryAttack()) {
            sfx.whoosh();
            this.haptic(12);
          }
        }
      },
      () => {
        this.bonkHeld = false;
      }
    );
    bindHoldBtn(
      document.getElementById('btn-touch-jump'),
      () => {
        this.touchJump = true;
      },
      () => {
        this.touchJump = false;
      }
    );
    bindHoldBtn(
      document.getElementById('btn-touch-act'),
      () => {
        if (!g.started || g.ui.panelOpen) return;
        this.applyMagneticAimAssist(g.player);
        this.eHeld = true;
        g.interactPress();
      },
      () => {
        this.eHeld = false;
      }
    );
    bindHoldBtn(
      document.getElementById('prompt'),
      () => {
        if (!g.started || g.ui.panelOpen) return;
        this.eHeld = true;
        g.interactPress();
      },
      () => {
        this.eHeld = false;
      }
    );

    const hbTrap = document.getElementById('hb-trap');
    if (hbTrap) {
      hbTrap.style.cursor = 'pointer';
      hbTrap.addEventListener('click', (e) => {
        e.stopPropagation();
        if (g.started && !g.ui.panelOpen) g.placeTrap(g.player);
      });
    }
    const hbWeapon = document.getElementById('hb-weapon');
    if (hbWeapon) {
      hbWeapon.style.cursor = 'pointer';
      hbWeapon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (g.started && !g.ui.panelOpen) {
          this.applyMagneticAimAssist(g.player);
          g.player.tryAttack() && sfx.whoosh();
        }
      });
    }
  }
}

// ============================================================================
// 4. BOOGA UNIFIED 3D ENGINE (Mobile + Web Renderer, Adaptive Scaler & Loop)
// ============================================================================
export class BoogaEngine {
  constructor(canvasHost) {
    this.host = canvasHost;
    this.isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;
    this.isMobile =
      this.isTouch ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.innerWidth <= 920;

    if (this.isTouch) document.body.classList.add('is-touch');
    if (this.isMobile) document.body.classList.add('is-mobile');

    // 1. WebGLRenderer with mobile-optimized defaults
    this.maxDpr = this.isMobile ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 1.75);
    this.currentDpr = this.maxDpr;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(this.currentDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    canvasHost.appendChild(this.renderer.domElement);

    // 2. CSS2DRenderer for clean floating world labels
    this.labels = new CSS2DRenderer();
    this.labels.setSize(window.innerWidth, window.innerHeight);
    this.labels.domElement.className = 'labels';
    canvasHost.appendChild(this.labels.domElement);

    // 3. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.isMobile && window.innerHeight > window.innerWidth ? 68 : 60,
      window.innerWidth / window.innerHeight,
      0.15,
      1250
    );

    // 4. Post-Processing Pipeline (Desktop High-FX vs Zero-Overhead Mobile Direct Render)
    this.fx = !this.isMobile;
    this.composer = null;
    if (!this.isMobile) {
      this._initComposer();
    }

    // 5. Engine Subsystems
    this.physics = new SpatialPhysicsEngine(18);
    this.streamer = new ZoneChunkStreamer(this.isMobile);
    this.clock = new THREE.Clock();

    // Adaptive FPS Monitor
    this.fps = 60;
    this.lowFpsTimer = 0;
    this.highFpsTimer = 0;

    // 6. Responsive Resize & Orientation Handler
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.fov = this.isMobile && h > w ? 68 : 60;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.labels.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
    };
    addEventListener('resize', onResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
    }

    // 7. Page Visibility Pause (Prevents physics delta-time spike when switching mobile apps/tabs)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.clock.getDelta();
      }
    });
  }

  attachGame(game) {
    this.game = game;
    this.input = new UnifiedInputEngine(this, game);
    return this.input;
  }

  _initComposer() {
    if (this.composer) return;
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.HalfFloatType,
      samples: this.isMobile ? 0 : 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(Math.min(this.currentDpr, 1.5));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.28,
      0.5,
      1.05
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass(GradeShader));
  }

  toggleQuality() {
    this.fx = !this.fx;
    if (this.fx && !this.composer) this._initComposer();
    this.renderer.shadowMap.enabled = true;
    if (this.game && this.game.ui) {
      this.game.ui.toast(
        this.fx ? 'Graphics: HIGH (Bloom + Color Grade)' : 'Graphics: FAST MOBILE 60FPS',
        'diamond'
      );
    }
  }

  updateAdaptiveQuality(dt) {
    if (dt <= 0.0001 || dt >= 0.25) return;
    const instantFps = 1 / dt;
    this.fps = this.fps * 0.92 + instantFps * 0.08;

    if (this.fps < 44) {
      this.lowFpsTimer += dt;
      this.highFpsTimer = 0;
      if (this.lowFpsTimer > 1.6) {
        this.lowFpsTimer = 0;
        if (this.fx) {
          this.fx = false;
        } else if (this.currentDpr > 0.85) {
          this.currentDpr = Math.max(0.85, this.currentDpr - 0.15);
          this.renderer.setPixelRatio(this.currentDpr);
        }
      }
    } else if (this.fps > 57) {
      this.highFpsTimer += dt;
      this.lowFpsTimer = 0;
      if (this.highFpsTimer > 4.0 && this.currentDpr < this.maxDpr) {
        this.highFpsTimer = 0;
        this.currentDpr = Math.min(this.maxDpr, this.currentDpr + 0.1);
        this.renderer.setPixelRatio(this.currentDpr);
      }
    }
  }

  render() {
    if (this.fx) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
