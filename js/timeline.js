// Inkfold — Timeline: when each scene happens in the story, by point of view.
import { buildTree, statusOf } from './model.js';
import { $, $$, esc, icon, sheet, toast } from './ui.js';

let ctx; // { state, saveItem, openScene, onChange }
export function initTimeline(c) { ctx = c; }
let order = 'story';

export function whenKey(w) {
  if (!w) return null;
  let k = null;
  if (w.date) { const [y, m, d] = w.date.split('-').map(Number); k = Date.UTC(y, m - 1, d) / 864e5; }
  else if (w.day !== undefined && w.day !== null && w.day !== '') k = +w.day;
  if (k === null || Number.isNaN(k)) return null;
  if (w.time) { const [h, mi] = w.time.split(':').map(Number); k += (h * 60 + (mi || 0)) / 1440; }
  return k;
}
export function whenLabel(w) {
  if (!w) return '';
  const parts = [];
  if (w.label) parts.push(w.label);
  else if (w.date) { const [y, m, d] = w.date.split('-').map(Number); parts.push(new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })); }
  else if (w.day !== undefined && w.day !== null && w.day !== '') parts.push(`Day ${w.day}`);
  if (w.time) { const [h, mi] = w.time.split(':').map(Number); parts.push(new Date(2000, 0, 1, h, mi).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })); }
  return parts.join(' · ');
}

export function renderTimeline(root) {
  const tree = buildTree(ctx.state.items);
  const scenes = tree.flatMap((c, ci) => c.scenes.map((s, si) => ({ s, num: `${ci + 1}.${si + 1}`, ch: c.title, idx: 0 })));
  scenes.forEach((x, i) => { x.idx = i; x.k = whenKey(x.s.when); });
  const placed = scenes.filter(x => x.k !== null);
  const unplaced = scenes.filter(x => x.k === null);
  const chron = [...placed].sort((a, b) => a.k - b.k || a.idx - b.idx);
  chron.forEach((x, i) => { x.c = i; });
  // flashbacks: a scene that happens before the scene read just before it
  const readOrder = [...placed].sort((a, b) => a.idx - b.idx);
  readOrder.forEach((x, i) => { x.r = i; });
  let prevK = -Infinity;
  for (const x of readOrder) { x.flash = x.k < prevK; prevK = Math.max(prevK, x.k); }
  const povs = [...new Set(placed.map(x => (x.s.pov || '').trim() || '—'))].sort((a, b) => a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b));
  const COL = 210, LANE = 132, PADX = 150, PADY = 48;
  const xOf = x => PADX + (order === 'story' ? x.c : x.r) * COL;
  const yOf = x => PADY + povs.indexOf((x.s.pov || '').trim() || '—') * LANE;
  const W = PADX + Math.max(1, placed.length) * COL + 40, H = PADY + povs.length * LANE + 20;
  const pts = readOrder.map(x => [xOf(x) + 85, yOf(x) + 46]);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('');
  let lastLabel = '';
  const axis = (order === 'story' ? chron : readOrder).map(x => { const l = whenLabel({ ...x.s.when, label: '' }) || whenLabel(x.s.when); const show = l !== lastLabel; lastLabel = l; return show ? `<span class="tl-tick" style="left:${xOf(x)}px">${esc(l)}</span>` : ''; }).join('');

  root.innerHTML = `<div class="tline">
    <div class="tl-bar">
      <div class="seg tl-order"><button data-o="story" class="${order === 'story' ? 'on' : ''}">Story order</button><button data-o="read" class="${order === 'read' ? 'on' : ''}">Reading order</button></div>
      <span class="tl-hint hide-narrow">${order === 'story' ? 'Scenes as they happen in your world. The line follows reading order, so jumps backwards are flashbacks.' : 'Scenes in the order readers meet them, with their story dates.'}</span>
    </div>
    ${placed.length ? `<div class="tl-scroll"><div class="tl-canvas" style="width:${W}px;height:${H}px">
      ${povs.map((p, i) => `<div class="tl-lane" style="top:${PADY + i * LANE - 10}px;height:${LANE}px"><span>${p === '—' ? 'No point of view' : esc(p)}</span></div>`).join('')}
      <div class="tl-axis">${axis}</div>
      <svg class="tl-path" width="${W}" height="${H}"><path d="${path}"/></svg>
      ${placed.map(x => `<button class="tl-card ${x.flash ? 'flash' : ''}" data-id="${x.s.id}" style="left:${xOf(x)}px;top:${yOf(x)}px">
        <span class="tl-top"><span class="tnum">${x.num}</span><i class="st-dot st-${statusOf(x.s).id}"></i>${x.flash ? '<b class="tl-fb">Flashback</b>' : ''}</span>
        <b>${esc(x.s.title)}</b><span class="tl-when">${esc(whenLabel(x.s.when))}</span>
      </button>`).join('')}
    </div></div>` : `<div class="tl-empty">${icon('calendar')}<b>Put your scenes in time</b><span>Give scenes a story date, a day number like “Day 3”, or a time. They’ll line up here by when they happen, one lane per point of view.</span></div>`}
    ${unplaced.length ? `<div class="tl-tray"><span class="group-title">Not on the timeline · ${unplaced.length}</span><div class="tl-chips">${unplaced.map(x => `<button class="tl-chip" data-id="${x.s.id}"><span class="tnum">${x.num}</span>${esc(x.s.title)}</button>`).join('')}</div></div>` : ''}
  </div>`;
  $$('[data-o]', root).forEach(b => b.onclick = () => { order = b.dataset.o; renderTimeline(root); });
  $$('.tl-card, .tl-chip', root).forEach(b => b.onclick = () => whenSheet(b.dataset.id, () => renderTimeline(root)));
}

export function whenSheet(id, after) {
  const sc = ctx.state.items.find(i => i.id === id); if (!sc) return;
  const w = sc.when || {};
  const s = sheet({ title: 'When does it happen?', sub: `“${esc(sc.title)}”. Use a calendar date, or a day number if your world has its own calendar.`,
    body: `<div class="split2"><div class="field"><label class="field-label" for="wDate">Date</label><input class="input tnum" type="date" id="wDate" value="${w.date || ''}"></div>
      <div class="field"><label class="field-label" for="wDay">or Day number</label><input class="input tnum" type="number" id="wDay" value="${w.day ?? ''}" placeholder="e.g. 3"></div></div>
      <div class="split2"><div class="field"><label class="field-label" for="wTime">Time</label><input class="input tnum" type="time" id="wTime" value="${w.time || ''}"></div>
      <div class="field"><label class="field-label" for="wLabel">Label</label><input class="input" id="wLabel" value="${esc(w.label || '')}" placeholder="The night of the storm" maxlength="60"></div></div>
      <div class="field"><label class="field-label" for="wPov">Point of view</label><input class="input" id="wPov" value="${esc(sc.pov || '')}" placeholder="Whose eyes?" maxlength="40"></div>`,
    foot: `<button class="btn btn-ghost" data-clear>Remove from timeline</button><span style="flex:1"></span><button class="btn btn-ghost" data-open>${icon('pen')}Open</button><button class="btn btn-primary" data-save>Save</button>` });
  const save = async () => {
    const date = $('#wDate').value, day = $('#wDay').value, time = $('#wTime').value, label = $('#wLabel').value.trim();
    sc.when = date || day !== '' || time || label ? { date: date || null, day: date ? null : (day === '' ? null : +day), time: time || null, label: label || null } : null;
    if (sc.when && whenKey(sc.when) === null && (time || label)) toast('Add a date or day number to place it on the timeline');
    sc.pov = $('#wPov').value.trim();
    await ctx.saveItem(sc); ctx.onChange({ skipView: true }); s.close(); after && after();
  };
  $('[data-save]', s.wrap).onclick = save;
  $('[data-clear]', s.wrap).onclick = async () => { sc.when = null; await ctx.saveItem(sc); s.close(); after && after(); };
  $('[data-open]', s.wrap).onclick = async () => { await save(); ctx.openScene(id); };
}
