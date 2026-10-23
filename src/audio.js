// Tiny WebAudio synth for juicy feedback, no audio files needed.
let ctx = null;
let muted = false;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
  if (muted) return;
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur = 0.15, vol = 0.2, freq = 600) {
  if (muted) return;
  const c = ac();
  const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource();
  s.buffer = b;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start();
}
export const sfx = {
  unlock: () => ac(),
  toggleMute: () => (muted = !muted),
  dust: () => tone(1200 + Math.random() * 300, 0.08, 'triangle', 0.06, 400),
  pickup: () => { tone(660, 0.08, 'square', 0.05); tone(990, 0.1, 'square', 0.05, 0, 0.06); },
  buy: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, 0, i * 0.06)); },
  bonk: () => {
    noise(0.18, 0.35, 500);
    tone(140, 0.2, 'sine', 0.25, -80);
    // Cartoon dizzy spinning-stars warble
    [720, 880, 680, 940, 760].forEach((f, i) => tone(f, 0.09, 'sine', 0.055, 80, 0.14 + i * 0.075));
  },
  whoosh: () => noise(0.12, 0.08, 1500),
  steal: () => { tone(880, 0.12, 'sawtooth', 0.06); tone(660, 0.18, 'sawtooth', 0.06, 0, 0.12); },
  alarm: () => { for (let i = 0; i < 3; i++) { tone(520, 0.12, 'square', 0.07, 0, i * 0.25); tone(390, 0.12, 'square', 0.07, 0, i * 0.25 + 0.12); } },
  hatch: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.15, 'sine', 0.08, 0, i * 0.07)); },
  craft: () => { tone(440, 0.1, 'triangle', 0.1); tone(880, 0.25, 'triangle', 0.1, 0, 0.1); },
  lock: () => { noise(0.4, 0.3, 200); tone(90, 0.4, 'sine', 0.2, -30); },
  error: () => tone(160, 0.18, 'square', 0.06),
  chest: () => { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, i * 0.07)); },
  gather: () => noise(0.06, 0.12, 900),
  stepClear: () => { [587, 740, 880, 1175].forEach((f, i) => tone(f, 0.14, 'square', 0.07, 0, i * 0.065)); },
  rankUp: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, 0, i * 0.055)); },
  victory: () => {
    const notes = [
      [523, 0.12, 0.0], [659, 0.12, 0.11], [784, 0.12, 0.22],
      [1046, 0.26, 0.34], [784, 0.14, 0.62], [1046, 0.45, 0.78],
    ];
    notes.forEach(([f, d, delay]) => tone(f, d, 'square', 0.09, 0, delay));
  },
};
