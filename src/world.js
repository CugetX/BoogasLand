import * as THREE from 'three';
import { BAL, BOOGA_ZONES } from './config.js';
import { MAP_GRID_SIZE, MAP_WORLD_SPAN, MAP_SDF } from './map_data.js';
import { textures, scatterInstanced, findTexture, windUniforms, spawn, tint, stylizeMaterial } from './assets.js';

// ---------- deterministic random ----------
let _seed = 1337;
export function resetRand(s = 1337) { _seed = s | 0; }
export function rand() {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- layout ----------
export let isTutorialMap = false;
export function setTutorialMap(v) {
  isTutorialMap = !!v;
  BAL.campDist = isTutorialMap ? 42 : 120;
  BAL.worldRadius = isTutorialMap ? 64 : 980;
  BAL.trailRadius = isTutorialMap ? 24 : 36;
}

export const CAMP_ANGLES = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];

// 4 Camp Positions across the Expansive 2000x2000m Booga Continent:
// 0: Rok (Booga Town Valley), 1: James (Jungle Frontier), 2: Joaquim (Ancient Runes/Prairie), 3: Cuget (Golden Savannah)
const CONTINENT_CAMPS = [
  new THREE.Vector3(-36, 0, 290),
  new THREE.Vector3(-150, 0, 40),
  new THREE.Vector3(-300, 0, -190),
  new THREE.Vector3(150, 0, -300),
];

export const campCenter = (i) => {
  if (isTutorialMap) {
    return new THREE.Vector3(Math.cos(CAMP_ANGLES[i]) * BAL.campDist, 0, Math.sin(CAMP_ANGLES[i]) * BAL.campDist);
  }
  return (CONTINENT_CAMPS[i] || CONTINENT_CAMPS[0]).clone();
};

export const BIOME_COLORS = {
  meadow: new THREE.Color('#7ec452'),
  jungle: new THREE.Color('#489939'),
  badlands: new THREE.Color('#db9244'),
  frost: new THREE.Color('#cfe3f5'),
  lava: new THREE.Color('#d98b4e'),
};

export const VOLCANO_R = 26;
export const VOLCANO_POS = new THREE.Vector3(280, 0, -60); // Colossal East Jungle Volcano!
export function getVolcanoPos() {
  return isTutorialMap ? new THREE.Vector3(0, 0, 0) : VOLCANO_POS;
}

// ---------- Continent SDF Lookup (from Booga map.ai) ----------
export function sdfAt(x, z) {
  if (isTutorialMap) {
    const r = Math.hypot(x, z);
    return (60 - r) * 0.25;
  }
  const u = x / MAP_WORLD_SPAN + 0.5;
  const v = z / MAP_WORLD_SPAN + 0.5;
  if (u <= 0.01 || u >= 0.99 || v <= 0.01 || v >= 0.99) return -12;
  const gx = u * (MAP_GRID_SIZE - 1);
  const gy = v * (MAP_GRID_SIZE - 1);
  const x0 = Math.max(0, Math.min(MAP_GRID_SIZE - 2, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(MAP_GRID_SIZE - 2, Math.floor(gy)));
  const fx = gx - x0;
  const fy = gy - y0;
  const v00 = MAP_SDF[y0][x0];
  const v10 = MAP_SDF[y0][x0 + 1];
  const v01 = MAP_SDF[y0 + 1][x0];
  const v11 = MAP_SDF[y0 + 1][x0 + 1];
  const top = v00 * (1 - fx) + v10 * fx;
  const bot = v01 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bot * fy;
}

export function isLandAt(x, z, minSdf = -0.5) {
  return sdfAt(x, z) >= minSdf;
}

// ---------- Closest Booga Zone ----------
export function zoneAt(x, z) {
  if (isTutorialMap) return BOOGA_ZONES[0];
  let best = BOOGA_ZONES[0];
  let bestScore = 1e9;
  for (const zn of BOOGA_ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z) / (zn.radius || 165);
    if (d < bestScore) {
      bestScore = d;
      best = zn;
    }
  }
  return best;
}

export function biomeAt(x, z) {
  if (isTutorialMap) return 'meadow';
  return zoneAt(x, z).biome || 'meadow';
}

function zoneTerrainBlend(x, z) {
  if (isTutorialMap) {
    return {
      color: new THREE.Color('#9ccc63'),
      w: { meadow: 1, jungle: 0, badlands: 0, frost: 0, lava: 0 },
      baseH: 0,
      hillAmp: 1.0,
    };
  }
  const col = new THREE.Color(0, 0, 0);
  const w = { meadow: 0, jungle: 0, badlands: 0, frost: 0, lava: 0 };
  let baseH = 0;
  let hillAmp = 0;
  let tot = 0;
  const tmp = new THREE.Color();
  for (const zn of BOOGA_ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z);
    const normD = d / (zn.radius || 165);
    const weight = 1 / (0.14 + Math.pow(normD, 3.4));
    tot += weight;
    col.add(tmp.set(zn.terrainColor || '#88c959').multiplyScalar(weight));
    w[zn.biome] = (w[zn.biome] || 0) + weight;
    baseH += (zn.baseH || 1.2) * weight;
    hillAmp += (zn.hillAmp || 2.5) * weight;
  }
  if (tot > 0) {
    col.multiplyScalar(1 / tot);
    for (const k in w) w[k] /= tot;
    baseH /= tot;
    hillAmp /= tot;
  }
  // Golden sandy shoreline transition along the ocean coast
  const sdf = sdfAt(x, z);
  if (sdf < 3.2) {
    const beachMix = 1 - THREE.MathUtils.smoothstep(sdf, -1.5, 3.2);
    col.lerp(tmp.set('#f2d388'), beachMix * 0.85);
    w.badlands = THREE.MathUtils.lerp(w.badlands, 1.0, beachMix * 0.75);
  }
  return { color: col, w, baseH, hillAmp };
}

export function flatness(x, z) {
  if (isTutorialMap) return 0;
  let f = 1.0;
  // Flatten around all 12 Zone Centers so landmarks, temples & plazas sit cleanly
  for (const zn of BOOGA_ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z);
    const flatR = zn.id === 'booga_town' ? 42 : 28;
    f = Math.min(f, THREE.MathUtils.smoothstep(d, flatR, flatR + 28));
  }
  // Flatten around all 4 Camps
  for (let i = 0; i < 4; i++) {
    const c = campCenter(i);
    const d = Math.hypot(x - c.x, z - c.z);
    f = Math.min(f, THREE.MathUtils.smoothstep(d, BAL.campRadius + 6, BAL.campRadius + 24));
  }
  // Flatten around Volcano base
  const vp = getVolcanoPos();
  const dv = Math.hypot(x - vp.x, z - vp.z);
  f = Math.min(f, THREE.MathUtils.smoothstep(dv, VOLCANO_R + 4, VOLCANO_R + 22));
  return f;
}

function computeExactHeight(x, z) {
  const sdf = sdfAt(x, z);
  if (sdf < -0.6) {
    return Math.max(-4.0, sdf * 0.55);
  }
  const coastalLift = THREE.MathUtils.smoothstep(sdf, -0.6, 2.4);
  const { baseH, hillAmp } = zoneTerrainBlend(x, z);
  const f = flatness(x, z);
  const hills = (
    Math.sin(x * 0.018) * Math.cos(z * 0.017) * 1.45 +
    Math.sin(x * 0.042 + z * 0.038) * 0.65 +
    Math.cos(z * 0.075 - x * 0.032) * 0.32
  ) * hillAmp * f;
  return (0.2 + baseH * 0.85 + hills) * coastalLift;
}

// Pre-baked 320x320 Bilinear Heightmap Cache for O(1) Mobile/Web Physics across 2480x2480m!
const H_GRID = 320;
const H_SPAN = 2480;
let _heightCache = null;

function ensureHeightCache() {
  if (_heightCache) return _heightCache;
  _heightCache = new Float32Array(H_GRID * H_GRID);
  for (let gz = 0; gz < H_GRID; gz++) {
    const z = (gz / (H_GRID - 1) - 0.5) * H_SPAN;
    for (let gx = 0; gx < H_GRID; gx++) {
      const x = (gx / (H_GRID - 1) - 0.5) * H_SPAN;
      _heightCache[gz * H_GRID + gx] = computeExactHeight(x, z);
    }
  }
  return _heightCache;
}

export function heightAt(x, z) {
  if (isTutorialMap) {
    const r = Math.hypot(x, z);
    return r > 58 ? Math.min(12, Math.pow((r - 58) * 0.42, 1.3)) : 0;
  }
  const hc = ensureHeightCache();
  const u = x / H_SPAN + 0.5;
  const v = z / H_SPAN + 0.5;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return -4.0;
  const gx = u * (H_GRID - 1);
  const gz = v * (H_GRID - 1);
  const x0 = Math.max(0, Math.min(H_GRID - 2, gx | 0));
  const z0 = Math.max(0, Math.min(H_GRID - 2, gz | 0));
  const fx = gx - x0;
  const fz = gz - z0;
  const row0 = z0 * H_GRID + x0;
  const row1 = (z0 + 1) * H_GRID + x0;
  const top = hc[row0] * (1 - fx) + hc[row0 + 1] * fx;
  const bot = hc[row1] * (1 - fx) + hc[row1 + 1] * fx;
  return top * (1 - fz) + bot * fz;
}

function inCampZone(x, z, pad = 2) {
  const count = isTutorialMap ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const c = campCenter(i);
    if (Math.hypot(x - c.x, z - c.z) < BAL.campRadius + pad) return true;
  }
  return false;
}

// Road network connecting the 12 Expansive Booga Biomes & 4 Camps!
const ROAD_SEGMENTS = [
  [60, 240, -36, 290],      // Booga Town <-> Rok's Camp
  [60, 240, -140, 540],     // Booga Town <-> Sunny Coast
  [60, 240, 320, 220],      // Booga Town <-> Haunted Woods
  [60, 240, -40, 0],        // Booga Town <-> Jungle
  [-40, 0, -150, 40],       // Jungle <-> James's Camp
  [-40, 0, 280, -60],       // Jungle <-> East Volcano
  [-150, 40, -660, 320],    // West Jungle <-> X Jail Island Sea Causeway
  [-40, 0, -140, -200],     // Jungle <-> Rocky Prairie
  [-140, -200, -300, -190], // Prairie <-> Joaquim's Camp
  [-140, -200, -400, -260], // Prairie <-> Ancient Runes
  [-140, -200, 100, -380],  // Prairie <-> Golden Savannah
  [100, -380, 150, -300],   // Savannah <-> Cuget's Camp
  [100, -380, -200, -460],  // Savannah <-> Sunstone Desert
  [100, -380, 420, -400],   // Savannah <-> Mountain Range
  [100, -380, 80, -640],    // Savannah <-> Frozen Tundra
  [80, -640, 540, -700],    // Tundra <-> Lost Island Causeway
];

function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 0.001) return Math.hypot(px - x1, pz - z1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

function roadFactorAt(x, z) {
  if (isTutorialMap) {
    const r = Math.hypot(x, z);
    return 1 - THREE.MathUtils.smoothstep(Math.abs(r - BAL.trailRadius), 2.4, 3.9);
  }
  let bestD = 1e9;
  for (const [x1, z1, x2, z2] of ROAD_SEGMENTS) {
    const d = distToSegment(x, z, x1, z1, x2, z2);
    if (d < bestD) bestD = d;
  }
  return 1 - THREE.MathUtils.smoothstep(bestD, 4.2, 8.5);
}

// ---------- materials ----------
const matCache = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache[key]) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.72, flatShading: true, ...opts });
    stylizeMaterial(m, 0, 5.0, 0.58);
    matCache[key] = m;
  }
  return matCache[key];
}

export function rockMat(color, repeat = 3) {
  const t = textures.lava.clone();
  t.needsUpdate = true;
  t.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.95 });
}

// ---------- terrain + tropical ocean ----------
function terrain(scene, isMobile = false) {
  const size = isTutorialMap ? 260 : 2480;
  const seg = isTutorialMap ? 120 : (isMobile ? 250 : 320);
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const aW = new Float32Array(pos.count * 4);
  const aDirt = new Float32Array(pos.count);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const campCount = isTutorialMap ? 2 : 4;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const { color: zCol, w } = zoneTerrainBlend(x, z);
    c.copy(zCol);

    let dirt = roadFactorAt(x, z) * 0.88;
    for (let k = 0; k < campCount; k++) {
      const cc = campCenter(k);
      const d = Math.hypot(x - cc.x, z - cc.z);
      dirt = Math.max(dirt, 1 - THREE.MathUtils.smoothstep(d, BAL.campRadius - 1, BAL.campRadius + 3.5));
    }
    if (!isTutorialMap) {
      for (const zn of BOOGA_ZONES) {
        const dz = Math.hypot(x - zn.x, z - zn.z);
        if (zn.id === 'booga_town') {
          dirt = Math.max(dirt, (1 - THREE.MathUtils.smoothstep(dz, 28, 42)) * 0.92);
        } else {
          dirt = Math.max(dirt, (1 - THREE.MathUtils.smoothstep(dz, 10, 18)) * 0.78);
        }
      }
    }
    c.lerp(tmp.set('#c9a06c'), dirt);
    const n = (Math.sin(x * 0.025 + z * 0.02) * Math.cos(z * 0.025 - x * 0.015)) * 0.05;
    c.offsetHSL(0.01 * n * 8, 0, n);
    colors.set([c.r, c.g, c.b], i * 3);
    aW.set([w.meadow + w.jungle, w.badlands, w.frost, w.lava], i * 4);
    aDirt[i] = dirt;
  }

  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aW', new THREE.BufferAttribute(aW, 4));
  g.setAttribute('aDirt', new THREE.BufferAttribute(aDirt, 1));
  g.computeVertexNormals();

  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 });
  const T = textures;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tGrass: { value: T.jungle }, tSand: { value: T.sand }, tSnow: { value: T.snow }, tLava: { value: T.lava }, tDirt: { value: T.dirt },
      aGrass: { value: T.jungle_avg }, aSand: { value: T.sand_avg }, aSnow: { value: T.snow_avg }, aLava: { value: T.lava_avg }, aDirtC: { value: T.dirt_avg },
    });
    sh.vertexShader = 'attribute vec4 aW; attribute float aDirt; varying vec4 vW; varying float vDirt; varying vec3 vWP;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vW = aW; vDirt = aDirt; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform sampler2D tGrass, tSand, tSnow, tLava, tDirt; uniform vec3 aGrass, aSand, aSnow, aLava, aDirtC;
      varying vec4 vW; varying float vDirt; varying vec3 vWP;
      vec3 samp(sampler2D t, vec3 avg, vec2 uv) {
        vec3 a = texture2D(t, uv).rgb; vec3 b = texture2D(t, uv * 0.23 + 0.37).rgb;
        return (a * 0.6 + b * 0.4) / max(avg, vec3(0.02));
      }
      vec3 sampL(sampler2D t, vec3 avg, vec2 uv) {
        vec3 s = samp(t, avg, uv); float l = dot(s, vec3(0.299, 0.587, 0.114)); return vec3(l);
      }\n` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 uv = vWP.xz * 0.16;
        vec3 det = samp(tGrass, aGrass, uv) * vW.x + samp(tSand, aSand, uv * 0.8) * vW.y + sampL(tSnow, aSnow, uv * 0.7) * vW.z + sampL(tLava, aLava, uv * 0.6) * vW.w;
        float wsum = max(vW.x + vW.y + vW.z + vW.w, 0.001);
        det /= wsum;
        det = mix(det, samp(tDirt, aDirtC, uv * 1.2), vDirt);
        diffuseColor.rgb *= mix(vec3(1.0), clamp(det, 0.0, 2.0), 0.9);`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Sparkling Tropical Ocean Surrounding the Booga Continent!
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#207cc9',
    emissive: '#0c3563',
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.85;
  scene.add(water);

  return { mesh, water, waterMat };
}

function volcano(scene, colliders) {
  const vp = getVolcanoPos();
  const baseY = heightAt(vp.x, vp.z);
  const H = isTutorialMap ? 22 : 42;
  const volGroup = new THREE.Group();
  volGroup.position.set(vp.x, baseY, vp.z);
  scene.add(volGroup);

  const lavaMat = new THREE.MeshStandardMaterial({
    color: '#ff7a1a',
    emissive: '#ff4500',
    emissiveIntensity: 3.0,
    roughness: 0.22,
    flatShading: true,
  });
  const lavaBrightMat = new THREE.MeshStandardMaterial({
    color: '#ffbe2e',
    emissive: '#ff6a00',
    emissiveIntensity: 3.4,
    roughness: 0.18,
    flatShading: true,
  });
  const basaltDark = new THREE.MeshStandardMaterial({ color: '#382a28', roughness: 0.88, flatShading: true });
  const basaltMid = new THREE.MeshStandardMaterial({ color: '#4a3734', roughness: 0.86, flatShading: true });
  const basaltAsh = new THREE.MeshStandardMaterial({ color: '#2a1f1e', roughness: 0.92, flatShading: true });

  const styleVolcanoMesh = (obj, rockMatChoice = basaltMid, capMatChoice = lavaMat) => {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const applyMat = (m) => {
        const nm = (m?.name || '').toLowerCase();
        if (nm.includes('snow')) return capMatChoice;
        if (nm.includes('dirt')) return basaltAsh;
        return rockMatChoice;
      };
      o.material = Array.isArray(o.material) ? o.material.map(applyMat) : applyMat(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return obj;
  };

  const core1 = styleVolcanoMesh(spawn('mountain_2', H), basaltMid, lavaBrightMat);
  core1.scale.set(0.92, 1.0, 0.92);
  core1.position.set(0, -1.2, 0);
  volGroup.add(core1);

  const core2 = styleVolcanoMesh(spawn('mountain_2', H * 0.96), basaltDark, lavaMat);
  core2.scale.set(0.88, 1.0, 0.88);
  core2.position.set(0, -1.2, 0);
  core2.rotation.y = Math.PI * 0.5;
  volGroup.add(core2);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const isMajor = i % 2 === 0;
    const h = isMajor ? H * 0.65 : H * 0.52;
    const peak = styleVolcanoMesh(spawn('mountain_2', h), isMajor ? basaltDark : basaltMid, isMajor ? lavaMat : lavaBrightMat);
    peak.scale.set(0.68, 1.0, 0.68);
    const dist = isMajor ? VOLCANO_R * 0.35 : VOLCANO_R * 0.45;
    peak.position.set(Math.cos(a) * dist, -0.9, Math.sin(a) * dist);
    peak.rotation.y = -a;
    volGroup.add(peak);
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.35;
    const poolR = VOLCANO_R * 0.86;
    const px = Math.cos(a) * poolR, pz = Math.sin(a) * poolR;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.5, 18), lavaMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(px, 0.08, pz);
    volGroup.add(pool);
  }

  const smoke = [];
  for (let i = 0; i < 14; i++) {
    const smMat = new THREE.MeshStandardMaterial({
      color: '#bfb3aa',
      emissive: '#ff4a00',
      emissiveIntensity: 0.4,
      roughness: 1,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const p = spawn('cloud', 3.8, 'max');
    p.traverse((o) => { if (o.isMesh) { o.material = smMat; o.castShadow = false; } });
    p.userData.mat = smMat;
    p.userData.t = i / 14;
    p.userData.o = rand() * 6;
    scene.add(p);
    smoke.push(p);
  }
  colliders.push({ x: vp.x, z: vp.z, r: VOLCANO_R + 2.0 });

  return {
    update(dt, t, focus) {
      if (focus) {
        const dVol = Math.hypot(focus.x - vp.x, focus.z - vp.z);
        const nearVol = dVol < 340;
        volGroup.visible = nearVol;
        for (const p of smoke) p.visible = nearVol;
        if (!nearVol) return;
      }
      for (const p of smoke) {
        p.userData.t = (p.userData.t + dt * 0.045) % 1;
        const k = p.userData.t;
        p.position.set(vp.x + Math.sin(k * 6 + p.userData.o) * 2.4 + k * 9.5, baseY + H - 1.0 + k * 38, vp.z + Math.cos(k * 5 + p.userData.o) * 2.4 + k * 3.5);
        p.rotation.y = k * 1.5 + p.userData.o;
        p.scale.setScalar(1.0 + k * 4.2);
        p.userData.mat.opacity = 0.62 * (1 - k) * Math.min(1, k * 8);
      }
      const pulse = 2.8 + Math.sin(t * 2.8) * 0.55;
      lavaMat.emissiveIntensity = pulse;
      lavaBrightMat.emissiveIntensity = pulse + 0.5;
    },
  };
}

// ---------- Build Handcrafted Set-Piece Architecture for all 12 Expansive Biomes ----------
function buildZoneLandmarks(scene, colliders) {
  if (isTutorialMap) return;

  const placeProp = (modelName, x, z, height, rotY = 0, colR = 0) => {
    const obj = spawn(modelName, height);
    obj.position.set(x, heightAt(x, z), z);
    obj.rotation.y = rotY;
    scene.add(obj);
    if (colR > 0) colliders.push({ x, z, r: colR });
    return obj;
  };

  // 1. Waypoint Stone Gateways in every Zone Center
  for (const zn of BOOGA_ZONES) {
    const px = zn.x, pz = zn.z;
    const py = heightAt(px, pz);
    const portalGrp = new THREE.Group();
    portalGrp.position.set(px, py, pz);
    const pad = spawn('rock_path_wide', 5.2, 'max');
    pad.position.y = 0.02;
    portalGrp.add(pad);
    const arch = spawn(zn.step >= 3 ? 'arch_round' : 'arch', 6.4);
    arch.position.set(0, 0, -2.0);
    portalGrp.add(arch);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2.6, 32),
      new THREE.MeshBasicMaterial({ color: zn.color, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    portalGrp.add(ring);
    for (const s of [-1, 1]) {
      const tr = tint(spawn('torch_wood', 2.6), zn.color, { emissive: zn.color, emissiveIntensity: 2.2 }, /yellow/i);
      tr.position.set(s * 2.6, 0, -1.5);
      portalGrp.add(tr);
    }
    scene.add(portalGrp);
  }

  // 2. BOOGA TOWN (60, 240) — Fortified Tribal Town Square, Gatehouses, Watchtowers & Market
  const bt = BOOGA_ZONES.find((z) => z.id === 'booga_town');
  if (bt) {
    const townBuildings = [
      ['hut', -22, -16, 5.2, 2.2], ['hut_2', 22, -16, 5.2, 2.2],
      ['hut_storage', -26, 12, 4.8, 2.2], ['hut', 26, 12, 5.0, 2.2],
      ['hut_2', -18, 26, 4.8, 2.0], ['hut_storage', 18, 26, 4.8, 2.0],
      ['watch_tower', -16, -28, 7.8, 2.0], ['watch_tower_2', 16, -28, 7.4, 2.0],
      ['guard_tower', -32, -4, 7.2, 2.0], ['guard_tower', 32, -4, 7.2, 2.0],
      ['well', 12, 16, 2.8, 1.4], ['cart', -13, 16, 2.2, 1.4],
      ['tent', 0, -30, 4.2, 1.8], ['bonfire_stones', 0, 14, 1.2, 1.0],
    ];
    for (const [mName, ox, oz, sc, r] of townBuildings) {
      const wx = bt.x + ox, wz = bt.z + oz;
      placeProp(mName, wx, wz, sc, Math.atan2(bt.x - wx, bt.z - wz), r);
    }
  }

  // 3. SUNNY COAST (-140, 540) — Giant Coastal Sea Arches, Shipwreck Coves & Ribcages
  const cs = BOOGA_ZONES.find((z) => z.id === 'coast');
  if (cs) {
    placeProp('arch_round', cs.x - 32, cs.z + 24, 12.5, 0.4, 2.5);
    placeProp('arch_round', cs.x + 38, cs.z + 18, 11.0, -0.5, 2.5);
    placeProp('cart_broken', cs.x - 16, cs.z + 14, 2.6, 0.8, 1.5);
    placeProp('ribs', cs.x + 22, cs.z + 28, 3.8, -0.3, 1.8);
    placeProp('watch_tower', cs.x, cs.z - 34, 8.2, 0, 2.0);
  }

  // 4. HAUNTED WOODS (320, 220) — Ancient Bone Barrows, Ruined Wood Temples & Giant Fungi
  const hw = BOOGA_ZONES.find((z) => z.id === 'haunted_woods');
  if (hw) {
    placeProp('temple_wood', hw.x + 24, hw.z - 22, 8.8, -0.6, 3.8);
    placeProp('temple_wood', hw.x - 28, hw.z + 20, 7.6, 0.9, 3.4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      placeProp(i % 2 === 0 ? 'ribs' : 'skull_horned', hw.x + Math.cos(a) * 22, hw.z + Math.sin(a) * 22, 3.2, a, 1.4);
    }
  }

  // 5. X JAIL ISLAND (-660, 320) — Offshore Iron Fortress, Perimeter Walls & 4 Corner Beacons
  const xj = BOOGA_ZONES.find((z) => z.id === 'x_jail');
  if (xj) {
    const jx = xj.x, jz = xj.z - 16;
    const jy = heightAt(jx, jz);
    const fort = new THREE.Group();
    fort.position.set(jx, jy, jz);
    const slateMat = new THREE.MeshStandardMaterial({ color: '#4d556e', roughness: 0.75, flatShading: true });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#717c9e', roughness: 0.6, flatShading: true });
    const box = new THREE.Mesh(new THREE.BoxGeometry(18, 13, 18), slateMat);
    box.position.y = 6.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19.5, 1.4, 19.5), roofMat);
    roof.position.y = 13.5;
    fort.add(box, roof);
    scene.add(fort);
    colliders.push({ x: jx, z: jz, r: 9.5 });

    for (const [lx, lz] of [[-32, -32], [32, -32], [-32, 32], [32, 32]]) {
      const wx = xj.x + lx, wz = xj.z + lz;
      const tw = tint(spawn('watch_tower', 10.5), '#ffd615', { emissive: '#ffae00', emissiveIntensity: 1.8 }, /main/i);
      tw.position.set(wx, heightAt(wx, wz), wz);
      scene.add(tw);
      colliders.push({ x: wx, z: wz, r: 2.2 });
    }
  }

  // 6. ROCKY PRAIRIE (-140, -200) — Grand Stonehenge Megalith Ring & Stag Sanctuary
  const pr = BOOGA_ZONES.find((z) => z.id === 'prairie');
  if (pr) {
    const rx = pr.x - 24, rz = pr.z - 18;
    placeProp('stag_statue', rx, rz, 5.6, 0, 1.8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      placeProp('arch', rx + Math.cos(a) * 18, rz + Math.sin(a) * 18, 6.8, -a + Math.PI / 2, 1.6);
    }
  }

  // 7. ANCIENT RUNES (-400, -260) — Colossal 4-Tiered Stepped Ziggurat & Sacred Colonnade
  const ar = BOOGA_ZONES.find((z) => z.id === 'ancient_runes');
  if (ar) {
    const tx = ar.x - 22, tz = ar.z - 26;
    const ty = heightAt(tx, tz);
    const temple = new THREE.Group();
    temple.position.set(tx, ty, tz);
    const stoneGold = new THREE.MeshStandardMaterial({ color: '#c48f45', roughness: 0.82, flatShading: true });
    const stoneDark = new THREE.MeshStandardMaterial({ color: '#8a6230', roughness: 0.88, flatShading: true });
    const tiers = [
      [26, 3.2, 26, 1.6, stoneDark],
      [20, 3.2, 20, 4.8, stoneGold],
      [14, 3.0, 14, 7.9, stoneDark],
      [9, 2.8, 9, 10.8, stoneGold],
    ];
    for (const [w, h, d, y, m] of tiers) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = y;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      temple.add(mesh);
    }
    const sanctuary = spawn('temple_1', 7.5);
    sanctuary.position.y = 12.2;
    temple.add(sanctuary);
    scene.add(temple);
    colliders.push({ x: tx, z: tz, r: 13.0 });

    // Processional Colonnade of Ancient Arches & Fox Statues
    for (let i = 1; i <= 3; i++) {
      placeProp('arch_round', ar.x + i * 16, ar.z + i * 10, 7.8, 0.5, 1.8);
      placeProp('fox_statue', ar.x - i * 15, ar.z + i * 12, 4.5, -0.4, 1.5);
    }
  }

  // 8. GOLDEN SAVANNAH (100, -380) — Towering Red-Rock Canyon Mesas & Sculpted Oasis Spring
  const sv = BOOGA_ZONES.find((z) => z.id === 'savannah');
  if (sv) {
    const ox = sv.x + 28, oz = sv.z - 16;
    const oy = heightAt(ox, oz);
    const oasisGrp = new THREE.Group();
    oasisGrp.position.set(ox, oy, oz);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#b57b45', roughness: 0.9, flatShading: true });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 10.2, 2.4, 20), rimMat);
    rim.position.y = -0.5;
    oasisGrp.add(rim);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(7.6, 7.6, 0.25, 24),
      new THREE.MeshStandardMaterial({ color: '#1da1f2', emissive: '#0c4a6e', emissiveIntensity: 0.45, roughness: 0.12 })
    );
    water.position.y = 0.62;
    oasisGrp.add(water);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const palm = spawn(i % 2 === 0 ? 'palm_1' : 'palm_2', 7.5 + (i % 2) * 1.5);
      palm.position.set(Math.cos(a) * 8.2, 0.5, Math.sin(a) * 8.2);
      palm.rotation.y = a;
      oasisGrp.add(palm);
    }
    scene.add(oasisGrp);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const mx = sv.x - 20 + Math.cos(a) * 34;
      const mz = sv.z - 14 + Math.sin(a) * 28;
      placeProp(i % 2 === 0 ? 'rock_canyon_1' : 'rock_canyon_2', mx, mz, 11.5 + (i % 3) * 2.5, a, 3.8);
    }
  }

  // 9. SUNSTONE DESERT (-200, -460) — Twin Great Stepped Pharaoh Pyramids & Sphinx Guardians
  const ds = BOOGA_ZONES.find((z) => z.id === 'desert');
  if (ds) {
    const pyrMat = new THREE.MeshStandardMaterial({ color: '#e6b85c', roughness: 0.8, flatShading: true });
    for (const [ox, oz, sz] of [[-32, -26, 18], [28, -30, 13.5], [0, 34, 11]]) {
      const px = ds.x + ox, pz = ds.z + oz;
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(sz, sz * 1.2, 4), pyrMat);
      pyr.rotation.y = Math.PI / 4;
      pyr.position.set(px, heightAt(px, pz) + sz * 0.52, pz);
      pyr.castShadow = true;
      pyr.receiveShadow = true;
      scene.add(pyr);
      colliders.push({ x: px, z: pz, r: sz * 0.68 });
    }
    placeProp('stag_statue', ds.x - 14, ds.z - 8, 6.2, 0, 2.0);
    placeProp('stag_statue', ds.x + 14, ds.z - 8, 6.2, 0, 2.0);
  }

  // 10. MOUNTAIN RANGE (420, -400) — Colossal Alpine Spires, Crystal Caverns & Pink Cloud Crown
  const mr = BOOGA_ZONES.find((z) => z.id === 'mountain_range');
  if (mr) {
    const peaks = [
      ['mountain_2', 18, -24, 46, 12],
      ['mountain_1', -32, -28, 38, 10],
      ['mountain_group', 36, 22, 34, 10],
      ['mountain_2', -28, 30, 32, 9],
    ];
    for (const [mName, ox, oz, h, r] of peaks) {
      const wx = mr.x + ox, wz = mr.z + oz;
      const pk = spawn(mName, h);
      pk.position.set(wx, heightAt(wx, wz) - 1.5, wz);
      scene.add(pk);
      colliders.push({ x: wx, z: wz, r });
    }
    const pinkMat = new THREE.MeshStandardMaterial({ color: '#ff85e4', emissive: '#ff3bd4', emissiveIntensity: 1.4, transparent: true, opacity: 0.78 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cl = spawn('cloud', 4.8, 'max');
      cl.traverse((o) => { if (o.isMesh) o.material = pinkMat; });
      cl.position.set(mr.x + 18 + Math.cos(a) * 15, heightAt(mr.x + 18, mr.z - 24) + 26, mr.z - 24 + Math.sin(a) * 15);
      scene.add(cl);
    }
  }

  // 11. FROZEN TUNDRA (80, -640) — Glacial Ice Spires & Frost Sanctum
  const td = BOOGA_ZONES.find((z) => z.id === 'tundra');
  if (td) {
    const iceMat = new THREE.MeshStandardMaterial({ color: '#8ffcff', emissive: '#00b4d8', emissiveIntensity: 0.85, roughness: 0.15, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ix = td.x + Math.cos(a) * 28;
      const iz = td.z + Math.sin(a) * 28;
      const spire = spawn('crystal_big', 7.5 + (i % 3) * 2.2);
      spire.traverse((o) => { if (o.isMesh) o.material = iceMat; });
      spire.position.set(ix, heightAt(ix, iz), iz);
      spire.rotation.y = a;
      scene.add(spire);
      colliders.push({ x: ix, z: iz, r: 2.0 });
    }
  }

  // 12. LOST ISLAND (540, -700) — Twin Cyborg Reactor Towers & Neon Conduit Pylons
  const li = BOOGA_ZONES.find((z) => z.id === 'lost_island');
  if (li) {
    const steelMat = new THREE.MeshStandardMaterial({ color: '#5c768d', metalness: 0.55, roughness: 0.4, flatShading: true });
    const neonMat = new THREE.MeshStandardMaterial({ color: '#00f5ff', emissive: '#00d9ff', emissiveIntensity: 2.5 });
    for (const [ox, oz, sc] of [[-18, -22, 1.45], [18, -18, 1.2]]) {
      const fx = li.x + ox, fz = li.z + oz;
      const fy = heightAt(fx, fz);
      const fac = new THREE.Group();
      fac.position.set(fx, fy, fz);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2 * sc, 5.0 * sc, 7.5 * sc, 10), steelMat);
      base.position.y = 3.75 * sc;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.8 * sc, 2.4 * sc, 14 * sc, 10), steelMat);
      stack.position.y = 9.0 * sc;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6 * sc, 0.38 * sc, 8, 24), neonMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 5.5 * sc;
      fac.add(base, stack, ring);
      scene.add(fac);
      colliders.push({ x: fx, z: fz, r: 4.8 * sc });
    }
  }
}

function sampleContinentPoints(count, filterFn) {
  const out = [];
  for (let i = 0; i < count * 8 && out.length < count; i++) {
    const x = (rand() - 0.5) * 1720;
    const z = (rand() - 0.5) * 1720;
    if (sdfAt(x, z) < 2.0) continue;
    if (inCampZone(x, z, 4.5)) continue;
    if (roadFactorAt(x, z) > 0.32) continue;
    const vp = getVolcanoPos();
    if (Math.hypot(x - vp.x, z - vp.z) < VOLCANO_R + 6) continue;
    if (BOOGA_ZONES.some((zn) => Math.hypot(x - zn.x, z - zn.z) < (zn.id === 'booga_town' ? 38 : 16))) continue;
    const zn = zoneAt(x, z);
    if (filterFn && !filterFn(x, z, zn)) continue;
    out.push({ x, y: heightAt(x, z) - 0.05, z, ry: rand() * Math.PI * 2, s: 0.85 + rand() * 0.7 });
  }
  return out;
}

function decor(scene, colliders) {
  const grassMeshes = [];
  const addInstanced = (...args) => {
    grassMeshes.push(...scatterInstanced(...args));
  };

  if (isTutorialMap) {
    const meadow = () => true;
    addInstanced(scene, 'grass_1', sampleContinentPoints(450, meadow), 0.45, { shadows: false, chunk: 30 });
    return grassMeshes;
  }

  buildZoneLandmarks(scene, colliders);

  const inZones = (ids) => (x, z, zn) => ids.includes(zn.id);

  // 1. Lush Ground Foliage across Green Biomes (Lightweight low-poly meshes, shadowless, distance-culled)
  addInstanced(scene, 'grass_1', sampleContinentPoints(2200, inZones(['booga_town', 'jungle', 'prairie', 'ancient_runes', 'coast'])), 0.58, { shadows: false, chunk: 95 });
  addInstanced(scene, 'fern', sampleContinentPoints(480, inZones(['jungle', 'ancient_runes', 'haunted_woods'])), 1.15, { shadows: false, chunk: 95 });
  addInstanced(scene, 'flowers_1', sampleContinentPoints(380, inZones(['booga_town', 'prairie', 'coast'])), 0.65, { shadows: false, chunk: 95 });
  addInstanced(scene, 'bush_flowers', sampleContinentPoints(240, inZones(['booga_town', 'prairie', 'jungle'])), 1.35, { shadows: false, chunk: 95 });

  // 2. Booga Town Valley, Sunny Coast & Meadow Stylized Tree Groves (Creative Trio Pack 01)
  const meadowTrees = sampleContinentPoints(240, inZones(['booga_town', 'coast', 'prairie']));
  meadowTrees.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.7 }));
  addInstanced(scene, 'tree_1', meadowTrees.slice(0, 50), 9.2, { chunk: 95 });
  addInstanced(scene, 'tree_2', meadowTrees.slice(50, 100), 8.8, { chunk: 95 });
  addInstanced(scene, 'tree_3', meadowTrees.slice(100, 150), 9.0, { chunk: 95 });
  addInstanced(scene, 'tree_spiral_1', meadowTrees.slice(150, 195), 8.5, { chunk: 95 });
  addInstanced(scene, 'pine_1', meadowTrees.slice(195), 9.4, { chunk: 95 });

  const palms = sampleContinentPoints(140, inZones(['coast', 'savannah']));
  palms.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.6 }));
  addInstanced(scene, 'palm_1', palms, 9.5, { chunk: 95 });

  // 3. Deep Jungle Rainforest Canopy, Baobabs & Stylized Giant Mushrooms
  const jTrees = sampleContinentPoints(320, inZones(['jungle', 'ancient_runes', 'prairie']));
  jTrees.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.75 }));
  addInstanced(scene, 'tree_1', jTrees.slice(0, 70), 10.5, { chunk: 95 });
  addInstanced(scene, 'tree_4', jTrees.slice(70, 140), 11.4, { chunk: 95 });
  addInstanced(scene, 'tree_5', jTrees.slice(140, 210), 10.2, { chunk: 95 });
  addInstanced(scene, 'tree_blob_1', jTrees.slice(210, 270), 9.6, { chunk: 95 });
  addInstanced(scene, 'pine_3', jTrees.slice(270), 9.8, { chunk: 95 });
  addInstanced(scene, 'mushroom_king', sampleContinentPoints(95, inZones(['jungle', 'haunted_woods', 'booga_town'])), 2.4, { shadows: false, chunk: 95 });
  addInstanced(scene, 'rock_moss', sampleContinentPoints(130, inZones(['jungle', 'ancient_runes', 'booga_town'])), 2.3, { shadows: false, chunk: 95 });

  // 4. Haunted Woods & X Jail Island Purple Fantasy Trees & Stylized Pines
  const hTrees = sampleContinentPoints(240, inZones(['haunted_woods', 'x_jail']));
  hTrees.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.65 }));
  addInstanced(scene, 'tree_twisted_1', hTrees.slice(0, 85), 9.2, { chunk: 95 });
  addInstanced(scene, 'tree_twisted_2', hTrees.slice(85, 165), 9.8, { chunk: 95 });
  addInstanced(scene, 'tree_spikes_1', hTrees.slice(165), 9.5, { chunk: 95 });
  addInstanced(scene, 'skull_horned', sampleContinentPoints(65, inZones(['haunted_woods', 'x_jail', 'desert'])), 1.45, { shadows: false, chunk: 95 });
  addInstanced(scene, 'mushroom_red', sampleContinentPoints(110, inZones(['haunted_woods'])), 1.6, { shadows: false, chunk: 95 });

  // 5. Golden Savannah Autumn/Amber Groves & Sunstone Desert Cacti
  const acacias = sampleContinentPoints(200, inZones(['savannah', 'ancient_runes']));
  acacias.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.65 }));
  addInstanced(scene, 'tree_acacia', acacias.slice(0, 90), 9.4, { chunk: 95 });
  addInstanced(scene, 'tree_lava_2', acacias.slice(90, 150), 9.0, { chunk: 95 });
  addInstanced(scene, 'tree_lava_3', acacias.slice(150), 8.8, { chunk: 95 });

  const cacti = sampleContinentPoints(220, inZones(['desert', 'savannah']));
  cacti.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.5 }));
  addInstanced(scene, 'cactus_1', cacti.slice(0, 120), 3.4, { shadows: false, chunk: 95 });
  addInstanced(scene, 'cactus_2', cacti.slice(120), 2.8, { shadows: false, chunk: 95 });

  // 6. Prairie, Ancient Runes & Mountain Range Stylized Rock Formations + Fiery Trees
  const crags = sampleContinentPoints(210, inZones(['prairie', 'mountain_range', 'ancient_runes', 'x_jail', 'booga_town']));
  crags.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 1.35 }));
  addInstanced(scene, 'rock_m1', crags.slice(0, 75), 3.6, { chunk: 95 });
  addInstanced(scene, 'rock_m2', crags.slice(75, 145), 3.2, { chunk: 95 });
  addInstanced(scene, 'magic_rock', crags.slice(145), 3.8, { chunk: 95 });
  addInstanced(scene, 'tree_lava_1', sampleContinentPoints(85, inZones(['mountain_range', 'jungle', 'savannah'])), 8.5, { chunk: 95 });

  // 7. Frozen Tundra & Lost Island Icy Blue Gradient Pines & Glacial Boulders
  const snowPines = sampleContinentPoints(250, inZones(['tundra', 'lost_island', 'mountain_range']));
  snowPines.forEach((p) => colliders.push({ x: p.x, z: p.z, r: 0.65 }));
  addInstanced(scene, 'pine_snow', snowPines.slice(0, 90), 10.4, { chunk: 95 });
  addInstanced(scene, 'ct_ice_tree_1', snowPines.slice(90, 170), 9.8, { chunk: 95 });
  addInstanced(scene, 'ct_ice_tree_2', snowPines.slice(170), 9.4, { chunk: 95 });
  addInstanced(scene, 'rock_snow', sampleContinentPoints(160, inZones(['tundra', 'lost_island'])), 2.2, { shadows: false, chunk: 95 });

  return grassMeshes;
}

// ---------- ambient biome particles ----------
function particles(scene) {
  const N = 220;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.PointsMaterial({ size: 0.24, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  scene.add(pts);
  const P = [];
  for (let i = 0; i < N; i++) P.push({ x: 0, y: -100, z: 0, ph: rand() * 6, life: 0 });
  const tmp = new THREE.Color();
  const R = 42;
  return (dt, t, focus) => {
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const dx = p.x - focus.x, dz = p.z - focus.z;
      if (p.life <= 0 || dx * dx + dz * dz > R * R) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
        p.x = focus.x + Math.cos(a) * r; p.z = focus.z + Math.sin(a) * r;
        p.b = biomeAt(p.x, p.z);
        p.y = heightAt(p.x, p.z) + (p.b === 'frost' ? 6 + rand() * 8 : rand() * 4);
        p.life = 4 + rand() * 6;
      }
      p.life -= dt;
      const b = p.b;
      if (b === 'frost') { p.y -= dt * 1.2; p.x += Math.sin(t + p.ph) * dt * 0.6; tmp.setRGB(0.65, 0.8, 0.98); }
      else if (b === 'lava') { p.y += dt * 1.6; p.x += Math.sin(t * 2 + p.ph) * dt; tmp.setRGB(1.6, 0.65, 0.18); }
      else if (b === 'jungle') { p.y += Math.sin(t * 1.5 + p.ph) * dt * 0.5; p.x += Math.cos(t * 0.7 + p.ph) * dt * 0.6; const k = 0.5 + 0.5 * Math.sin(t * 3 + p.ph * 3); tmp.setRGB(0.9 * k, 1.4 * k, 0.3 * k); }
      else if (b === 'badlands') { p.x += dt * 2.5; p.y += Math.sin(t + p.ph) * dt * 0.2; tmp.setRGB(0.75, 0.55, 0.28); }
      else { p.y += Math.sin(t + p.ph) * dt * 0.3; p.x += dt * 0.4; tmp.setRGB(0.45, 0.6, 0.28); }
      const fade = Math.max(0, Math.min(1, p.life, (R - Math.sqrt(dx * dx + dz * dz)) / 4));
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = tmp.r * fade; col[i * 3 + 1] = tmp.g * fade; col[i * 3 + 2] = tmp.b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
}

export function buildWorld(scene, isMobile = false) {
  resetRand(1337);
  const colliders = [];
  scene.background = textures.sky;
  scene.environment = textures.sky;
  scene.environmentIntensity = 0.58;
  scene.backgroundIntensity = 0.92;
  scene.fog = new THREE.Fog('#b5daf2', 140, 620);
  const hemi = new THREE.HemisphereLight('#e3f4ff', '#7a6a50', 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2db', 3.0);
  sun.position.set(40, 75, 25);
  sun.castShadow = true;
  const shadowRes = isMobile ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 230;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = isMobile ? 2 : 3;
  scene.add(sun, sun.target);

  const ter = terrain(scene, isMobile);
  const vol = volcano(scene, colliders);
  const grass = decor(scene, colliders);
  const updParticles = particles(scene);

  const bark = findTexture('tree_1', 'bark');
  const barkN = findTexture('tree_1', 'bark', 'normalMap');

  const tmpFog = new THREE.Color();
  const tmpSun = new THREE.Color();
  const tmpSky = new THREE.Color();
  const tmpGnd = new THREE.Color();

  let t = 0;
  return {
    colliders,
    sun,
    hemi,
    bark,
    barkN,
    update(dt, focus, camPos) {
      t += dt;
      windUniforms.uTime.value = t;
      vol.update(dt, t, focus);
      if (ter.water) {
        ter.water.position.y = -0.85 + Math.sin(t * 1.8) * 0.08;
      }
      updParticles(dt, t, focus);

      // Dynamic Real-Time Biome Atmosphere & Lighting Transition
      if (!isTutorialMap && focus) {
        const zn = zoneAt(focus.x, focus.z);
        const k = Math.min(1, dt * 2.2);
        if (zn && scene.fog) {
          scene.fog.color.lerp(tmpFog.set(zn.fogColor || '#b5daf2'), k);
          scene.fog.near += ((zn.fogNear || 120) - scene.fog.near) * k;
          scene.fog.far += ((zn.fogFar || 560) - scene.fog.far) * k;
          sun.color.lerp(tmpSun.set(zn.sunColor || '#fff2db'), k);
          sun.intensity += ((zn.sunIntensity || 3.0) - sun.intensity) * k;
          hemi.color.lerp(tmpSky.set(zn.hemiSky || '#e3f4ff'), k);
          hemi.groundColor.lerp(tmpGnd.set(zn.hemiGround || '#7a6a50'), k);
        }
      }

      sun.position.set(focus.x + 40, 75, focus.z + 25);
      sun.target.position.set(focus.x, 0, focus.z);
      const refPos = focus || camPos;
      if (refPos) {
        for (let i = 0; i < grass.length; i++) {
          const g = grass[i];
          const s = g.boundingSphere;
          if (s) {
            const d = s.center.distanceTo(refPos);
            const vis = d < 215 + s.radius;
            g.visible = vis;
            if (vis && g.userData.canShadow) {
              g.castShadow = d < 88 + s.radius * 0.5;
            }
          }
        }
      }
    },
  };
}
