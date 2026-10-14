// Inkfold — writing modes: words used per mode, poetry line handling and syllables, journal entries and calendar.
import { $, $$, esc, num, icon } from './ui.js';
import { buildTree } from './model.js';

export const MODES = {
  novel: { name: 'Novel', blurb: 'Chapters and scenes, for fiction and long-form prose.', chapter: 'Chapter', scene: 'Scene', icon: 'book' },
  screenplay: { name: 'Screenplay', blurb: 'Industry formatting as you type, with Fountain and Final Draft export.', chapter: 'Act', scene: 'Scene', icon: 'film' },
  poetry: { name: 'Poetry', blurb: 'Line breaks that stay put, stanzas and syllable counts.', chapter: 'Section', scene: 'Poem', icon: 'feather' },
  journal: { name: 'Journal', blurb: 'One entry a day, organised by month, with moods and a calendar.', chapter: 'Month', scene: 'Entry', icon: 'calendar' },
};
export const modeOf = p => (p && MODES[p.mode]) ? p.mode : 'novel';
export const T = p => MODES[modeOf(p)];

// ---------------------------------------------------------------- Poetry
export function poetryEnter(e, editor) {
  if (e.key !== 'Enter' || e.shiftKey) return false;
  const sel = getSelection(); if (!sel.rangeCount) return false;
  let b = sel.anchorNode; while (b && b.parentNode !== editor) b = b.parentNode;
  if (!b || b.nodeType !== 1) return false;
  // Enter on an empty line starts a new stanza; otherwise it's a line break
  const r = sel.getRangeAt(0).cloneRange(); r.setStart(b, 0);
  const before = r.toString();
  const lineEmpty = before === '' || /\n$/.test(before) || isAfterBr(sel);
  if (lineEmpty && before.trim()) {
    e.preventDefault();
    // remove the trailing <br> that made the empty line, then split into a new stanza
    const prev = previousBr(sel); if (prev) prev.remove();
    document.execCommand('insertParagraph');
    return true;
  }
  e.preventDefault();
  document.execCommand('insertLineBreak');
  return true;
}
function isAfterBr(sel) { const n = sel.anchorNode, o = sel.anchorOffset; if (n.nodeType === 1) { const c = n.childNodes[o - 1]; return c && c.nodeName === 'BR'; } if (n.nodeType === 3 && o === 0) { const p = n.previousSibling; return p && p.nodeName === 'BR'; } return false; }
function previousBr(sel) { const n = sel.anchorNode, o = sel.anchorOffset; if (n.nodeType === 1) { const c = n.childNodes[o - 1]; return c && c.nodeName === 'BR' ? c : null; } if (n.nodeType === 3 && o === 0) { const p = n.previousSibling; return p && p.nodeName === 'BR' ? p : null; } return null; }

export function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
}
export function poemLines(editor) {
  const lines = [];
  for (const p of editor.children) {
    if (p.tagName === 'HR') continue;
    let cur = { text: '', node: null };
    const walk = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (!cur.node && c.nodeValue.trim()) cur.node = c; cur.text += c.nodeValue; }
        else if (c.nodeName === 'BR') { lines.push(cur); cur = { text: '', node: null }; }
        else walk(c);
      }
    };
    walk(p); lines.push(cur);
  }
  return lines;
}
export function renderSyllables(editor, gutter) {
  gutter.innerHTML = '';
  const base = gutter.getBoundingClientRect();
  let count = 0, stanzas = 0;
  for (const p of editor.children) if (p.tagName !== 'HR' && p.textContent.trim()) stanzas++;
  for (const l of poemLines(editor)) {
    if (!l.node || !l.text.trim()) continue;
    count++;
    const n = (l.text.match(/[\p{L}'’]+/gu) || []).reduce((s, w) => s + syllables(w), 0);
    const r = document.createRange(); r.setStart(l.node, 0); r.setEnd(l.node, Math.min(1, l.node.length));
    const rect = r.getClientRects()[0]; if (!rect) continue;
    const s = document.createElement('span'); s.textContent = n; s.style.top = (rect.top - base.top) + 'px'; s.style.height = rect.height + 'px';
    gutter.appendChild(s);
  }
  return { lines: count, stanzas };
}

// ---------------------------------------------------------------- Journal
export const MOODS = [
  { v: 1, name: 'Rough', mouth: 'M8.5 16.5c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2' },
  { v: 2, name: 'Low', mouth: 'M8.5 15.8c1.1-.6 2.3-.9 3.5-.9s2.4.3 3.5.9' },
  { v: 3, name: 'Okay', mouth: 'M8.5 15h7' },
  { v: 4, name: 'Good', mouth: 'M8.5 14.4c1.1.8 2.3 1.2 3.5 1.2s2.4-.4 3.5-1.2' },
  { v: 5, name: 'Great', mouth: 'M8 13.8c1.1 1.8 2.5 2.7 4 2.7s2.9-.9 4-2.7' },
];
export const MOOD_COLORS = { 1: '#b4483a', 2: '#d8873a', 3: '#c49a2c', 4: '#4f9c66', 5: '#2a7865' };
export const moodFace = (v, size = 22) => { const m = MOODS.find(x => x.v === v); return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="mood-face" style="--mc:${MOOD_COLORS[v] || 'var(--muted)'}"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".9" class="eye"/><circle cx="15" cy="10" r=".9" class="eye"/><path d="${m ? m.mouth : MOODS[2].mouth}"/></svg>`; };

const pad = n => String(n).padStart(2, '0');
export const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthTitle = d => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
export const entryTitle = d => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

// Finds or creates the month chapter and the entry for a date. Returns { chapter, scene, created }
export function entryFor(items, projectId, d, make) {
  const key = dateKey(d), mkey = key.slice(0, 7);
  let scene = items.find(i => i.type === 'scene' && !i.deleted && i.when && i.when.date === key);
  if (scene) return { scene, created: false };
  let chapter = items.find(i => i.type === 'chapter' && !i.deleted && i.when && i.when.month === mkey);
  const out = { created: true, newItems: [] };
  if (!chapter) {
    chapter = make.chapter(projectId, d.getFullYear() * 100 + d.getMonth() + 1, monthTitle(d));
    chapter.when = { month: mkey };
    out.newItems.push(chapter);
  }
  scene = make.scene(projectId, chapter.id, d.getDate(), entryTitle(d));
  scene.when = { date: key };
  out.newItems.push(scene);
  return { ...out, scene, chapter };
}

let calMonth = null;
export function renderCalendar(root, ctx) {
  const items = ctx.state.items;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!calMonth) calMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const byDate = new Map(items.filter(i => i.type === 'scene' && !i.deleted && i.when && i.when.date).map(i => [i.when.date, i]));
  const monthEntries = [...byDate.entries()].filter(([k]) => k.startsWith(`${y}-${pad(m + 1)}`)).map(([, v]) => v);
  const words = monthEntries.reduce((s, e) => s + (e.words || 0), 0);
  const moods = monthEntries.filter(e => e.data && e.data.mood);
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-cell pad"></div>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d), key = dateKey(date), e = byDate.get(key);
    const future = date > today, isToday = +date === +today;
    cells += `<button class="cal-cell ${e ? 'has' : ''} ${isToday ? 'today' : ''}" data-date="${key}" ${future && !e ? 'disabled' : ''}>
      <span class="cal-d tnum">${d}</span>
      ${e ? `${e.data && e.data.mood ? moodFace(e.data.mood, 20) : '<i class="cal-dot"></i>'}<span class="cal-w tnum">${num(e.words)}</span>` : ''}
    </button>`;
  }
  root.innerHTML = `<div class="cal">
    <header class="cal-head">
      <div><span class="eyebrow">Journal</span><h2>${esc(monthTitle(calMonth))}</h2><p class="tnum">${monthEntries.length} entr${monthEntries.length === 1 ? 'y' : 'ies'} · ${num(words)} words${moods.length ? ` · average mood ${MOODS[Math.round(moods.reduce((s, e) => s + e.data.mood, 0) / moods.length) - 1].name.toLowerCase()}` : ''}</p></div>
      <div class="cal-nav"><button class="icon-btn" data-cal="-1" aria-label="Previous month">${icon('back')}</button><button class="btn btn-quiet btn-sm" data-cal="0">Today</button><button class="icon-btn" data-cal="1" aria-label="Next month" style="transform:scaleX(-1)">${icon('back')}</button></div>
    </header>
    <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="cal-wd">${d}</span>`).join('')}${cells}</div>
    <button class="btn btn-primary cal-new" data-today>${icon('pen')}Write today’s entry</button>
  </div>`;
  $$('[data-cal]', root).forEach(b => b.onclick = () => { const k = +b.dataset.cal; calMonth = k === 0 ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(y, m + k, 1); renderCalendar(root, ctx); });
  $$('[data-date]', root).forEach(b => b.onclick = () => { const [yy, mm, dd] = b.dataset.date.split('-').map(Number); ctx.openEntry(new Date(yy, mm - 1, dd)); });
  $('[data-today]', root).onclick = () => ctx.openEntry(new Date());
}
export const resetCalendar = () => { calMonth = null; };
void buildTree;
