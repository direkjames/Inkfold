// Inkfold — Linked from Mapfold. Mapfold (the sister worldbuilding app on the same domain) shares finished maps
// by writing them to its own IndexedDB ("mapfold-link"). We only ever READ that database, then create ordinary
// Inkfold items from it, so everything here keeps working with sync, backups and trash like any other map.
//
//   map     data.mapfold  = { key, worldId, mapId, revision, plainRev, name }   (key = worldId:mapId)
//   mapmark data.mapfoldId = the id of the pin / label / region / route inside Mapfold
//   place   data.mapfoldId = the id of the Mapfold wiki entry, data.mapfoldBody = the text we imported
//
// Re-importing updates what Mapfold owns, removes marks that were deleted in Mapfold and leaves
// anything you added in Inkfold alone. Secret items never leave Mapfold, so there is nothing to filter here.
import { uid } from './db.js';
import { touch } from './model.js';
import { $, esc, icon, sheet, toast, errorToast } from './ui.js';
import { createEntry, entries } from './bible.js';
import { compressImage } from './images.js';

let ctx; // { state, saveItem, open(mapId), refresh() }
export function initMapfold(c) {
  ctx = c;
  try {
    const ch = new BroadcastChannel('mapfold-link');
    let t = 0;
    ch.onmessage = e => {
      const d = e.data || {};
      if (d.t !== 'published' || !linkedMaps().some(m => m.data.mapfold.worldId === d.worldId)) return;
      clearTimeout(t);
      t = setTimeout(async () => {
        const stale = (await updatesFor(d.worldId)).length;
        if (stale) toast(`Mapfold has ${stale === 1 ? 'an update' : stale + ' updates'} for a linked map.`, { label: 'Review', run: () => openImportSheet() }, 8000);
      }, 800);
    };
  } catch { /* BroadcastChannel unavailable */ }
}

const items = () => ctx.state.items;
const owner = () => ctx.state.project.seriesId || ctx.state.project.id;
export const linkedMaps = () => items().filter(i => i.type === 'map' && !i.deleted && i.data && i.data.mapfold && i.data.mapfold.key);
export const mapfoldInfo = m => (m && m.data && m.data.mapfold) || null;

// ---------------------------------------------------------------- reading Mapfold's shared database (read-only)
function openLink() {
  return new Promise(res => {
    if (typeof indexedDB === 'undefined') return res(null);
    let req;
    try { req = indexedDB.open('mapfold-link'); } catch { return res(null); }
    // Nothing shared yet: the database doesn't exist, so don't create an empty one on Mapfold's behalf.
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch {} };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('packages')) { db.close(); return res(null); }
      res(db);
    };
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
}
export async function readPackages() {
  const db = await openLink(); if (!db) return [];
  try {
    return await new Promise(res => {
      const r = db.transaction('packages', 'readonly').objectStore('packages').getAll();
      r.onsuccess = () => res((r.result || []).filter(p => p && p.key && p.worldId && p.interchange));
      r.onerror = () => res([]);
    });
  } finally { db.close(); }
}
const byWorld = pkgs => {
  const worlds = new Map();
  for (const p of pkgs) {
    if (!worlds.has(p.worldId)) worlds.set(p.worldId, { id: p.worldId, name: p.worldName || 'Untitled world', pkgs: [] });
    worlds.get(p.worldId).pkgs.push(p);
  }
  // parents first so a map's children can find it
  worlds.forEach(w => {
    const ids = new Set(w.pkgs.map(p => p.mapId)), out = [], seen = new Set();
    const add = p => { if (seen.has(p.mapId)) return; seen.add(p.mapId); out.push(p); w.pkgs.filter(c => c.parentMapId === p.mapId).forEach(add); };
    w.pkgs.filter(p => !p.parentMapId || !ids.has(p.parentMapId)).forEach(add); w.pkgs.forEach(add);
    w.pkgs = out;
  });
  return [...worlds.values()];
};
const existingFor = pkg => linkedMaps().find(m => m.data.mapfold.key === pkg.key) || null;
const statusOf = pkg => { const m = existingFor(pkg); return !m ? 'new' : (m.data.mapfold.revision === pkg.revision ? 'current' : 'update'); };
async function updatesFor(worldId) { return (await readPackages()).filter(p => p.worldId === worldId && statusOf(p) === 'update'); }

// ---------------------------------------------------------------- cleaning what comes in
const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const txt = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim())) ? v.trim() : d;
const pts = a => (Array.isArray(a) ? a : []).slice(0, 2000).map(p => Array.isArray(p) ? [num(p[0], 0, 1, NaN), num(p[1], 0, 1, NaN)] : [NaN, NaN]).filter(p => p[0] === p[0] && p[1] === p[1]);
const ICONS = { marker: 'landmark', city: 'city', town: 'town', castle: 'castle', dungeon: 'dungeon', ruins: 'ruin', tavern: 'tavern', temple: 'temple', cave: 'dungeon', camp: 'village', port: 'port', landmark: 'landmark', quest: 'star', danger: 'ruin', treasure: 'star' };
const LABEL = { realm: 'caps', region: 'caps', water: 'serif', settlement: 'plain', note: 'serif' };
const ROUTE = { road: 'solid', trail: 'dashed', river: 'solid', sea: 'dotted' };
const BORDER = { solid: 'solid', dashed: 'dashed', dotted: 'dotted', none: 'none' };
const UNIT_M = { m: 1, km: 1000, ft: 0.3048, yd: 0.9144, mi: 1609.344, mile: 1609.344, miles: 1609.344, league: 4828, leagues: 4828, ft_: 0.3048 };
const labelSize = (frac, W, H) => { const f = num(frac, 0, 1, 0.02) * H / Math.max(W, H); return f < 0.0145 ? 's' : f < 0.0235 ? 'm' : 'l'; };
const routeWidth = (w, kind, W) => { const px = num(w, 0, 200, 0) || ({ road: 7, trail: 4, river: 7, sea: 4 }[kind] || 5); return Math.min(10, Math.max(2, Math.round(px / (W / 1000)))); };

// ---------------------------------------------------------------- one map
async function pictureFor(pkg, W0) {
  const blob = pkg.plain;
  if (!(blob instanceof Blob) || !blob.size) throw new Error('This map has no picture yet. Open it in Mapfold once and try again.');
  const f = new File([blob], 'map.png', { type: 'image/png' });
  return compressImage(f, 4000);
}
async function importOne(pkg, state) {
  const ic = pkg.interchange || {}, src = ic.source || {};
  let m = existingFor(pkg);
  const prev = m && m.data.mapfold;
  const name = txt(pkg.mapName || src.mapName, 80) || 'Mapfold map';
  let pic = null;
  if (!m || !prev.plainRev || prev.plainRev !== pkg.plainRev || !m.data.src) pic = await pictureFor(pkg);
  const W = pic ? pic.w : m.data.w, H = pic ? pic.h : m.data.h;
  const sc = ic.scale || {}, unit = UNIT_M[String(sc.unit || '').toLowerCase()];
  const cells = num(sc.cellPx, 1, 1e6, 0) ? (num(ic.image && ic.image.width, 1, 1e6, 0) / sc.cellPx) : 0;
  const mpw = unit && sc.perCell > 0 && cells ? Math.round(cells * sc.perCell * unit) : 0;
  const link = { key: pkg.key, worldId: pkg.worldId, mapId: pkg.mapId, revision: pkg.revision, plainRev: pkg.plainRev || null, name };
  if (!m) {
    const order = Math.max(0, ...items().filter(i => i.type === 'map').map(x => x.order || 0)) + 1;
    m = touch({ id: uid('mp-'), projectId: owner(), type: 'map', parentId: null, order, title: name, content: '', deleted: false,
      data: { src: pic.src, w: pic.w, h: pic.h, layers: [{ id: 'main', name: 'Main' }], speeds: { walk: 30, horse: 60, ship: 150 }, ...(mpw ? { scale: { mpw } } : {}), mapfold: link } });
    items().push(m); state.created++;
  } else {
    const renamed = m.title !== prev.name;
    m.data = { ...m.data, ...(pic ? { src: pic.src, w: pic.w, h: pic.h } : {}), ...(mpw ? { scale: { mpw } } : {}), mapfold: link };
    if (!renamed) m.title = name;
    touch(m); state.updated++;
  }
  await ctx.saveItem(m);
  state.maps.set(pkg.mapId, m);
  state.todo.push({ pkg, m, W, H });
}

// ---------------------------------------------------------------- marks and places
async function placeFor(e, state) {
  if (!e || e.type !== 'place') return null;
  const body = txt(e.body, 20000).trim();
  const fields = Object.entries(e.fields && typeof e.fields === 'object' ? e.fields : {}).slice(0, 30).map(([k, v]) => `${txt(k, 60)}: ${txt(String(v ?? ''), 200)}`).filter(l => !/:\s*$/.test(l));
  const notes = [body, ...fields].filter(Boolean).join('\n\n');
  let p = entries('place').find(x => x.data && x.data.mapfoldId === e.id);
  if (!p) {
    p = await createEntry('place', txt(e.name, 120) || 'Unnamed place');
    p.data = { ...p.data, mapfoldId: e.id, mapfoldBody: notes, notes };
    touch(p); await ctx.saveItem(p); state.places++;
    return p;
  }
  // only refresh text the writer hasn't changed since the last import
  if ((p.data.notes || '') === (p.data.mapfoldBody || '') && notes !== (p.data.mapfoldBody || '')) {
    p.data = { ...p.data, notes, mapfoldBody: notes }; touch(p); await ctx.saveItem(p); state.placesUpdated++;
  }
  return p;
}
async function syncMarks({ pkg, m, W, H }, state) {
  const ic = pkg.interchange, ents = new Map((Array.isArray(ic.entries) ? ic.entries : []).map(e => [e.id, e]));
  const have = new Map(items().filter(i => i.type === 'mapmark' && i.parentId === m.id && i.data && i.data.mapfoldId).map(i => [i.data.mapfoldId, i]));
  const layer = (m.data.layers && m.data.layers[0] && m.data.layers[0].id) || 'main';
  const want = [];
  for (const p of (Array.isArray(ic.pins) ? ic.pins : []).slice(0, 5000)) {
    const place = await placeFor(ents.get(p.entryId), state);
    want.push({ id: p.id, data: { kind: 'pin', x: num(p.x, 0, 1, 0.5), y: num(p.y, 0, 1, 0.5), icon: ICONS[p.icon] || 'landmark', color: hex(p.color, '#c0392b'),
      name: txt(p.label, 120), ...(place ? { placeId: place.id } : {}), ...(p.opensMap ? { opensMapfold: String(p.opensMap).slice(0, 80) } : {}) } });
  }
  for (const l of (Array.isArray(ic.labels) ? ic.labels : []).slice(0, 5000))
    want.push({ id: l.id, data: { kind: 'label', x: num(l.x, 0, 1, 0.5), y: num(l.y, 0, 1, 0.5), text: txt(l.text, 200) || 'Label', size: labelSize(l.size, W, H), style: LABEL[l.style] || 'serif', color: hex(l.color, '#2b2b2b'), rot: num(l.rotation, -360, 360, 0) } });
  for (const r of (Array.isArray(ic.regions) ? ic.regions : []).slice(0, 5000)) {
    const P = pts(r.points); if (P.length < 3) continue;
    want.push({ id: r.id, data: { kind: 'region', pts: P, name: txt(r.name, 120), color: hex(r.color, '#3a64b8'), opacity: num(r.fill, 0.05, 0.9, 0.25), border: BORDER[r.border] || 'solid', smooth: !!r.smooth } });
  }
  for (const r of (Array.isArray(ic.routes) ? ic.routes : []).slice(0, 5000)) {
    const P = pts(r.points); if (P.length < 2) continue;
    want.push({ id: r.id, data: { kind: 'route', pts: P, name: txt(r.name, 120), color: hex(r.color, '#c0392b'), width: routeWidth(r.width, r.kind, W), style: ROUTE[r.kind] || 'solid', smooth: r.smooth !== false } });
  }
  const seen = new Set(), now = Date.now();
  for (const w of want) {
    const key = String(w.id || '').slice(0, 80); if (!key || seen.has(key)) continue; seen.add(key);
    let mk = have.get(key);
    if (mk) {
      mk.data = { ...w.data, layer: mk.data.layer || layer, mapfoldId: key };
      if (mk.deleted) { mk.deleted = false; delete mk.deletedAt; }
      touch(mk);
    } else {
      mk = touch({ id: uid('mm-'), projectId: owner(), type: 'mapmark', parentId: m.id, order: 0, title: '', content: '', deleted: false, data: { ...w.data, layer, mapfoldId: key } });
      items().push(mk);
    }
    await ctx.saveItem(mk);
  }
  // gone in Mapfold -> gone here (marks you drew in Inkfold have no mapfoldId and are never touched)
  for (const [key, mk] of have) if (!seen.has(key) && !mk.deleted) { mk.deleted = true; mk.deletedAt = now; touch(mk); await ctx.saveItem(mk); state.removed++; }
}
// pins that open a nested map: resolve once every map of the world exists
async function linkNested(state) {
  for (const { m } of state.todo) {
    for (const mk of items().filter(i => i.type === 'mapmark' && !i.deleted && i.parentId === m.id && i.data && i.data.opensMapfold)) {
      const target = state.maps.get(mk.data.opensMapfold);
      const data = { ...mk.data }; delete data.opensMapfold;
      if (target && target.id !== m.id) data.opensMap = target.id;
      mk.data = data; touch(mk); await ctx.saveItem(mk);
    }
  }
}

export async function importPackages(pkgs) {
  const state = { created: 0, updated: 0, places: 0, placesUpdated: 0, removed: 0, maps: new Map(), todo: [] };
  // maps of the same world that are already here count as targets for nested pins
  linkedMaps().forEach(m => state.maps.set(m.data.mapfold.mapId, m));
  for (const p of pkgs) await importOne(p, state);
  for (const t of state.todo) await syncMarks(t, state);
  await linkNested(state);
  return state;
}

// ---------------------------------------------------------------- the sheet
export async function openImportSheet() {
  const s = sheet({ title: 'Import from Mapfold', sub: 'Maps you share from Mapfold appear here. Pins, labels, regions and routes come across, places are added to your story bible, and secrets stay in Mapfold.', body: '<p class="note">Looking for shared maps…</p>', foot: '<button class="btn btn-ghost" data-done>Close</button>', wide: true });
  $('[data-done]', s.wrap).onclick = () => s.close();
  const paint = async () => {
    const worlds = byWorld(await readPackages());
    if (!worlds.length) {
      s.body.innerHTML = `<div class="mf-empty"><span class="mv-empty-ic">${icon('pin')}</span><h3>Nothing shared yet</h3>
        <p class="note">In Mapfold, open a world, choose <b>Export</b>, then <b>Share with Inkfold</b>. It has to be the same browser you’re using here. Then come back and open this again.</p></div>`;
      return;
    }
    s.body.innerHTML = worlds.map((w, wi) => {
      const todo = w.pkgs.filter(p => statusOf(p) !== 'current').length;
      return `<section class="mf-world"><div class="mf-head"><div><b>${esc(w.name)}</b><span class="note">${w.pkgs.length} map${w.pkgs.length === 1 ? '' : 's'}</span></div>
        <button class="btn ${todo ? 'btn-primary' : 'btn-ghost'} btn-sm" data-go="${wi}" ${todo ? '' : 'disabled'}>${todo ? (w.pkgs.some(p => statusOf(p) === 'update') ? 'Update' : 'Import') + (todo > 1 ? ` ${todo} maps` : '') : 'Up to date'}</button></div>
        <div class="mf-list">${w.pkgs.map(p => { const st = statusOf(p); const n = (p.interchange.pins || []).length;
          return `<div class="mf-map"><span>${esc(p.mapName || 'Map')}</span><small class="note">${n} pin${n === 1 ? '' : 's'}</small><em class="mf-tag mf-${st}">${st === 'new' ? 'New' : st === 'update' ? 'Update available' : 'Imported'}</em></div>`; }).join('')}</div></section>`;
    }).join('') + `<p class="note" style="text-align:left">Updating replaces pins, labels, regions and routes that came from Mapfold. Things you drew here are left alone.</p>`;
    s.body.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Importing…';
      try {
        const w = worlds[+b.dataset.go];
        const st = await importPackages(w.pkgs.filter(p => statusOf(p) !== 'current'));
        const bits = [st.created && `${st.created} map${st.created === 1 ? '' : 's'} added`, st.updated && `${st.updated} updated`, st.places && `${st.places} place${st.places === 1 ? '' : 's'} added to your bible`, st.removed && `${st.removed} removed`].filter(Boolean);
        toast(bits.join(', ') || 'Up to date', null, 4200);
        const first = st.todo[0] && st.todo[0].m;
        s.close(); if (first) ctx.open(first.id); else ctx.refresh();
      } catch (e) { errorToast(e); paint(); }
    });
  };
  await paint();
}

// A small "linked from Mapfold" block for the map panel; returns '' for ordinary maps.
export function linkBadge(m) {
  const i = mapfoldInfo(m); if (!i) return '';
  return `<div class="mvd-sec mf-badge"><span class="field-label">Linked from Mapfold</span>
    <p class="note" style="text-align:left">Pins, labels, regions and routes from Mapfold stay in sync when you update. Things you draw here are never removed.</p>
    <button class="btn btn-quiet btn-sm" data-mfcheck>${icon('upload')}Check for update</button></div>`;
}
export async function checkUpdate(m) {
  const i = mapfoldInfo(m); if (!i) return;
  const pkgs = (await readPackages()).filter(p => p.worldId === i.worldId);
  if (!pkgs.length) return toast('Mapfold isn’t sharing this world any more. Your copy here is untouched.', null, 4200);
  const stale = pkgs.filter(p => statusOf(p) !== 'current');
  if (!stale.length) return toast('Already up to date', null, 2200);
  try { const st = await importPackages(stale); toast(`Updated from Mapfold${st.removed ? `, ${st.removed} removed` : ''}`, null, 3600); ctx.open(m.id); } catch (e) { errorToast(e); }
}
