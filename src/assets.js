import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Creative Trio Stylized Gradient Shader Hook:
 * Gives 3D models Creative Trio's signature hand-painted look:
 * - Warm plum/earth grounding shadow at the base (y = minY)
 * - Rich saturated midtones in the body
 * - Sunlit golden-warm crown highlight at the top (y = maxY)
 * - Soft hemisphere sky/ground wrap so shadows are never harsh black
 */
export function stylizeMaterial(mat, minY = 0, maxY = 5.0, strength = 0.62) {
  if (!mat || mat.userData?.ctStylized) return mat;
  mat.userData = mat.userData || {};
  mat.userData.ctStylized = true;
  mat.roughness = Math.min(mat.roughness ?? 0.7, 0.72);
  mat.metalness = Math.min(mat.metalness ?? 0.0, 0.08);
  const span = Math.max(0.4, maxY - minY);
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    if (prevCompile) prevCompile(sh, renderer);
    sh.vertexShader =
      `varying float vCtHeight;\nvarying vec3 vCtWorldN;\n` +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCtHeight = clamp((position.y - (${minY.toFixed(3)})) / ${span.toFixed(3)}, 0.0, 1.0);
        vCtWorldN = normalize(normalMatrix * objectNormal);`
      );
    sh.fragmentShader =
      `varying float vCtHeight;\nvarying vec3 vCtWorldN;\n` +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 ctBot = vec3(0.72, 0.60, 0.68);
        vec3 ctMid = vec3(1.02, 0.99, 0.96);
        vec3 ctTop = vec3(1.18, 1.13, 1.01);
        vec3 ctGrad = vCtHeight < 0.5
          ? mix(ctBot, ctMid, vCtHeight * 2.0)
          : mix(ctMid, ctTop, (vCtHeight - 0.5) * 2.0);
        float ctHemi = clamp(vCtWorldN.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 ctWrap = mix(vec3(0.90, 0.82, 0.88), vec3(1.08, 1.05, 1.00), ctHemi);
        diffuseColor.rgb *= mix(vec3(1.0), ctGrad * ctWrap, ${strength.toFixed(3)});`
      );
  };
  mat.customProgramCacheKey = () => `ctStyle_${minY.toFixed(1)}_${span.toFixed(1)}_${strength.toFixed(2)}`;
  return mat;
}

function extractNormalizedFbxMesh(fbxGroup, childName, material, stylizeStrength = 0.28) {
  if (!fbxGroup) return null;
  const ch =
    fbxGroup.children.find((c) => c.name === childName) ||
    fbxGroup.children.find((c) => c.name && c.name.toLowerCase() === childName.toLowerCase());
  if (!ch || !ch.geometry) return null;
  const geo = ch.geometry.clone();
  const rotMat = new THREE.Matrix4().makeRotationFromEuler(ch.rotation);
  geo.applyMatrix4(rotMat);
  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const cx = (b.min.x + b.max.x) * 0.5;
  const cz = (b.min.z + b.max.z) * 0.5;
  geo.translate(-cx, -b.min.y, -cz);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const h = Math.max(0.5, geo.boundingBox.max.y - geo.boundingBox.min.y);
  const m = material.clone();
  stylizeMaterial(m, 0, h, stylizeStrength);

  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(mesh);
  return grp;
}

// CC0 models by Quaternius (quaternius.com), fetched via tools/fetch_assets.mjs
export const MODEL_NAMES = [
  'dino_raptor', 'dino_trike', 'dino_stego', 'dino_para', 'dino_rex', 'dino_apato',
  'tree_1', 'tree_2', 'tree_3', 'tree_4', 'tree_5', 'tree_acacia', 'palm_1', 'pine_1', 'pine_2', 'pine_3',
  'dead_1', 'dead_2', 'dead_3', 'rock_m1', 'rock_m2', 'rock_m3', 'rock_b1', 'rock_b2', 'rock_b3', 'rock_b4', 'rock_b5',
  'rock_g1', 'rock_g2', 'rock_g3', 'fern', 'grass_1', 'grass_tall', 'grass_wispy', 'flowers_1', 'flowers_2', 'clover',
  'bush_flowers', 'bush_1', 'bush_moss', 'mushroom_s', 'mushroom_l', 'mushroom_red', 'reeds',
  'bonfire', 'logs', 'tent', 'chest', 'skull', 'bone', 'ribs', 'cactus_1', 'cactus_2',
  'pine_snow', 'rock_snow', 'bush_snow', 'dead_snow', 'stump', 'crystal_big', 'crystal', 'axe_stone',
  'wood_wall', 'wood_gate_open', 'watch_tower', 'monument', 'hut', 'banner', 'arch', 'arch_round',
  'pedestal', 'torch_wood', 'cloud', 'hay', 'vines', 'bear_trap', 'hammer', 'axe_double', 'axe_small',
  'bat_barbed', 'crown', 'star', 'rock_path_wide', 'pebble_round', 'bags', 'bucket', 'cauldron', 'wood_log_moss',
  'volcano_1', 'volcano_2',
  'mountains', 'mountain_group', 'mountain_1', 'mountain_2',
  'tree_lava_1', 'tree_lava_2', 'tree_lava_3', 'tree_twisted_1', 'tree_twisted_2',
  'tree_blob_1', 'tree_spikes_1', 'tree_spiral_1',
  'rock_moss', 'rock_canyon_1', 'rock_canyon_2', 'gold_rocks', 'magic_rock',
  'palisade_wall', 'palisade_gate', 'fence_rustic_1', 'fence_rustic_2',
  'temple_1', 'temple_wood', 'hut_2', 'hut_storage', 'watch_tower_2', 'guard_tower',
  'bonfire_stones', 'chest_gold', 'chest_gold_2', 'coin_piles', 'gold_bag',
  'gem_blue', 'gem_green', 'gem_pink',
  'skull_crossbones', 'skull_horned', 'skeleton_1',
  'stag_statue', 'fox_statue', 'well', 'cart', 'cart_broken',
  'bridge_small', 'sign_wood', 'sign_arrow', 'mushroom_king', 'egg_poly',
];

export const models = {};
export const anims = {};
export const textures = {};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  const texLoader = new THREE.TextureLoader();
  const texList = ['grass', 'jungle', 'sand', 'snow', 'lava', 'dirt'];
  const total = MODEL_NAMES.length + texList.length;
  const tick = () => onProgress && onProgress(++done / total);
  let ctPackData = null;
  await Promise.all([
    ...MODEL_NAMES.map(async (n) => {
      try {
        const g = await loader.loadAsync(`/models/cc0/${n}.glb`);
        const box = new THREE.Box3().setFromObject(g.scene);
        g.scene.traverse((o) => {
          if (o.isMesh) {
            if (o.geometry && !o.geometry.attributes.normal) {
              o.geometry.computeVertexNormals();
            }
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m) return;
              if (m.map) m.map.anisotropy = 4;
              if (m.alphaTest > 0) m.side = THREE.DoubleSide;
              if (/metal|gold|steel|iron/i.test(m.name)) {
                m.metalness = 0.22;
                m.roughness = 0.45;
              } else {
                m.metalness = 0;
                m.roughness = 0.68;
              }
              stylizeMaterial(m, box.min.y, box.max.y, 0.65);
            });
          }
        });
        models[n] = g.scene;
        anims[n] = g.animations;
      } catch (e) {
        console.warn('model failed', n, e);
      }
      tick();
    }),
    ...texList.map(async (n) => {
      const t = await texLoader.loadAsync(`/env/${n}_diff.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      textures[n] = t;
      textures[n + '_avg'] = averageLinear(t.image);
      tick();
    }),
    (async () => {
      const sky = await new RGBELoader().loadAsync('/env/sky_1k.hdr');
      sky.mapping = THREE.EquirectangularReflectionMapping;
      textures.sky = sky;
    })(),
    // Load Creative Trio Stylized Low-Poly Packs in parallel
    (async () => {
      try {
        const fbxLoader = new FBXLoader();
        const [
          ctPalette,
          ctRocksPalette,
          trees01,
          trees02,
          rocks01,
          plants01,
          flowers01,
          mushrooms01,
          fences01,
        ] = await Promise.all([
          texLoader.loadAsync('/assets/trees/CT_Pallete.png'),
          texLoader.loadAsync('/assets/trees/CT_Rocks_Palette.png'),
          fbxLoader.loadAsync('/assets/trees/Trees_Pack_01.fbx'),
          fbxLoader.loadAsync('/assets/trees/Trees_Pack_02.fbx'),
          fbxLoader.loadAsync('/assets/trees/Rocks_01.fbx'),
          fbxLoader.loadAsync('/assets/trees/Plants_01.fbx'),
          fbxLoader.loadAsync('/assets/trees/Flowers_01.fbx'),
          fbxLoader.loadAsync('/assets/trees/Mushrooms_Pack_01.fbx'),
          fbxLoader.loadAsync('/assets/trees/Wooden_Fences_01.fbx'),
        ]);
        ctPackData = {
          ctPalette,
          ctRocksPalette,
          trees01,
          trees02,
          rocks01,
          plants01,
          flowers01,
          mushrooms01,
          fences01,
        };
      } catch (e) {
        console.warn('Creative Trio FBX pack load warning:', e);
      }
    })(),
  ]);

  // Apply Creative Trio Stylized Low-Poly Models AFTER base glTF loads complete so they are never overwritten!
  if (ctPackData) {
    const {
      ctPalette,
      ctRocksPalette,
      trees01,
      trees02,
      rocks01,
      plants01,
      flowers01,
      mushrooms01,
      fences01,
    } = ctPackData;

    for (const t of [ctPalette, ctRocksPalette]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    textures.ctPalette = ctPalette;
    textures.ctRocksPalette = ctRocksPalette;

    const baseCtMat = new THREE.MeshStandardMaterial({
      map: ctPalette,
      color: '#ffffff',
      roughness: 0.68,
      metalness: 0.0,
    });
    const baseRockMat = new THREE.MeshStandardMaterial({
      map: ctRocksPalette,
      color: '#ffffff',
      roughness: 0.74,
      metalness: 0.0,
    });

    const assignCt = (targetName, group, childName, mat = baseCtMat, strength = 0.24) => {
      const extracted = extractNormalizedFbxMesh(group, childName, mat, strength);
      if (extracted) {
        models[targetName] = extracted;
        delete sizeCache[targetName];
      }
    };

    // 1. Register all 23 stylized trees from Creative Trio Trees Pack 01
    trees01.children.forEach((ch, idx) => {
      assignCt(`ct_tree_${idx}`, trees01, ch.name, baseCtMat, 0.24);
      assignCt(`ct_${ch.name}`, trees01, ch.name, baseCtMat, 0.24);
    });

    // Lush Green Broadleaf & Round Canopy Trees (Meadow, Booga Town, Jungle, Coast, Prairie, Ancient Runes)
    assignCt('tree_1', trees01, 'Tree007', baseCtMat);
    assignCt('tree_2', trees01, 'Tree013', baseCtMat);
    assignCt('tree_3', trees01, 'Tree009', baseCtMat);
    assignCt('tree_4', trees01, 'Tree026', baseCtMat);
    assignCt('tree_5', trees01, 'Tree027', baseCtMat);
    assignCt('tree_blob_1', trees01, 'Tree018', baseCtMat);
    assignCt('tree_spiral_1', trees01, 'Tree001', baseCtMat);

    // Stylized Layered Green Pines & Conifers
    assignCt('pine_1', trees01, 'Tree005', baseCtMat);
    assignCt('pine_2', trees01, 'Tree010', baseCtMat);
    assignCt('pine_3', trees01, 'Tree011', baseCtMat);

    // Golden / Autumn / Volcano / Savannah Gradient Trees
    assignCt('tree_acacia', trees01, 'Tree006', baseCtMat);
    assignCt('tree_lava_1', trees01, 'Tree017', baseCtMat);
    assignCt('tree_lava_2', trees01, 'Tree019', baseCtMat);
    assignCt('tree_lava_3', trees01, 'Tree002', baseCtMat);

    // Haunted Woods & X Jail Island Purple / Violet Fantasy Trees
    assignCt('tree_twisted_1', trees01, 'Tree020', baseCtMat);
    assignCt('tree_twisted_2', trees01, 'Tree021', baseCtMat);
    assignCt('tree_spikes_1', trees01, 'Tree004', baseCtMat);

    // Frozen Tundra & Lost Island Icy Blue / Cyan Gradient Pines & Trees
    assignCt('pine_snow', trees01, 'Tree012', baseCtMat);
    assignCt('ct_ice_tree_1', trees01, 'Tree008', baseCtMat);
    assignCt('ct_ice_tree_2', trees01, 'Tree015', baseCtMat);

    // 2. Stylized Low-Poly Rocks & Canyon Formations (Rocks_01.fbx)
    assignCt('rock_m1', rocks01, 'Rock_Formation001', baseRockMat, 0.30);
    assignCt('rock_m2', rocks01, 'Rock_Formation002', baseRockMat, 0.30);
    assignCt('rock_m3', rocks01, 'Rock_Formation005', baseRockMat, 0.30);
    assignCt('rock_b1', rocks01, 'Rock001', baseRockMat, 0.30);
    assignCt('rock_b2', rocks01, 'Rock002', baseRockMat, 0.30);
    assignCt('rock_b3', rocks01, 'Rock004', baseRockMat, 0.30);
    assignCt('rock_b4', rocks01, 'Rock009', baseRockMat, 0.30);
    assignCt('rock_b5', rocks01, 'Rock011', baseRockMat, 0.30);
    assignCt('rock_moss', rocks01, 'Rock_Formation010', baseRockMat, 0.30);
    assignCt('rock_canyon_1', rocks01, 'Rock_Formation003', baseRockMat, 0.30);
    assignCt('rock_canyon_2', rocks01, 'Rock_Formation013', baseRockMat, 0.30);
    assignCt('rock_snow', rocks01, 'Rock_Formation016', baseRockMat, 0.30);

    // 3. Stylized Low-Poly Bushes, Ferns, Flowers & Gradient Mushrooms
    assignCt('fern', plants01, 'Plane027', baseCtMat, 0.24);
    assignCt('bush_1', plants01, 'Plane001', baseCtMat, 0.24);
    assignCt('bush_moss', plants01, 'Plane029', baseCtMat, 0.24);
    assignCt('bush_flowers', plants01, 'Plane015', baseCtMat, 0.24);
    assignCt('flowers_1', flowers01, 'Flower031', baseCtMat, 0.24);
    assignCt('flowers_2', flowers01, 'Flower025', baseCtMat, 0.24);
    assignCt('mushroom_s', mushrooms01, 'Mushroom003', baseCtMat, 0.24);
    assignCt('mushroom_l', mushrooms01, 'Mushroom012', baseCtMat, 0.24);
    assignCt('mushroom_red', mushrooms01, 'Mushroom021', baseCtMat, 0.24);
    assignCt('mushroom_king', mushrooms01, 'Mushroom002', baseCtMat, 0.24);

    // 4. Stylized Wooden Fences
    assignCt('fence_rustic_1', fences01, 'Fence0501', baseCtMat, 0.26);
    assignCt('fence_rustic_2', fences01, 'Fence0701', baseCtMat, 0.26);
  }
}

function averageLinear(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data;
  const col = new THREE.Color(0, 0, 0);
  const tmp = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    tmp.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    col.r += tmp.r; col.g += tmp.g; col.b += tmp.b;
  }
  return col.multiplyScalar(1 / 256);
}

const sizeCache = {};
/** bounding box of template (cached) */
export function bbox(name) {
  if (!sizeCache[name]) {
    const b = new THREE.Box3().setFromObject(models[name]);
    sizeCache[name] = { box: b, size: b.getSize(new THREE.Vector3()), center: b.getCenter(new THREE.Vector3()) };
  }
  return sizeCache[name];
}

/** Clone a static model normalised to a target height (or largest dimension with mode 'max'), base at y=0 */
export function spawn(name, height = 1, mode = 'height') {
  const src = models[name];
  if (!src) return new THREE.Group();
  const { box, size } = bbox(name);
  const s = height / (mode === 'max' ? Math.max(size.x, size.y, size.z) : size.y);
  const inner = src.clone(true);
  inner.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  inner.scale.setScalar(s);
  const g = new THREE.Group();
  g.add(inner);
  g.userData.footprint = Math.max(size.x, size.z) * s;
  return g;
}

/** Replace materials of a clone with tinted clones (optionally filtered by material name regex) */
export function tint(obj, color, opts = {}, matRegex = null) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (matRegex && !matRegex.test(m.name || '')) return m;
      const c = m.clone();
      if (color) c.color.set(color);
      Object.assign(c, opts);
      if (opts.emissive) c.emissive = new THREE.Color(opts.emissive);
      stylizeMaterial(c, 0, 5.0, 0.55);
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return obj;
}

// ---------- animated dinos ----------
export function spawnAnimated(name, length = 2) {
  const src = models[name];
  const g = new THREE.Group();
  if (!src) return g;
  const { box, size } = bbox(name);
  const s = length / Math.max(size.x, size.z);
  const inner = SkeletonUtils.clone(src);
  inner.scale.setScalar(s);
  inner.position.y = -box.min.y * s;
  inner.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
  g.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const clips = anims[name] || [];
  const find = (k) => clips.find((c) => c.name.toLowerCase().includes(k));
  g.userData.mixer = mixer;
  g.userData.actions = {};
  for (const k of ['idle', 'walk', 'run', 'attack', 'jump']) {
    const c = find(k);
    if (c) g.userData.actions[k] = mixer.clipAction(c);
  }
  g.userData.play = (k, fade = 0.25) => {
    const a = g.userData.actions[k];
    if (!a || g.userData.current === a) return;
    if (g.userData.current) g.userData.current.fadeOut(fade);
    a.reset().fadeIn(fade).play();
    g.userData.current = a;
  };
  return g;
}

// ---------- instancing (decor) ----------
/**
 * Build chunked InstancedMeshes from a template for an array of transforms [{x,y,z,ry,s}].
 * Template is normalised to `height`. Returns array of instanced meshes (added to parent).
 */
export function scatterInstanced(parent, name, items, height, { chunk = 40, shadows = true, wind = 0, receive = true } = {}) {
  const src = models[name];
  if (!src || !items.length) return [];
  const { box, size } = bbox(name);
  const s0 = height / size.y;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const local = o.matrixWorld.clone();
    parts.push({ geo: o.geometry, mat: wind ? windMaterial(o.material, wind, size.y) : o.material, local });
  });
  const norm = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  // bucket by chunk
  const buckets = new Map();
  for (const it of items) {
    const key = Math.floor(it.x / chunk) + ',' + Math.floor(it.z / chunk);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [, list] of buckets) {
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      list.forEach((it, i) => {
        e.set(it.rx || 0, it.ry || 0, it.rz || 0);
        q.setFromEuler(e);
        const s = s0 * (it.s || 1);
        m.compose(v.set(it.x, it.y, it.z), q, sc.set(s, s * (it.sy || 1), s));
        m.multiply(norm).multiply(p.local);
        im.setMatrixAt(i, m);
      });
      im.castShadow = shadows;
      im.receiveShadow = receive;
      im.computeBoundingSphere();
      parent.add(im);
      out.push(im);
    }
  }
  return out;
}

export const windUniforms = { uTime: { value: 0 } };
const windCache = new Map();
function windMaterial(mat, strength, height) {
  const key = mat.uuid + strength;
  if (windCache.has(key)) return windCache.get(key);
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader =
      'uniform float uTime;\nvarying float vCtHeight;\nvarying vec3 vCtWorldN;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hk = clamp(position.y / ${height.toFixed(3)}, 0.0, 1.0);
        vCtHeight = hk;
        vCtWorldN = normalize(normalMatrix * objectNormal);
        float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.6 + sin(uTime * 3.1 + ip.x * 0.9) * 0.25;
        transformed.x += w * hk * hk * ${strength.toFixed(3)};
        transformed.z += cos(uTime * 1.3 + ip.z * 0.4) * hk * hk * ${(strength * 0.5).toFixed(3)};`
      );
    sh.fragmentShader =
      `varying float vCtHeight;\nvarying vec3 vCtWorldN;\n` +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 ctBot = vec3(0.72, 0.60, 0.68);
        vec3 ctMid = vec3(1.02, 0.99, 0.96);
        vec3 ctTop = vec3(1.18, 1.13, 1.01);
        vec3 ctGrad = vCtHeight < 0.5
          ? mix(ctBot, ctMid, vCtHeight * 2.0)
          : mix(ctMid, ctTop, (vCtHeight - 0.5) * 2.0);
        float ctHemi = clamp(vCtWorldN.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 ctWrap = mix(vec3(0.90, 0.82, 0.88), vec3(1.08, 1.05, 1.00), ctHemi);
        diffuseColor.rgb *= mix(vec3(1.0), ctGrad * ctWrap, 0.35);`
      );
  };
  m.customProgramCacheKey = () => 'wind_ct_' + strength + height.toFixed(2);
  windCache.set(key, m);
  return m;
}

/** find a texture inside a loaded model by image name fragment */
export function findTexture(modelName, frag, slot = 'map') {
  let found = null;
  models[modelName] && models[modelName].traverse((o) => {
    if (found || !o.isMesh) return;
    const t = o.material[slot];
    if (t && t.name && t.name.toLowerCase().includes(frag.toLowerCase())) found = t;
    else if (t && t.image && t.image.currentSrc === undefined && o.material.name.toLowerCase().includes(frag.toLowerCase())) found = t;
  });
  return found;
}
