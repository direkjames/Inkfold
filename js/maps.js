// Inkfold — Maps: upload a map, mark it up (pins, labels, regions, routes, layers, a ruler),
// see where scenes happen and follow characters' journeys through the story.
//
// Data (all shared within a series, like the story bible):
//   map      { type: 'map', title, order, data: { src, w, h, layers: [{ id, name, hidden, locked }], scale: { mpw }, speeds: { walk, horse, ship } } }
//            mpw = metres across the full width of the picture (so replacing the picture keeps the scale)
//   mapmark  { type: 'mapmark', parentId: mapId, data: { kind: 'pin'|'label'|'region'|'route', layer, ...positions as fractions of the picture } }
//   scene    .place = place entry id, .cast = { in: [characterIds], out: [characterIds] } (overrides for journeys)
import { uid } from './db.js';
import { touch, buildTree } from './model.js';
import { htmlToText } from './text.js';
import { $, $$, esc, num, el, icon, popover, closePop, menu, sheet, confirmSheet, toast, errorToast, haptic, debounce } from './ui.js';
import { entries, namesOf, nameRegex, avatar, createEntry } from './bible.js';
import { compressImage } from './images.js';
import { whenKey } from './timeline.js';
import { saveFile, safeName } from './io.js';

let ctx; // { state, saveItem, openScene, openEntry, onChange }
export function initMaps(c) { ctx = c; }

const NS = 'http://www.w3.org/2000/svg';
const MAP_MAX = 4000;
export const PIN_ICONS = {
  city: { name: 'City', d: 'M4 20V9l5-3v14M9 20V4l7 4v12M16 20v-7l4 2v5M3 20h18' },
  town: { name: 'Town', d: 'M4 11l8-6 8 6M6 10v10h12V10M10 20v-5h4v5' },
  village: { name: 'Village', d: 'M2 13l5-4 5 4M3.5 12v7h7v-7M12 13l5-4 5 4M13.5 12v7h7v-7' },
  castle: { name: 'Castle', d: 'M4 20V8h3v3h3V8h4v3h3V8h3v12zM10 20v-4h4v4' },
  ruin: { name: 'Ruin', d: 'M6 20V9M10 20v-6M14 20V7M18 20v-9M4 20h16M5 9h2M13 7h2' },
  dungeon: { name: 'Dungeon or cave', d: 'M4 20v-7a8 8 0 0116 0v7M9 20v-5a3 3 0 016 0v5M3 20h18' },
  mountain: { name: 'Mountain', d: 'M2 20l7-12 4 6 3-4 6 10z' },
  forest: { name: 'Forest', d: 'M12 3l6 9h-4l4 6H6l4-6H6zM12 18v3' },
  lake: { name: 'Lake or sea', d: 'M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0' },
  port: { name: 'Port', d: 'M12 6.5a2 2 0 100-4 2 2 0 000 4zM12 6.5V21M7 10h10M4.5 14a7.5 7.5 0 0015 0' },
  temple: { name: 'Temple', d: 'M3 9l9-5 9 5M5 9v10M9.5 9v10M14.5 9v10M19 9v10M3 20h18' },
  tavern: { name: 'Tavern', d: 'M5 6h10v14H5zM15 9h3a2 2 0 012 2v3a2 2 0 01-2 2h-3M8 9v8M12 9v8' },
  landmark: { name: 'Landmark', d: 'M6 21V4M6 4h11l-2 4 2 4H6' },
  star: { name: 'Star', d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z' },
};
export const MAP_COLORS = ['#c0392b', '#d9822b', '#c9a227', '#3d8b4f', '#2a7f8f', '#3a64b8', '#7a4fb3', '#b0457a', '#5b5e66', '#2b2b2b'];
const JOURNEY_COLORS = ['#d0453a', '#2f7fd1', '#23996b', '#c27c0e', '#8e5bd0'];
const DEFAULT_SPEEDS = { walk: 30, horse: 60, ship: 150 }; // km a day
const LABEL_SIZES = { s: 0.011, m: 0.018, l: 0.03 };
const TOOLS = [
  { id: 'select', name: 'Select', key: 'v', svg: '<path d="M5 3l14 8-6 1.5L10 19z"/>' },
  { id: 'pin', name: 'Pin', key: 'p', svg: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>' },
  { id: 'label', name: 'Label', key: 't', svg: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>' },
  { id: 'region', name: 'Region', key: 'r', svg: '<path d="M4 7l6-3 9 3 1 8-7 5-9-3z"/>' },
  { id: 'route', name: 'Route', key: 'l', svg: '<path d="M4 19c4 0 3-6 7-6s3-8 9-8"/><circle cx="4" cy="19" r="1.5"/><circle cx="20" cy="5" r="1.5"/>' },
  { id: 'ruler', name: 'Ruler', key: 'm', svg: '<path d="M3 16L16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>' },
];
const toolIcon = t => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${t.svg}</svg>`;

// ---------------------------------------------------------------- state
const V = { mapId: null, tool: 'select', sel: null, draft: null, T: {}, layer: {}, hist: [], redo: [], journey: { on: false, chars: [], povOnly: new Set(), upTo: null }, root: null, sideOpen: false, scaleMode: false };
const items = () => ctx.state.items;
const byId = id => items().find(i => i.id === id);
const owner = () => ctx.state.project.seriesId || ctx.state.project.id;
export const allMaps = () => items().filter(i => i.type === 'map' && !i.deleted).sort((a, b) => (a.order || 0) - (b.order || 0) || (a.title || '').localeCompare(b.title || ''));
const marksOf = mapId => items().filter(i => i.type === 'mapmark' && !i.deleted && i.parentId === mapId);
const curMap = () => byId(V.mapId);
const layersOf = m => (m.data.layers && m.data.layers.length) ? m.data.layers : (m.data.layers = [{ id: 'main', name: 'Main' }]);
const layerOf = (m, mk) => layersOf(m).find(l => l.id === mk.data.layer) || layersOf(m)[0];
const visible = (m, mk) => !layerOf(m, mk).hidden;
const locked = (m, mk) => !!layerOf(m, mk).locked;
const snap = it => it ? JSON.parse(JSON.stringify(it)) : null;

// ---------------------------------------------------------------- distances
export function fmtDist(m) {
  if (!(m >= 0)) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace(/\.0$/, '') : num(Math.round(km))} km`;
}
function fmtDays(d) {
  if (d < 1) { const h = Math.max(1, Math.round(d * 8)); return `about ${h} hour${h === 1 ? '' : 's'}`; }
  if (d < 14) { const n = Math.max(1, Math.round(d)); return `about ${n} day${n === 1 ? '' : 's'}`; }
  const w = Math.round(d / 7); return `about ${w} week${w === 1 ? '' : 's'}`;
}
// metres between two points given as fractions of the picture
function metres(m, a, b) {
  const mpw = m.data.scale && m.data.scale.mpw; if (!mpw) return null;
  return Math.hypot(a[0] - b[0], (a[1] - b[1]) * m.data.h / m.data.w) * mpw;
}
const speeds = m => ({ ...DEFAULT_SPEEDS, ...(m.data.speeds || {}) });
function travelLines(m, meters) {
  const s = speeds(m), km = meters / 1000;
  return [['On foot', km / s.walk], ['On horseback', km / s.horse], ['By ship', km / s.ship]].map(([n, d]) => `<div class="mv-tt"><span>${n}</span><b>${fmtDays(d)}</b></div>`).join('');
}
const pathLen = (m, pts) => { let t = 0; for (let i = 1; i < pts.length; i++) t += metres(m, pts[i - 1], pts[i]); return t; };

// ---------------------------------------------------------------- what's where
const scenesList = () => buildTree(items()).flatMap((c, ci) => c.scenes.map(s => ({ s, ci, ch: c })));
// every place shown on a map, including maps opened from its pins
function placesUnder(mapId, seen = new Set()) {
  const out = new Set(); if (seen.has(mapId)) return out; seen.add(mapId);
  for (const mk of marksOf(mapId)) {
    if (mk.data.placeId) out.add(mk.data.placeId);
    if (mk.data.kind === 'pin' && mk.data.opensMap) placesUnder(mk.data.opensMap, seen).forEach(p => out.add(p));
  }
  return out;
}
// the places a pin stands for: its own place, plus everything on the map it opens that isn't pinned here directly
function pinPlaces(m, pin) {
  const set = new Set(pin.data.placeId ? [pin.data.placeId] : []);
  if (pin.data.opensMap) {
    const direct = new Set(marksOf(m.id).filter(x => x.id !== pin.id && x.data.placeId).map(x => x.data.placeId));
    placesUnder(pin.data.opensMap, new Set([m.id])).forEach(p => { if (!direct.has(p)) set.add(p); });
  }
  return set;
}
const scenesAt = set => scenesList().filter(x => x.s.place && set.has(x.s.place));
const centroid = pts => { let x = 0, y = 0; pts.forEach(p => { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; };
// where a place sits on a map (its pin, a region linked to it, or the pin of a map that contains it)
function locate(m, placeId) {
  const marks = marksOf(m.id).filter(mk => visible(m, mk));
  const pin = marks.find(mk => mk.data.kind === 'pin' && mk.data.placeId === placeId);
  if (pin) return [pin.data.x, pin.data.y];
  const reg = marks.find(mk => mk.data.kind === 'region' && mk.data.placeId === placeId);
  if (reg) return centroid(reg.data.pts);
  const holder = marks.find(mk => mk.data.kind === 'pin' && mk.data.opensMap && placesUnder(mk.data.opensMap, new Set([m.id])).has(placeId));
  return holder ? [holder.data.x, holder.data.y] : null;
}
export function placeName(id) { const p = id && byId(id); return p && !p.deleted ? (p.title || 'Unnamed place') : ''; }
export function parentMapOf(mapId) {
  const pin = items().find(i => i.type === 'mapmark' && !i.deleted && i.data && i.data.opensMap === mapId && byId(i.parentId) && !byId(i.parentId).deleted);
  return pin ? pin.parentId : null;
}
export function mapsWithPlace(placeId) {
  return allMaps().filter(m => marksOf(m.id).some(mk => mk.data.placeId === placeId)).map(m => ({ m, mk: marksOf(m.id).find(mk => mk.data.placeId === placeId) }));
}

// ---------------------------------------------------------------- who is in a scene (for journeys)
const textCache = new Map();
const sceneText = s => { const c = textCache.get(s.id); if (c && c.rev === s.rev) return c.t; const t = htmlToText(s.content || ''); textCache.set(s.id, { rev: s.rev, t }); return t; };
export function castStatus(c, s, povOnly = false) {
  const cast = s.cast || {};
  if ((cast.out || []).includes(c.id)) return { inScene: false, why: 'out' };
  if ((cast.in || []).includes(c.id)) return { inScene: true, why: 'in' };
  const pov = (s.pov || '').trim().toLowerCase();
  const ns = namesOf(c);
  if (pov && ns.some(n => n.toLowerCase() === pov)) return { inScene: true, why: 'pov' };
  if (povOnly) return { inScene: false, why: 'none' };
  const re = nameRegex(ns); const hits = re ? (sceneText(s).match(re) || []).length : 0;
  return hits ? { inScene: true, why: 'mentioned', n: hits } : { inScene: false, why: 'none' };
}

// ---------------------------------------------------------------- journeys
function storyOrder() {
  const list = scenesList();
  let last = null;
  list.forEach((x, i) => { const k = whenKey(x.s.when); x.dated = k !== null; if (k !== null) last = k; x.key = k !== null ? k : last; x.i = i; });
  const anyDated = list.some(x => x.dated);
  return list.slice().sort((a, b) => anyDated ? ((a.key ?? -1e12) - (b.key ?? -1e12) || a.i - b.i) : a.i - b.i);
}
function journeyOf(m, c) {
  const povOnly = V.journey.povOnly.has(c.id);
  const upTo = V.journey.upTo;
  const steps = [];
  for (const x of storyOrder()) {
    if (upTo !== null && x.ci > upTo) continue;
    if (!x.s.place || !castStatus(c, x.s, povOnly).inScene) continue;
    const prev = steps[steps.length - 1];
    if (prev && prev.place === x.s.place) { prev.scenes.push(x); continue; }
    steps.push({ place: x.s.place, scenes: [x], pt: locate(m, x.s.place) });
  }
  return steps;
}
function travelWarnings(m, c, steps) {
  if (!(m.data.scale && m.data.scale.mpw)) return [];
  const s = speeds(m), out = [];
  for (let i = 1; i < steps.length; i++) {
    const A = steps[i - 1], B = steps[i];
    if (!A.pt || !B.pt) continue;
    const a = A.scenes[A.scenes.length - 1], b = B.scenes[0];
    const ka = whenKey(a.s.when), kb = whenKey(b.s.when);
    if (ka === null || kb === null) continue;
    const d = metres(m, A.pt, B.pt); if (!d || d < 500) continue;
    const days = kb - ka, horse = d / 1000 / s.horse;
    if (days <= 0) out.push({ step: i, text: `${c.title} is at ${placeName(A.place)} and ${placeName(B.place)} at the same time (${fmtDist(d)} apart).` });
    else if (horse > days * 1.15) out.push({ step: i, text: `${c.title} travels ${fmtDist(d)} in ${days < 1 ? `${Math.round(days * 24)} hour${Math.round(days * 24) === 1 ? '' : 's'}` : `${+days.toFixed(1)} day${+days.toFixed(1) === 1 ? '' : 's'}`} (${placeName(A.place)} → ${placeName(B.place)}). On foot that’s ${fmtDays(d / 1000 / s.walk)}, on horseback ${fmtDays(horse)}, by ship ${fmtDays(d / 1000 / s.ship)}.` });
  }
  return out;
}

// ---------------------------------------------------------------- drawing (shared by the live view and the PNG export)
const smoothPath = (P, closed) => {
  if (P.length < 3) return 'M' + P.map(p => p.join(' ')).join('L') + (closed ? 'Z' : '');
  const pts = closed ? [P[P.length - 1], ...P, P[0], P[1]] : [P[0], ...P, P[P.length - 1]];
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d + (closed ? 'Z' : '');
};
const polyPath = (P, closed) => 'M' + P.map(p => p.join(' ')).join('L') + (closed ? 'Z' : '');
const DASH = { solid: '', dashed: '9 7', dotted: '1.5 6', none: '' };
const xe = s => esc(s).replace(/"/g, '&quot;');
// opt: { live, k (zoom), S (export scale), sel, counts, idPrefix }
export function marksSvg(m, opt) {
  const W = m.data.w, H = m.data.h, X = f => f * W, Y = f => f * H;
  const live = !!opt.live, S = live ? 1 : opt.S, ps = live ? 1 / opt.k : opt.S; // pin scale: constant size on screen
  const ve = live ? ' vector-effect="non-scaling-stroke"' : '';
  const sw = n => live ? n : n * S;
  const marks = marksOf(m.id).filter(mk => visible(m, mk));
  const halo = 'paint-order="stroke" stroke-linejoin="round"';
  const lbl = (mk) => live ? ` data-mk="${mk.id}" class="mk${opt.sel === mk.id ? ' sel' : ''}${locked(m, mk) ? ' locked' : ''}"` : '';
  let out = '';
  const base = Math.max(W, H);
  // regions
  for (const mk of marks.filter(x => x.data.kind === 'region')) {
    const d = mk.data, P = d.pts.map(p => [X(p[0]), Y(p[1])]);
    const path = d.smooth ? smoothPath(P, true) : polyPath(P, true);
    const c = d.color || MAP_COLORS[5], [cx, cy] = centroid(P);
    const fs = base * LABEL_SIZES.m;
    out += `<g${lbl(mk)}><path d="${path}" fill="${c}" fill-opacity="${d.opacity ?? 0.25}" stroke="${d.border === 'none' ? 'none' : c}" stroke-width="${sw(2)}" stroke-dasharray="${DASH[d.border || 'solid'] ? DASH[d.border].split(' ').map(n => sw(+n)).join(' ') : ''}"${ve}/>
      ${d.name ? `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fs}" letter-spacing="${fs * 0.3}" fill="${c}" stroke="#fff" stroke-opacity=".75" stroke-width="${fs * 0.16}" ${halo} style="text-transform:uppercase" pointer-events="none">${esc(d.name.toUpperCase())}</text>` : ''}</g>`;
  }
  // routes
  for (const mk of marks.filter(x => x.data.kind === 'route')) {
    const d = mk.data, P = d.pts.map(p => [X(p[0]), Y(p[1])]);
    const path = d.smooth ? smoothPath(P, false) : polyPath(P, false);
    const c = d.color || MAP_COLORS[0], w = d.width || 3, dash = DASH[d.style || 'solid'];
    const pid = (opt.idPrefix || 'rt') + mk.id.replace(/[^\w-]/g, '');
    const fs = base * LABEL_SIZES.s;
    out += `<g${lbl(mk)}>${live ? `<path d="${path}" stroke="transparent" stroke-width="16" fill="none"${ve} class="hit"/>` : ''}<path id="${pid}" d="${path}" fill="none" stroke="${c}" stroke-width="${sw(w)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash ? dash.split(' ').map(n => sw(+n * (w / 3))).join(' ') : ''}"${ve}/>
      ${d.name ? `<text font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${fs}" fill="${c}" stroke="#fff" stroke-opacity=".8" stroke-width="${fs * 0.18}" ${halo} dy="${-fs * 0.5}" pointer-events="none"><textPath href="#${pid}" startOffset="50%" text-anchor="middle">${esc(d.name)}</textPath></text>` : ''}</g>`;
  }
  // labels
  for (const mk of marks.filter(x => x.data.kind === 'label')) {
    const d = mk.data, fs = base * (LABEL_SIZES[d.size || 'm']);
    const style = d.style || 'plain';
    const font = style === 'serif' ? `font-family="Georgia, 'Times New Roman', serif" font-style="italic"` : style === 'caps' ? `font-family="Georgia, 'Times New Roman', serif" letter-spacing="${fs * 0.32}"` : `font-family="'Hanken Grotesk', Helvetica, Arial, sans-serif" font-weight="600"`;
    const text = style === 'caps' ? (d.text || '').toUpperCase() : (d.text || '');
    out += `<g${lbl(mk)} transform="translate(${X(d.x)} ${Y(d.y)}) rotate(${d.rot || 0})"><text text-anchor="middle" dominant-baseline="middle" ${font} font-size="${fs}" fill="${d.color || '#2b2b2b'}" stroke="#fff" stroke-opacity=".7" stroke-width="${fs * 0.16}" ${halo}>${esc(text || 'Label')}</text></g>`;
  }
  // journeys go between labels and pins
  if (opt.journey) out += opt.journey;
  // pins
  for (const mk of marks.filter(x => x.data.kind === 'pin')) {
    const d = mk.data, c = d.color || MAP_COLORS[0], ic = PIN_ICONS[d.icon] || PIN_ICONS.city;
    const name = placeName(d.placeId) || d.name || '';
    const n = opt.counts && opt.counts.get(mk.id);
    out += `<g${lbl(mk)} transform="translate(${X(d.x)} ${Y(d.y)}) scale(${ps})">
      <path d="M0 0C-4-8-15-14-15-25A15 15 0 1 1 15-25C15-14 4-8 0 0z" fill="${c}" stroke="#fff" stroke-width="2" class="pin-body"/>
      <g transform="translate(-8.5 -33.5) scale(.71)"><path d="${ic.d}" fill="${d.icon === 'star' ? '#fff' : 'none'}" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></g>
      ${d.opensMap && byId(d.opensMap) && !byId(d.opensMap).deleted ? `<circle cx="12" cy="-36" r="6" fill="#fff" stroke="${c}" stroke-width="1.6"/><path d="M9.5-36h5M12-38.5v5" stroke="${c}" stroke-width="1.6"/>` : ''}
      ${n ? `<g transform="translate(-14 -40)"><rect x="-9" y="-8" width="${Math.max(18, String(n).length * 7 + 10)}" height="16" rx="8" fill="#1d2330"/><text x="${Math.max(18, String(n).length * 7 + 10) / 2 - 9}" y="4" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#fff">${n}</text></g>` : ''}
      ${name ? `<text y="16" text-anchor="middle" font-family="'Hanken Grotesk', Helvetica, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#1d2330" stroke="#fff" stroke-width="3.2" ${halo}>${esc(name)}</text>` : ''}
    </g>`;
  }
  return out;
}
function journeySvg(m, opt) {
  const W = m.data.w, H = m.data.h, live = !!opt.live, ps = live ? 1 / opt.k : opt.S;
  const chars = V.journey.chars.map(id => byId(id)).filter(Boolean);
  let defs = '', body = '', dots = '';
  const seen = new Map(); // place point -> how many characters have a dot there
  chars.forEach((c, ci) => {
    const col = JOURNEY_COLORS[ci % JOURNEY_COLORS.length];
    const steps = journeyOf(m, c);
    const pts = steps.map((s, i) => s.pt ? { x: s.pt[0] * W, y: s.pt[1] * H, n: i + 1 } : null).filter(Boolean);
    const off = (ci - (chars.length - 1) / 2) * 5 * ps;
    const mid = `jm${ci}${opt.idPrefix || ''}`;
    defs += `<marker id="${mid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="${live ? 9 : 9 * ps}" markerHeight="${live ? 9 : 9 * ps}" markerUnits="${live ? 'strokeWidth' : 'userSpaceOnUse'}" orient="auto"><path d="M1 1L9 5L1 9z" fill="${col}"/></marker>`;
    const pairs = new Map();
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.x === b.x && a.y === b.y) continue;
      const key = [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)].sort().join(',');
      const nth = pairs.get(key) || 0; pairs.set(key, nth + 1);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), ux = -dy / d, uy = dx / d;
      const bend = d * 0.12 * (1 + nth) + off;
      const cx = (a.x + b.x) / 2 + ux * bend, cy = (a.y + b.y) / 2 + uy * bend;
      const mx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
      body += `<path d="M${a.x + ux * off} ${a.y + uy * off}Q${cx} ${cy} ${b.x + ux * off} ${b.y + uy * off}" fill="none" stroke="${col}" stroke-width="${live ? 3 : 3 * ps}" stroke-linecap="round" stroke-dasharray="${live ? '' : ''}" opacity=".9"${live ? ' vector-effect="non-scaling-stroke"' : ''}/>`;
      // arrow head in the middle of the leg, pointing along it
      const tx = (b.x - a.x) * 0.5 + (cx - (a.x + b.x) / 2) * 0, ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      void tx;
      body += `<g transform="translate(${mx} ${my}) rotate(${ang}) scale(${ps})"><path d="M-6-5L5 0L-6 5z" fill="${col}" stroke="#fff" stroke-width="1"/></g>`;
    }
    void mid;
    // numbered stops (several visits to one place share a dot)
    const byPt = new Map();
    pts.forEach(p => { const k = Math.round(p.x) + ',' + Math.round(p.y); if (!byPt.has(k)) byPt.set(k, { ...p, ns: [] }); byPt.get(k).ns.push(p.n); });
    byPt.forEach((p, k) => {
      const shared = seen.get(k) || 0; seen.set(k, shared + 1);
      const label = p.ns.length > 3 ? `${p.ns[0]}…${p.ns[p.ns.length - 1]}` : p.ns.join(',');
      const w = Math.max(20, label.length * 6.6 + 10);
      dots += `<g transform="translate(${p.x} ${p.y}) scale(${ps})"><g transform="translate(${-w / 2 + 22 + shared * (w + 3)} -54)"><rect x="${-w / 2}" y="-10" width="${w}" height="20" rx="10" fill="${col}" stroke="#fff" stroke-width="1.5"/><text y="4.2" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#fff">${label}</text></g></g>`;
    });
  });
  return `<defs>${defs}</defs><g class="mv-journey" pointer-events="none">${body}${dots}</g>`;
}

// ---------------------------------------------------------------- history (undo / redo)
async function record(list, before) {
  V.hist.push(list.map((it, i) => ({ id: it.id, before: before[i] })));
  if (V.hist.length > 100) V.hist.shift();
  V.redo = [];
  for (const it of list) await ctx.saveItem(it);
}
// change(items, fn): snapshot, mutate, save, remember for undo. New items: pass them with created: true
async function change(list, fn, created = []) {
  const before = list.map(snap).concat(created.map(() => null));
  fn && fn();
  await record(list.concat(created), before);
}
async function undoRedo(redo) {
  const stack = redo ? V.redo : V.hist, other = redo ? V.hist : V.redo;
  const ops = stack.pop(); if (!ops) return toast(redo ? 'Nothing to redo' : 'Nothing to undo', null, 1200);
  const back = [];
  for (const op of ops) {
    const cur = byId(op.id); if (!cur) continue;
    back.push({ id: op.id, before: snap(cur) });
    if (op.before === null) { cur.deleted = true; cur.deletedAt = Date.now(); }
    else { for (const k of Object.keys(cur)) if (!(k in op.before)) delete cur[k]; Object.assign(cur, op.before); }
    await ctx.saveItem(cur);
  }
  other.push(back);
  if (V.sel && (!byId(V.sel) || byId(V.sel).deleted)) V.sel = null;
  redraw(); renderSide(); renderDetail();
}
// typing in the details panel: one undo step per burst of edits
let burst = null;
function edit(it, fn, draw = true) {
  if (!burst || burst.id !== it.id) { flushBurst(); burst = { id: it.id, before: snap(it) }; }
  fn();
  if (draw) redraw();
  saveBurst();
}
const saveBurst = debounce(() => flushBurst(), 600);
function flushBurst() {
  if (!burst) return; const b = burst; burst = null;
  const it = byId(b.id); if (!it) return;
  V.hist.push([{ id: b.id, before: b.before }]); V.redo = [];
  ctx.saveItem(it);
}

// ---------------------------------------------------------------- view
export function renderMaps(root, opts = {}) {
  V.root = root;
  flushBurst();
  const list = allMaps();
  if (opts.mapId) { V.mapId = opts.mapId; V.sel = opts.select || null; }
  if (!V.mapId || !list.some(m => m.id === V.mapId)) {
    let remembered = null; try { remembered = sessionStorage.getItem('map:' + ctx.state.project.id); } catch {}
    V.mapId = (list.find(m => m.id === remembered) || list.find(m => !parentMapOf(m.id)) || list[0] || {}).id || null;
    V.sel = null; V.draft = null; V.hist = []; V.redo = [];
  }
  if (!list.length) {
    root.innerHTML = `<div class="mv-empty"><div class="mv-empty-card">
      <span class="mv-empty-ic">${icon('pin')}</span>
      <h3>Add your world map</h3>
      <p>Upload a picture of your map, then pin your places on it, label seas and mountains, draw borders and roads, and see where every scene happens and how your characters travel.</p>
      <button class="btn btn-primary" data-newmap>${icon('upload')}Upload a map</button>
      <span class="note">JPG, PNG or WebP. Big maps are kept sharp up to ${num(MAP_MAX)} pixels.</span>
    </div></div>`;
    $('[data-newmap]', root).onclick = newMap;
    return;
  }
  const m = curMap();
  try { sessionStorage.setItem('map:' + ctx.state.project.id, m.id); } catch {}
  if (!V.layer[m.id] || !layersOf(m).some(l => l.id === V.layer[m.id])) V.layer[m.id] = (layersOf(m).find(l => !l.locked) || layersOf(m)[0]).id;
  root.innerHTML = `<div class="mapv ${V.sideOpen ? 'side-open' : ''}">
    <aside class="mv-side" id="mvSide"></aside>
    <section class="mv-main">
      <div class="mv-top">
        <button class="icon-btn only-narrow" data-mvside aria-label="Maps and layers">${icon('layers')}</button>
        <nav class="mv-crumbs" id="mvCrumbs"></nav>
        <span style="flex:1"></span>
        <button class="btn btn-quiet btn-sm ${V.journey.on ? 'on' : ''}" data-journeys>${icon('users')}<span class="hide-narrow">Journeys</span></button>
        <button class="btn btn-ghost btn-sm" data-export title="Save the map as a picture">${icon('download')}<span class="hide-narrow">Export</span></button>
        <button class="icon-btn" data-mapmenu aria-label="Map options">${icon('more')}</button>
      </div>
      <div class="mv-stage tool-${V.tool}" id="mvStage">
        <svg class="mv-svg" id="mvSvg"><g id="mvVp"><image id="mvImg" x="0" y="0" width="${m.data.w}" height="${m.data.h}" preserveAspectRatio="none"/><g id="mvMarks"></g><g id="mvDraft"></g></g></svg>
        <div class="mv-hint" id="mvHint" hidden></div>
        <div class="rm-zoom mv-zoom"><button class="icon-btn" data-z="in" aria-label="Zoom in">${icon('zoomIn')}</button><button class="icon-btn" data-z="out" aria-label="Zoom out">${icon('zoomOut')}</button><button class="icon-btn" data-z="fit" aria-label="Fit to screen">${icon('fit')}</button></div>
        <div class="mv-scalebar" id="mvScale" hidden></div>
      </div>
      <div class="mv-tools" role="toolbar" aria-label="Map tools">${TOOLS.map(t => `<button class="mv-tool ${V.tool === t.id ? 'on' : ''}" data-tool="${t.id}" title="${t.name} (${t.key.toUpperCase()})">${toolIcon(t)}<span>${t.name}</span></button>`).join('')}</div>
    </section>
    <aside class="mv-detail" id="mvDetail"></aside>
  </div>`;
  $('#mvImg', root).setAttribute('href', m.data.src);
  $('[data-mvside]', root).onclick = () => { V.sideOpen = !V.sideOpen; $('.mapv', root).classList.toggle('side-open', V.sideOpen); };
  $$('[data-tool]', root).forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('[data-journeys]', root).onclick = () => { V.journey.on = !V.journey.on; if (V.journey.on) V.sel = null; renderMaps(root); };
  $('[data-export]', root).onclick = () => exportPng().catch(errorToast);
  $('[data-mapmenu]', root).onclick = e => mapMenu(e.currentTarget);
  renderSide(); renderCrumbs(); renderDetail();
  bindStage();
}
function renderCrumbs() {
  const nav = $('#mvCrumbs', V.root); if (!nav) return;
  const chain = []; let id = V.mapId; const seen = new Set();
  while (id && !seen.has(id) && chain.length < 6) { seen.add(id); chain.unshift(byId(id)); id = parentMapOf(id); }
  nav.innerHTML = chain.map((m, i) => i < chain.length - 1 ? `<button data-crumb="${m.id}">${esc(m.title || 'Map')}</button><span class="sep">›</span>` : `<b>${esc(m.title || 'Map')}</b>`).join('');
  $$('[data-crumb]', nav).forEach(b => b.onclick = () => openMap(b.dataset.crumb));
}
function openMap(id, sel = null) { flushBurst(); V.mapId = id; V.sel = sel; V.draft = null; V.hist = []; V.redo = []; renderMaps(V.root); }
export function showOnMap(mapId, markId) { V.mapId = mapId; V.sel = markId; }

// ---------- sidebar: maps and layers
function renderSide() {
  const side = $('#mvSide', V.root); if (!side) return;
  const m = curMap(), list = allMaps();
  const depth = id => { let d = 0, p = parentMapOf(id); const seen = new Set([id]); while (p && !seen.has(p) && d < 4) { seen.add(p); d++; p = parentMapOf(p); } return d; };
  // parents first, children right after them
  const ordered = []; const add = mm => { if (ordered.includes(mm)) return; ordered.push(mm); list.filter(x => parentMapOf(x.id) === mm.id).forEach(add); };
  list.filter(x => !parentMapOf(x.id) || !list.some(y => y.id === parentMapOf(x.id))).forEach(add); list.forEach(add);
  const L = layersOf(m);
  side.innerHTML = `<div class="mv-sec"><span class="group-title">Maps</span></div>
    <div class="mv-list">${ordered.map(mm => `<button class="mv-map ${mm.id === m.id ? 'on' : ''}" data-map="${mm.id}" style="padding-left:${8 + depth(mm.id) * 16}px"><span class="mv-thumb" style="background-image:url('${mm.data.src}')"></span><span class="mv-mtitle">${esc(mm.title || 'Untitled map')}</span></button>`).join('')}</div>
    <button class="btn btn-quiet btn-sm mv-new" data-newmap>${icon('plus')}New map</button>
    <div class="mv-sec"><span class="group-title">Layers</span><button class="icon-btn" data-addlayer aria-label="Add a layer" title="Add a layer">${icon('plus')}</button></div>
    <div class="mv-layers">${L.map((l, i) => `<div class="mv-layer ${V.layer[m.id] === l.id ? 'on' : ''} ${l.hidden ? 'off' : ''}" data-layer="${l.id}">
      <button class="icon-btn" data-lvis="${l.id}" aria-label="${l.hidden ? 'Show' : 'Hide'} layer" title="${l.hidden ? 'Show' : 'Hide'}">${l.hidden ? EYE_OFF : EYE}</button>
      <button class="mv-lname" data-lact="${l.id}" title="New things go on this layer">${esc(l.name)}<small>${marksOf(m.id).filter(mk => (mk.data.layer || L[0].id) === l.id || (!L.some(x => x.id === mk.data.layer) && i === 0)).length}</small></button>
      <button class="icon-btn ${l.locked ? 'on' : ''}" data-llock="${l.id}" aria-label="${l.locked ? 'Unlock' : 'Lock'} layer" title="${l.locked ? 'Locked' : 'Lock'}">${icon(l.locked ? 'lock' : 'unlock')}</button>
      <button class="icon-btn" data-lmenu="${l.id}" aria-label="Layer options">${icon('more')}</button></div>`).join('')}</div>
    <p class="note mv-layer-note">New pins, labels, regions and routes go on the highlighted layer.</p>`;
  $$('[data-map]', side).forEach(b => b.onclick = () => { V.sideOpen = false; openMap(b.dataset.map); });
  $('[data-newmap]', side).onclick = newMap;
  $('[data-addlayer]', side).onclick = () => change([m], () => { const l = { id: uid('ly-'), name: `Layer ${L.length + 1}` }; m.data.layers = [...L, l]; V.layer[m.id] = l.id; }).then(() => { renderSide(); renameLayer(V.layer[m.id]); });
  $$('[data-lvis]', side).forEach(b => b.onclick = () => change([m], () => { const l = L.find(x => x.id === b.dataset.lvis); l.hidden = !l.hidden; }).then(() => { if (V.sel && byId(V.sel) && !visible(m, byId(V.sel))) V.sel = null; redraw(); renderSide(); renderDetail(); }));
  $$('[data-llock]', side).forEach(b => b.onclick = () => change([m], () => { const l = L.find(x => x.id === b.dataset.llock); l.locked = !l.locked; }).then(() => { redraw(); renderSide(); }));
  $$('[data-lact]', side).forEach(b => { b.onclick = () => { V.layer[m.id] = b.dataset.lact; renderSide(); }; b.ondblclick = () => renameLayer(b.dataset.lact); });
  $$('[data-lmenu]', side).forEach(b => b.onclick = () => {
    const id = b.dataset.lmenu, i = L.findIndex(x => x.id === id);
    menu(b, [
      { k: 'rn', icon: 'edit', label: 'Rename', run: () => renameLayer(id) },
      ...(i > 0 ? [{ k: 'up', icon: 'arrowRight', label: 'Move up', run: () => change([m], () => { [L[i - 1], L[i]] = [L[i], L[i - 1]]; m.data.layers = [...L]; }).then(renderSide) }] : []),
      ...(i < L.length - 1 ? [{ k: 'dn', icon: 'arrowRight', label: 'Move down', run: () => change([m], () => { [L[i + 1], L[i]] = [L[i], L[i + 1]]; m.data.layers = [...L]; }).then(renderSide) }] : []),
      ...(L.length > 1 ? ['-', { k: 'del', icon: 'trash', label: 'Delete layer', danger: true, run: async () => {
        const marks = marksOf(m.id).filter(mk => mk.data.layer === id);
        const to = L.find(x => x.id !== id);
        if (marks.length && !(await confirmSheet({ title: `Delete “${esc(L[i].name)}”?`, sub: `Its ${marks.length} item${marks.length === 1 ? '' : 's'} move to “${esc(to.name)}”.`, confirm: 'Delete layer', danger: true }))) return;
        await change([m, ...marks], () => { marks.forEach(mk => { mk.data = { ...mk.data, layer: to.id }; }); m.data.layers = L.filter(x => x.id !== id); });
        if (V.layer[m.id] === id) V.layer[m.id] = to.id;
        redraw(); renderSide();
      } }] : []),
    ]);
  });
}
const EYE = '<svg class="i" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg class="i" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.2 6.3C3.6 8.1 2 12 2 12s3.6 7 10 7a9.6 9.6 0 004.6-1.2M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
function renameLayer(id) {
  const m = curMap(), row = $(`[data-layer="${id}"] .mv-lname`, V.root); if (!row) return;
  const l = layersOf(m).find(x => x.id === id);
  const inp = el(`<input class="mv-lrename" value="${xe(l.name)}" maxlength="40">`);
  row.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const fin = async ok => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== l.name) await change([m], () => { l.name = v; }); renderSide(); };
  inp.onkeydown = e => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') { e.stopPropagation(); fin(false); } };
  inp.onblur = () => fin(true);
}

// ---------- maps: new, replace, menu
function pickFile(accept, cb) {
  const fi = el(`<input type="file" accept="${accept}" hidden>`); document.body.appendChild(fi);
  fi.onchange = () => { const f = fi.files[0]; fi.remove(); if (f) cb(f); };
  fi.click();
}
function newMap() {
  pickFile('image/*', async f => {
    const t = toast('Preparing your map…', null, 0);
    try {
      const data = await compressImage(f, MAP_MAX);
      const order = Math.max(0, ...allMaps().map(x => x.order || 0)) + 1;
      const m = touch({ id: uid('mp-'), projectId: owner(), type: 'map', parentId: null, order, title: data.name || 'Map', content: '', deleted: false,
        data: { src: data.src, w: data.w, h: data.h, layers: [{ id: 'main', name: 'Main' }], speeds: { ...DEFAULT_SPEEDS } } });
      items().push(m); await ctx.saveItem(m);
      t(); haptic(8);
      V.tool = 'select'; openMap(m.id);
      toast('Map added. Pick the Pin tool to start marking places.', null, 3200);
    } catch (e) { t(); errorToast(e); }
  });
}
function replacePicture() {
  const m = curMap();
  pickFile('image/*', async f => {
    const t = toast('Replacing the picture…', null, 0);
    try {
      const data = await compressImage(f, MAP_MAX);
      const ratio = Math.abs(data.w / data.h - m.data.w / m.data.h);
      await change([m], () => { m.data = { ...m.data, src: data.src, w: data.w, h: data.h }; });
      t(); renderMaps(V.root);
      toast(ratio > 0.02 ? 'Picture replaced. It has a different shape, so check that your pins still line up.' : 'Picture replaced. Everything stays in place.', null, 3600);
    } catch (e) { t(); errorToast(e); }
  });
}
function mapMenu(anchor) {
  const m = curMap(), list = allMaps(), i = list.indexOf(m);
  menu(anchor, [
    { k: 'rename', icon: 'edit', label: 'Rename map', run: () => { V.sel = null; V.journey.on = false; renderDetail(); setTimeout(() => { const n = $('#mvName', V.root); if (n) { n.focus(); n.select(); } }, 30); } },
    { k: 'replace', icon: 'image', label: 'Replace picture', run: replacePicture },
    { k: 'dup', icon: 'copy', label: 'Duplicate map', run: async () => {
      const copy = touch({ ...snap(m), id: uid('mp-'), title: m.title + ' (copy)', order: (m.order || 0) + 0.5, revs: [] });
      const marks = marksOf(m.id).map(mk => touch({ ...snap(mk), id: uid('mm-'), parentId: copy.id, revs: [] }));
      items().push(copy, ...marks); for (const x of [copy, ...marks]) await ctx.saveItem(x);
      openMap(copy.id); toast('Map duplicated');
    } },
    ...(i > 0 ? [{ k: 'up', icon: 'arrowRight', label: 'Move up the list', run: async () => { const a = list[i - 1]; const o = a.order || 0; a.order = m.order || 0; m.order = o === m.order ? o - 1 : o; await ctx.saveItem(a); await ctx.saveItem(m); renderSide(); } }] : []),
    '-',
    { k: 'del', icon: 'trash', label: 'Delete map', danger: true, run: async () => {
      if (!(await confirmSheet({ title: `Delete “${esc(m.title || 'this map')}”?`, sub: 'It moves to Trash for 30 days with its pins, labels, regions and routes. Your places and scenes aren’t touched.', confirm: 'Delete map', danger: true }))) return;
      const now = Date.now();
      m.deleted = true; m.deletedAt = now; await ctx.saveItem(m);
      for (const mk of marksOf(m.id)) { mk.deleted = true; mk.deletedAt = now; mk.deletedWith = m.id; await ctx.saveItem(mk); }
      V.mapId = null; renderMaps(V.root);
      toast(`“${m.title}” moved to Trash`);
    } },
  ]);
}

// ---------------------------------------------------------------- canvas: pan, zoom, tools
let ctlr = null, lastTap = null;
function bindStage() {
  const m = curMap(), stage = $('#mvStage', V.root), svg = $('#mvSvg', V.root), vp = $('#mvVp', V.root);
  if (ctlr) ctlr.abort(); ctlr = new AbortController(); const sig = { signal: ctlr.signal };
  let T = V.T[m.id];
  const apply = () => { vp.setAttribute('transform', `translate(${T.x} ${T.y}) scale(${T.k})`); };
  const fit = () => {
    const W = stage.clientWidth || 800, H = stage.clientHeight || 600;
    const k = Math.min(W / m.data.w, H / m.data.h) * 0.94;
    T = V.T[m.id] = { k, x: (W - m.data.w * k) / 2, y: (H - m.data.h * k) / 2 }; apply(); redraw();
  };
  let zr = 0;
  const zoomAt = (f, cx, cy) => {
    const minK = Math.min((stage.clientWidth || 800) / m.data.w, (stage.clientHeight || 600) / m.data.h) * 0.4;
    const k = Math.max(minK, Math.min(8, T.k * f));
    T.x = cx - (cx - T.x) * (k / T.k); T.y = cy - (cy - T.y) * (k / T.k); T.k = k; apply();
    cancelAnimationFrame(zr); zr = requestAnimationFrame(redraw);
  };
  $$('[data-z]', V.root).forEach(b => b.onclick = () => { if (b.dataset.z === 'fit') return fit(); zoomAt(b.dataset.z === 'in' ? 1.3 : 1 / 1.3, stage.clientWidth / 2, stage.clientHeight / 2); });
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false, ...sig });
  const toMap = (cx, cy) => { const r = svg.getBoundingClientRect(); const x = (cx - r.left - T.x) / T.k, y = (cy - r.top - T.y) / T.k; return [Math.max(0, Math.min(1, x / m.data.w)), Math.max(0, Math.min(1, y / m.data.h))]; };
  const pointers = new Map(); let drag = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: T.k }; drag = null; return; }
    const h = e.target.closest('[data-h], [data-hmid]');
    const mkEl = e.target.closest('[data-mk]');
    const mk = mkEl && byId(mkEl.dataset.mk);
    const base = { sx: e.clientX, sy: e.clientY, moved: false, tx: T.x, ty: T.y, at: toMap(e.clientX, e.clientY) };
    if (h && V.sel) {
      const it = byId(V.sel);
      if (h.dataset.hmid !== undefined) { // add a point on an edge
        const i = +h.dataset.hmid; const before = snap(it);
        it.data = { ...it.data, pts: [...it.data.pts.slice(0, i + 1), base.at, ...it.data.pts.slice(i + 1)] };
        drag = { ...base, kind: 'vertex', it, i: i + 1, before, moved: true };
      } else drag = { ...base, kind: 'vertex', it, i: +h.dataset.h, before: snap(it) };
      return;
    }
    if (V.tool === 'select' && mk && !locked(m, mk)) {
      drag = { ...base, kind: 'move', it: mk, before: snap(mk), orig: snap(mk.data) };
      return;
    }
    drag = { ...base, kind: 'pan', mk };
  }, sig);
  svg.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const r = svg.getBoundingClientRect(); zoomAt((pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d) / T.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return; }
    if (V.draft && !drag) { V.draft.hover = toMap(e.clientX, e.clientY); drawDraft(); }
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const at = toMap(e.clientX, e.clientY);
    if (drag.kind === 'pan') { T.x = drag.tx + dx; T.y = drag.ty + dy; apply(); if (V.draft) { V.draft.hover = at; drawDraft(); } return; }
    if (drag.kind === 'vertex') { const pts = drag.it.data.pts.slice(); pts[drag.i] = at; drag.it.data = { ...drag.it.data, pts }; redraw(); return; }
    if (drag.kind === 'move') {
      const o = drag.orig, ddx = at[0] - drag.at[0], ddy = at[1] - drag.at[1];
      if (o.pts) drag.it.data = { ...drag.it.data, pts: o.pts.map(p => [p[0] + ddx, p[1] + ddy]) };
      else drag.it.data = { ...drag.it.data, x: Math.max(0, Math.min(1, o.x + ddx)), y: Math.max(0, Math.min(1, o.y + ddy)) };
      redraw();
    }
  }, sig);
  const end = async e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    const d = drag; drag = null; if (!d) return;
    if (d.kind === 'vertex' || d.kind === 'move') {
      if (d.moved) { await record([d.it], [d.before]); haptic(4); renderDetail(); }
      else if (d.kind === 'move') {
        // double-click / double-tap on a pin that opens another map
        const now = Date.now(), it = d.it;
        if (lastTap && lastTap.id === it.id && now - lastTap.at < 450 && it.data.kind === 'pin' && it.data.opensMap && byId(it.data.opensMap) && !byId(it.data.opensMap).deleted) { lastTap = null; return openMap(it.data.opensMap); }
        lastTap = { id: it.id, at: now };
        select(it.id);
      }
      return;
    }
    if (d.moved) return; // panned
    const at = toMap(e.clientX, e.clientY);
    if (V.tool === 'select') { if (d.mk) select(d.mk.id); else if (V.sel) select(null); return; }
    if (V.tool === 'pin') return addPin(at);
    if (V.tool === 'label') return addLabel(at);
    if (V.tool === 'region' || V.tool === 'route') { if (!V.draft) V.draft = { kind: V.tool, pts: [] }; V.draft.pts.push(at); drawDraft(); return; }
    if (V.tool === 'ruler') { if (!V.draft || V.draft.pts.length >= 2) V.draft = { kind: 'ruler', pts: [] }; V.draft.pts.push(at); drawDraft(); renderDetail(); }
  };
  svg.addEventListener('pointerup', end, sig); svg.addEventListener('pointercancel', end, sig);
  svg.addEventListener('dblclick', e => {
    if (V.draft && (V.draft.kind === 'region' || V.draft.kind === 'route')) { e.preventDefault(); V.draft.pts.pop(); finishDraft(); return; }
    // the pin may have been redrawn between the two clicks, so look up what's under the pointer now
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const mkEl = under && under.closest('[data-mk]'); const mk = mkEl && byId(mkEl.dataset.mk);
    if (mk && mk.data.kind === 'pin' && mk.data.opensMap && byId(mk.data.opensMap) && !byId(mk.data.opensMap).deleted) openMap(mk.data.opensMap);
  }, sig);
  document.addEventListener('keydown', e => {
    if (!V.root || V.root.hidden || !document.body.contains(svg)) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.sheet-wrap, .pop')) { if (e.key !== 'Escape') return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); undoRedo(true); return; }
    if (mod || e.altKey) return;
    if (e.key === 'Escape') { if (V.draft) { V.draft = null; drawDraft(); renderDetail(); } else if (V.sel) select(null); else if (V.tool !== 'select') setTool('select'); return; }
    if (e.key === 'Enter' && V.draft) { e.preventDefault(); finishDraft(); return; }
    if ((e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      if (V.draft && V.draft.pts.length) { V.draft.pts.pop(); drawDraft(); return; }
      if (V.sel) deleteMark(V.sel);
      return;
    }
    const t = TOOLS.find(x => x.key === e.key.toLowerCase()); if (t) setTool(t.id);
  }, sig);
  new ResizeObserver(() => { if (!document.body.contains(stage)) return; }).observe(stage);
  requestAnimationFrame(() => { if (T) { apply(); redraw(); } else fit(); });
}
function setTool(t) {
  flushBurst();
  if (V.draft && V.tool !== t) V.draft = null;
  V.tool = t; V.scaleMode = false;
  $$('[data-tool]', V.root).forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  const st = $('#mvStage', V.root); if (st) st.className = `mv-stage tool-${t}`;
  if (t !== 'select') V.sel = null;
  drawDraft(); redraw(); renderDetail();
}
function select(id) { flushBurst(); V.sel = id; if (id) V.journey.on = V.journey.on && false; redraw(); renderDetail(); const b = $('[data-journeys]', V.root); if (b) b.classList.toggle('on', V.journey.on); }

let sideCount = '';
function redraw() {
  const m = curMap(), g = $('#mvMarks', V.root); if (!m || !g) return;
  // keep the layer counts in the sidebar current
  const sig = marksOf(m.id).map(x => x.id + (x.data.layer || '')).join();
  if (sig !== sideCount) { sideCount = sig; renderSide(); }
  const T = V.T[m.id]; if (!T) return;
  const counts = new Map();
  if (!V.journey.on) marksOf(m.id).filter(mk => mk.data.kind === 'pin').forEach(pin => { const n = scenesAt(pinPlaces(m, pin)).length; if (n) counts.set(pin.id, n); });
  g.innerHTML = marksSvg(m, { live: true, k: T.k, sel: V.sel, counts, journey: V.journey.on && V.journey.chars.length ? journeySvg(m, { live: true, k: T.k }) : '' }) + handlesSvg(m, T.k);
  drawDraft(); drawScaleBar();
}
function handlesSvg(m, k) {
  const it = V.sel && byId(V.sel);
  if (!it || it.data.kind === 'pin' || it.data.kind === 'label' || !it.data.pts || locked(m, it)) return '';
  const W = m.data.w, H = m.data.h, P = it.data.pts, r = 6 / k, closed = it.data.kind === 'region';
  let s = '';
  for (let i = 0; i < P.length - (closed ? 0 : 1); i++) { const a = P[i], b = P[(i + 1) % P.length]; s += `<circle data-hmid="${i}" cx="${(a[0] + b[0]) / 2 * W}" cy="${(a[1] + b[1]) / 2 * H}" r="${r * 0.7}" class="mv-hmid"/>`; }
  P.forEach((p, i) => { s += `<circle data-h="${i}" cx="${p[0] * W}" cy="${p[1] * H}" r="${r}" class="mv-h"/>`; });
  return s;
}
function drawDraft() {
  const m = curMap(), g = $('#mvDraft', V.root), hint = $('#mvHint', V.root); if (!m || !g) return;
  const T = V.T[m.id]; if (!T) return;
  const d = V.draft;
  if (!d) { g.innerHTML = ''; if (hint) hint.hidden = true; return; }
  const W = m.data.w, H = m.data.h, P = d.pts.map(p => [p[0] * W, p[1] * H]);
  const all = d.hover && (d.kind !== 'ruler' || d.pts.length === 1) ? [...P, [d.hover[0] * W, d.hover[1] * H]] : P;
  const c = d.kind === 'ruler' ? '#1d2330' : d.kind === 'region' ? MAP_COLORS[5] : MAP_COLORS[0];
  let s = all.length > 1 ? `<path d="${polyPath(all, d.kind === 'region' && all.length > 2)}" fill="${d.kind === 'region' ? c : 'none'}" fill-opacity=".15" stroke="${c}" stroke-width="2.5" stroke-dasharray="${d.kind === 'ruler' ? '' : '7 5'}" vector-effect="non-scaling-stroke"/>` : '';
  s += P.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${5 / T.k}" fill="#fff" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
  if (d.kind === 'ruler' && all.length === 2) {
    const a = d.pts[0], b = d.pts[1] || d.hover, dist = metres(m, a, b);
    const mx = (all[0][0] + all[1][0]) / 2, my = (all[0][1] + all[1][1]) / 2;
    const text = dist === null ? 'Set the scale to measure' : fmtDist(dist);
    s += `<g transform="translate(${mx} ${my}) scale(${1 / T.k})"><rect x="${-(text.length * 3.8 + 12)}" y="-28" width="${text.length * 7.6 + 24}" height="22" rx="11" fill="#1d2330"/><text y="-13" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#fff">${esc(text)}</text></g>`;
  }
  g.innerHTML = s;
  if (hint) {
    hint.hidden = false;
    const msg = d.kind === 'ruler' ? (d.pts.length < 2 ? 'Click two points to measure' : 'Click again to start a new measurement') : d.kind === 'region' ? `Click to outline the region${d.pts.length >= 3 ? '. Double-click or press Enter to finish' : ''}` : `Click to draw the route${d.pts.length >= 2 ? '. Double-click or press Enter to finish' : ''}`;
    hint.innerHTML = `<span>${msg}</span>${d.kind !== 'ruler' ? `<button class="btn btn-primary btn-sm" data-dfin ${d.pts.length < (d.kind === 'region' ? 3 : 2) ? 'disabled' : ''}>Finish</button><button class="btn btn-ghost btn-sm" data-dback ${d.pts.length ? '' : 'disabled'}>Undo point</button>` : ''}<button class="btn btn-ghost btn-sm" data-dcancel>${d.kind === 'ruler' ? 'Clear' : 'Cancel'}</button>`;
    const f = $('[data-dfin]', hint); if (f) f.onclick = finishDraft;
    const bk = $('[data-dback]', hint); if (bk) bk.onclick = () => { V.draft.pts.pop(); drawDraft(); };
    $('[data-dcancel]', hint).onclick = () => { V.draft = null; drawDraft(); renderDetail(); };
  }
}
function drawScaleBar() {
  const m = curMap(), box = $('#mvScale', V.root); if (!m || !box) return;
  const mpw = m.data.scale && m.data.scale.mpw, T = V.T[m.id];
  if (!mpw || !T) { box.hidden = true; return; }
  const metresPerScreenPx = mpw / (m.data.w * T.k);
  const target = 110 * metresPerScreenPx, p = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map(f => f * p).reverse().find(v => v <= target) || p;
  box.hidden = false;
  box.innerHTML = `<i style="width:${nice / metresPerScreenPx}px"></i><span>${fmtDist(nice)}</span>`;
}

// ---------- creating and deleting marks
function newMark(kind, data) {
  const m = curMap();
  return touch({ id: uid('mm-'), projectId: owner(), type: 'mapmark', parentId: m.id, order: 0, title: '', content: '', deleted: false, data: { kind, layer: V.layer[m.id], ...data } });
}
async function addPin(at) {
  const last = marksOf(V.mapId).filter(x => x.data.kind === 'pin').slice(-1)[0];
  const mk = newMark('pin', { x: at[0], y: at[1], icon: last ? last.data.icon : 'city', color: last ? last.data.color : MAP_COLORS[0] });
  items().push(mk); await change([], null, [mk]); haptic(6);
  V.tool = 'select'; $$('[data-tool]', V.root).forEach(b => b.classList.toggle('on', b.dataset.tool === 'select')); $('#mvStage', V.root).className = 'mv-stage tool-select';
  V.sel = mk.id; redraw(); renderDetail();
  setTimeout(() => { const b = $('[data-pickplace]', V.root); if (b) b.click(); }, 60);
}
async function addLabel(at) {
  const mk = newMark('label', { x: at[0], y: at[1], text: 'New label', size: 'm', style: 'serif', color: '#2b2b2b', rot: 0 });
  items().push(mk); await change([], null, [mk]);
  V.tool = 'select'; $$('[data-tool]', V.root).forEach(b => b.classList.toggle('on', b.dataset.tool === 'select')); $('#mvStage', V.root).className = 'mv-stage tool-select';
  V.sel = mk.id; redraw(); renderDetail();
  setTimeout(() => { const t = $('#mvLabelText', V.root); if (t) { t.focus(); t.select(); } }, 40);
}
async function finishDraft() {
  const d = V.draft; if (!d) return;
  if (d.kind === 'ruler') return;
  const need = d.kind === 'region' ? 3 : 2;
  if (d.pts.length < need) return toast(d.kind === 'region' ? 'A region needs at least 3 points' : 'A route needs at least 2 points', null, 1600);
  const mk = d.kind === 'region'
    ? newMark('region', { pts: d.pts, name: '', color: MAP_COLORS[5], opacity: 0.22, border: 'dashed', smooth: false })
    : newMark('route', { pts: d.pts, name: '', color: MAP_COLORS[0], width: 3, style: 'dashed', smooth: true });
  V.draft = null; items().push(mk); await change([], null, [mk]); haptic(8);
  V.sel = mk.id; V.tool = 'select';
  $$('[data-tool]', V.root).forEach(b => b.classList.toggle('on', b.dataset.tool === 'select')); $('#mvStage', V.root).className = 'mv-stage tool-select';
  redraw(); renderDetail();
  setTimeout(() => { const n = $('#mvMarkName', V.root); if (n) n.focus(); }, 40);
}
async function deleteMark(id) {
  const mk = byId(id); if (!mk) return;
  await change([mk], () => { mk.deleted = true; mk.deletedAt = Date.now(); });
  V.sel = null; redraw(); renderDetail();
  toast('Deleted', { label: 'Undo', run: () => undoRedo(false) }, 2600);
}

// ---------------------------------------------------------------- details panel
function renderDetail() {
  const box = $('#mvDetail', V.root); if (!box) return;
  const m = curMap();
  box.classList.toggle('has', !!(V.sel || V.journey.on || V.draft));
  if (V.journey.on) return renderJourneyPanel(box, m);
  const it = V.sel && byId(V.sel);
  if (V.tool === 'ruler' || (V.draft && V.draft.kind === 'ruler')) return renderRuler(box, m);
  if (!it || it.deleted) return renderMapPanel(box, m);
  const d = it.data, k = d.kind;
  const head = (title, ic) => `<div class="mvd-h"><span class="mvd-ic">${ic}</span><b>${title}</b><button class="icon-btn" data-dclose aria-label="Close">${icon('x')}</button></div>`;
  const colors = cur => `<div class="mv-colors">${MAP_COLORS.map(c => `<button class="mv-color ${cur === c ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>`;
  const layerSel = `<label class="field"><span class="field-label">Layer</span><select class="input" data-layersel>${layersOf(m).map(l => `<option value="${l.id}" ${layerOf(m, it).id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>`;
  const seg = (attr, cur, opts) => `<div class="seg mv-seg">${opts.map(([v, l]) => `<button data-${attr}="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const del = `<button class="btn btn-ghost btn-sm mvd-del" data-delmark>${icon('trash')}Delete</button>`;
  let html = '';
  if (k === 'pin') {
    const place = d.placeId && byId(d.placeId);
    const here = scenesAt(pinPlaces(m, it));
    html = head('Pin', PIN_SVG(d.color || MAP_COLORS[0]))
      + `<div class="mvd-place">${place && !place.deleted ? `<div class="mvd-pcard">${avatar(place, 44)}<div><b>${esc(place.title || 'Unnamed place')}</b><span>${esc([place.data && place.data.kind, place.data && place.data.region].filter(Boolean).join(' · ') || 'Place')}</span></div></div>
          ${place.data && place.data.notes ? `<p class="mvd-notes">${esc(place.data.notes.replace(/\[\[|\]\]/g, '').slice(0, 180))}${place.data.notes.length > 180 ? '…' : ''}</p>` : ''}
          <div class="mvd-row"><button class="btn btn-quiet btn-sm" data-openplace>${icon('book')}Open place</button><button class="btn btn-ghost btn-sm" data-pickplace>Change</button></div>`
        : `<p class="note" style="text-align:left">Link this pin to a place in your story bible to see its details and scenes.</p><button class="btn btn-primary btn-sm" data-pickplace>${icon('pin')}Choose a place</button>`}</div>
      ${here.length ? `<div class="mvd-sec"><span class="group-title">Scenes here · ${here.length}</span><div class="mvd-scenes">${here.slice(0, 30).map(x => `<button data-scene="${x.s.id}"><span class="tnum">${x.ci + 1}</span>${esc(x.s.title || 'Untitled')}${x.s.place !== d.placeId ? `<small>${esc(placeName(x.s.place))}</small>` : ''}</button>`).join('')}</div></div>` : place ? `<p class="note" style="text-align:left">No scenes are set here yet. Set a scene’s place from the top of the scene, next to “Set time”.</p>` : ''}
      <div class="mvd-sec"><span class="field-label">Icon</span><div class="mv-icons">${Object.entries(PIN_ICONS).map(([id, ic]) => `<button class="mv-icon ${(d.icon || 'city') === id ? 'on' : ''}" data-icon="${id}" title="${ic.name}" aria-label="${ic.name}"><svg viewBox="0 0 24 24"><path d="${ic.d}" fill="${id === 'star' ? 'currentColor' : 'none'}"/></svg></button>`).join('')}</div></div>
      <div class="mvd-sec"><span class="field-label">Colour</span>${colors(d.color || MAP_COLORS[0])}</div>
      <label class="field"><span class="field-label">Opens map</span><select class="input" data-opens><option value="">Nothing</option>${allMaps().filter(x => x.id !== m.id).map(x => `<option value="${x.id}" ${d.opensMap === x.id ? 'selected' : ''}>${esc(x.title || 'Untitled map')}</option>`).join('')}</select></label>
      ${d.opensMap && byId(d.opensMap) && !byId(d.opensMap).deleted ? `<button class="btn btn-quiet btn-sm" data-gomap>${icon('arrowRight')}Open “${esc(byId(d.opensMap).title)}”</button>` : ''}
      ${layerSel}${del}`;
  } else if (k === 'label') {
    html = head('Label', `<svg class="i" viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>`)
      + `<label class="field"><span class="field-label">Text</span><input class="input" id="mvLabelText" value="${xe(d.text || '')}" maxlength="80"></label>
      <div class="mvd-sec"><span class="field-label">Size</span>${seg('lsize', d.size || 'm', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}</div>
      <div class="mvd-sec"><span class="field-label">Style</span>${seg('lstyle', d.style || 'plain', [['plain', 'Plain'], ['serif', '<i style="font-family:Georgia,serif">Italic</i>'], ['caps', 'C A P S']])}</div>
      <div class="mvd-sec"><span class="field-label">Colour</span>${colors(d.color || '#2b2b2b')}</div>
      <label class="slider-row"><span>Angle</span><input type="range" min="-90" max="90" step="1" value="${d.rot || 0}" data-rot><output>${d.rot || 0}°</output></label>
      ${layerSel}${del}`;
  } else {
    const isRoute = k === 'route';
    const len = isRoute ? pathLen(m, d.pts) : null;
    const place = d.placeId && byId(d.placeId);
    html = head(isRoute ? 'Route' : 'Region', toolIcon(TOOLS.find(t => t.id === k)))
      + `<label class="field"><span class="field-label">Name</span><input class="input" id="mvMarkName" value="${xe(d.name || '')}" placeholder="${isRoute ? 'The King’s Road' : 'Kingdom of Vael'}" maxlength="60"></label>
      ${isRoute ? (len ? `<div class="mvd-sec mv-len"><span class="field-label">Length</span><b class="tnum">${fmtDist(len)}</b>${travelLines(m, len)}</div>` : `<p class="note" style="text-align:left">Set the map’s scale with the Ruler to see this route’s length and travel times.</p>`)
        : `<div class="mvd-sec"><span class="field-label">Place</span>${place && !place.deleted ? `<div class="mvd-row"><b>${esc(place.title)}</b><button class="btn btn-ghost btn-sm" data-pickplace>Change</button></div>` : `<button class="btn btn-quiet btn-sm" data-pickplace>${icon('pin')}Link to a place</button>`}</div>`}
      <div class="mvd-sec"><span class="field-label">Colour</span>${colors(d.color)}</div>
      ${isRoute ? `<div class="mvd-sec"><span class="field-label">Line</span>${seg('rstyle', d.style || 'solid', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']])}</div>
        <label class="slider-row"><span>Thickness</span><input type="range" min="1" max="10" step="0.5" value="${d.width || 3}" data-rwidth><output>${d.width || 3}</output></label>`
      : `<div class="mvd-sec"><span class="field-label">Border</span>${seg('border', d.border || 'solid', [['solid', 'Solid'], ['dashed', 'Dashed'], ['none', 'None']])}</div>
        <label class="slider-row"><span>Fill</span><input type="range" min="0" max="0.7" step="0.02" value="${d.opacity ?? 0.25}" data-opacity><output>${Math.round((d.opacity ?? 0.25) * 100)}%</output></label>`}
      <div class="toggle-row"><div class="t-text"><b>Smooth curves</b><span>Round off the corners</span></div><button class="switch" role="switch" aria-checked="${!!d.smooth}" data-smooth aria-label="Smooth curves"></button></div>
      <p class="note" style="text-align:left">Drag the white dots to reshape. Click a small dot to add a point there.</p>
      ${layerSel}${del}`;
  }
  box.innerHTML = `<div class="mvd">${html}</div>`;
  const set = (patch, draw = true) => edit(it, () => { it.data = { ...it.data, ...patch }; }, draw);
  const q = s => $(s, box);
  q('[data-dclose]').onclick = () => select(null);
  q('[data-delmark]').onclick = () => deleteMark(it.id);
  q('[data-layersel]').onchange = e => { set({ layer: e.target.value }); flushBurst(); renderSide(); };
  $$('[data-color]', box).forEach(b => b.onclick = () => { set({ color: b.dataset.color }); $$('[data-color]', box).forEach(x => x.classList.toggle('on', x === b)); flushBurst(); });
  $$('[data-scene]', box).forEach(b => b.onclick = () => ctx.openScene(b.dataset.scene));
  const pp = q('[data-pickplace]'); if (pp) pp.onclick = () => pickPlace(d.placeId, async id => { if (id === undefined) return; await change([it], () => { it.data = { ...it.data, placeId: id || null }; }); redraw(); renderDetail(); });
  const op = q('[data-openplace]'); if (op) op.onclick = () => ctx.openEntry(d.placeId);
  $$('[data-icon]', box).forEach(b => b.onclick = () => { set({ icon: b.dataset.icon }); flushBurst(); $$('[data-icon]', box).forEach(x => x.classList.toggle('on', x === b)); });
  const opens = q('[data-opens]'); if (opens) opens.onchange = async e => { await change([it], () => { it.data = { ...it.data, opensMap: e.target.value || null }; }); redraw(); renderDetail(); renderSide(); };
  const gm = q('[data-gomap]'); if (gm) gm.onclick = () => openMap(d.opensMap);
  const lt = q('#mvLabelText'); if (lt) lt.oninput = () => set({ text: lt.value });
  $$('[data-lsize]', box).forEach(b => b.onclick = () => { set({ size: b.dataset.lsize }); flushBurst(); renderDetail(); });
  $$('[data-lstyle]', box).forEach(b => b.onclick = () => { set({ style: b.dataset.lstyle }); flushBurst(); renderDetail(); });
  const rot = q('[data-rot]'); if (rot) rot.oninput = () => { set({ rot: +rot.value }); rot.nextElementSibling.textContent = rot.value + '°'; };
  const nm = q('#mvMarkName'); if (nm) nm.oninput = () => set({ name: nm.value });
  $$('[data-rstyle]', box).forEach(b => b.onclick = () => { set({ style: b.dataset.rstyle }); flushBurst(); renderDetail(); });
  const rw = q('[data-rwidth]'); if (rw) rw.oninput = () => { set({ width: +rw.value }); rw.nextElementSibling.textContent = rw.value; };
  $$('[data-border]', box).forEach(b => b.onclick = () => { set({ border: b.dataset.border }); flushBurst(); renderDetail(); });
  const opa = q('[data-opacity]'); if (opa) opa.oninput = () => { set({ opacity: +opa.value }); opa.nextElementSibling.textContent = Math.round(opa.value * 100) + '%'; };
  const sm = q('[data-smooth]'); if (sm) sm.onclick = () => { set({ smooth: !d.smooth }); flushBurst(); renderDetail(); };
  $$('input[type=range]', box).forEach(r => { const f = () => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); f(); r.addEventListener('input', f); });
}
const PIN_SVG = c => `<svg class="i" viewBox="-16 -42 32 44"><path d="M0 0C-4-8-15-14-15-25A15 15 0 1 1 15-25C15-14 4-8 0 0z" fill="${c}" stroke="none"/></svg>`;

function renderMapPanel(box, m) {
  const mpw = m.data.scale && m.data.scale.mpw, s = speeds(m);
  const parent = parentMapOf(m.id);
  box.innerHTML = `<div class="mvd">
    <div class="mvd-h"><span class="mvd-ic">${icon('image')}</span><b>Map</b></div>
    <label class="field"><span class="field-label">Name</span><input class="input" id="mvName" value="${xe(m.title || '')}" maxlength="80"></label>
    ${parent ? `<p class="note" style="text-align:left">Opens from a pin on <button class="linkish" data-crumb2="${parent}">${esc(byId(parent).title)}</button>.</p>` : ''}
    <div class="mvd-sec"><span class="field-label">Scale</span>
      ${mpw ? `<p class="mv-scale-line">The whole map is <b class="tnum">${fmtDist(mpw)}</b> across.</p>` : `<p class="note" style="text-align:left">Set the scale to measure distances, see route lengths and travel times, and check how fast characters travel.</p>`}
      <button class="btn btn-quiet btn-sm" data-setscale>${toolIcon(TOOLS[5])}${mpw ? 'Change scale' : 'Set scale'}</button></div>
    <div class="mvd-sec"><span class="field-label">Travel speeds (km a day)</span>
      <div class="mv-speeds">${[['walk', 'On foot'], ['horse', 'Horseback'], ['ship', 'Ship']].map(([k, l]) => `<label><span>${l}</span><input class="input tnum" type="number" min="1" step="1" value="${s[k]}" data-speed="${k}"></label>`).join('')}</div></div>
    <div class="mvd-sec"><span class="field-label">On this map</span><p class="mv-counts tnum">${['pin', 'label', 'region', 'route'].map(k => { const n = marksOf(m.id).filter(x => x.data.kind === k).length; return `${n} ${k}${n === 1 ? '' : 's'}`; }).join(' · ')}</p></div>
    <div class="mvd-row"><button class="btn btn-ghost btn-sm" data-replace>${icon('image')}Replace picture</button></div>
    <p class="note" style="text-align:left">Tip: pick a tool below the map. Scroll or pinch to zoom, drag to move around. Ctrl/Cmd + Z undoes.</p>
  </div>`;
  const n = $('#mvName', box); n.oninput = () => { edit(m, () => { m.title = n.value.trim() || 'Untitled map'; }, false); renderCrumbs(); const b = $(`[data-map="${m.id}"] .mv-mtitle`, V.root); if (b) b.textContent = m.title; };
  $('[data-setscale]', box).onclick = () => { setTool('ruler'); V.scaleMode = true; renderDetail(); };
  $('[data-replace]', box).onclick = replacePicture;
  const c2 = $('[data-crumb2]', box); if (c2) c2.onclick = () => openMap(c2.dataset.crumb2);
  $$('[data-speed]', box).forEach(inp => inp.onchange = () => { const v = Math.max(1, +inp.value || DEFAULT_SPEEDS[inp.dataset.speed]); change([m], () => { m.data = { ...m.data, speeds: { ...speeds(m), [inp.dataset.speed]: v } }; }); });
}
function renderRuler(box, m) {
  const d = V.draft && V.draft.kind === 'ruler' ? V.draft : null;
  const two = d && d.pts.length === 2;
  const dist = two ? metres(m, d.pts[0], d.pts[1]) : null;
  const mpw = m.data.scale && m.data.scale.mpw;
  const setting = V.scaleMode || !mpw;
  box.innerHTML = `<div class="mvd">
    <div class="mvd-h"><span class="mvd-ic">${toolIcon(TOOLS[5])}</span><b>${setting ? 'Set the scale' : 'Ruler'}</b><button class="icon-btn" data-dclose aria-label="Close">${icon('x')}</button></div>
    ${setting ? `<p class="note" style="text-align:left">${two ? 'How long is the line you drew, in your world?' : 'Draw a line across something you know the length of, like the scale bar printed on your map: click its start, then its end.'}</p>
      ${two ? `<div class="mv-scale-in"><input class="input tnum" type="number" min="0" step="any" id="mvScaleN" placeholder="e.g. 100" autofocus><div class="seg mv-seg"><button data-unit="km" class="on">km</button><button data-unit="m">m</button></div></div>
      <button class="btn btn-primary btn-sm" data-applyscale>Set scale</button>` : ''}
      ${mpw ? `<button class="btn btn-ghost btn-sm" data-cancelscale>Keep the current scale</button>` : ''}`
    : `${two && dist !== null ? `<div class="mv-measure"><b class="tnum">${fmtDist(dist)}</b>${travelLines(m, dist)}</div>` : `<p class="note" style="text-align:left">Click two points on the map to measure the distance between them.</p>`}
      <button class="btn btn-ghost btn-sm" data-rescale>${two ? 'Use this line to set the scale' : 'Change the scale'}</button>`}
  </div>`;
  $('[data-dclose]', box).onclick = () => setTool('select');
  let unit = 'km';
  $$('[data-unit]', box).forEach(b => b.onclick = () => { unit = b.dataset.unit; $$('[data-unit]', box).forEach(x => x.classList.toggle('on', x === b)); });
  const ap = $('[data-applyscale]', box);
  if (ap) {
    const go = async () => {
      const v = parseFloat($('#mvScaleN', box).value); if (!(v > 0)) return toast('Type how long the line is');
      const metersLine = v * (unit === 'km' ? 1000 : 1);
      const frac = Math.hypot(d.pts[0][0] - d.pts[1][0], (d.pts[0][1] - d.pts[1][1]) * m.data.h / m.data.w);
      if (!(frac > 0)) return toast('Draw a longer line');
      await change([m], () => { m.data = { ...m.data, scale: { mpw: metersLine / frac } }; });
      V.scaleMode = false; haptic(10); toast(`Scale set. The map is ${fmtDist(metersLine / frac)} across.`);
      redraw(); renderDetail();
    };
    ap.onclick = go; $('#mvScaleN', box).onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => $('#mvScaleN', box)?.focus(), 30);
  }
  const cs = $('[data-cancelscale]', box); if (cs) cs.onclick = () => { V.scaleMode = false; renderDetail(); };
  const rs = $('[data-rescale]', box); if (rs) rs.onclick = () => { V.scaleMode = true; if (!two) V.draft = null; drawDraft(); renderDetail(); };
}

// ---------- journeys panel
function renderJourneyPanel(box, m) {
  const chars = entries('character');
  const tree = buildTree(items());
  const J = V.journey;
  J.chars = J.chars.filter(id => chars.some(c => c.id === id));
  const upTo = J.upTo === null ? tree.length - 1 : Math.min(J.upTo, tree.length - 1);
  const sections = J.chars.map((id, ci) => {
    const c = byId(id), steps = journeyOf(m, c), warn = travelWarnings(m, c, steps);
    const col = JOURNEY_COLORS[ci % JOURNEY_COLORS.length];
    return `<div class="mj-char" style="--jc:${col}">
      <div class="mj-head">${avatar(c, 28)}<b>${esc(c.title)}</b><button class="icon-btn" data-jrm="${id}" aria-label="Remove ${xe(c.title)}">${icon('x')}</button></div>
      <label class="mj-pov"><input type="checkbox" data-jpov="${id}" ${J.povOnly.has(id) ? 'checked' : ''}> Only scenes from ${esc(c.title.split(/\s+/)[0])}’s point of view</label>
      ${warn.length ? `<div class="mj-warn">${warn.map(w => `<p>${icon('alert')}<span>${esc(w.text)}</span></p>`).join('')}</div>` : ''}
      ${steps.length ? `<ol class="mj-steps">${steps.map((s, i) => `<li class="${s.pt ? '' : 'off'}"><span class="mj-n">${i + 1}</span><div><b>${esc(placeName(s.place))}</b>${s.pt ? '' : '<small> · not on this map</small>'}<div class="mj-sc">${s.scenes.map(x => `<button data-scene="${x.s.id}">Ch ${x.ci + 1} · ${esc(x.s.title || 'Untitled')}</button>`).join('')}</div></div></li>`).join('')}</ol>`
        : `<p class="note" style="text-align:left">No scenes with a place yet for ${esc(c.title.split(/\s+/)[0])}. Set where scenes happen (next to “Set time” at the top of a scene), and check who’s in them with the people button there.</p>`}
    </div>`;
  }).join('');
  box.innerHTML = `<div class="mvd mj">
    <div class="mvd-h"><span class="mvd-ic">${icon('users')}</span><b>Journeys</b><button class="icon-btn" data-dclose aria-label="Close">${icon('x')}</button></div>
    <p class="note" style="text-align:left">Follow characters through the places they visit, in story order. A character counts as in a scene when it’s from their point of view or they’re mentioned by name.</p>
    ${J.chars.length < 5 ? `<select class="input" data-jadd><option value="">${chars.length ? 'Add a character…' : 'Add characters in the Bible first'}</option>${chars.filter(c => !J.chars.includes(c.id)).map(c => `<option value="${c.id}">${esc(c.title || 'Unnamed')}</option>`).join('')}</select>` : ''}
    ${tree.length > 1 && J.chars.length ? `<label class="mj-up"><span>Up to <b>Chapter ${upTo + 1}</b> · ${esc(tree[upTo].title)}</span><input type="range" min="0" max="${tree.length - 1}" step="1" value="${upTo}" data-jup></label>` : ''}
    ${sections}
  </div>`;
  $('[data-dclose]', box).onclick = () => { J.on = false; renderMaps(V.root); };
  const add = $('[data-jadd]', box); if (add) add.onchange = () => { if (add.value) { J.chars.push(add.value); redraw(); renderDetail(); } };
  $$('[data-jrm]', box).forEach(b => b.onclick = () => { J.chars = J.chars.filter(x => x !== b.dataset.jrm); redraw(); renderDetail(); });
  $$('[data-jpov]', box).forEach(b => b.onchange = () => { if (b.checked) J.povOnly.add(b.dataset.jpov); else J.povOnly.delete(b.dataset.jpov); redraw(); renderDetail(); });
  const up = $('[data-jup]', box);
  if (up) {
    const f = () => up.style.setProperty('--p', (up.value / (up.max || 1) * 100) + '%'); f();
    up.oninput = () => { J.upTo = +up.value >= tree.length - 1 ? null : +up.value; f(); const lab = $('.mj-up span', box); lab.innerHTML = `Up to <b>Chapter ${+up.value + 1}</b> · ${esc(tree[+up.value].title)}`; redraw(); };
    up.onchange = () => renderDetail();
  }
  $$('[data-scene]', box).forEach(b => b.onclick = () => ctx.openScene(b.dataset.scene));
}

// ---------------------------------------------------------------- picking a place (pins and scenes)
export function pickPlace(current, done, { title = 'Choose a place', suggest = [] } = {}) {
  let picked;
  const s = sheet({ title, sub: 'Pick a place from your story bible, or type a new name to create one.', foot: null, onClose: () => done(picked),
    body: `<div class="bb-search pp-search">${icon('search')}<input id="ppQ" placeholder="Search or create a place" autocomplete="off"></div><div class="pp-list" id="ppList"></div>` });
  const q = $('#ppQ', s.wrap), list = $('#ppList', s.wrap);
  const draw = () => {
    const v = q.value.trim(), lv = v.toLowerCase();
    const all = entries('place');
    const hits = all.filter(p => !lv || namesOf(p).some(n => n.toLowerCase().includes(lv)) || (p.title || '').toLowerCase().includes(lv));
    const sug = !lv ? suggest.filter(x => all.some(p => p.id === x.id)) : [];
    list.innerHTML = `${sug.length ? `<div class="group-title pp-g">Mentioned in this scene</div>${sug.map(x => row(all.find(p => p.id === x.id), `${x.n}×`)).join('')}<div class="group-title pp-g">All places</div>` : ''}
      ${hits.map(p => row(p)).join('') || (v ? '' : '<p class="note">No places yet. Type a name to create the first one.</p>')}
      ${v && !all.some(p => (p.title || '').toLowerCase() === lv) ? `<button class="pp-row pp-new" data-ppnew>${icon('plus')}<span>Create “<b>${esc(v)}</b>”</span></button>` : ''}
      ${current ? `<button class="pp-row pp-clear" data-ppclear>${icon('x')}<span>No place</span></button>` : ''}`;
    $$('[data-pp]', list).forEach(b => b.onclick = () => { picked = b.dataset.pp; s.close(); });
    const nb = $('[data-ppnew]', list); if (nb) nb.onclick = async () => { const p = await createEntry('place', v); picked = p.id; s.close(); toast(`“${v}” added to your places`); };
    const cb = $('[data-ppclear]', list); if (cb) cb.onclick = () => { picked = ''; s.close(); };
  };
  const row = (p, extra = '') => `<button class="pp-row ${p.id === current ? 'on' : ''}" data-pp="${p.id}">${avatar(p, 30)}<span><b>${esc(p.title || 'Unnamed place')}</b><small>${esc([p.data && p.data.kind, p.data && p.data.region].filter(Boolean).join(' · '))}</small></span>${extra ? `<em>${extra}</em>` : ''}${p.id === current ? icon('check') : ''}</button>`;
  q.oninput = draw; q.onkeydown = e => { if (e.key === 'Enter') { const first = $('[data-pp], [data-ppnew]', list); if (first) first.click(); } };
  draw(); setTimeout(() => q.focus(), 40);
}
// Places mentioned in a scene, most mentioned first
export function suggestPlaces(scene, html) {
  const text = htmlToText(html ?? scene.content ?? '');
  return entries('place').map(p => { const re = nameRegex(namesOf(p)); return { id: p.id, n: re ? (text.match(re) || []).length : 0 }; }).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 4);
}
export function scenePlaceSheet(sceneId, after, html) {
  const sc = byId(sceneId); if (!sc) return;
  pickPlace(sc.place, async id => {
    if (id === undefined) return;
    sc.place = id || null; await ctx.saveItem(sc); after && after();
  }, { title: 'Where does this scene happen?', suggest: suggestPlaces(sc, html) });
}

// Who's in a scene: what Inkfold detected, and the writer's corrections
export function castSheet(sceneId, after) {
  const sc = byId(sceneId); if (!sc) return;
  const chars = entries('character');
  const cast = { in: [...((sc.cast || {}).in || [])], out: [...((sc.cast || {}).out || [])] };
  const auto = c => { const st = castStatus(c, { ...sc, cast: {} }); return st; };
  const stateOf = c => cast.in.includes(c.id) ? 'in' : cast.out.includes(c.id) ? 'out' : 'auto';
  const s = sheet({ title: 'Who’s in this scene?', sub: 'Used for character journeys on the map. Inkfold counts the point-of-view character and anyone mentioned by name. Correct it here if it got something wrong.', foot: `<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-save>Save</button>`,
    body: chars.length ? `<div class="cast-list">${chars.map(c => { const a = auto(c); return `<div class="cast-row" data-cid="${c.id}">${avatar(c, 30)}<span class="cast-name"><b>${esc(c.title || 'Unnamed')}</b><small>${a.why === 'pov' ? 'Point of view' : a.why === 'mentioned' ? `Mentioned ${a.n}×` : 'Not detected'}</small></span>
      <div class="seg cast-seg"><button data-v="auto" class="${stateOf(c) === 'auto' ? 'on' : ''}">Auto${a.inScene ? ' ✓' : ''}</button><button data-v="in" class="${stateOf(c) === 'in' ? 'on' : ''}">In</button><button data-v="out" class="${stateOf(c) === 'out' ? 'on' : ''}">Not in</button></div></div>`; }).join('')}</div>`
      : '<p class="note">Add characters in the Bible first.</p>' });
  $$('.cast-row', s.wrap).forEach(r => $$('[data-v]', r).forEach(b => b.onclick = () => {
    const id = r.dataset.cid; cast.in = cast.in.filter(x => x !== id); cast.out = cast.out.filter(x => x !== id);
    if (b.dataset.v === 'in') cast.in.push(id); if (b.dataset.v === 'out') cast.out.push(id);
    $$('[data-v]', r).forEach(x => x.classList.toggle('on', x === b));
  }));
  const c = $('[data-c]', s.wrap); if (c) c.onclick = s.close;
  const sv = $('[data-save]', s.wrap); if (sv) sv.onclick = async () => { sc.cast = cast.in.length || cast.out.length ? cast : null; await ctx.saveItem(sc); s.close(); after && after(); };
}
export function castCount(sc) { return entries('character').filter(c => castStatus(c, sc).inScene).length; }

// ---------------------------------------------------------------- export
async function exportPng() {
  const m = curMap(); flushBurst();
  const S = Math.max(m.data.w, m.data.h) / 1400;
  const counts = new Map();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${m.data.w}" height="${m.data.h}" viewBox="0 0 ${m.data.w} ${m.data.h}"><image href="${m.data.src}" xlink:href="${m.data.src}" x="0" y="0" width="${m.data.w}" height="${m.data.h}"/>${marksSvg(m, { S, counts, idPrefix: 'x', journey: V.journey.on && V.journey.chars.length ? journeySvg(m, { S, idPrefix: 'x' }) : '' })}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The map couldn’t be drawn.')); i.src = url; });
    const c = document.createElement('canvas'); c.width = m.data.w; c.height = m.data.h;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    await saveFile(blob, `${safeName(m.title || 'Map')}.png`, { preferShare: true });
    toast('Map saved as a picture');
  } finally { URL.revokeObjectURL(url); }
}

void NS; void closePop; void popover;
