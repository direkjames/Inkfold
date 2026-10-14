// Inkfold — Nearby Sync. Devices talk directly (WebRTC). Nothing is stored on a server.
import { db, deviceInfo } from './db.js';
import { loadLib, LIBS } from './libs.js';

const ITEM_FIELDS = ['projectId', 'type', 'parentId', 'order', 'title', 'content', 'deleted', 'status', 'label', 'pov', 'synopsis', 'target', 'data'];
const PROJECT_FIELDS = ['title', 'subtitle', 'author', 'cover', 'format', 'deleted', 'target', 'deadline', 'coverImage'];
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
    if (!L) { out.projects.push(R); summary.projectsAdded++; continue; }
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

export async function applyMerge(remote, peerName) {
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
const CHUNK = 15000;
class Channel {
  constructor(sendRaw, getBuffered) { this.sendRaw = sendRaw; this.getBuffered = getBuffered; this.parts = new Map(); this.onmessage = null; }
  async send(obj) {
    const s = JSON.stringify(obj);
    const id = Math.random().toString(36).slice(2, 8);
    const n = Math.ceil(s.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) {
      while (this.getBuffered && this.getBuffered() > 1_000_000) await new Promise(r => setTimeout(r, 40));
      this.sendRaw(JSON.stringify({ c: id, i, n, p: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
    }
  }
  receive(raw) {
    let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
    if (!m || !m.c) return;
    const arr = this.parts.get(m.c) || [];
    arr[m.i] = m.p; this.parts.set(m.c, arr);
    if (arr.filter(x => x !== undefined).length === m.n) {
      this.parts.delete(m.c);
      try { this.onmessage && this.onmessage(JSON.parse(arr.join(''))); } catch (e) { console.error(e); }
    }
  }
}

// ---------------- Sync session (same on both devices) ----------------
export function runSession(channel, { onStatus, onDone, onError, close }) {
  let me, peer = null, remoteData = null, sentData = false, merged = false, peerDone = false, summary = null;
  const finish = () => { if (merged && peerDone) { onDone(summary, peer); setTimeout(() => close && close(), 600); } };
  const tryMerge = async () => {
    if (!sentData || !remoteData || merged) return;
    onStatus(`Merging changes from ${peer.name}…`);
    try {
      summary = await applyMerge(remoteData, peer.name);
      const last = await db.meta('lastSync', {});
      last[peer.id] = { at: Date.now(), name: peer.name };
      await db.setMeta('lastSync', last);
      merged = true;
      await channel.send({ t: 'done' });
      finish();
    } catch (e) { onError(e); }
  };
  channel.onmessage = async (m) => {
    if (m.t === 'hello') {
      peer = { id: m.deviceId, name: m.name || 'Other device' };
      onStatus(`Connected to ${peer.name}. Saving a snapshot…`);
      await db.snapshot(`Before sync with ${peer.name}`);
      onStatus(`Sending your library to ${peer.name}…`);
      await channel.send({ t: 'data', data: await db.dump() });
      sentData = true;
      tryMerge();
    } else if (m.t === 'data') { remoteData = m.data; onStatus(`Received ${peer ? peer.name : 'library'}…`); tryMerge(); }
    else if (m.t === 'done') { peerDone = true; finish(); }
  };
  return (async () => { me = await deviceInfo(); await channel.send({ t: 'hello', deviceId: me.id, name: me.name, v: 1 }); })();
}

// ---------------- Transport A: pairing code (PeerJS matchmaker, files go device-to-device) ----------------
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHA[b % ALPHA.length]).join('');
const peerId = code => 'inkfold-v1-' + code.toLowerCase().replace(/[^a-z0-9]/g, '');

function wrapPeerConn(conn) {
  const ch = new Channel(s => conn.send(s), () => (conn.dataChannel ? conn.dataChannel.bufferedAmount : 0));
  conn.on('data', d => ch.receive(d));
  return ch;
}

export async function hostWithCode(code, handlers) {
  await loadLib(LIBS.peerjs);
  const peer = new window.Peer(peerId(code), { debug: 0 });
  const cleanup = () => { try { peer.destroy(); } catch {} };
  peer.on('error', e => handlers.onError(new Error(e.type === 'unavailable-id' ? 'That code is busy. Generate a new one.' : e.type === 'network' || e.type === 'server-error' ? 'Pairing codes need internet for a moment. Use Offline pairing instead.' : (e.message || 'Connection failed'))));
  peer.on('open', () => handlers.onStatus('Waiting for the other device…'));
  peer.on('connection', conn => {
    conn.on('open', () => runSession(wrapPeerConn(conn), { ...handlers, close: cleanup }));
    conn.on('error', e => handlers.onError(e));
  });
  return cleanup;
}

export async function joinWithCode(code, handlers) {
  await loadLib(LIBS.peerjs);
  const peer = new window.Peer({ debug: 0 });
  const cleanup = () => { try { peer.destroy(); } catch {} };
  peer.on('error', e => handlers.onError(new Error(e.type === 'peer-unavailable' ? 'No device is showing that code. Check it and try again.' : e.type === 'network' || e.type === 'server-error' ? 'Pairing codes need internet for a moment. Use Offline pairing instead.' : (e.message || 'Connection failed'))));
  peer.on('open', () => {
    handlers.onStatus('Connecting…');
    const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
    conn.on('open', () => runSession(wrapPeerConn(conn), { ...handlers, close: cleanup }));
    conn.on('error', e => handlers.onError(e));
  });
  return cleanup;
}

// ---------------- Transport B: offline pairing (QR / copy-paste, no internet) ----------------
async function packSdp(prefix, desc) {
  const json = JSON.stringify({ t: desc.type, s: desc.sdp.split(/\r?\n/).filter(l => l && !/^a=(extmap|rtcp-fb|ssrc|msid)/.test(l)).join('\n') });
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
  const [head, body] = code.split('.');
  const bin = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  if (head.endsWith('z')) {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  }
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return { type: o.t, sdp: o.s.split('\n').filter(Boolean).join('\r\n') + '\r\n' };
}
function gathered(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 2500);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function wireChannel(dc, handlers, pc) {
  dc.bufferedAmountLowThreshold = 256000;
  const ch = new Channel(s => dc.send(s), () => dc.bufferedAmount);
  dc.onmessage = e => ch.receive(e.data);
  dc.onopen = () => runSession(ch, { ...handlers, close: () => { try { pc.close(); } catch {} } });
}

export async function offlineStart(handlers) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel('inkfold', { ordered: true });
  wireChannel(dc, handlers, pc);
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await packSdp('IF1O', pc.localDescription);
  return {
    code,
    async acceptReply(reply) { await pc.setRemoteDescription(await unpackSdp(reply, 'IF1A')); handlers.onStatus('Connecting over Wi-Fi…'); },
    close() { try { pc.close(); } catch {} }
  };
}

export async function offlineJoin(offerCode, handlers) {
  const offer = await unpackSdp(offerCode, 'IF1O');
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.ondatachannel = e => wireChannel(e.channel, handlers, pc);
  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await packSdp('IF1A', pc.localDescription), close() { try { pc.close(); } catch {} } };
}
