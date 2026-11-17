// Inkfold — ambient soundscapes: real recordings in /sounds, looped with a soft crossfade.
// The service worker keeps each recording after its first play, so it works offline from then on.
let ctx = null, session = null, volume = 0.5, onChange = () => {}, onError = () => {};

export const SOUNDS = [
  { id: 'beach', name: 'Beach', icon: 'sun' },
  { id: 'cafe', name: 'Cafe', icon: 'cup' },
  { id: 'crickets', name: 'Crickets', icon: 'moon' },
  { id: 'fireplace', name: 'Fireplace', icon: 'fire' },
  { id: 'forest', name: 'Forest', icon: 'pine' },
  { id: 'library', name: 'Library', icon: 'book' },
  { id: 'rain', name: 'Rain', icon: 'rain' },
  { id: 'river', name: 'River', icon: 'wave' },
  { id: 'thunderstorm', name: 'Thunderstorm', icon: 'bolt' },
  { id: 'village', name: 'Village', icon: 'home' },
];

const XFADE = 3; // seconds of overlap where the recording ends and starts again
const curve = up => Float32Array.from({ length: 48 }, (_, i) => Math.sin((up ? i : 47 - i) / 47 * Math.PI / 2)); // equal-power

function audio(playback) {
  // iPhone/iPad mute Web Audio when the silent switch is on unless the page asks for playback
  if (playback) try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state !== 'running') { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); }
  return ctx;
}

export const playing = () => session ? session.id : null;
export const loading = () => !!(session && !session.ready);
export const getVolume = () => volume;
export function subscribe(fn, errFn) { onChange = fn || (() => {}); onError = errFn || (() => {}); }

export function stop() {
  const s = session; session = null;
  if (!s) return;
  clearInterval(s.timer);
  const t = ctx.currentTime;
  try { s.master.gain.cancelScheduledValues(t); s.master.gain.setValueAtTime(s.master.gain.value, t); s.master.gain.linearRampToValueAtTime(0, t + 0.6); } catch {}
  setTimeout(() => {
    s.els.forEach(el => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} });
    try { s.master.disconnect(); } catch {}
  }, 700);
  onChange();
}

// Must be called from a tap or click: phones only start sound from a gesture.
export function play(id) {
  const item = SOUNDS.find(x => x.id === id);
  stop();
  if (!item) return;
  audio(true);
  const master = ctx.createGain(); master.gain.setValueAtTime(0, ctx.currentTime); master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(volume * 0.9, ctx.currentTime + 1.5);
  const url = `sounds/${item.id}.mp3`;
  const make = () => {
    const el = new Audio(); el.preload = 'auto'; el.src = url;
    const g = ctx.createGain(); g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(g); g.connect(master);
    return { el, g };
  };
  const A = make(), B = make();
  const s = session = { id, master, els: [A.el, B.el], ready: false, timer: 0 };
  let cur = A, other = B, fading = false;
  A.g.gain.value = 1;

  const fail = () => { if (session !== s) return; stop(); onError(`Couldn’t load the ${item.name} sound. Check your connection and try again.`); };
  A.el.addEventListener('error', fail);
  B.el.addEventListener('error', () => { A.el.loop = true; clearInterval(s.timer); });
  A.el.addEventListener('playing', () => { if (session === s && !s.ready) { s.ready = true; onChange(); } }, { once: true });

  // Unlock the second player inside this same tap, so it can start later on its own (iOS needs this)
  const p1 = A.el.play(); if (p1 && p1.catch) p1.catch(fail);
  try { const p2 = B.el.play(); if (p2 && p2.catch) p2.catch(() => {}); B.el.pause(); } catch {}
  onChange();

  s.timer = setInterval(() => {
    if (session !== s || fading) return;
    const d = cur.el.duration;
    if (!isFinite(d) || d < XFADE * 3) { if (isFinite(d)) { A.el.loop = true; clearInterval(s.timer); } return; }
    if (d - cur.el.currentTime > XFADE + 0.2) return;
    fading = true;
    const from = cur, to = other, t = ctx.currentTime;
    try { to.el.currentTime = 0; } catch {}
    const go = to.el.play();
    const swap = () => {
      to.g.gain.cancelScheduledValues(t); to.g.gain.setValueCurveAtTime(curve(true), t, XFADE);
      from.g.gain.cancelScheduledValues(t); from.g.gain.setValueCurveAtTime(curve(false), t, XFADE);
      setTimeout(() => { if (session !== s) return; try { from.el.pause(); from.el.currentTime = 0; } catch {} cur = to; other = from; fading = false; }, XFADE * 1000 + 100);
    };
    if (go && go.then) go.then(swap, () => { fading = false; cur.el.loop = true; clearInterval(s.timer); }); else swap();
  }, 200);
}

export function setVolume(v) {
  volume = v;
  if (session && ctx) { const g = session.master.gain; g.cancelScheduledValues(ctx.currentTime); g.setTargetAtTime(v * 0.9, ctx.currentTime, 0.1); }
}

// A soft two-note chime for timers
export function chime() {
  try {
    audio();
    const t = ctx.currentTime;
    [[659.25, 0], [987.77, 0.18]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
      o.connect(g); g.connect(ctx.destination); o.start(t + d); o.stop(t + d + 1.7);
    });
  } catch {}
}
