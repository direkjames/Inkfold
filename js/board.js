// Inkfold — Corkboard, Outliner and scene details.
import { buildTree, STATUSES, LABELS, statusOf, labelOf } from './model.js';
import { $, $$, esc, num, el, icon, popover, closePop, sheet, haptic } from './ui.js';

let ctx; // { state, saveItem, openScene, addScene, addChapter, onChange }
export function initBoard(c) { ctx = c; }

const pill = it => { const s = statusOf(it); return `<span class="pill st-${s.id}">${s.name}</span>`; };
const progress = it => it.target ? `<span class="tnum">${num(it.words)} / ${num(it.target)}</span>` : `<span class="tnum">${num(it.words)} words</span>`;

// ---------------------------------------------------------------- Corkboard
export function renderBoard(root) {
  const tree = buildTree(ctx.state.items);
  root.innerHTML = `<div class="board">${tree.map((c, ci) => `
    <section class="b-chapter" data-chapter="${c.id}">
      <header class="b-head">
        <div class="b-title"><span class="eyebrow">Chapter ${ci + 1}</span><h3>${esc(c.title)}</h3></div>
        <span class="b-count tnum">${c.scenes.length} scene${c.scenes.length === 1 ? '' : 's'} · ${num(c.scenes.reduce((s, x) => s + (x.words || 0), 0))} words</span>
      </header>
      <div class="b-grid">
        ${c.scenes.map((s, si) => cardHtml(s, si)).join('')}
        ${c.id !== '__loose' ? `<button class="b-add" data-add-card="${c.id}">${icon('plus')}<span>New card</span></button>` : ''}
      </div>
    </section>`).join('')}
    <button class="btn btn-quiet b-newch" data-board-chapter>${icon('plus')}New chapter</button>
  </div>`;
  root.onclick = e => {
    const add = e.target.closest('[data-add-card]');
    if (add) return ctx.addScene(add.dataset.addCard, { stay: true });
    if (e.target.closest('[data-board-chapter]')) return ctx.addChapter({ stay: true });
    if (e.target.closest('[data-cgrip]')) return;
    const card = e.target.closest('.card-ix');
    if (card) sceneDetails(card.dataset.id);
  };
  root.ondblclick = e => { const card = e.target.closest('.card-ix'); if (card) ctx.openScene(card.dataset.id); };
  $$('[data-cgrip]', root).forEach(g => g.addEventListener('pointerdown', startCardDrag));
}

function cardHtml(s, i) {
  const l = labelOf(s);
  const pct = s.target ? Math.min(100, Math.round((s.words || 0) / s.target * 100)) : null;
  return `<article class="card-ix ${s.conflictOf ? 'conflict' : ''}" data-id="${s.id}" tabindex="0" style="${l ? `--lbl:${l.color}` : ''}">
    <div class="cx-top"><span class="cx-grip" data-cgrip aria-label="Drag card">${icon('grip')}</span><span class="cx-num tnum">${String(i + 1).padStart(2, '0')}</span>${pill(s)}</div>
    <h4>${esc(s.title || 'Untitled scene')}</h4>
    <p class="cx-syn ${s.synopsis ? '' : 'empty'}">${s.synopsis ? esc(s.synopsis) : 'Add a synopsis…'}</p>
    <footer>${s.pov ? `<span class="cx-pov">${icon('pen')}${esc(s.pov)}</span>` : '<span></span>'}${progress(s)}</footer>
    ${pct !== null ? `<div class="cx-bar"><i style="width:${pct}%"></i></div>` : ''}
  </article>`;
}

function startCardDrag(e) {
  const card = e.currentTarget.closest('.card-ix');
  const root = card.closest('.board');
  const id = card.dataset.id;
  const sx = e.clientX, sy = e.clientY;
  const rect = card.getBoundingClientRect();
  let started = false, ghost = null, ph = null, lastKey = '';
  e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
  const scroller = root.closest('.view-scroll');

  const move = ev => {
    if (!started) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      started = true; haptic(6);
      ghost = card.cloneNode(true); ghost.classList.add('cx-ghost');
      Object.assign(ghost.style, { width: rect.width + 'px', height: rect.height + 'px', left: rect.left + 'px', top: rect.top + 'px' });
      document.body.appendChild(ghost);
      ph = el('<div class="cx-ph"></div>'); ph.style.height = rect.height + 'px';
      card.after(ph); card.hidden = true;
    }
    ghost.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy}px) rotate(-1.5deg)`;
    if (scroller) { const r = scroller.getBoundingClientRect(); if (ev.clientY < r.top + 50) scroller.scrollTop -= 12; else if (ev.clientY > r.bottom - 50) scroller.scrollTop += 12; }
    // nearest card (or an empty chapter)
    const cards = $$('.card-ix', root).filter(c => c !== card);
    let best = null, bd = Infinity;
    for (const c of cards) { const r = c.getBoundingClientRect(); const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2)); if (d < bd) { bd = d; best = c; } }
    const overGrid = document.elementsFromPoint(ev.clientX, ev.clientY).map(x => x.closest && x.closest('.b-grid')).find(Boolean);
    if (overGrid && !overGrid.querySelector('.card-ix:not([hidden])')) {
      const key = 'into:' + overGrid.closest('.b-chapter').dataset.chapter;
      if (key !== lastKey) { lastKey = key; overGrid.prepend(ph); }
      return;
    }
    if (!best) return;
    const r = best.getBoundingClientRect();
    const after = ev.clientX > r.left + r.width / 2;
    const key = best.dataset.id + (after ? ':a' : ':b');
    if (key !== lastKey) { lastKey = key; after ? best.after(ph) : best.before(ph); }
  };
  const up = async () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    if (!started) return;
    ghost.remove();
    const grid = ph.closest('.b-grid');
    const chapterId = grid.closest('.b-chapter').dataset.chapter;
    const siblings = $$('.card-ix, .cx-ph', grid).filter(x => x !== card);
    const idx = siblings.indexOf(ph);
    const prev = siblings[idx - 1], next = siblings[idx + 1];
    const find = n => n && ctx.state.items.find(i => i.id === n.dataset.id);
    const a = find(prev), b = find(next);
    const it = ctx.state.items.find(i => i.id === id);
    if (chapterId !== '__loose') it.parentId = chapterId;
    it.order = a && b ? (a.order + b.order) / 2 : a ? a.order + 1 : b ? b.order - 1 : 1;
    await ctx.saveItem(it); haptic(10);
    ctx.onChange();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

// ---------------------------------------------------------------- Outliner
export function renderOutline(root) {
  const tree = buildTree(ctx.state.items);
  root.innerHTML = `<div class="outline-wrap"><table class="outline">
    <thead><tr><th class="o-n">#</th><th>Scene</th><th>Status</th><th>POV</th><th class="o-c">Label</th><th class="o-w">Words</th><th class="o-t">Target</th><th class="o-syn">Synopsis</th><th class="o-c"></th></tr></thead>
    <tbody>${tree.map((c, ci) => `
      <tr class="o-ch"><td colspan="9"><div><span class="eyebrow">Chapter ${ci + 1}</span><b>${esc(c.title)}</b><span class="tnum">${num(c.scenes.reduce((s, x) => s + (x.words || 0), 0))} words</span></div></td></tr>
      ${c.scenes.map((s, si) => rowHtml(s, si)).join('')}`).join('')}
    </tbody></table></div>`;
  root.onchange = async e => {
    const f = e.target.dataset.f; if (!f) return;
    const row = e.target.closest('tr'); const it = ctx.state.items.find(i => i.id === row.dataset.id);
    let v = e.target.value;
    if (f === 'target') v = Math.max(0, parseInt(v, 10) || 0) || null;
    if (f === 'title') v = v.trim() || 'Untitled scene';
    it[f] = v;
    await ctx.saveItem(it); ctx.onChange({ skipView: true });
    if (f === 'target' || f === 'status') row.outerHTML = rowHtml(it, +row.dataset.n);
  };
  root.onclick = e => {
    const open = e.target.closest('[data-open-scene]'); if (open) return ctx.openScene(open.dataset.openScene);
    const lb = e.target.closest('[data-label]'); if (lb) return labelMenu(lb, lb.closest('tr').dataset.id, () => renderOutline(root));
  };
  root.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); };
}

function rowHtml(s, i) {
  const l = labelOf(s);
  const pct = s.target ? Math.min(100, Math.round((s.words || 0) / s.target * 100)) : null;
  return `<tr data-id="${s.id}" data-n="${i}">
    <td class="o-n tnum">${i + 1}</td>
    <td><input class="o-in o-title" data-f="title" value="${esc(s.title)}" aria-label="Title" maxlength="140"></td>
    <td><span class="o-sel st-${statusOf(s).id}"><select data-f="status" aria-label="Status">${STATUSES.map(x => `<option value="${x.id}" ${statusOf(s).id === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></span></td>
    <td><input class="o-in" data-f="pov" value="${esc(s.pov || '')}" placeholder="—" aria-label="Point of view" maxlength="40"></td>
    <td class="o-c"><button class="o-dot" data-label style="${l ? `--lbl:${l.color}` : ''}" aria-label="Label: ${l ? l.name : 'none'}"></button></td>
    <td class="o-w tnum">${num(s.words)}${pct !== null ? `<div class="o-bar"><i style="width:${pct}%"></i></div>` : ''}</td>
    <td class="o-t"><input class="o-in tnum" type="number" min="0" step="100" data-f="target" value="${s.target || ''}" placeholder="—" aria-label="Word target"></td>
    <td class="o-syn"><input class="o-in" data-f="synopsis" value="${esc(s.synopsis || '')}" placeholder="One line about this scene" aria-label="Synopsis" maxlength="400"></td>
    <td class="o-c"><button class="icon-btn" data-open-scene="${s.id}" aria-label="Open in editor" title="Open in editor">${icon('pen')}</button></td>
  </tr>`;
}

export function labelMenu(anchor, id, after) {
  const it = ctx.state.items.find(i => i.id === id);
  const p = popover(anchor, `<div class="lbl-pop"><button class="lbl-sw none ${!it.label ? 'on' : ''}" data-l="" aria-label="No label">${icon('x')}</button>${LABELS.map(l => `<button class="lbl-sw ${it.label === l.id ? 'on' : ''}" data-l="${l.id}" style="--lbl:${l.color}" aria-label="${l.name}" title="${l.name}"></button>`).join('')}</div>`, { align: 'start' });
  $$('[data-l]', p).forEach(b => b.onclick = async () => { it.label = b.dataset.l || null; closePop(); await ctx.saveItem(it); ctx.onChange({ skipView: true }); after && after(); });
}

// ---------------------------------------------------------------- Scene details
export function sceneDetails(id) {
  const it = ctx.state.items.find(i => i.id === id);
  if (!it) return;
  let status = statusOf(it).id, label = it.label || '';
  const s = sheet({
    title: 'Scene details',
    body: `<div class="field"><label class="field-label" for="sd-title">Title</label><input class="input" id="sd-title" value="${esc(it.title)}" maxlength="140"></div>
      <div class="field"><label class="field-label" for="sd-syn">Synopsis</label><textarea class="input prose" id="sd-syn" rows="3" maxlength="400" placeholder="What happens, and why it matters">${esc(it.synopsis || '')}</textarea></div>
      <div class="field"><span class="field-label">Status</span><div class="seg" id="sd-status">${STATUSES.map(x => `<button data-v="${x.id}" class="${x.id === status ? 'on' : ''}"><i class="st-dot st-${x.id}"></i>${x.name}</button>`).join('')}</div></div>
      <div class="split2">
        <div class="field"><label class="field-label" for="sd-pov">Point of view</label><input class="input" id="sd-pov" value="${esc(it.pov || '')}" placeholder="Whose eyes?" maxlength="40"></div>
        <div class="field"><label class="field-label" for="sd-target">Word target</label><input class="input tnum" id="sd-target" type="number" min="0" step="100" value="${it.target || ''}" placeholder="e.g. 1500"></div>
      </div>
      <div class="field"><span class="field-label">Label</span><div class="lbl-pop" id="sd-label"><button class="lbl-sw none ${!label ? 'on' : ''}" data-l="" aria-label="No label">${icon('x')}</button>${LABELS.map(l => `<button class="lbl-sw ${label === l.id ? 'on' : ''}" data-l="${l.id}" style="--lbl:${l.color}" aria-label="${l.name}"></button>`).join('')}</div></div>`,
    foot: `<button class="btn btn-ghost" data-open>${icon('pen')}Open in editor</button><button class="btn btn-primary" data-save>Save</button>`
  });
  $$('#sd-status button', s.wrap).forEach(b => b.onclick = () => { status = b.dataset.v; $$('#sd-status button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $$('#sd-label [data-l]', s.wrap).forEach(b => b.onclick = () => { label = b.dataset.l; $$('#sd-label [data-l]', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  const save = async () => {
    Object.assign(it, { title: $('#sd-title').value.trim() || 'Untitled scene', synopsis: $('#sd-syn').value.trim(), status, label: label || null, pov: $('#sd-pov').value.trim(), target: parseInt($('#sd-target').value, 10) || null });
    await ctx.saveItem(it); ctx.onChange(); s.close();
  };
  $('[data-save]', s.wrap).onclick = save;
  $('[data-open]', s.wrap).onclick = async () => { await save(); ctx.openScene(id); };
}
