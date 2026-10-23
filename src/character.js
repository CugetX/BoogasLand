import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// The source model is ~2.03 units tall, faces +Z, left hand on +X, T-pose rest.
const MODEL_SCALE = 0.82;
let template = null;

export async function loadBoogaTemplate(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => onProgress && e.total && onProgress(e.loaded / e.total));
  template = gltf.scene;
  template.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  return template;
}

const _q = new THREE.Quaternion();
const _t = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

const BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const FINGER_BONES = [
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3',
  'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
  'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
];

// Smooth quintic easing (0..1 -> 0..1 with zero 1st & 2nd derivatives at endpoints)
const smootherstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * A Booga character instance with a smooth, quaternion-damped procedural animator.
 * Rotations are expressed in "model space" axes (X = character's left, Y = up, Z = forward)
 * relative to the bone's rest frame, then blended via frame-rate-independent quaternion slerp.
 */
export class Booga {
  constructor({ shirt = '#ffffff', name = '' } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // bobbing / leaning layer
    this.root.add(this.body);
    this.model = SkeletonUtils.clone(template);
    this.model.scale.setScalar(MODEL_SCALE);
    this.body.add(this.model);
    this.name = name;

    this.model.traverse((o) => {
      if (o.isMesh && /^Shirt/.test(o.name)) {
        o.material = o.material.clone();
        o.material.color.set(shirt);
      }
    });

    this.bones = {};
    this.model.traverse((o) => {
      if (o.isBone) this.bones[o.name.replace('mixamorig:', '').replace('mixamorig', '')] = o;
    });

    this.model.updateMatrixWorld(true);
    const modelInv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
    this.rest = {};
    for (const n of BONES) {
      const b = this.bones[n];
      if (!b) continue;
      _m.multiplyMatrices(modelInv, b.parent.matrixWorld);
      const pq = new THREE.Quaternion();
      _m.decompose(_v, pq, _s);
      this.rest[n] = { local: b.quaternion.clone(), p: pq, pInv: pq.clone().invert() };
    }
    this.fingerRest = {};
    for (const n of FINGER_BONES) {
      const b = this.bones[n];
      if (b) this.fingerRest[n] = b.quaternion.clone();
    }

    // Animation state (with continuous blend weights so transitions never snap)
    this.t = Math.random() * 10;
    this.walkPhase = 0;
    this.speed01 = 0; // 0 idle .. 1 run
    this.carryW = 0;  // 0..1 smooth carry blend
    this.gatherW = 0; // 0..1 smooth gather blend
    this.airW = 0;    // 0..1 smooth airborne blend
    this.stunW = 0;   // 0..1 smooth stun blend
    this.turnLean = 0;
    this.landSquash = 0;
    this.wasAirborne = false;
    this.carrying = false;
    this.hasWeapon = false;
    this.airborne = false;
    this.stunned = 0;
    this.attackT = -1; // 0..1 during bonk
    this.gatherT = -1;
    this.wave = 0;
  }

  /** Rotate bone `n` toward euler (x,y,z) in model-space axes, smoothed via quaternion slerp. */
  pose(n, x, y, z, damp = 18, dt = 0.016) {
    const r = this.rest[n];
    if (!r) return;
    _e.set(x, y, z, 'XYZ');
    _q.setFromEuler(_e);
    _t.copy(r.pInv).multiply(_q).multiply(r.p).multiply(r.local);
    const b = this.bones[n];
    const k = damp <= 0 ? 1 : 1 - Math.exp(-damp * dt);
    b.quaternion.slerp(_t, k);
  }

  /** Curl fingers in local bone space (+X curls fingers into the palm). */
  curlFingers(leftCurl, rightCurl, dt) {
    const k = 1 - Math.exp(-14 * dt);
    for (const n of FINGER_BONES) {
      const b = this.bones[n];
      const r = this.fingerRest[n];
      if (!b || !r) continue;
      const c = n.startsWith('Left') ? leftCurl : rightCurl;
      _e.set(c, 0, 0, 'XYZ');
      _q.setFromEuler(_e);
      _t.copy(r).multiply(_q);
      b.quaternion.slerp(_t, k);
    }
  }

  attack() {
    if (this.attackT < 0) this.attackT = 0;
  }

  update(dt, moveSpeed, turnRate = 0, vy = 0) {
    this.t += dt;
    const damp = (cur, dst, rate) => cur + (dst - cur) * (1 - Math.exp(-rate * dt));

    // Smooth blend weights for all state transitions
    const targetSpeed = Math.min(1, moveSpeed / 7.2);
    this.speed01 = damp(this.speed01, targetSpeed, 11);
    this.carryW = damp(this.carryW, this.carrying ? 1 : 0, 12);
    this.gatherW = damp(this.gatherT >= 0 ? 1 : 0, this.gatherT >= 0 ? 1 : 0, 12);
    this.airW = damp(this.airW, this.airborne ? 1 : 0, 14);
    this.stunW = damp(this.stunW, this.stunned > 0 ? 1 : 0, 12);
    this.turnLean = damp(this.turnLean, Math.max(-1, Math.min(1, turnRate * 0.14)), 10);

    // Landing squash-and-stretch impulse
    if (this.wasAirborne && !this.airborne) this.landSquash = 1.0;
    this.wasAirborne = this.airborne;
    this.landSquash = damp(this.landSquash, 0, 10);

    const s = this.speed01;
    // Advance walk phase smoothly; when stopping, relax phase toward nearest neutral zero-crossing
    const stride = 4.6 + 5.8 * s;
    if (s > 0.02) {
      this.walkPhase += dt * stride;
    } else {
      const rem = ((this.walkPhase % Math.PI) + Math.PI) % Math.PI;
      const delta = rem > Math.PI * 0.5 ? Math.PI - rem : -rem;
      this.walkPhase += delta * (1 - Math.exp(-8 * dt));
    }

    const ph = this.walkPhase;
    const sw = Math.sin(ph);
    const cw = Math.cos(ph);
    // Secondary harmonics for smooth C-infinity gait (no sharp |cos| cusps!)
    const sw2 = Math.sin(ph * 2);
    const cw2 = Math.cos(ph * 2);
    // Lagged phase for overlapping follow-through on forearms, hands, and feet
    const swLag = Math.sin(ph - 0.55);
    const amp = smootherstep(Math.min(1, s * 1.35));
    const idleW = 1 - amp;

    // Multi-frequency idle breathing & weight shift
    const breathe = Math.sin(this.t * 2.1);
    const breathe2 = Math.cos(this.t * 1.35);
    const idleShift = Math.sin(this.t * 1.1) * idleW;

    // Smooth vertical bob (sinusoidal double-frequency, no sharp corners) + landing dip
    const bob = (0.5 - 0.5 * cw2) * 0.065 * amp + breathe * 0.014 * idleW - this.landSquash * 0.09;
    this.body.position.y = damp(this.body.position.y, bob, 20);
    this.body.position.x = damp(this.body.position.x, (-cw * 0.025 * amp) + idleShift * 0.018, 16);

    // Forward run lean + banking into turns + stun wobble
    let bodyPitch = 0.13 * s + this.landSquash * 0.12 - 0.06 * this.carryW;
    let bodyRoll = -this.turnLean * 0.16 * s + sw * 0.035 * amp + idleShift * 0.02;
    let bodyYaw = -this.turnLean * 0.08 * s;
    if (this.stunW > 0.01) {
      bodyRoll += Math.sin(this.t * 8.5) * 0.22 * this.stunW;
      bodyPitch = THREE.MathUtils.lerp(bodyPitch, Math.cos(this.t * 8.5) * 0.18 - 0.06, this.stunW);
      bodyYaw += Math.sin(this.t * 4.2) * 0.25 * this.stunW;
    }
    this.body.rotation.x = damp(this.body.rotation.x, bodyPitch, 16);
    this.body.rotation.z = damp(this.body.rotation.z, bodyRoll, 16);
    this.body.rotation.y = damp(this.body.rotation.y, bodyYaw, 16);

    // ---------- Hips (pelvic roll, yaw twist, and landing knee-bend dip) ----------
    const hipTwist = sw * 0.14 * amp + idleShift * 0.03;
    const hipRoll = cw * 0.06 * amp - idleShift * 0.025;
    const hipPitch = -0.04 * s + this.landSquash * 0.08;
    this.pose('Hips', hipPitch, hipTwist, hipRoll, 18, dt);

    // ---------- Legs, Knees, Ankles & Toes ----------
    // Smooth harmonic thigh swing + subtle second harmonic for natural forward reach
    const legAmp = (0.72 - 0.14 * this.carryW) * amp;
    let lUp = (-sw - 0.12 * sw2) * legAmp + this.landSquash * -0.22;
    let rUp = (sw - 0.12 * sw2) * legAmp + this.landSquash * -0.22;

    // Smooth C-infinity knee bend during swing phase: (0.5 * (1 - cos(ph +- 0.25)))^1.5
    const lLift = Math.pow(0.5 - 0.5 * Math.cos(ph - 0.35), 1.4);
    const rLift = Math.pow(0.5 + 0.5 * Math.cos(ph - 0.35), 1.4);
    let lKnee = lLift * 1.05 * amp + 0.06 + Math.abs(idleShift) * 0.04 + this.landSquash * 0.42;
    let rKnee = rLift * 1.05 * amp + 0.06 + Math.abs(idleShift) * 0.04 + this.landSquash * 0.42;

    // Smooth ankle & toe articulation
    let lFoot = -lKnee * 0.35 + sw * 0.18 * amp;
    let rFoot = -rKnee * 0.35 - sw * 0.18 * amp;
    let lToe = Math.max(0, sw) * 0.32 * amp;
    let rToe = Math.max(0, -sw) * 0.32 * amp;

    // Blend in airborne pose smoothly based on airW and vertical velocity vy
    if (this.airW > 0.001) {
      const rise = Math.max(-1, Math.min(1, vy / 6));
      lUp = THREE.MathUtils.lerp(lUp, -0.55 - 0.15 * rise, this.airW);
      rUp = THREE.MathUtils.lerp(rUp, -0.2 + 0.1 * rise, this.airW);
      lKnee = THREE.MathUtils.lerp(lKnee, 0.95 - 0.15 * rise, this.airW);
      rKnee = THREE.MathUtils.lerp(rKnee, 0.55 - 0.1 * rise, this.airW);
      lFoot = THREE.MathUtils.lerp(lFoot, -0.25, this.airW);
      rFoot = THREE.MathUtils.lerp(rFoot, -0.15, this.airW);
    }

    this.pose('LeftUpLeg', lUp, 0, -0.02 * idleW, 20, dt);
    this.pose('RightUpLeg', rUp, 0, 0.02 * idleW, 20, dt);
    this.pose('LeftLeg', lKnee, 0, 0, 20, dt);
    this.pose('RightLeg', rKnee, 0, 0, 20, dt);
    this.pose('LeftFoot', lFoot, 0, 0, 20, dt);
    this.pose('RightFoot', rFoot, 0, 0, 20, dt);
    this.pose('LeftToeBase', lToe, 0, 0, 20, dt);
    this.pose('RightToeBase', rToe, 0, 0, 20, dt);

    // ---------- Spine, Neck & Head (counter-rotation + breathing + look into turns) ----------
    let sp0Pitch = 0.04 * s + breathe * 0.018 * idleW + this.landSquash * 0.1;
    let sp1Pitch = 0.05 * s + breathe * 0.025 + (this.gatherT >= 0 ? 0.22 + Math.sin(this.t * 10) * 0.08 : 0);
    let sp2Pitch = 0.03 * s + breathe * 0.02 - 0.08 * this.carryW;
    let spineTwist = -sw * 0.16 * amp - idleShift * 0.03;
    let spineRoll = -cw * 0.04 * amp - this.turnLean * 0.06;

    // ---------- Shoulders, Arms, Forearms & Hands ----------
    const down = 1.22;
    // Natural idle arm sway + run swing with lagged forearm/wrist follow-through
    let lSh = { x: 0, y: -sw * 0.08 * amp, z: -0.04 - breathe * 0.025 };
    let rSh = { x: 0, y: sw * 0.08 * amp, z: 0.04 + breathe * 0.025 };

    let la = {
      x: sw * 0.62 * amp + breathe2 * 0.035 * idleW,
      y: -0.06 * amp,
      z: -down + 0.06 * amp + breathe * 0.025 * idleW,
    };
    let ra = {
      x: -sw * 0.62 * amp - breathe2 * 0.035 * idleW - (this.hasWeapon ? 0.18 : 0),
      y: 0.06 * amp,
      z: down - 0.06 * amp - breathe * 0.025 * idleW - (this.hasWeapon ? 0.08 : 0),
    };
    // Forearms bend naturally during run and lag slightly behind upper arm
    let lf = -0.28 - (0.38 + Math.max(0, -swLag) * 0.28) * amp - breathe * 0.04 * idleW;
    let rf = 0.28 + (0.38 + Math.max(0, swLag) * 0.28) * amp + breathe * 0.04 * idleW + (this.hasWeapon ? 0.22 : 0);
    let lWrist = swLag * 0.18 * amp;
    let rWrist = -swLag * 0.18 * amp;

    // Smooth blend into overhead Carry pose
    if (this.carryW > 0.001) {
      const cwBob = Math.sin(ph * 2) * 0.04 * amp + breathe * 0.02;
      la.x = THREE.MathUtils.lerp(la.x, -0.22 + cwBob, this.carryW);
      la.y = THREE.MathUtils.lerp(la.y, 0.18, this.carryW);
      la.z = THREE.MathUtils.lerp(la.z, 1.12, this.carryW);
      ra.x = THREE.MathUtils.lerp(ra.x, -0.22 + cwBob, this.carryW);
      ra.y = THREE.MathUtils.lerp(ra.y, -0.18, this.carryW);
      ra.z = THREE.MathUtils.lerp(ra.z, -1.12, this.carryW);
      lf = THREE.MathUtils.lerp(lf, -0.55, this.carryW);
      rf = THREE.MathUtils.lerp(rf, 0.55, this.carryW);
    }

    // Smooth harvesting / gathering motion
    if (this.gatherT >= 0) {
      const g1 = Math.sin(this.t * 9.5);
      const g2 = Math.cos(this.t * 9.5);
      ra = { x: -1.15 - g1 * 0.55, y: -0.15, z: down * 0.52 };
      la = { x: -0.95 + g1 * 0.4, y: 0.15, z: -down * 0.52 };
      lf = -0.85 + g2 * 0.2;
      rf = 0.85 - g2 * 0.2;
      spineTwist += g1 * 0.18;
    }

    // Full-body club swing (smooth quintic windup -> smash -> follow-through -> recovery)
    if (this.attackT >= 0) {
      this.attackT += dt * 3.1;
      const a = this.attackT;
      let swing, torsoPitch, torsoYaw, elbow;
      if (a < 0.32) {
        const k = smootherstep(a / 0.32);
        swing = THREE.MathUtils.lerp(-0.3, -2.75, k);
        torsoPitch = THREE.MathUtils.lerp(0, -0.18, k);
        torsoYaw = THREE.MathUtils.lerp(0, -0.38, k);
        elbow = THREE.MathUtils.lerp(rf, 0.65, k);
      } else if (a < 0.58) {
        const k = smootherstep((a - 0.32) / 0.26);
        swing = THREE.MathUtils.lerp(-2.75, -0.35, k);
        torsoPitch = THREE.MathUtils.lerp(-0.18, 0.26, k);
        torsoYaw = THREE.MathUtils.lerp(-0.38, 0.32, k);
        elbow = THREE.MathUtils.lerp(0.65, 0.18, k);
      } else {
        const k = smootherstep(Math.min(1, (a - 0.58) / 0.42));
        swing = THREE.MathUtils.lerp(-0.35, ra.x, k);
        torsoPitch = THREE.MathUtils.lerp(0.26, 0, k);
        torsoYaw = THREE.MathUtils.lerp(0.32, 0, k);
        elbow = THREE.MathUtils.lerp(0.18, rf, k);
      }
      ra = { x: swing, y: -0.12, z: down * 0.32 };
      rf = elbow;
      rSh.x -= 0.2;
      sp1Pitch += torsoPitch * 0.5;
      sp2Pitch += torsoPitch * 0.5;
      spineTwist += torsoYaw;
      if (a >= 1) this.attackT = -1;
    }

    // Stunned daze (5s dizzy wobble)
    if (this.stunned > 0) this.attackT = -1;
    if (this.stunW > 0.01) {
      const w = Math.sin(this.t * 9.0);
      const c = Math.cos(this.t * 9.0);
      la.x = THREE.MathUtils.lerp(la.x, w * 0.45, this.stunW);
      la.z = THREE.MathUtils.lerp(la.z, -0.58 + c * 0.15, this.stunW);
      ra.x = THREE.MathUtils.lerp(ra.x, -w * 0.45, this.stunW);
      ra.z = THREE.MathUtils.lerp(ra.z, 0.58 - c * 0.15, this.stunW);
    }

    if (this.wave > 0) {
      this.wave -= dt;
      ra = { x: 0, y: 0, z: -0.95 + Math.sin(this.t * 12) * 0.32 };
      rf = 0.85;
    }

    const armRate = this.attackT >= 0 ? 32 : 18;
    this.pose('LeftShoulder', lSh.x, lSh.y, lSh.z, 16, dt);
    this.pose('RightShoulder', rSh.x, rSh.y, rSh.z, armRate, dt);
    this.pose('LeftArm', la.x, la.y, la.z, 18, dt);
    this.pose('RightArm', ra.x, ra.y, ra.z, armRate, dt);
    this.pose('LeftForeArm', 0, lf, 0, 20, dt);
    this.pose('RightForeArm', 0, rf, 0, armRate, dt);
    this.pose('LeftHand', lWrist, 0, 0, 18, dt);
    this.pose('RightHand', rWrist, 0, 0, 18, dt);

    // Curl fingers into relaxed grip (or firm weapon grip on right hand)
    const lCurl = this.carrying ? 0.25 : 0.45 + 0.15 * amp;
    const rCurl = this.carrying ? 0.25 : (this.hasWeapon ? 0.95 : 0.45 + 0.15 * amp);
    this.curlFingers(lCurl, rCurl, dt);

    // Spine & Head chain
    let headLookYaw = -spineTwist * 0.75 + this.turnLean * 0.22 + Math.sin(this.t * 0.7) * 0.08 * idleW;
    let headLookPitch = -0.08 * s + Math.cos(this.t * 0.9) * 0.04 * idleW;
    if (this.stunW > 0.01) {
      headLookYaw += Math.sin(this.t * 10) * 0.38 * this.stunW;
      headLookPitch += Math.cos(this.t * 10) * 0.28 * this.stunW;
    }
    this.pose('Spine', sp0Pitch, spineTwist * 0.35, spineRoll * 0.4, 18, dt);
    this.pose('Spine1', sp1Pitch, spineTwist * 0.4, spineRoll * 0.4, 18, dt);
    this.pose('Spine2', sp2Pitch, spineTwist * 0.25, spineRoll * 0.2, 18, dt);
    this.pose('Neck', headLookPitch * 0.4, headLookYaw * 0.4, 0, 16, dt);
    this.pose('Head', headLookPitch * 0.6, headLookYaw * 0.6, -this.turnLean * 0.08, 16, dt);
  }
}
