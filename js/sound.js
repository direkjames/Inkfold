// Inkfold — ambient soundscapes, generated live with the Web Audio API (no audio files, fully offline).
let ctx = null, master = null, nodes = [], timers = [], current = null, volume = 0.5;

function noiseBuffer(kind, seconds = 6) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else { // pink (Paul Kellet)
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
  }
  return buf;
}
function loop(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); nodes.push(s); return s; }
function filter(type, freq, q = 0.7) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function gain(v) { const g = ctx.createGain(); g.gain.value = v; nodes.push(g); return g; }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
function lfo(param, rate, depth, base) {
  const o = ctx.createOscillator(); o.frequency.value = rate; const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(param); param.value = base; o.start(); nodes.push(o, g);
}
function burstBuffer(ms, decay) {
  const len = Math.floor(ctx.sampleRate * ms / 1000);
  const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  return b;
}
// schedule short one-shot sounds at random intervals
function sprinkle(makeOne, minMs, maxMs) {
  let next = ctx.currentTime + 0.1;
  const tick = () => {
    while (next < ctx.currentTime + 0.4) { makeOne(next); next += (minMs + Math.random() * (maxMs - minMs)) / 1000; }
  };
  tick(); timers.push(setInterval(tick, 150));
}

const SCENES = {
  rain(out) {
    chain(loop(noiseBuffer('pink')), filter('highpass', 350), filter('lowpass', 6500), gain(0.55), out);
    chain(loop(noiseBuffer('brown')), filter('lowpass', 300), gain(0.35), out);
    const drop = burstBuffer(22, 3);
    sprinkle(t => {
      const s = ctx.createBufferSource(); s.buffer = drop; s.playbackRate.value = 0.6 + Math.random() * 1.2;
      const f = filter('bandpass', 1800 + Math.random() * 3500, 2); const g = ctx.createGain(); g.gain.value = 0.04 + Math.random() * 0.12;
      const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
      chain(s, f, g, p, out); s.start(t);
    }, 15, 70);
  },
  fireplace(out) {
    const base = chain(loop(noiseBuffer('brown')), filter('lowpass', 420), gain(0.6));
    const g = gain(1); lfo(g.gain, 0.23, 0.18, 0.85); chain(base, g, out);
    const crack = burstBuffer(9, 6), pop = burstBuffer(40, 4);
    sprinkle(t => {
      const big = Math.random() < 0.08;
      const s = ctx.createBufferSource(); s.buffer = big ? pop : crack; s.playbackRate.value = 0.7 + Math.random() * 0.8;
      const f = filter('highpass', big ? 700 : 1500 + Math.random() * 2500); const v = ctx.createGain(); v.gain.value = big ? 0.45 : 0.05 + Math.random() * 0.25;
      const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 0.8 - 0.4;
      chain(s, f, v, p, out); s.start(t);
    }, 40, 420);
  },
  cafe(out) {
    chain(loop(noiseBuffer('brown')), filter('lowpass', 900), gain(0.45), out);
    const murmur = chain(loop(noiseBuffer('pink')), filter('bandpass', 520, 1.2), gain(0.0));
    const g = gain(1); lfo(g.gain, 0.37, 0.12, 0.28); chain(murmur, g, out);
    const m2 = chain(loop(noiseBuffer('pink')), filter('bandpass', 310, 1.5), gain(1)); lfo(m2.gain, 0.21, 0.1, 0.18); m2.connect(out);
    sprinkle(t => { // a cup set down somewhere
      const f0 = 2200 + Math.random() * 2400; const v = ctx.createGain(); v.gain.setValueAtTime(0.0001, t);
      v.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.04, t + 0.005); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.4 - 0.7; v.connect(p); p.connect(out);
      [1, 2.76, 5.4].forEach((m, i) => { const o = ctx.createOscillator(); o.frequency.value = f0 * m; const og = ctx.createGain(); og.gain.value = 1 / (i + 1.5); o.connect(og); og.connect(v); o.start(t); o.stop(t + 0.55); });
    }, 2500, 9000);
  },
  ocean(out) {
    const f = filter('lowpass', 900);
    const g = gain(1);
    chain(loop(noiseBuffer('pink', 8)), f, g, out);
    lfo(g.gain, 0.085, 0.42, 0.5); lfo(f.frequency, 0.085, 500, 900);
    chain(loop(noiseBuffer('brown')), filter('lowpass', 200), gain(0.4), out);
  },
};

export const SOUNDS = [
  { id: 'rain', name: 'Rain', icon: 'rain' },
  { id: 'fireplace', name: 'Fireplace', icon: 'fire' },
  { id: 'cafe', name: 'Café', icon: 'cup' },
  { id: 'ocean', name: 'Ocean', icon: 'wave' },
];

export function stop() {
  timers.forEach(clearInterval); timers = [];
  if (master && ctx) {
    const m = master, n = nodes, t = ctx.currentTime;
    m.gain.cancelScheduledValues(t); m.gain.setValueAtTime(m.gain.value, t); m.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => { n.forEach(x => { try { x.stop && x.stop(); } catch {} try { x.disconnect(); } catch {} }); try { m.disconnect(); } catch {} }, 700);
  }
  nodes = []; master = null; current = null;
}

export function play(id) {
  stop();
  if (!SCENES[id]) return;
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(volume * 0.9, ctx.currentTime + 1.5);
  SCENES[id](master);
  current = id;
}

export function setVolume(v) {
  volume = v;
  if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.1); }
}
export const getVolume = () => volume;
export const playing = () => current;

// A soft two-note chime for timers
export function chime() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume();
    const t = ctx.currentTime;
    [[659.25, 0], [987.77, 0.18]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
      o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 1.7);
    });
  } catch {}
}
