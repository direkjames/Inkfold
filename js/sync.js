// Inkfold — Nearby Sync. Devices talk directly (WebRTC). Nothing is stored on a server.
import { db, deviceInfo } from './db.js';
import { loadLib, LIBS } from './libs.js';

const ITEM_FIELDS = ['projectId', 'type', 'parentId', 'order', 'title', 'content', 'deleted', 'status', 'label', 'pov', 'synopsis', 'target', 'data', 'when', 'enc', 'place', 'cast'];
const PROJECT_FIELDS = ['title', 'subtitle', 'author', 'cover', 'format', 'deleted', 'target', 'deadline', 'coverImage', 'mode', 'compile', 'enc', 'align', 'kind', 'seriesId', 'seriesOrder'];
const sig = (r, f) => JSON.stringify(f.map(k => r[k] ?? null));

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Decide which of two versions of the same record wins. Deterministic on both devices.
function relation(L, R) {
  if (L.rev && R.rev) {
    if (L.rev === R.rev) return 'same';
    if ((R.revs || []).includes(L.rev)) return 'remote-newer'; // remote built on top of ours
    if ((L.revs || []).includes(R.rev)) return 'local-newer';
    return 'diverged';
  }
  return 'diverged';
}
function pickNewer(L, R, fields) {
  if (R.updatedAt !== L.updatedAt) return R.updatedAt > L.updatedAt ? R : L;
  return sig(R, fields) > sig(L, fields) ? R : L;
}

/**
 * Merge a remote library dump into the local one.
 * Returns the writes to apply and a human summary. Both devices run this and end up identical.
 */
export function mergeLibraries(local, remote, peerName = 'other device') {
  const out = { projects: [], items: [], tombstones: [], deleteItems: [], deleteProjects: [] };
  const summary = { projectsAdded: 0, projectsUpdated: 0, scenesAdded: 0, scenesUpdated: 0, conflicts: [] };
  const tombs = new Map();
  [...(local.tombstones || []), ...(remote.tombstones || [])].forEach(t => tombs.set(t.id, t));
  (remote.tombstones || []).forEach(t => { if (!(local.tombstones || []).some(x => x.id === t.id)) out.tombstones.push(t); });

  // Projects
  const lp = new Map(local.projects.map(p => [p.id, p]));
  for (const R of remote.projects) {
    if (tombs.has(R.id)) continue;
    const L = lp.get(R.id);
    if (!L) { out.projects.push(R); if (R.kind !== 'series') summary.projectsAdded++; continue; }
    if (sig(L, PROJECT_FIELDS) === sig(R, PROJECT_FIELDS)) continue;
    const rel = relation(L, R);
    const win = rel === 'remote-newer' ? R : rel === 'local-newer' ? L : pickNewer(L, R, PROJECT_FIELDS);
    if (win === R) { out.projects.push(R); summary.projectsUpdated++; }
  }
  for (const L of local.projects) if (tombs.has(L.id)) out.deleteProjects.push(L.id);

  // Items (chapters + scenes)
  const li = new Map(local.items.map(i => [i.id, i]));
  const ri = new Map(remote.items.map(i => [i.id, i]));
  for (const R of remote.items) {
    if (tombs.has(R.id)) continue;
    const L = li.get(R.id);
    const isScene = R.type === 'scene';
    if (!L) { out.items.push(R); if (isScene && !R.deleted) summary.scenesAdded++; continue; }
    if (sig(L, ITEM_FIELDS) === sig(R, ITEM_FIELDS)) continue;
    const rel = relation(L, R);
    if (rel === 'remote-newer') { out.items.push(R); if (isScene) summary.scenesUpdated++; continue; }
    if (rel === 'local-newer' || rel === 'same') continue;

    // Edited on both devices since they last matched.
    const win = pickNewer(L, R, ITEM_FIELDS);
    const lose = win === L ? R : L;
    if (isScene && !L.deleted && !R.deleted && L.content !== R.content) {
      const copyId = lose.id + '~' + hash(lose.content || '');
      if (!li.has(copyId) && !ri.has(copyId)) {
        const fromName = lose === R ? peerName : 'this device';
        out.items.push({ ...lose, id: copyId, title: `${lose.title} (conflicted copy)`, order: win.order + 0.001, conflictOf: win.id });
        summary.conflicts.push({ title: win.title, from: fromName });
      }
    }
    if (win === R) { out.items.push(R); if (isScene) summary.scenesUpdated++; }
  }
  for (const L of local.items) if (tombs.has(L.id)) out.deleteItems.push(L.id);

  // Writing log: one record per day, project and device, so devices simply union their stats
  out.log = [];
  const ll = new Map((local.log || []).map(l => [l.id, l]));
  for (const R of remote.log || []) { const L = ll.get(R.id); if (!L || (R.words || 0) > (L.words || 0)) out.log.push(R); }
  return { writes: out, summary };
}

// Everything a paired device sends is checked before it touches the library.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function cleanRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || !r.id || r.id.length > 200) return null;
  if (Object.keys(r).some(k => BAD_KEYS.has(k))) return null;
  return r;
}
export function validateDump(d) {
  if (!d || typeof d !== 'object' || d.format !== 'inkfold-library' || !Array.isArray(d.projects) || !Array.isArray(d.items)) throw new Error('The other device sent data Inkfold doesn’t understand. Update Inkfold on both devices and try again.');
  const list = a => (Array.isArray(a) ? a : []).map(cleanRecord).filter(Boolean);
  return { format: d.format, version: d.version, projects: list(d.projects), items: list(d.items), tombstones: list(d.tombstones), log: list(d.log) };
}

export async function applyMerge(remoteRaw, peerName) {
  const remote = validateDump(remoteRaw);
  const local = await db.dump();
  const { writes, summary } = mergeLibraries(local, remote, peerName);
  await db.writeBatch(writes);
  return summary;
}

export function describeSummary(s) {
  const parts = [];
  const scenes = s.scenesAdded + s.scenesUpdated;
  if (s.projectsAdded) parts.push(`${s.projectsAdded} new project${s.projectsAdded > 1 ? 's' : ''}`);
  if (scenes) parts.push(`${scenes} scene${scenes > 1 ? 's' : ''} updated`);
  if (s.conflicts.length) parts.push(`${s.conflicts.length} conflict${s.conflicts.length > 1 ? 's' : ''} kept as copies`);
  return parts.length ? parts.join(' · ') : 'Already up to date';
}

// ---------------- Channel: chunked JSON over a data channel ----------------
// Chunks stay well under 16 KB even for non-Latin text, which is the smallest message size browsers agree on.
const CHUNK = 4000;
const HIGH_WATER = 512 * 1024;
const MAX_CHUNKS = 200000;
class Channel {
  constructor(sendRaw, getBuffered) {
    this.sendRaw = sendRaw; this.getBuffered = getBuffered;
    this.parts = new Map(); this.counts = new Map();
    this.queue = []; this._onmessage = null;
    this.onprogress = null; this.onactivity = null; this.closed = false;
  }
  set onmessage(fn) {
    this._onmessage = fn;
    if (fn && this.queue.length) this.queue.splice(0).forEach(m => fn(m));
  }
  get onmessage() { return this._onmessage; }
  async send(obj, onProgress, track = true) {
    const s = JSON.stringify(obj);
    const id = Math.random().toString(36).slice(2, 8);
    const n = Math.ceil(s.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) {
      while (this.getBuffered && this.getBuffered() > HIGH_WATER) {
        if (this.closed) throw new Error('The connection dropped before sync finished.');
        await new Promise(r => setTimeout(r, 20));
      }
      if (this.closed) throw new Error('The connection dropped before sync finished.');
      this.sendRaw(JSON.stringify({ c: id, i, n, p: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
      if (track) this.onactivity && this.onactivity();
      if (onProgress && n > 8 && i % 16 === 15) onProgress(Math.round(((i + 1) / n) * 100));
    }
  }
  receive(raw) {
    let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!m || typeof m.c !== 'string' || m.c.length > 16 || !Number.isInteger(m.i) || !Number.isInteger(m.n) || m.n < 1 || m.n > MAX_CHUNKS || m.i < 0 || m.i >= m.n || typeof m.p !== 'string') return;
    this.onactivity && this.onactivity();
    let arr = this.parts.get(m.c);
    if (!arr) {
      if (this.parts.size >= 8) return;
      arr = new Array(m.n); this.parts.set(m.c, arr); this.counts.set(m.c, 0);
    }
    if (arr.length !== m.n || arr[m.i] !== undefined) return;
    arr[m.i] = m.p;
    const c = this.counts.get(m.c) + 1; this.counts.set(m.c, c);
    if (m.n > 8 && this.onprogress && c % 16 === 0) this.onprogress(Math.round((c / m.n) * 100));
    if (c === m.n) {
      this.parts.delete(m.c); this.counts.delete(m.c);
      let msg; try { msg = JSON.parse(arr.join('')); } catch (e) { return console.error(e); }
      if (this._onmessage) this._onmessage(msg); else this.queue.push(msg);
    }
  }
}

// ---------------- Sync session (same on both devices) ----------------
const STALL_MS = 45000;
// Returns a stop() function. `confirm(peer)` (optional) lets this device approve the other one before any data moves.
const HANDSHAKE_MS = 20000;
export function runSession(channel, { onStatus, onDone, onError, close, confirm }) {
  let me = null, peer = null, remoteData = null, sentData = false, merging = false, merged = false, peerDone = false, summary = null;
  const ready = deviceInfo().then(d => { me = d; });
  let stopped = false, acked = false, lastActive = Date.now(), helloTimer = null, watchdog = null, handshake = null;
  const stop = () => { stopped = true; channel.closed = true; clearInterval(helloTimer); clearInterval(watchdog); clearTimeout(handshake); };
  const fail = e => { if (stopped) return; stop(); onError(e instanceof Error ? e : new Error(String(e))); setTimeout(() => close && close(), 400); };
  const finish = () => {
    if (stopped || !merged || !peerDone) return;
    stop(); onDone(summary, peer); setTimeout(() => close && close(), 800);
  };
  // Only what the other device sends counts as life; our own retries must not keep a dead session looking busy.
  channel.onactivity = () => { lastActive = Date.now(); };
  channel.onclose = () => { if (merged && !stopped) { peerDone = true; finish(); } else fail(new Error('The connection dropped before sync finished.')); };

  const tryMerge = async () => {
    if (!sentData || !remoteData || merging || stopped) return;
    merging = true;
    onStatus(`Merging changes from ${peer.name}…`);
    try {
      summary = await applyMerge(remoteData, peer.name);
      remoteData = null;
      const last = await db.meta('lastSync', {});
      last[peer.id] = { at: Date.now(), name: peer.name };
      await db.setMeta('lastSync', last);
      merged = true;
      await channel.send({ t: 'done' });
      finish();
    } catch (e) { fail(e); }
  };

  const sendHello = () => { if (me) channel.send({ t: 'hello', deviceId: me.id, name: me.name, v: 1, got: !!peer }, null, false).catch(() => {}); };

  const onHello = async m => {
    if (m.got) acked = true; // the other device has our hello, so we can stop repeating it
    if (peer) return;
    if (typeof m.deviceId !== 'string' || !m.deviceId) return;
    if (m.v !== 1) return fail(new Error('The other device runs a different version of Inkfold. Update both and try again.'));
    clearTimeout(handshake);
    peer = { id: m.deviceId, name: String(m.name || 'Other device').slice(0, 40) };
    sendHello(); // tells the other side its hello arrived
    if (confirm) {
      onStatus(`${peer.name} wants to sync with this device.`);
      // keeps the other device informed (and its stall timer quiet) while this one waits for a tap
      const waiting = setInterval(() => channel.send({ t: 'wait', name: me.name }, null, false).catch(() => {}), 4000);
      channel.send({ t: 'wait', name: me.name }, null, false).catch(() => {});
      const ok = await Promise.race([confirm(peer), new Promise(r => setTimeout(() => r(false), 120000))]);
      clearInterval(waiting);
      if (!ok) { try { await channel.send({ t: 'deny' }, null, false); } catch {} return fail(new Error('Sync was cancelled on this device.')); }
    }
    onStatus(`Connected to ${peer.name}. Saving a snapshot…`);
    await db.snapshot(`Before sync with ${peer.name}`);
    onStatus(`Sending your library to ${peer.name}…`);
    await channel.send({ t: 'data', data: await db.dump() }, pct => onStatus(`Sending your library to ${peer.name}… ${pct}%`));
    sentData = true;
    if (!remoteData) onStatus(`Waiting for ${peer.name}…`);
    await tryMerge();
  };

  channel.onprogress = pct => { if (!stopped) onStatus(`Receiving ${peer ? peer.name + '’s' : 'the'} library… ${pct}%`); };
  channel.onmessage = async m => {
    if (!m || typeof m !== 'object') return;
    try {
      await ready; // a message can arrive before this device knows its own name
      if (stopped) return;
      if (m.t === 'hello') await onHello(m);
      else if (m.t === 'data') { acked = true; remoteData = m.data; if (peer) onStatus(`Received ${peer.name}’s library…`); await tryMerge(); } // can land before the hello that names the sender
      else if (m.t === 'done') { peerDone = true; finish(); }
      else if (m.t === 'wait') onStatus(`Waiting for ${String(m.name || 'the other device').slice(0, 40)} to approve…`);
      else if (m.t === 'deny') fail(new Error('The other device declined the sync.'));
    } catch (e) { fail(e); }
  };

  (async () => {
    try {
      await ready;
      // hello is repeated until the other side confirms it got ours, so one lost on the way can't leave a device waiting
      sendHello(); helloTimer = setInterval(() => { if (!stopped && (!peer || !acked)) sendHello(); }, 1500);
      handshake = setTimeout(() => { if (!peer) fail(new Error('Connected, but the other device didn’t answer. Open Nearby Sync on it, then try again.')); }, HANDSHAKE_MS);
      watchdog = setInterval(() => { if (!stopped && Date.now() - lastActive > STALL_MS) fail(new Error('The other device stopped responding.')); }, 5000);
    } catch (e) { fail(e); }
  })();
  return stop;
}

// ---------------- Shared WebRTC helpers ----------------
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const iceServers = () => (navigator.onLine ? STUN : []);
const CONNECT_MS = 25000;
const WIFI_HINT = 'Make sure both devices are on the same Wi-Fi network (not a guest network) and keep Inkfold open on both.';

// Wraps a session so success/failure is reported once and the connection is always cleaned up.
function guarded(handlers) {
  let ended = false;
  return {
    ...handlers,
    onDone: (s, p) => { ended = true; handlers.onDone(s, p); },
    onError: e => { if (ended) return; ended = true; handlers.onError(e); },
    get ended() { return ended; },
  };
}

// ---------------- Transport A: pairing code (PeerJS matchmaker, files go device-to-device) ----------------
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHA[b % ALPHA.length]).join('');
const peerId = code => 'inkfold-v1-' + code.toLowerCase().replace(/[^a-z0-9]/g, '');
const NET_MSG = 'Pairing codes need internet for a moment. Use Offline (QR) instead.';
const BROKER_MS = 12000;
const PEER_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ],
  sdpSemantics: 'unified-plan',
};
const peerErr = e => new Error(
  e.type === 'unavailable-id' ? 'That code is busy. Generate a new one.'
  : e.type === 'peer-unavailable' ? 'No device is showing that code. Check it and try again.'
  : ['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type) ? NET_MSG
  : (e.message || 'Connection failed'));

// Raw strings: Inkfold already chunks and encodes its own messages, and PeerJS's JSON mode rejects anything over 16 KB after re-encoding.
const SERIALIZATION = 'raw';
function wrapPeerConn(conn) {
  const ch = new Channel(s => conn.send(s), () => (conn.dataChannel ? conn.dataChannel.bufferedAmount : 0));
  conn.on('data', d => ch.receive(d));
  conn.on('close', () => { ch.closed = true; ch.onclose && ch.onclose(); });
  return ch;
}

// Watches the WebRTC link PeerJS builds, so a link that can't form is reported with what was tried instead of hanging.
function watchPeerLink(conn, onFail) {
  const seen = { host: 0, srflx: 0, relay: 0, mdns: 0 };
  let tries = 0;
  const attach = () => {
    const pc = conn.peerConnection;
    if (!pc) { if (++tries < 40) setTimeout(attach, 50); return; }
    pc.addEventListener('icecandidate', e => {
      const c = e.candidate && e.candidate.candidate; if (!c) return;
      const t = /typ (host|srflx|relay)/.exec(c); if (t) seen[t[1]]++;
      if (/\.local\s/.test(c)) seen.mdns++;
    });
    pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed') onFail(); });
  };
  attach();
  return () => `Tried ${seen.host} local, ${seen.srflx} public and ${seen.relay} relay routes.`;
}

export async function hostWithCode(code, handlers) {
  await loadLib(LIBS.peerjs);
  const h = guarded(handlers);
  const peer = new window.Peer(peerId(code), { debug: 0, config: PEER_CONFIG });
  let stopSession = null, active = false, timer = null;
  const cleanup = () => { clearTimeout(timer); try { stopSession && stopSession(); } catch {} try { peer.destroy(); } catch {} };
  const brokerTimer = setTimeout(() => { if (!peer.open) { h.onError(new Error(NET_MSG)); cleanup(); } }, BROKER_MS);
  peer.on('error', e => { clearTimeout(brokerTimer); h.onError(peerErr(e)); });
  peer.on('disconnected', () => { if (!peer.destroyed && !active) try { peer.reconnect(); } catch {} });
  peer.on('open', () => { clearTimeout(brokerTimer); handlers.onStatus('Waiting for the other device…'); });
  peer.on('connection', conn => {
    if (active) { conn.on('open', () => conn.close()); return; } // one device at a time
    active = true;
    handlers.onStatus('Connecting to your other device…');
    const diag = watchPeerLink(conn, () => { h.onError(new Error(`Couldn’t connect to the other device. ${WIFI_HINT} ${diag()}`)); cleanup(); });
    timer = setTimeout(() => { if (!stopSession) { h.onError(new Error(`Couldn’t connect to the other device. ${WIFI_HINT} ${diag()}`)); cleanup(); } }, CONNECT_MS);
    const ch = wrapPeerConn(conn);
    conn.on('error', e => h.onError(new Error(e.message || 'Connection failed')));
    conn.on('open', () => { clearTimeout(timer); stopSession = runSession(ch, { onStatus: h.onStatus, onDone: h.onDone, onError: h.onError, confirm: handlers.confirm, close: cleanup }); });
  });
  return () => { clearTimeout(brokerTimer); cleanup(); };
}

export async function joinWithCode(code, handlers) {
  await loadLib(LIBS.peerjs);
  const h = guarded(handlers);
  const peer = new window.Peer({ debug: 0, config: PEER_CONFIG });
  let stopSession = null, timer = null;
  const cleanup = () => { clearTimeout(timer); try { stopSession && stopSession(); } catch {} try { peer.destroy(); } catch {} };
  timer = setTimeout(() => { if (!peer.open) { h.onError(new Error(NET_MSG)); cleanup(); } }, BROKER_MS);
  peer.on('error', e => { clearTimeout(timer); h.onError(peerErr(e)); });
  peer.on('open', () => {
    clearTimeout(timer);
    handlers.onStatus('Looking for the other device…');
    const conn = peer.connect(peerId(code), { reliable: true, serialization: SERIALIZATION });
    const fail = () => { h.onError(new Error(`Couldn’t connect to the other device. ${WIFI_HINT} ${diag()}`)); cleanup(); };
    const diag = watchPeerLink(conn, fail);
    const ch = wrapPeerConn(conn);
    timer = setTimeout(() => { if (!stopSession) fail(); }, CONNECT_MS);
    conn.on('error', e => h.onError(new Error(e.message || 'Connection failed')));
    conn.on('open', () => {
      clearTimeout(timer);
      handlers.onStatus('Connected. Waiting for the other device to approve…');
      // the device that shows the code approves; this one just waits (no confirm here)
      stopSession = runSession(ch, { onStatus: h.onStatus, onDone: h.onDone, onError: h.onError, close: cleanup });
    });
  });
  return cleanup;
}

// ---------------- Transport B: offline pairing (QR / copy-paste, no internet) ----------------
function compactSdp(sdp) {
  return sdp.split(/\r?\n/).filter(l => {
    if (!l || /^a=(extmap|rtcp-fb|ssrc|msid|ice-options)/.test(l)) return false;
    if (/^a=candidate:/.test(l) && (/\stcp\s/i.test(l) || /\sfe80:/i.test(l))) return false; // UDP only, no link-local IPv6
    return true;
  }).join('\n');
}
async function packSdp(prefix, desc) {
  const json = JSON.stringify({ t: desc.type, s: compactSdp(desc.sdp) });
  let bytes = new TextEncoder().encode(json);
  let tag = 'r';
  if (window.CompressionStream) {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(cs).arrayBuffer()); tag = 'z';
  }
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `${prefix}${tag}.` + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackSdp(code, prefix) {
  code = (code || '').trim().replace(/\s+/g, '');
  if (!code.startsWith(prefix)) throw new Error(prefix === 'IF1O' ? 'That isn’t a pairing code from “Start”.' : 'That isn’t a reply code from the other device.');
  try {
    const [head, body] = code.split('.');
    const bin = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    let bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (head.endsWith('z')) {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!['offer', 'answer'].includes(o.t) || typeof o.s !== 'string') throw new Error('bad');
    return { type: o.t, sdp: o.s.split('\n').filter(Boolean).join('\r\n') + '\r\n' };
  } catch { throw new Error('That code looks damaged or incomplete. Scan it again or copy it in full.'); }
}
function gathered(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
// Reports a dead connection instead of spinning forever.
function watchConnection(pc, h) {
  let timer = null, lost = null;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { if (pc.connectionState !== 'connected') { h.onError(new Error(`Couldn’t connect to the other device. ${WIFI_HINT}`)); try { pc.close(); } catch {} } }, CONNECT_MS); };
  pc.addEventListener('connectionstatechange', () => {
    const st = pc.connectionState;
    if (st === 'connected') { clearTimeout(timer); clearTimeout(lost); }
    else if (st === 'failed') { clearTimeout(timer); h.onError(new Error(`Couldn’t connect to the other device. ${WIFI_HINT}`)); try { pc.close(); } catch {} }
    else if (st === 'disconnected') { lost = setTimeout(() => { if (pc.connectionState === 'disconnected') pc.close(); }, 8000); }
  });
  return { arm, clear: () => { clearTimeout(timer); clearTimeout(lost); } };
}
function wireChannel(dc, h, pc) {
  const ch = new Channel(s => dc.send(s), () => dc.bufferedAmount);
  let stopSession = null;
  dc.onmessage = e => ch.receive(e.data);
  dc.onclose = () => { ch.closed = true; ch.onclose && ch.onclose(); };
  dc.onerror = () => {};
  const start = () => { if (!stopSession) stopSession = runSession(ch, { ...h, close: () => { try { pc.close(); } catch {} } }); };
  if (dc.readyState === 'open') start(); else dc.onopen = start;
  return () => { try { stopSession && stopSession(); } catch {} };
}

export async function offlineStart(handlers) {
  const h = guarded(handlers);
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const watch = watchConnection(pc, h);
  const dc = pc.createDataChannel('inkfold', { ordered: true });
  const stopSession = wireChannel(dc, h, pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await packSdp('IF1O', pc.localDescription);
  const close = () => { watch.clear(); stopSession(); try { pc.close(); } catch {} };
  return {
    code,
    async acceptReply(reply) {
      await pc.setRemoteDescription(await unpackSdp(reply, 'IF1A'));
      handlers.onStatus('Connecting over Wi-Fi…'); watch.arm();
    },
    close
  };
}

export async function offlineJoin(offerCode, handlers) {
  const h = guarded(handlers);
  const offer = await unpackSdp(offerCode, 'IF1O');
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const watch = watchConnection(pc, h);
  let stopSession = () => {};
  pc.ondatachannel = e => { stopSession = wireChannel(e.channel, h, pc); };
  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  watch.arm();
  return { code: await packSdp('IF1A', pc.localDescription), close() { watch.clear(); stopSession(); try { pc.close(); } catch {} } };
}
