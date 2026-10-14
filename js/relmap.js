// Inkfold — Relationship map: a free-form web and a generational family tree.
import { $, $$, esc, icon, el, haptic } from './ui.js';
import { REL_KINDS, relKind, entries, rels, avatar } from './bible.js';

const NS = 'http://www.w3.org/2000/svg';
const R = 30; // node radius
const view = { web: null, tree: null };
let showAll = false;
const AV = ['#2f6f62', '#7a4e3a', '#4a5f8f', '#7b5a8a', '#5f7346', '#8a5a5a', '#3f6b7f', '#866b34'];
const hue = s => { let h = 0; for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export function renderMap(main, ctx) {
  const chars = entries('character');
  const all = rels().filter(r => chars.some(c => c.id === r.data.a) && chars.some(c => c.id === r.data.b));
  const mode = ctx.mode;
  let selected = null;
  main.innerHTML = `<div class="rmap">
    <div class="rm-bar">
      <div class="seg rm-mode"><button data-m="web" class="${mode === 'web' ? 'on' : ''}">${icon('web')}<span>Web</span></button><button data-m="tree" class="${mode === 'tree' ? 'on' : ''}">${icon('tree')}<span>Family tree</span></button></div>
      ${mode === 'tree' ? `<label class="rm-check"><input type="checkbox" id="rmAll" ${showAll ? 'checked' : ''}> Show other relationships</label>` : `<span class="rm-hint hide-narrow">Drag people to arrange them. Double-click to open a profile.</span>`}
      <span style="flex:1"></span>
      <button class="btn btn-primary btn-sm" data-addrel>${icon('plus')}<span class="hide-narrow">Add relationship</span></button>
    </div>
    <div class="rm-stage" id="rmStage">
      <svg class="rm-svg" id="rmSvg"><defs>${REL_KINDS.filter(k => k.dir).map(k => `<marker id="arw-${k.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${k.color}"/></marker>`).join('')}</defs><g id="rmVp"><g id="rmEdges"></g><g id="rmNodes"></g></g></svg>
      <div class="rm-zoom"><button class="icon-btn" data-z="in" aria-label="Zoom in">${icon('zoomIn')}</button><button class="icon-btn" data-z="out" aria-label="Zoom out">${icon('zoomOut')}</button><button class="icon-btn" data-z="fit" aria-label="Fit to screen">${icon('fit')}</button></div>
      <div class="rm-legend" id="rmLegend"></div>
      <div class="rm-card" id="rmCard" hidden></div>
      <div class="rm-empty" id="rmEmpty" hidden></div>
    </div>
  </div>`;
  $$('[data-m]', main).forEach(b => b.onclick = () => { ctx.setMode(b.dataset.m); ctx.mode = b.dataset.m; renderMap(main, ctx); });
  const chk = $('#rmAll', main); if (chk) chk.onchange = () => { showAll = chk.checked; renderMap(main, ctx); };
  $('[data-addrel]', main).onclick = () => ctx.relSheet(selected ? { a: selected } : null, () => renderMap(main, ctx));

  const stage = $('#rmStage', main), svg = $('#rmSvg', main), vp = $('#rmVp', main);
  const empty = $('#rmEmpty', main);
  if (chars.length < 2 || (mode === 'tree' && !all.some(r => relKind(r.data.kind).family))) {
    empty.hidden = false;
    empty.innerHTML = chars.length < 2
      ? `${icon('users')}<b>Add a few characters first</b><span>Relationships connect the people in your story. Create characters in the Characters tab, then link them here.</span>`
      : `${icon('tree')}<b>No family yet</b><span>The family tree is built from <i>Parent of</i>, <i>Married to</i> and <i>Sibling of</i> relationships.</span><button class="btn btn-quiet btn-sm" data-addrel2>${icon('plus')}Add a family relationship</button>`;
    const b2 = $('[data-addrel2]', empty); if (b2) b2.onclick = () => ctx.relSheet(null, () => renderMap(main, ctx));
    if (chars.length < 2) return;
  }

  // ---------- layout ----------
  const pos = new Map();
  let treeInfo = null, loose = [];
  if (mode === 'web') webLayout(chars, all, pos);
  else { treeInfo = treeLayout(chars, all, pos); loose = treeInfo.loose; }

  const drawn = mode === 'web' ? all : all.filter(r => relKind(r.data.kind).family || showAll);
  const usedKinds = [...new Set(drawn.map(r => r.data.kind))];
  $('#rmLegend', main).innerHTML = usedKinds.map(k => { const K = relKind(k); return `<span><i style="--k:${K.color}" class="${k === 'enemy' || k === 'rival' ? 'dash' : ''}"></i>${K.name.replace(/ of$| to$| with$/, '')}</span>`; }).join('');

  function drawEdges() {
    const g = $('#rmEdges', svg); g.innerHTML = '';
    if (mode === 'tree') drawTreeLinks(g, treeInfo, pos);
    const pairCount = new Map();
    drawn.forEach(r => {
      const K = relKind(r.data.kind);
      if (mode === 'tree' && K.family) return;
      const a = pos.get(r.data.a), b = pos.get(r.data.b); if (!a || !b) return;
      const key = [r.data.a, r.data.b].sort().join('|'); const n = pairCount.get(key) || 0; pairCount.set(key, n + 1);
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const sx = a.x + ux * (R + 2), sy = a.y + uy * (R + 2), ex = b.x - ux * (R + (K.dir ? 6 : 2)), ey = b.y - uy * (R + (K.dir ? 6 : 2));
      const bend = (mode === 'tree' ? 0.25 * d : 0) + Math.ceil(n / 2) * 52 * (n % 2 ? 1 : -1);
      const cx = (sx + ex) / 2 - uy * bend, cy = (sy + ey) / 2 + ux * bend;
      const path = `M${sx} ${sy}Q${cx} ${cy} ${ex} ${ey}`;
      const grp = document.createElementNS(NS, 'g');
      grp.setAttribute('class', 'rm-edge' + (mode === 'tree' ? ' faint' : ''));
      grp.dataset.rel = r.id; grp.dataset.a = r.data.a; grp.dataset.b = r.data.b;
      const mx = 0.25 * sx + 0.5 * cx + 0.25 * ex, my = 0.25 * sy + 0.5 * cy + 0.25 * ey;
      const label = K.name.replace(/ of$| to$| with$/, '');
      grp.innerHTML = `<path d="${path}" class="hit"/><path d="${path}" stroke="${K.color}" class="ln ${r.data.kind === 'enemy' || r.data.kind === 'rival' ? 'dash' : ''}" ${K.dir ? `marker-end="url(#arw-${K.id})"` : ''}/>
        <g class="elabel" transform="translate(${mx} ${my})"><rect x="${-label.length * 3.4 - 8}" y="-10" width="${label.length * 6.8 + 16}" height="20" rx="10" style="stroke:${K.color}"/><text text-anchor="middle" y="4" style="fill:${K.color}">${esc(label)}</text></g>`;
      grp.addEventListener('click', e => { e.stopPropagation(); ctx.relSheet(r, () => renderMap(main, ctx)); });
      g.appendChild(grp);
    });
    applySelection();
  }

  function drawNodes() {
    const g = $('#rmNodes', svg); g.innerHTML = '';
    chars.forEach(c => {
      const p = pos.get(c.id); if (!p) return;
      const d = c.data || {};
      const n = document.createElementNS(NS, 'g');
      n.setAttribute('class', 'rm-node' + (d.role === 'Protagonist' ? ' hero' : ''));
      n.setAttribute('transform', `translate(${p.x} ${p.y})`);
      n.dataset.id = c.id;
      const clip = 'clip-' + c.id.replace(/[^\w-]/g, '');
      n.innerHTML = `<circle r="${R + 4}" class="halo"/>${d.photo
        ? `<clipPath id="${clip}"><circle r="${R}"/></clipPath><image href="${d.photo}" x="${-R}" y="${-R}" width="${R * 2}" height="${R * 2}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/><circle r="${R}" class="rim"/>`
        : `<circle r="${R}" fill="${hue(c.title)}"/><text class="ini" text-anchor="middle" y="6">${esc(initials(c.title))}</text>`}
        <text class="nm" text-anchor="middle" y="${R + 20}">${esc(c.title || 'Unnamed')}</text>${d.role ? `<text class="rl" text-anchor="middle" y="${R + 35}">${esc(d.role)}</text>` : ''}`;
      g.appendChild(n);
    });
  }

  function applySelection() {
    svg.classList.toggle('has-sel', !!selected);
    $$('.rm-node', svg).forEach(n => n.classList.toggle('sel', n.dataset.id === selected));
    const linked = new Set([selected]);
    $$('.rm-edge', svg).forEach(e => { const on = selected && (e.dataset.a === selected || e.dataset.b === selected); e.classList.toggle('on', !!on); if (on) { linked.add(e.dataset.a); linked.add(e.dataset.b); } });
    $$('.rm-node', svg).forEach(n => n.classList.toggle('linked', linked.has(n.dataset.id)));
    const card = $('#rmCard', main);
    if (!selected) { card.hidden = true; return; }
    const c = chars.find(x => x.id === selected);
    const mine = all.filter(r => r.data.a === selected || r.data.b === selected);
    card.hidden = false;
    card.innerHTML = `<div class="rc-top">${avatar(c, 42)}<div><b>${esc(c.title || 'Unnamed')}</b><span>${esc((c.data && c.data.role) || 'Character')}</span></div><button class="icon-btn" data-close-card aria-label="Close">${icon('x')}</button></div>
      <div class="rc-list">${mine.length ? mine.map(r => { const K = relKind(r.data.kind); const other = chars.find(x => x.id === (r.data.a === selected ? r.data.b : r.data.a)); return `<button class="rc-rel" data-rel="${r.id}"><i style="--k:${K.color}"></i><span>${r.data.a === selected ? K.name : (K.inverse || K.name)}</span><b>${esc(other?.title || '')}</b></button>`; }).join('') : '<span class="note" style="text-align:left">No relationships yet.</span>'}</div>
      <div class="rc-actions"><button class="btn btn-quiet btn-sm" data-open-profile>Open profile</button><button class="btn btn-ghost btn-sm" data-rel-new>${icon('plus')}Relationship</button></div>`;
    $('[data-close-card]', card).onclick = () => { selected = null; applySelection(); };
    $('[data-open-profile]', card).onclick = () => ctx.openEntry(selected);
    $('[data-rel-new]', card).onclick = () => ctx.relSheet({ a: selected }, () => renderMap(main, ctx));
    $$('[data-rel]', card).forEach(b => b.onclick = () => ctx.relSheet(all.find(r => r.id === b.dataset.rel), () => renderMap(main, ctx)));
  }

  // ---------- pan / zoom ----------
  let T = view[mode] || null;
  const apply = () => vp.setAttribute('transform', `translate(${T.x} ${T.y}) scale(${T.k})`);
  function fit() {
    const pts = [...pos.values()];
    if (!pts.length) { T = { x: 0, y: 0, k: 1 }; return apply(); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90, minY = Math.min(...ys) - 70, maxY = Math.max(...ys) + 90;
    const W = stage.clientWidth, H = stage.clientHeight;
    const k = Math.max(0.35, Math.min(1.25, Math.min(W / (maxX - minX), H / (maxY - minY))));
    T = { k, x: W / 2 - (minX + maxX) / 2 * k, y: H / 2 - (minY + maxY) / 2 * k };
    view[mode] = T; apply();
  }
  const zoomAt = (f, cx, cy) => { const k = Math.max(0.25, Math.min(2.5, T.k * f)); T.x = cx - (cx - T.x) * (k / T.k); T.y = cy - (cy - T.y) * (k / T.k); T.k = k; view[mode] = T; apply(); };
  $$('[data-z]', main).forEach(b => b.onclick = () => { const W = stage.clientWidth / 2, H = stage.clientHeight / 2; if (b.dataset.z === 'fit') fit(); else zoomAt(b.dataset.z === 'in' ? 1.2 : 1 / 1.2, W, H); });
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  const pointers = new Map(); let drag = null, pinch = null;
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - T.x) / T.k, y: (cy - r.top - T.y) / T.k }; };
  svg.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: T.k }; drag = null; return; }
    const node = e.target.closest('.rm-node');
    if (e.target.closest('.rm-edge')) return;
    drag = node ? { kind: 'node', id: node.dataset.id, sx: e.clientX, sy: e.clientY, moved: false, el: node } : { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: T.x, ty: T.y, moved: false };
  });
  svg.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const r = svg.getBoundingClientRect(); const f = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; const k0 = T.k; zoomAt((pinch.k * f) / k0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return; }
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (drag.kind === 'pan') { T.x = drag.tx + dx; T.y = drag.ty + dy; apply(); }
    else if (mode === 'web') { const w = toWorld(e.clientX, e.clientY); pos.set(drag.id, { x: w.x, y: w.y }); drag.el.setAttribute('transform', `translate(${w.x} ${w.y})`); drawEdges(); svg.classList.add('dragging'); }
  });
  const end = async e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    const d = drag; drag = null; svg.classList.remove('dragging');
    if (!d) return;
    if (d.kind === 'node' && d.moved && mode === 'web') {
      const c = chars.find(x => x.id === d.id); const p = pos.get(d.id);
      c.data = c.data || {}; c.data.mapPos = { x: Math.round(p.x), y: Math.round(p.y) };
      await ctx.saveItem(c); haptic(6);
    } else if (d.kind === 'node' && !d.moved) { selected = selected === d.id ? null : d.id; applySelection(); }
    else if (d.kind === 'pan' && !d.moved) { selected = null; applySelection(); }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('dblclick', e => { const n = e.target.closest('.rm-node'); if (n) ctx.openEntry(n.dataset.id); });

  drawNodes(); drawEdges();
  requestAnimationFrame(() => { if (T) apply(); else fit(); });
  if (mode === 'tree' && loose.length) {
    const lg = $('#rmLegend', main);
    lg.insertAdjacentHTML('beforeend', `<span class="rm-loose">${loose.length} not in the family tree</span>`);
  }
}

// ---------------------------------------------------------------- Web layout (force-directed)
function webLayout(chars, all, pos) {
  const N = chars.length;
  const pts = chars.map((c, i) => {
    const mp = c.data && c.data.mapPos;
    const a = (i / N) * Math.PI * 2;
    return { id: c.id, x: mp ? mp.x : Math.cos(a) * 60 * Math.sqrt(N) * 2, y: mp ? mp.y : Math.sin(a) * 60 * Math.sqrt(N) * 2, fixed: !!mp, vx: 0, vy: 0 };
  });
  const idx = new Map(pts.map((p, i) => [p.id, i]));
  const links = all.map(r => [idx.get(r.data.a), idx.get(r.data.b)]).filter(([a, b]) => a !== undefined && b !== undefined);
  if (pts.some(p => !p.fixed)) {
    for (let it = 0; it < 600; it++) {
      const cool = 1 - it / 600;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = pts[i], b = pts[j]; let dx = b.x - a.x, dy = b.y - a.y; let d2 = dx * dx + dy * dy || 1; const d = Math.sqrt(d2);
        const f = 30000 / d2; dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
      for (const [i, j] of links) {
        const a = pts[i], b = pts[j]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
        const f = (d - 240) * 0.035; a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
      }
      for (const p of pts) {
        p.vx -= p.x * 0.012; p.vy -= p.y * 0.012;
        if (!p.fixed) { p.x += Math.max(-30, Math.min(30, p.vx)) * cool; p.y += Math.max(-30, Math.min(30, p.vy)) * cool; }
        p.vx *= 0.5; p.vy *= 0.5;
      }
    }
  }
  pts.forEach(p => pos.set(p.id, { x: p.x, y: p.y }));
}

// ---------------------------------------------------------------- Family tree layout (generations)
function treeLayout(chars, all, pos) {
  const fam = all.filter(r => relKind(r.data.kind).family);
  const inTree = new Set(); fam.forEach(r => { inTree.add(r.data.a); inTree.add(r.data.b); });
  const people = chars.filter(c => inTree.has(c.id));
  const parents = new Map(), spouses = new Map(), sibs = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  fam.forEach(r => {
    const { a, b, kind } = r.data;
    if (kind === 'parent') add(parents, b, a);
    if (kind === 'spouse') { add(spouses, a, b); add(spouses, b, a); }
    if (kind === 'sibling') { add(sibs, a, b); add(sibs, b, a); }
  });
  const gen = new Map(people.map(p => [p.id, 0]));
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (const p of people) {
      let g = gen.get(p.id);
      for (const par of parents.get(p.id) || []) g = Math.max(g, gen.get(par) + 1);
      for (const s of [...(spouses.get(p.id) || []), ...(sibs.get(p.id) || [])]) g = Math.max(g, gen.get(s));
      if (g !== gen.get(p.id) && g < 40) { gen.set(p.id, g); changed = true; }
    }
    if (!changed) break;
  }
  const rows = new Map();
  people.forEach(p => { const g = gen.get(p.id); if (!rows.has(g)) rows.set(g, []); rows.get(g).push(p.id); });
  const GX = 160, GY = 170;
  const x = new Map();
  [...rows.keys()].sort((a, b) => a - b).forEach((g, gi) => {
    const ids = rows.get(g);
    const key = id => {
      const ps = (parents.get(id) || []).filter(p => x.has(p));
      if (ps.length) return ps.reduce((s, p) => s + x.get(p), 0) / ps.length;
      const sib = (sibs.get(id) || []).find(s => x.has(s)); if (sib) return x.get(sib);
      return null;
    };
    // group spouses into units
    const seen = new Set(), units = [];
    ids.forEach((id, i) => {
      if (seen.has(id)) return;
      const unit = [id]; seen.add(id);
      for (const s of spouses.get(id) || []) if (ids.includes(s) && !seen.has(s)) { unit.push(s); seen.add(s); }
      unit.sort((a, b) => ((key(b) !== null) - (key(a) !== null)));
      const ks = unit.map(key).filter(k => k !== null);
      units.push({ unit, k: ks.length ? ks.reduce((s, v) => s + v, 0) / ks.length : null, i });
    });
    let fallback = 0;
    units.sort((a, b) => (a.k ?? 1e9 + a.i) - (b.k ?? 1e9 + b.i));
    let cursor = -Infinity;
    units.forEach(u => {
      const width = (u.unit.length - 1) * GX;
      let start = u.k !== null ? u.k - width / 2 : (cursor === -Infinity ? fallback++ * GX : cursor);
      if (start < cursor) start = cursor;
      u.unit.forEach((id, j) => x.set(id, start + j * GX));
      cursor = start + width + GX + 20;
      void gi;
    });
  });
  people.forEach(p => pos.set(p.id, { x: x.get(p.id), y: gen.get(p.id) * GY }));
  // people outside the family: a row underneath
  const loose = chars.filter(c => !inTree.has(c.id));
  const maxG = people.length ? Math.max(...people.map(p => gen.get(p.id))) : -1;
  const xs = people.map(p => x.get(p.id)); const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  loose.forEach((c, i) => pos.set(c.id, { x: midX + (i - (loose.length - 1) / 2) * GX, y: (maxG + 1) * GY + 70 }));
  return { parents, spouses, sibs, gen, loose, people };
}

function drawTreeLinks(g, info, pos) {
  if (!info) return;
  const pc = relKind('parent').color, sc = relKind('spouse').color, sbc = relKind('sibling').color;
  let html = '';
  // spouses
  const done = new Set();
  info.spouses.forEach((list, a) => list.forEach(b => {
    const k = [a, b].sort().join('|'); if (done.has(k)) return; done.add(k);
    const A = pos.get(a), B = pos.get(b); if (!A || !B) return;
    if (Math.abs(A.y - B.y) < 1) html += `<line x1="${Math.min(A.x, B.x) + R}" y1="${A.y}" x2="${Math.max(A.x, B.x) - R}" y2="${B.y}" stroke="${sc}" class="tl spouse"/>`;
    else html += `<path d="M${A.x} ${A.y}L${B.x} ${B.y}" stroke="${sc}" class="tl spouse"/>`;
  }));
  // children grouped by parent set
  const groups = new Map();
  info.parents.forEach((ps, child) => { const k = [...ps].sort().join('|'); if (!groups.has(k)) groups.set(k, { ps, kids: [] }); groups.get(k).kids.push(child); });
  groups.forEach(({ ps, kids }) => {
    const P = ps.map(p => pos.get(p)).filter(Boolean); const K = kids.map(k => pos.get(k)).filter(Boolean);
    if (!P.length || !K.length) return;
    const married = ps.length === 2 && (info.spouses.get(ps[0]) || []).includes(ps[1]) && Math.abs(P[0].y - P[1].y) < 1;
    const ax = P.reduce((s, p) => s + p.x, 0) / P.length;
    const ay = married ? P[0].y : Math.max(...P.map(p => p.y)) + R + 22;
    const top = Math.min(...K.map(k => k.y)) - R - 26;
    const midY = Math.max(ay + 24, top);
    if (!married) P.forEach(p => { html += `<path d="M${p.x} ${p.y + R + 22}V${p.y + R + 30}" stroke="${pc}" class="tl"/>`; });
    if (!married && P.length > 1) html += `<path d="M${Math.min(...P.map(p => p.x))} ${ay}H${Math.max(...P.map(p => p.x))}" stroke="${pc}" class="tl"/>`;
    const minX = Math.min(ax, ...K.map(k => k.x)), maxX = Math.max(ax, ...K.map(k => k.x));
    html += `<path d="M${ax} ${ay + (married ? 0 : 0)}V${midY}M${minX} ${midY}H${maxX}${K.map(k => `M${k.x} ${midY}V${k.y - R - 24}`).join('')}" stroke="${pc}" class="tl"/>`;
  });
  // siblings with no recorded parents: a dashed bracket above them
  const sdone = new Set();
  info.sibs.forEach((list, a) => list.forEach(b => {
    const k = [a, b].sort().join('|'); if (sdone.has(k)) return; sdone.add(k);
    const pa = info.parents.get(a) || [], pb = info.parents.get(b) || [];
    if (pa.some(p => pb.includes(p))) return;
    const A = pos.get(a), B = pos.get(b); if (!A || !B) return;
    const y = Math.min(A.y, B.y) - R - 30;
    html += `<path d="M${A.x} ${A.y - R - 24}V${y}H${B.x}V${B.y - R - 24}" stroke="${sbc}" class="tl dash"/>`;
  }));
  g.insertAdjacentHTML('beforeend', html);
}
