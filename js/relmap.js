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
  $('#rmLegend', main).innerHTML = mode === 'tree'
    ? [['Male', GENDER_COLORS.Male], ['Female', GENDER_COLORS.Female], ['Non-binary / other', GENDER_COLORS.Other], ['Gender not set', GENDER_COLORS['']]].map(([n, c]) => `<span><i class="round" style="--k:${c}"></i>${n}</span>`).join('')
      + `<span><svg class="lg-ring" viewBox="-11 -11 22 22"><g class="ring"><circle r="10" class="ring-bg"/><circle cx="-2.6" r="4.2" class="ring-o"/><circle cx="2.6" r="4.2" class="ring-o"/></g></svg>Married</span>`
      + (showAll ? usedKinds.filter(k => !relKind(k).family).map(k => { const K = relKind(k); return `<span><i style="--k:${K.color}" class="${k === 'enemy' || k === 'rival' ? 'dash' : ''}"></i>${K.name.replace(/ of$| to$| with$/, '')}</span>`; }).join('') : '')
    : usedKinds.map(k => { const K = relKind(k); return `<span><i style="--k:${K.color}" class="${k === 'enemy' || k === 'rival' ? 'dash' : ''}"></i>${K.name.replace(/ of$| to$| with$/, '')}</span>`; }).join('');

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
    if (mode === 'tree') return drawTreeNodes(g);
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

  function drawTreeNodes(g) {
    chars.forEach(c => {
      const p = pos.get(c.id); if (!p) return;
      const d = c.data || {};
      const col = genderColor(c);
      const n = document.createElementNS(NS, 'g');
      n.setAttribute('class', 'rm-node tree' + (treeInfo.loose.includes(c) ? ' loose' : ''));
      n.setAttribute('transform', `translate(${p.x} ${p.y})`);
      n.dataset.id = c.id;
      const clip = 'tclip-' + c.id.replace(/[^\w-]/g, '');
      const words = (c.title || 'Unnamed').trim().split(/\s+/);
      const l1 = words[0], l2 = words.slice(1).join(' ');
      const w = Math.min(140, Math.max(66, Math.max(l1.length, l2.length) * 7.6 + 18));
      n.innerHTML = `<circle r="${R + 7}" class="halo"/><circle r="${R + 2}" fill="${col}"/>${d.photo
        ? `<clipPath id="${clip}"><circle r="${R - 3}"/></clipPath><image href="${d.photo}" x="${-R + 3}" y="${-R + 3}" width="${(R - 3) * 2}" height="${(R - 3) * 2}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
        : `<circle r="${R - 3}" fill="${col}" class="t-fill"/><path class="t-sil" d="M0 -14a8 8 0 1 1 0 16a8 8 0 1 1 0-16zM-15 20c0-9 6.5-14 15-14s15 5 15 14z" transform="translate(0 -1)"/>`}
        <g class="tn-label" transform="translate(0 ${R + 6})"><rect x="${-w / 2}" y="0" width="${w}" height="${l2 ? 32 : 19}" rx="5"/><text text-anchor="middle" y="13">${esc(l1)}</text>${l2 ? `<text text-anchor="middle" y="26">${esc(l2.length > 18 ? l2.slice(0, 17) + '…' : l2)}</text>` : ''}</g>`;
      g.appendChild(n);
    });
  }

  function applySelection() {
    svg.classList.toggle('has-sel', !!selected);
    $$('.rm-node', svg).forEach(n => n.classList.toggle('sel', n.dataset.id === selected));
    const linked = new Set([selected]);
    if (selected && mode === 'tree' && treeInfo && treeInfo.people.includes(selected)) treeInfo.related(selected).forEach(x => linked.add(x));
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
    const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 140, minY = Math.min(...ys) - 80, maxY = Math.max(...ys) + 110;
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
// Laid out like a printed family tree: every generation on its own row, partners side by side joined by one line,
// children hanging from the middle of their parents' line, siblings sharing one bar.
const GX = 150;          // distance between partners
const SIB_GAP = 140;     // space between siblings' households
const FAM_GAP = 210;     // space between different families
const GY = 200;          // distance between generations

export const GENDER_COLORS = { Male: '#1d7d9a', Female: '#ef6a2c', 'Non-binary': '#8d6cc8', Other: '#8d6cc8', '': '#8b93a1' };
export const genderColor = c => GENDER_COLORS[(c.data && c.data.gender) || ''] || GENDER_COLORS[''];

function treeLayout(chars, all, pos) {
  const fam = all.filter(r => relKind(r.data.kind).family);
  const ids = new Set(chars.map(c => c.id));
  const inTree = new Set(); fam.forEach(r => { if (ids.has(r.data.a) && ids.has(r.data.b)) { inTree.add(r.data.a); inTree.add(r.data.b); } });
  const people = chars.filter(c => inTree.has(c.id)).map(c => c.id);
  const parents = new Map(), spouses = new Map(), sibs = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  fam.forEach(r => {
    const { a, b, kind } = r.data; if (!inTree.has(a) || !inTree.has(b) || a === b) return;
    if (kind === 'parent') add(parents, b, a);
    if (kind === 'spouse') { add(spouses, a, b); add(spouses, b, a); }
    if (kind === 'sibling') { add(sibs, a, b); add(sibs, b, a); }
  });

  // sibling groups (sibling links + shared parents); members without parents borrow the group's parents
  const grp = new Map(people.map(id => [id, id]));
  const find = x => { while (grp.get(x) !== x) { grp.set(x, grp.get(grp.get(x))); x = grp.get(x); } return x; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) grp.set(ra, rb); };
  sibs.forEach((list, a) => list.forEach(b => unite(a, b)));
  const byParents = new Map();
  parents.forEach((ps, c) => { const k = [...ps].sort().join('|'); if (byParents.has(k)) unite(c, byParents.get(k)); else byParents.set(k, c); });
  const groupOf = new Map(); people.forEach(id => { const r = find(id); if (!groupOf.has(r)) groupOf.set(r, []); groupOf.get(r).push(id); });
  const eff = new Map(); // child -> parent ids actually drawn
  people.forEach(id => {
    if ((parents.get(id) || []).length) { eff.set(id, [...parents.get(id)].sort()); return; }
    const mates = groupOf.get(find(id)).filter(x => (parents.get(x) || []).length);
    if (mates.length) eff.set(id, [...parents.get(mates[0])].sort());
  });
  // contradictory data (A parent of B and B parent of A, or longer loops): drop the link that closes the loop
  { const kids = new Map(); eff.forEach((ps, c) => ps.forEach(p => add(kids, p, c)));
    const state = new Map(), drop = [];
    const dfs = (u) => { state.set(u, 1); for (const c of kids.get(u) || []) { if (state.get(c) === 1) drop.push([u, c]); else if (!state.get(c)) dfs(c); } state.set(u, 2); };
    people.forEach(id => { if (!state.get(id)) dfs(id); });
    drop.forEach(([p, c]) => { const ps = (eff.get(c) || []).filter(x => x !== p); if (ps.length) eff.set(c, ps); else eff.delete(c); }); }
  const kidsOf = new Map(); eff.forEach((ps, c) => ps.forEach(p => add(kidsOf, p, c)));

  // partners: married couples, plus two people who share a child (drawn as a couple without the ring)
  const partners = new Map(); const married = new Set();
  spouses.forEach((list, a) => list.forEach(b => { add(partners, a, b); married.add([a, b].sort().join('|')); }));
  eff.forEach(ps => { if (ps.length === 2) { add(partners, ps[0], ps[1]); add(partners, ps[1], ps[0]); } });

  // generations: children one row below parents, partners and siblings on the same row
  const gen = new Map(people.map(id => [id, 0]));
  for (let pass = 0; pass < 80; pass++) {
    let changed = false;
    const up = (id, v) => { if (v > gen.get(id) && v < 60) { gen.set(id, v); changed = true; } };
    eff.forEach((ps, c) => ps.forEach(p => { up(c, gen.get(p) + 1); up(p, gen.get(c) - 1); }));
    partners.forEach((list, a) => list.forEach(b => { up(a, gen.get(b)); up(b, gen.get(a)); }));
    groupOf.forEach(g => { const m = Math.max(...g.map(x => gen.get(x))); g.forEach(x => up(x, m)); });
    if (!changed) break;
  }
  const minG = Math.min(...people.map(id => gen.get(id)));
  people.forEach(id => gen.set(id, gen.get(id) - minG));

  // households: partners on the same row, in a line (someone with two partners sits between them)
  const unitOf = new Map(), units = [];
  const seen = new Set();
  const title = id => (chars.find(c => c.id === id) || {}).title || '';
  [...people].sort((a, b) => title(a).localeCompare(title(b))).forEach(id => {
    if (seen.has(id)) return;
    const comp = []; const stack = [id]; seen.add(id);
    while (stack.length) { const x = stack.pop(); comp.push(x); for (const y of partners.get(x) || []) if (!seen.has(y) && gen.get(y) === gen.get(x)) { seen.add(y); stack.push(y); } }
    let line = [comp[0]];
    if (comp.length > 1) {
      const deg = x => (partners.get(x) || []).filter(y => comp.includes(y)).length;
      const hub = comp.slice().sort((a, b) => deg(b) - deg(a))[0];
      line = [hub]; const placed = new Set([hub]);
      let left = true;
      for (const y of (partners.get(hub) || []).filter(y => comp.includes(y))) { if (left) line.unshift(y); else line.push(y); placed.add(y); left = !left; }
      let grew = true;
      while (grew) { grew = false; for (const end of [line[0], line[line.length - 1]]) for (const y of (partners.get(end) || []).filter(y => comp.includes(y) && !placed.has(y))) { if (end === line[0]) line.unshift(y); else line.push(y); placed.add(y); grew = true; } }
      comp.filter(x => !placed.has(x)).forEach(x => line.push(x));
    }
    const u = { id: units.length, members: line, gen: gen.get(id), x: 0 };
    units.push(u); line.forEach(m => unitOf.set(m, u));
  });
  const rowsN = Math.max(0, ...units.map(u => u.gen)) + 1;
  const rows = Array.from({ length: rowsN }, () => []);

  // first ordering: walk the families depth-first so relatives start out next to each other
  const placedU = new Set();
  const visit = u => {
    if (!u || placedU.has(u.id)) return;
    placedU.add(u.id); rows[u.gen].push(u);
    for (const m of u.members) for (const p of eff.get(m) || []) visit(unitOf.get(p));
    const kids = [...new Set(u.members.flatMap(m => kidsOf.get(m) || []))];
    kids.forEach(k => visit(unitOf.get(k)));
  };
  units.filter(u => u.gen === 0).forEach(visit); units.forEach(visit);

  // households belong together when the person in them is a child of the same parents (or the same parentless sibling group)
  const famOf = m => (eff.get(m) || []).join('|') || ((groupOf.get(find(m)) || []).length > 1 ? 'grp:' + find(m) : '');
  const familyKey = u => { const keys = [...new Set(u.members.map(famOf).filter(Boolean))]; return keys.length === 1 ? keys[0] : null; };
  const gapAfter = (a, b) => familyKey(a) && familyKey(a) === familyKey(b) ? SIB_GAP : FAM_GAP;
  const memberX = id => { const u = unitOf.get(id); return u.x + u.members.indexOf(id) * GX; };
  const pack = () => rows.forEach(r => { let x = 0; r.forEach((u, i) => { u.x = x; x += (u.members.length - 1) * GX + (r[i + 1] ? gapAfter(u, r[i + 1]) : 0); }); });
  const parentAnchor = m => { const ps = eff.get(m) || []; return ps.length ? ps.reduce((s, p) => s + memberX(p), 0) / ps.length : null; };
  const unitTop = u => { const v = u.members.map(parentAnchor).filter(v => v !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const unitKids = u => [...new Set(u.members.flatMap(m => kidsOf.get(m) || []))];
  const unitBottom = u => { const k = unitKids(u); return k.length ? k.reduce((s, c) => s + memberX(c), 0) / k.length : null; };
  const orderMembers = u => {
    if (u.members.length < 2) return;
    const a = parentAnchor(u.members[0]), b = parentAnchor(u.members[u.members.length - 1]);
    if (a !== null && b !== null && a > b) u.members.reverse();
    else if (a === null && b !== null && u.members.length === 2) { /* keep the child of this family nearest its parents */ const c = u.x + (u.members.length - 1) * GX / 2; if (b < c) u.members.reverse(); }
    else if (b === null && a !== null && u.members.length === 2) { const c = u.x + (u.members.length - 1) * GX / 2; if (a > c) u.members.reverse(); }
  };
  // barycentre sweeps to untangle the order. Children of the same parents always stay side by side:
  // whole sibling groups move as one, and only then are the siblings ordered inside their group.
  const sortRow = row => {
    const blocks = new Map();
    row.forEach((u, i) => { u.i = i; const key = familyKey(u) || 'u' + u.id; if (!blocks.has(key)) blocks.set(key, []); blocks.get(key).push(u); });
    const list = [...blocks.values()].map(us => ({ us: us.sort((a, b) => a.k - b.k || a.i - b.i), k: us.reduce((t, u) => t + u.k, 0) / us.length, i: Math.min(...us.map(u => u.i)) }));
    list.sort((a, b) => a.k - b.k || a.i - b.i);
    row.splice(0, row.length, ...list.flatMap(b => b.us));
  };
  pack();
  for (let it = 0; it < 6; it++) {
    for (let g = 1; g < rowsN; g++) { rows[g].forEach(u => { u.k = unitTop(u); if (u.k === null) u.k = u.x; }); sortRow(rows[g]); pack(); rows[g].forEach(orderMembers); }
    for (let g = rowsN - 2; g >= 0; g--) { rows[g].forEach(u => { u.k = unitBottom(u); if (u.k === null) u.k = u.x; }); sortRow(rows[g]); pack(); }
  }
  rows.forEach(r => r.forEach(orderMembers));

  // coordinates: keep the order, put each household as close as possible to where it wants to be
  // (under its parents / over its children), never closer to its neighbour than the gap allows
  function place(row, desired, weight) {
    // isotonic regression (pool adjacent violators) on left edges with minimum spacing
    const n = row.length; if (!n) return;
    const off = [0];
    for (let i = 1; i < n; i++) { const a = row[i - 1], b = row[i]; off[i] = off[i - 1] + (a.members.length - 1) * GX + gapAfter(a, b); }
    const blocks = [];
    for (let i = 0; i < n; i++) {
      blocks.push({ w: weight[i], v: desired[i] - off[i], n: 1, start: i });
      while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
        const b = blocks.pop(), a = blocks[blocks.length - 1];
        const w = a.w + b.w; a.v = (a.v * a.w + b.v * b.w) / w; a.w = w; a.n += b.n;
      }
    }
    blocks.forEach(b => { for (let i = b.start; i < b.start + b.n; i++) row[i].x = b.v + off[i]; });
  }
  const width = u => (u.members.length - 1) * GX;
  const topDown = g => {
    const row = rows[g];
    // households that are siblings get the same target so the group is centred under the parents
    const desired = row.map(u => {
      const tops = u.members.map((m, j) => { const a = parentAnchor(m); return a === null ? null : a - j * GX; }).filter(v => v !== null);
      return tops.length ? tops.reduce((a, b) => a + b, 0) / tops.length : null;
    });
    // centre each sibling run on its parents
    let i = 0;
    while (i < row.length) {
      let j = i; const key = familyKey(row[i]);
      while (key && j + 1 < row.length && familyKey(row[j + 1]) === key) j++;
      if (key && j > i && !key.startsWith('grp:')) {
        const anchor = parentAnchor(row[i].members.find(m => famOf(m) === key));
        let span = 0; const offs = [];
        for (let k = i; k <= j; k++) { offs.push(span); span += width(row[k]) + (k < j ? SIB_GAP : 0); }
        const kidsMid = []; for (let k = i; k <= j; k++) { const idx = row[k].members.findIndex(m => famOf(m) === key); kidsMid.push(offs[k - i] + idx * GX); }
        const mid = kidsMid.reduce((a, b) => a + b, 0) / kidsMid.length;
        for (let k = i; k <= j; k++) desired[k] = anchor - mid + offs[k - i];
      }
      i = j + 1;
    }
    place(row, desired.map((d, k) => d === null ? row[k].x : d), desired.map(d => d === null ? 0.05 : 1));
  };
  const bottomUp = g => {
    const row = rows[g];
    const desired = row.map(u => { const b = unitBottom(u); return b === null ? null : b - width(u) / 2; });
    place(row, desired.map((d, k) => d === null ? row[k].x : d), row.map((u, k) => desired[k] === null ? 0.05 : unitKids(u).length));
  };
  for (let it = 0; it < 12; it++) {
    for (let g = rowsN - 2; g >= 0; g--) bottomUp(g);
    for (let g = 1; g < rowsN; g++) topDown(g);
  }

  people.forEach(id => pos.set(id, { x: memberX(id), y: gen.get(id) * GY }));
  // people outside the family: a row underneath
  const loose = chars.filter(c => !inTree.has(c.id));
  const xs = people.map(id => pos.get(id).x); const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  loose.forEach((c, i) => pos.set(c.id, { x: midX + (i - (loose.length - 1) / 2) * GX, y: rowsN * GY + 60 }));
  const related = id => new Set([id, ...(eff.get(id) || []), ...(kidsOf.get(id) || []), ...(partners.get(id) || []), ...(groupOf.get(find(id)) || [])]);
  return { units, unitOf, eff, kidsOf, partners, married, groupOf: [...groupOf.values()], gen, loose, people, related };
}

function drawTreeLinks(g, info, pos) {
  if (!info) return;
  let html = '';
  const LABEL = 40; // the name label under each circle
  // couples: one line between partners; married couples get a ring in the middle
  info.units.forEach(u => {
    for (let i = 0; i + 1 < u.members.length; i++) {
      const a = u.members[i], b = u.members[i + 1];
      if (!(info.partners.get(a) || []).includes(b)) continue;
      const A = pos.get(a), B = pos.get(b); const y = A.y;
      const x1 = A.x + R + 3, x2 = B.x - R - 3, mx = (A.x + B.x) / 2;
      if (info.married.has([a, b].sort().join('|'))) {
        html += `<path d="M${x1} ${y - 3}H${x2}M${x1} ${y + 3}H${x2}" class="tl t couple"/>`;
        html += `<g class="ring" transform="translate(${mx} ${y})"><circle r="10" class="ring-bg"/><circle cx="-2.6" r="4.2" class="ring-o"/><circle cx="2.6" r="4.2" class="ring-o"/></g>`;
      } else {
        html += `<path d="M${x1} ${y}H${x2}" class="tl t"/><circle cx="${mx}" cy="${y}" r="4" class="tl-dot"/>`;
      }
    }
  });
  // children: grouped by their parents, hanging from one bar
  const groups = new Map();
  info.eff.forEach((ps, c) => { const k = ps.join('|'); if (!groups.has(k)) groups.set(k, { ps, kids: [] }); groups.get(k).kids.push(c); });
  // sibling groups with no parents in the tree get a bar with a stub (their parents aren't shown)
  info.groupOf.forEach(m => { if (m.length > 1 && !m.some(x => info.eff.has(x))) groups.set('none:' + m.join('|'), { ps: [], kids: m }); });
  // stagger bars that would overlap on the same row
  const bars = [];
  groups.forEach(gp => {
    const K = gp.kids.map(k => pos.get(k)).filter(Boolean); if (!K.length) return;
    const P = gp.ps.map(p => pos.get(p)).filter(Boolean);
    const together = P.length === 2 && Math.abs(P[0].y - P[1].y) < 1 && Math.abs(P[0].x - P[1].x) <= GX + 1;
    const ax = P.length ? P.reduce((s, p) => s + p.x, 0) / P.length : K.reduce((s, k) => s + k.x, 0) / K.length;
    const ay = P.length === 0 ? null : together || P.length === 1 ? (P.length === 1 ? P[0].y + R + LABEL : P[0].y + 13) : Math.max(...P.map(p => p.y)) + R + LABEL;
    const top = Math.min(...K.map(k => k.y)) - R - 4;
    const lo = Math.min(ax, ...K.map(k => k.x)), hi = Math.max(ax, ...K.map(k => k.x));
    bars.push({ gp, P, K, ax, ay, top, lo, hi, together });
  });
  const levels = new Map();
  bars.sort((a, b) => a.lo - b.lo).forEach(b => {
    const key = Math.round(b.top); const used = levels.get(key) || [];
    let lv = 0; while (used.some(x => x.lv === lv && !(b.lo > x.hi + 12 || b.hi < x.lo - 12))) lv++;
    used.push({ lv, lo: b.lo, hi: b.hi }); levels.set(key, used); b.lv = lv;
  });
  bars.forEach(b => {
    const barY = b.top - 26 - b.lv * 12;
    let d = '';
    if (b.ay === null) d += `M${b.ax} ${barY - 16}V${barY}`;
    else {
      if (b.P.length === 2 && !b.together) { // parents far apart: join them first
        b.P.forEach(p => { d += `M${p.x} ${p.y + R + LABEL}V${b.ay}`; });
        d += `M${Math.min(...b.P.map(p => p.x))} ${b.ay}H${Math.max(...b.P.map(p => p.x))}`;
      }
      d += `M${b.ax} ${b.ay}V${barY}`;
    }
    d += `M${b.lo} ${barY}H${b.hi}`;
    b.K.forEach(k => { d += `M${k.x} ${barY}V${k.y - R - 4}`; });
    html += `<path d="${d}" class="tl t"/>`;
    if (b.ay === null) html += `<circle cx="${b.ax}" cy="${barY - 16}" r="4" class="tl-dot"/>`;
  });
  // married-in partners (no parents shown, partner of someone who has them): a short stub with a dot
  info.units.forEach(u => {
    if (!u.members.some(m => info.eff.has(m))) return;
    u.members.filter(m => !info.eff.has(m)).forEach(m => { const P = pos.get(m); html += `<path d="M${P.x} ${P.y - R - 4}V${P.y - R - 22}" class="tl t"/><circle cx="${P.x}" cy="${P.y - R - 22}" r="4" class="tl-dot"/>`; });
  });
  g.insertAdjacentHTML('beforeend', html);
}
