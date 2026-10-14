// Inkfold — Screenplay mode: Fountain-style elements, auto-formatting, autocomplete,
// Fountain import/export, Final Draft (FDX) export and an industry-format PDF.
import { esc, icon, $, $$ } from './ui.js';
import { htmlToBlocks, blocksToHtml } from './text.js';

export const ELEMENTS = [
  { id: 'heading', name: 'Scene heading', short: 'Heading', key: '1' },
  { id: 'action', name: 'Action', short: 'Action', key: '2' },
  { id: 'character', name: 'Character', short: 'Character', key: '3' },
  { id: 'paren', name: 'Parenthetical', short: 'Paren', key: '4' },
  { id: 'dialogue', name: 'Dialogue', short: 'Dialogue', key: '5' },
  { id: 'transition', name: 'Transition', short: 'Transition', key: '6' },
  { id: 'centered', name: 'Centered', short: 'Centered', key: '7' },
];
const NEXT = { heading: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'heading', centered: 'action' };
const TAB = { action: 'character', character: 'transition', transition: 'heading', heading: 'action', dialogue: 'paren', paren: 'dialogue', centered: 'action' };
const SHIFT_TAB = { character: 'action', transition: 'character', heading: 'transition', action: 'heading', paren: 'dialogue', dialogue: 'character', centered: 'action' };
export const elName = id => (ELEMENTS.find(e => e.id === id) || ELEMENTS[1]).name;

const HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME'];

export function blockOf(editor) {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  let n = sel.anchorNode;
  while (n && n.parentNode !== editor) n = n.parentNode;
  return n && n.nodeType === 1 ? n : null;
}
const caretAtEnd = (b) => { const sel = getSelection(); if (!sel.rangeCount) return false; const r = document.createRange(); r.selectNodeContents(b); r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset); return /^\)?\s*$/.test(r.toString()); };
const textOf = b => (b.textContent || '').replace(/ /g, ' ').trim();
function setEl(b, el) { b.dataset.el = el; }
function caretIn(b, atEnd = true) {
  const r = document.createRange(); r.selectNodeContents(b); r.collapse(!atEnd);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function newBlockAfter(b, el) {
  const p = document.createElement('p'); p.dataset.el = el; p.innerHTML = '<br>';
  b.after(p); caretIn(p, false); return p;
}

// Auto-detect an element from what was typed (Fountain conventions)
function detect(b) {
  const t = textOf(b), el = b.dataset.el || 'action';
  if (!t) return el;
  if ((el === 'action' || el === 'heading') && (HEADING_RE.test(t) || (/^\.[^.]/.test(t)))) return 'heading';
  if (el === 'action' && t.length <= 24 && /^[A-Za-z0-9 .'’\-]+to:$/i.test(t) && (t === t.toUpperCase() || /^(cut|dissolve|smash cut|match cut|fade|jump cut|wipe|iris)/i.test(t))) return 'transition';
  if (el === 'action' && /^>.*<$/.test(t)) return 'centered';
  if (el === 'action' && t.length <= 40 && /\p{L}/u.test(t) && t === t.toUpperCase() && !/[.!?]$/.test(t.replace(/\((V\.O\.|O\.S\.|O\.C\.|CONT’D|CONT'D)\)$/, ''))) return 'character';
  if (el === 'dialogue' && /^\(.*\)$/.test(t)) return 'paren';
  return el;
}

export function handleKey(e, editor, onChange) {
  const b = blockOf(editor); if (!b) return false;
  const el = b.dataset.el || 'action';
  if (ac && ac.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); ac.move(e.key === 'ArrowDown' ? 1 : -1); return true; }
  if (ac && ac.open && (e.key === 'Enter' || e.key === 'Tab') && ac.accept()) { e.preventDefault(); onChange(); return true; }
  if (ac && ac.open && e.key === 'Escape') { e.preventDefault(); closeAC(); return true; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const to = (e.shiftKey ? SHIFT_TAB : TAB)[el] || 'action';
    setEl(b, to);
    if (to === 'paren' && !textOf(b)) { b.textContent = '()'; const r = document.createRange(); r.setStart(b.firstChild, 1); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    onChange(); return true;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    closeAC();
    const t = textOf(b);
    if (!t) {
      // Enter on an empty line steps back to action, like Final Draft
      if (el !== 'action') { e.preventDefault(); setEl(b, 'action'); onChange(); return true; }
      return false;
    }
    const det = detect(b);
    if (det !== el) setEl(b, det);
    if (det === 'heading' && /^\./.test(t) && !/^\.\./.test(t)) b.textContent = t.slice(1);
    if (!caretAtEnd(b)) { setTimeout(() => { const nb = blockOf(editor); if (nb && nb !== b) setEl(nb, b.dataset.el); onChange(); }); return false; }
    e.preventDefault();
    let next = NEXT[det] || 'action';
    newBlockAfter(b, next);
    onChange(); return true;
  }
  return false;
}

// Character and location autocomplete
let ac = null;
function closeAC() { if (ac) { ac.el.remove(); ac = null; } }
export function suggest(editor, allBlocks, bibleNames) {
  const b = blockOf(editor); if (!b) return closeAC();
  const el = b.dataset.el, t = (b.textContent || '').replace(/\u00a0/g, ' ').replace(/^\s+/, '').toUpperCase();
  let list = [], replaceFrom = 0;
  if (el === 'character' && t.length >= 1) {
    const names = new Set([...allBlocks.filter(x => x.el === 'character').map(x => x.text.toUpperCase().replace(/\s*\(.*\)$/, '').trim()), ...bibleNames.map(n => n.toUpperCase())]);
    list = [...names].filter(n => n && n.startsWith(t) && n !== t).slice(0, 6);
  } else if (el === 'heading') {
    const m = t.match(/^((?:INT|EXT|EST|INT\.?\/EXT|I\/E)\.?\s+)(.*)$/);
    if (m && !m[2].includes(' - ') && !m[2].includes(' – ')) {
      const locs = new Set(allBlocks.filter(x => x.el === 'heading').map(x => x.text.toUpperCase().match(/^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)\.?\s+(.+?)(?:\s+[-–]\s+.*)?$/)).filter(Boolean).map(x => x[1].trim()));
      list = [...locs].filter(l => l.startsWith(m[2]) && l !== m[2]).slice(0, 6).map(l => m[1] + l);
    } else if (m) {
      const k = Math.max(t.lastIndexOf(' - '), t.lastIndexOf(' – '));
      const tail = t.slice(k + 3);
      list = TIMES.filter(x => x.startsWith(tail) && x !== tail).slice(0, 6).map(x => t.slice(0, k + 3) + x);
    } else if (t.length <= 3 && t.length >= 1) list = ['INT. ', 'EXT. ', 'INT./EXT. '].filter(x => x.startsWith(t));
  } else if (el === 'transition' && t.length >= 1) {
    list = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE OUT.', 'FADE TO BLACK.'].filter(x => x.startsWith(t) && x !== t);
  }
  void replaceFrom;
  if (!list.length) return closeAC();
  const rect = b.getBoundingClientRect();
  const sel = getSelection(); const cr = sel.rangeCount ? sel.getRangeAt(0).getClientRects()[0] : null;
  if (!ac) { ac = { el: document.createElement('div'), i: 0 }; ac.el.className = 'sp-ac'; document.body.appendChild(ac.el); }
  ac.list = list; ac.i = Math.min(ac.i, list.length - 1); ac.open = true;
  const render = () => {
    ac.el.innerHTML = list.map((x, i) => `<button class="${i === ac.i ? 'on' : ''}" data-i="${i}">${esc(x)}</button>`).join('') + `<span class="sp-ac-hint">Tab to accept</span>`;
    $$('button', ac.el).forEach(btn => btn.onmousedown = ev => { ev.preventDefault(); ac.i = +btn.dataset.i; ac.accept(); editor.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  ac.move = d => { ac.i = (ac.i + d + list.length) % list.length; render(); };
  ac.accept = () => { const v = list[ac.i]; if (!v) return false; b.textContent = v; caretIn(b, true); closeAC(); return true; };
  render();
  const x = cr ? cr.left : rect.left, y = (cr ? cr.bottom : rect.bottom) + 6;
  Object.assign(ac.el.style, { left: Math.min(x, innerWidth - 260) + 'px', top: Math.min(y, innerHeight - 220) + 'px' });
}
export const hideSuggest = closeAC;

export function setElement(editor, el) {
  const b = blockOf(editor); if (!b) return;
  setEl(b, el);
  if (el === 'paren' && !textOf(b)) { b.textContent = '()'; const r = document.createRange(); r.setStart(b.firstChild, 1); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
}

// Estimated page count (industry rule of thumb: ~55 lines a page)
const WIDTH = { heading: 61, action: 61, character: 38, paren: 25, dialogue: 35, transition: 20, centered: 61 };
const GAP = { heading: 2, action: 1, character: 1, transition: 1, centered: 1, paren: 0, dialogue: 0 };
export function pageCount(blocks) {
  let lines = 0;
  for (const b of blocks) { const el = b.el || 'action'; const t = (b.runs || []).map(r => r.text).join(''); lines += GAP[el] + Math.max(1, Math.ceil(t.length / WIDTH[el])); }
  return lines / 55;
}

// ---------------------------------------------------------------- Fountain
const plainRuns = b => (b.runs || []).map(r => { let t = r.text; if (r.b && r.i) t = `***${t}***`; else if (r.b) t = `**${t}**`; else if (r.i) t = `*${t}*`; return t; }).join('');
export function toFountain(project, chapters) {
  const out = [`Title: ${project.title}`];
  if (project.author) out.push(`Author: ${project.author}`);
  out.push(`Draft date: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, '');
  let prev = null;
  for (const ch of chapters) {
    out.push(`# ${ch.title}`, '');
    for (const sc of ch.scenes) {
      for (const b of sc.blocks) {
        const el = b.el || 'action';
        let t = plainRuns(b);
        const tight = (el === 'dialogue' || el === 'paren') && ['character', 'paren', 'dialogue'].includes(prev);
        if (!tight && out[out.length - 1] !== '') out.push('');
        if (el === 'heading') { t = t.toUpperCase(); if (!HEADING_RE.test(t)) t = '.' + t; }
        else if (el === 'character') { t = t.toUpperCase(); if (!/\p{L}/u.test(t)) t = '@' + t; }
        else if (el === 'paren') { if (!/^\(/.test(t)) t = `(${t})`; }
        else if (el === 'transition') { t = t.toUpperCase(); if (!/TO:$/.test(t)) t = '> ' + t; }
        else if (el === 'centered') t = `> ${t} <`;
        else if (el === 'action' && t === t.toUpperCase() && /\p{L}/u.test(t)) t = '!' + t;
        out.push(t);
        prev = el;
      }
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function parseFountain(text) {
  const lines = text.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
  const meta = {};
  let i = 0;
  if (/^[\w ]+:/.test(lines[0] || '')) {
    let key = null;
    for (; i < lines.length && lines[i].trim() !== ''; i++) {
      const m = lines[i].match(/^([\w ]+):\s*(.*)$/);
      if (m) { key = m[1].toLowerCase(); meta[key] = m[2]; } else if (key) meta[key] += (meta[key] ? ' ' : '') + lines[i].trim();
    }
  }
  const chapters = []; let ch = null, sc = null;
  const ensureCh = () => { if (!ch) { ch = { title: 'Act One', scenes: [] }; chapters.push(ch); } return ch; };
  const ensureSc = () => { ensureCh(); if (!sc) { sc = { title: 'Opening', blocks: [] }; ch.scenes.push(sc); } return sc; };
  const push = (el, t) => ensureSc().blocks.push({ type: 'p', el, runs: [{ text: t.replace(/\[\[.*?\]\]/g, '').replace(/\*/g, ''), b: false, i: false }] });
  let mode = null;
  for (; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    const nextLine = (lines[i + 1] || '').trim();
    if (!t) { mode = null; continue; }
    if (/^###?\s/.test(t) || /^#\s/.test(t)) {
      const depth = t.match(/^#+/)[0].length, title = t.replace(/^#+\s*/, '');
      if (depth === 1) { ch = { title, scenes: [] }; chapters.push(ch); sc = null; } else { ensureCh(); sc = { title, blocks: [] }; ch.scenes.push(sc); }
      continue;
    }
    if (/^=(?!=)/.test(t)) continue; // synopsis line
    if (mode === 'dialogue') { push(/^\(.*\)$/.test(t) ? 'paren' : 'dialogue', t); continue; }
    if (prevBlank && (HEADING_RE.test(t) || /^\.[^.]/.test(t))) {
      const h = t.replace(/^\./, '');
      if (sc && sc.blocks.length) { ensureCh(); sc = { title: h, blocks: [] }; ch.scenes.push(sc); } else if (sc && !sc.blocks.length) sc.title = h; else { ensureCh(); sc = { title: h, blocks: [] }; ch.scenes.push(sc); }
      push('heading', h); continue;
    }
    if (/^>.*<$/.test(t)) { push('centered', t.replace(/^>\s*|\s*<$/g, '')); continue; }
    if (/^>/.test(t) || (prevBlank && /^[A-Z0-9 .'’\-]+TO:$/.test(t) && !nextLine)) { push('transition', t.replace(/^>\s*/, '')); continue; }
    if (/^!/.test(t)) { push('action', t.slice(1)); continue; }
    if (prevBlank && nextLine && (/^@/.test(t) || (t === t.toUpperCase() && /\p{L}/u.test(t) && t.length <= 45))) { push('character', t.replace(/^@/, '')); mode = 'dialogue'; continue; }
    push('action', t);
  }
  return { meta, chapters: chapters.length ? chapters : [{ title: 'Act One', scenes: [{ title: 'Opening', blocks: [{ type: 'p', el: 'heading', runs: [] }] }] }] };
}

// ---------------------------------------------------------------- Final Draft (FDX)
const X = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FDX_TYPE = { heading: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', centered: 'General' };
export function toFdx(project, chapters) {
  const paras = [];
  for (const ch of chapters) for (const sc of ch.scenes) for (const b of sc.blocks) {
    const el = b.el || 'action';
    const up = ['heading', 'character', 'transition'].includes(el);
    const texts = (b.runs || []).map(r => { const st = [r.b && 'Bold', r.i && 'Italic'].filter(Boolean).join('+'); return `<Text${st ? ` Style="${st}"` : ''}>${X(up ? r.text.toUpperCase() : r.text)}</Text>`; }).join('') || '<Text></Text>';
    paras.push(`    <Paragraph Type="${FDX_TYPE[el]}"${el === 'centered' ? ' Alignment="Center"' : ''}>${texts}</Paragraph>`);
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paras.join('\n')}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center" Type="Title"><Text>${X(project.title.toUpperCase())}</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Title"><Text></Text></Paragraph>
      <Paragraph Alignment="Center" Type="Title"><Text>Written by</Text></Paragraph>
      <Paragraph Alignment="Center" Type="Title"><Text>${X(project.author || '')}</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>
`;
}

// ---------------------------------------------------------------- Screenplay PDF (Courier 12, standard margins)
export async function toScreenplayPdf(jsPDF, project, chapters, o = {}) {
  const doc = new jsPDF({ unit: 'pt', format: o.pageSize || 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const LH = 12, TOP = 72, BOTTOM = H - 72;
  const X0 = 108;
  const L = { heading: [X0, 61], action: [X0, 61], character: [266, 38], paren: [223, 25], dialogue: [180, 35], transition: [X0, 61], centered: [X0, 61] };
  let y = TOP, page = 1;
  const clean = t => t.replace(/[^\x09\x0a\x20-\x7e -ÿ–—‘’“”…]/g, '?');
  const wrap = (t, n) => { const out = []; for (const para of t.split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { if (!w) continue; if ((line + ' ' + w).trim().length > n) { if (line) out.push(line); line = w; } else line = (line + ' ' + w).trim(); } out.push(line); } return out; };
  doc.setFont('courier', 'normal'); doc.setFontSize(12);
  const newPage = () => { doc.addPage(); page++; y = TOP; doc.setFont('courier', 'normal'); doc.text(`${page}.`, W - 72, 48, { align: 'right' }); };
  // title page
  doc.text(clean(project.title.toUpperCase()), W / 2, H * 0.4, { align: 'center' });
  doc.text('Written by', W / 2, H * 0.4 + 36, { align: 'center' });
  doc.text(clean(project.author || ''), W / 2, H * 0.4 + 60, { align: 'center' });
  if (o.contact) clean(o.contact).split('\n').forEach((l, i) => doc.text(l, X0, H - 120 + i * LH));
  doc.addPage(); y = TOP; page = 1;
  const all = chapters.flatMap(c => c.scenes.flatMap(s => s.blocks));
  let prev = null;
  all.forEach((b, idx) => {
    const el = b.el || 'action';
    let t = clean((b.runs || []).map(r => r.text).join(''));
    if (['heading', 'character', 'transition'].includes(el)) t = t.toUpperCase();
    if (el === 'paren' && !/^\(/.test(t)) t = `(${t})`;
    const [x, n] = L[el];
    const lines = wrap(t, n);
    const gap = prev && !(['dialogue', 'paren'].includes(el) && ['character', 'paren', 'dialogue'].includes(prev)) ? (el === 'heading' ? 2 : 1) : 0;
    let need = gap + lines.length;
    if (el === 'character' || el === 'heading') { const nx = all[idx + 1]; if (nx) need += 2; }
    if (y + need * LH > BOTTOM) newPage(); else y += gap * LH;
    doc.setFont('courier', el === 'heading' && o.boldHeadings ? 'bold' : 'normal');
    for (const line of lines) {
      if (y > BOTTOM) newPage();
      if (el === 'transition') doc.text(line, W - 72, y, { align: 'right' });
      else if (el === 'centered') doc.text(line, W / 2 + 18, y, { align: 'center' });
      else doc.text(line, x, y);
      y += LH;
    }
    prev = el;
  });
  doc.setProperties({ title: project.title, author: project.author || '' });
  return doc.output('blob');
}

export const elementMenuItems = (run) => ELEMENTS.map(e => ({ k: e.id, icon: 'file', label: `${e.name}`, run: () => run(e.id) }));
void icon; void htmlToBlocks; void blocksToHtml;
