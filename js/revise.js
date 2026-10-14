// Inkfold — revision tools: margin notes, revision rounds, analysis, find & replace,
// version history with diff, read-aloud and the reference pane.
import { db, uid } from './db.js';
import { touch, buildTree } from './model.js';
import { htmlToBlocks, blocksToHtml, htmlToText, htmlWords } from './text.js';
import { $, $$, esc, num, el, icon, sheet, confirmSheet, toast, haptic, ago, debounce } from './ui.js';
import { entries, nameIndex, nameRegex, avatar } from './bible.js';

let ctx; // { state, settings, saveSettings, saveNow, reloadScene, openScene, saveItem, markChanged, isMd }
export function initRevise(c) { ctx = c; }

const HL = !!(window.CSS && CSS.highlights && window.Highlight);
const setHL = (name, ranges) => { if (!HL) return; if (ranges && ranges.length) CSS.highlights.set(name, new Highlight(...ranges)); else CSS.highlights.delete(name); };
export const ROUND_COLORS = { 2: '#4a7bc2', 3: '#3f9668', 4: '#9168c4', 5: '#c2513f', 6: '#b88a1e' };

// ---------------------------------------------------------------- text helpers
function blocksOf(editor) {
  return Array.from(editor.children).filter(b => b.tagName !== 'HR').flatMap(b => b.tagName === 'UL' || b.tagName === 'OL' || b.tagName === 'BLOCKQUOTE' ? Array.from(b.children) : [b])
    .map(elm => ({ el: elm, text: elm.textContent }));
}
export function rangeIn(root, start, end) {
  const r = document.createRange();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0, n, ok = false;
  while ((n = w.nextNode())) {
    const len = n.nodeValue.length;
    if (!ok && start < pos + len + (len === 0 ? 1 : 0)) { r.setStart(n, Math.max(0, start - pos)); ok = true; }
    if (ok && end <= pos + len) { r.setEnd(n, end - pos); return r; }
    pos += len;
  }
  if (ok) { r.setEndAfter(root.lastChild || root); return r; }
  return null;
}
function rangesFor(editor, re) {
  const out = [];
  for (const b of blocksOf(editor)) { re.lastIndex = 0; let m; while ((m = re.exec(b.text))) { if (!m[0].length) { re.lastIndex++; continue; } const r = rangeIn(b.el, m.index, m.index + m[0].length); if (r) out.push(r); } }
  return out;
}

// ---------------------------------------------------------------- side panel
let tab = 'notes', refId = null;
export function panelOpen() { return !document.getElementById('sidePanel')?.hidden; }
export function openPanel(t) {
  const p = $('#sidePanel'); if (!p) return;
  if (t) tab = t;
  p.hidden = false; document.body.classList.add('panel-open');
  document.body.classList.toggle('panel-wide', tab === 'reference');
  renderPanel();
}
export function closePanel() {
  const p = $('#sidePanel'); if (p) p.hidden = true;
  document.body.classList.remove('panel-open', 'panel-wide');
  clearAnalysis();
}
export function togglePanel(t) { if (panelOpen() && (!t || t === tab)) closePanel(); else openPanel(t); }
export function renderPanel() {
  const p = $('#sidePanel'); if (!p || p.hidden) return;
  p.innerHTML = `<div class="sp-head"><div class="seg sp-tabs">
      <button data-sp="notes" class="${tab === 'notes' ? 'on' : ''}">Notes</button>
      <button data-sp="revise" class="${tab === 'revise' ? 'on' : ''}">Revise</button>
      <button data-sp="reference" class="${tab === 'reference' ? 'on' : ''}">Reference</button></div>
      <button class="icon-btn" data-sp-close aria-label="Close panel">${icon('x')}</button></div>
    <div class="sp-body" id="spBody"></div>`;
  $$('[data-sp]', p).forEach(b => b.onclick = () => openPanel(b.dataset.sp));
  $('[data-sp-close]', p).onclick = closePanel;
  const body = $('#spBody', p);
  if (tab !== 'revise') clearAnalysis();
  if (tab === 'notes') renderNotes(body);
  else if (tab === 'revise') renderRevise(body);
  else renderReference(body);
}
export function onSceneChanged() { if (panelOpen()) renderPanel(); }
export const onEditorInput = debounce(() => { if (panelOpen() && tab === 'revise') { runAnalysis(); updateStatsBlock(); } }, 700);

// ---------------------------------------------------------------- margin notes (comments)
const commentsOf = sceneId => ctx.state.items.filter(i => i.type === 'comment' && !i.deleted && i.parentId === sceneId);

export async function addComment() {
  if (ctx.isMd()) return toast('Notes work in rich text projects. Switch the editor in Project details.');
  const ed = $('#editor'); const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode)) return toast('Select some text to attach a note to');
  const r = sel.getRangeAt(0);
  const blockOf = n => { while (n && n.parentNode !== ed) n = n.parentNode; return n; };
  if (blockOf(r.startContainer) !== blockOf(r.endContainer)) return toast('Select text within one paragraph');
  const id = uid('cm-');
  const quote = r.toString().trim().slice(0, 140);
  // wrap the selection directly (insertHTML would turn <mark> into a styled <span>)
  const mark = document.createElement('mark'); mark.className = 'cmt'; mark.dataset.c = id;
  mark.appendChild(r.extractContents()); r.insertNode(mark);
  sel.removeAllRanges(); const after = document.createRange(); after.setStartAfter(mark); after.collapse(true); sel.addRange(after);
  const it = touch({ id, projectId: ctx.state.project.id, type: 'comment', parentId: ctx.state.scene.id, order: 0, title: quote, content: '', deleted: false, data: { text: '', resolved: false, at: Date.now() } });
  ctx.state.items.push(it);
  ctx.markChanged(); haptic(6);
  openPanel('notes');
  const t = $(`[data-cmt="${id}"] textarea`); if (t) t.focus();
  await ctx.saveItem(it);
}

function renderNotes(body) {
  const sc = ctx.state.scene; if (!sc) return;
  const ed = $('#editor');
  const list = commentsOf(sc.id);
  const pos = c => { const m = ed.querySelector(`mark[data-c="${c.id}"]`); return m ? m : null; };
  const open = list.filter(c => !c.data.resolved), done = list.filter(c => c.data.resolved);
  open.sort((a, b) => { const A = pos(a), B = pos(b); if (!A || !B) return A ? -1 : B ? 1 : 0; return A.compareDocumentPosition(B) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
  body.innerHTML = `<div class="notes-head"><div><b>Margin notes</b><span>${open.length ? `${open.length} open in this scene` : 'Select text, then add a note'}</span></div><button class="btn btn-quiet btn-sm" data-addc>${icon('comment')}Add note</button></div>
    <div class="cmt-list">${open.map(c => cmtCard(c, !pos(c))).join('') || `<div class="sp-empty">${icon('comment')}<span>Notes stay pinned to the words you selected, like comments in a margin.</span></div>`}</div>
    ${done.length ? `<details class="cmt-done"><summary>Resolved (${done.length})</summary>${done.map(c => cmtCard(c, false, true)).join('')}</details>` : ''}`;
  $('[data-addc]', body).onmousedown = e => e.preventDefault();
  $('[data-addc]', body).onclick = addComment;
  $$('[data-cmt]', body).forEach(card => {
    const c = list.find(x => x.id === card.dataset.cmt);
    const ta = $('textarea', card);
    if (ta) { const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }; grow(); ta.oninput = debounce(() => { grow(); c.data.text = ta.value; ctx.saveItem(c); }, 350); ta.addEventListener('input', grow); }
    card.onclick = e => { if (e.target.closest('button, textarea')) return; flashMark(c.id); };
    $$('[data-act-c]', card).forEach(b => b.onclick = async () => {
      const a = b.dataset.actC;
      if (a === 'resolve' || a === 'delete') {
        const m = ed.querySelector(`mark[data-c="${c.id}"]`);
        if (m) { m.replaceWith(...m.childNodes); ctx.markChanged(); }
        if (a === 'resolve') c.data.resolved = true; else { c.deleted = true; c.deletedAt = Date.now(); c.deletedWith = sc.id; }
        await ctx.saveItem(c); renderNotes(body);
        if (a === 'resolve') toast('Note resolved');
      } else if (a === 'reopen') { c.data.resolved = false; await ctx.saveItem(c); renderNotes(body); }
    });
  });
}
const cmtCard = (c, orphan, resolved) => `<div class="ncard ${orphan ? 'orphan' : ''} ${resolved ? 'resolved' : ''}" data-cmt="${c.id}">
  <blockquote>${esc(c.title || '')}</blockquote>
  ${orphan ? '<span class="cmt-warn">The text this note was attached to has been deleted.</span>' : ''}
  ${resolved ? `<p>${esc(c.data.text || '')}</p>` : `<textarea rows="1" placeholder="Write a note…" maxlength="1200">${esc(c.data.text || '')}</textarea>`}
  <div class="cmt-foot"><span>${ago(c.data.at)}</span>${resolved ? `<button data-act-c="reopen">Reopen</button><button data-act-c="delete">Delete</button>` : `<button data-act-c="resolve">${icon('check')}Resolve</button><button data-act-c="delete">Delete</button>`}</div>
</div>`;
export function flashMark(id) {
  const m = $(`#editor mark[data-c="${id}"]`); if (!m) return;
  m.scrollIntoView({ block: 'center', behavior: 'smooth' });
  m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash');
}
export function focusNote(id) { openPanel('notes'); setTimeout(() => { const c = $(`[data-cmt="${id}"]`); if (c) { c.scrollIntoView({ block: 'nearest' }); c.classList.add('pulse'); setTimeout(() => c.classList.remove('pulse'), 900); } }, 30); }

// ---------------------------------------------------------------- revision rounds
export function revisionInsert(e, text) {
  // Called from beforeinput when a revision round is active. New text goes inside <ins data-r="N">.
  const round = ctx.settings.revRound; if (!round) return false;
  const sel = getSelection(); if (!sel.rangeCount) return false;
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  if (anchor && anchor.closest(`ins[data-r="${round}"]`)) {
    // already inside this round: let the browser type normally (keeps undo)
    if (e.defaultPrevented || text !== e.data) { e.preventDefault(); document.execCommand('insertText', false, text); }
    return true;
  }
  e.preventDefault();
  const r = sel.getRangeAt(0);
  if (!r.collapsed) r.deleteContents();
  const ins = document.createElement('ins'); ins.dataset.r = round;
  const t = document.createTextNode(text === ' ' ? '\u00a0' : text);
  ins.appendChild(t);
  r.insertNode(ins);
  const c = document.createRange(); c.setStart(t, t.length); c.collapse(true);
  sel.removeAllRanges(); sel.addRange(c);
  $('#editor').dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
  return true;
}
export function applyRevisionView() {
  const ed = $('#editor'); if (!ed) return;
  ed.classList.toggle('show-rev', ctx.settings.showRev !== false);
  const ind = $('#revIndicator');
  if (ind) { const r = ctx.settings.revRound; ind.hidden = !r; if (r) ind.innerHTML = `<i style="background:${ROUND_COLORS[r]}"></i>Round ${r}`; }
}

// ---------------------------------------------------------------- Revise tab
const STOP = new Set('the a an and or but if then so of to in on at by for with from as is was were be been are am it its it’s it\'s this that these those he she they them his her their there here i you we me my your our us not no yes do did does done had has have just than too very can could would should will shall may might must what when where who whom which while into onto over under out up down off about again all any each few more most other some such only own same both now ever never also back like one two said says say get got went go goes come came know knew think thought see saw look looked way well even still how why because through before after above below between toward towards upon around'.split(' '));
const ADV_SKIP = new Set('only family reply early likely holy ugly fly july daily friendly lovely lonely belly apply supply rely silly jelly bully hilly italy lily ally reply rally sally billy emily kelly molly holly dolly folly jolly melancholy anomaly assembly monopoly comply imply multiply butterfly dragonfly firefly bodily curly elderly costly deadly lively orderly smelly'.split(' '));
const PASSIVE = /\b(?:am|is|are|was|were|be|been|being|get|got|gets|getting)\s+(?:\w+ly\s+)?(?:\w+ed|\w+en|made|done|seen|known|given|taken|built|found|left|told|kept|held|brought|thought|caught|taught|sold|sent|spent|lost|paid|put|set|shut|hit|hurt|cut|felt|heard|meant|met|read|born|torn|worn|thrown|drawn|shown|grown)\b/gi;

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1);
}
function readability(text) {
  const sentences = text.split(/(?<=[.!?…])["”’)\]]*\s+|\n+/).map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s));
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const S = Math.max(1, sentences.length), W = Math.max(1, words.length);
  const ease = Math.round(206.835 - 1.015 * (W / S) - 84.6 * (syl / W));
  const grade = Math.max(0, Math.round((0.39 * (W / S) + 11.8 * (syl / W) - 15.59) * 10) / 10);
  return { sentences: sentences.length, words: words.length, ease: Math.max(0, Math.min(100, ease)), grade, avg: Math.round(W / S * 10) / 10, long: sentences.filter(s => (s.match(/\S+/g) || []).length > 35).length };
}
const easeLabel = e => e >= 80 ? 'Very easy to read' : e >= 65 ? 'Easy to read' : e >= 50 ? 'Fairly easy' : e >= 30 ? 'Challenging' : 'Dense';

function overused(text) {
  const counts = new Map();
  for (const w of (text.toLowerCase().match(/[\p{L}][\p{L}'’]+/gu) || [])) { if (w.length < 4 || STOP.has(w)) continue; counts.set(w, (counts.get(w) || 0) + 1); }
  return [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function nameCheck(text) {
  const known = new Set(), tokens = [];
  for (const e of entries()) for (const n of [e.title, ...((e.data && e.data.aliases) || [])]) for (const t of (n || '').split(/\s+/)) if (t.length >= 4) { known.add(t); tokens.push(t); }
  if (!tokens.length) return [];
  const found = new Map();
  for (const w of (text.match(/\b\p{Lu}[\p{L}'’]{3,}\b/gu) || [])) {
    if (known.has(w)) continue;
    for (const t of tokens) {
      if (w[0] !== t[0]) continue;
      const d = lev(w.toLowerCase(), t.toLowerCase());
      if (d > 0 && d <= (t.length >= 7 ? 2 : 1)) { const k = w + '→' + t; found.set(k, { word: w, name: t, n: (found.get(k)?.n || 0) + 1 }); break; }
    }
  }
  return [...found.values()];
}

const TOGGLES = [
  ['adverbs', 'Adverbs', 'Words ending in -ly', 'ink-adverb'],
  ['passive', 'Passive voice', '“was taken”, “is known”', 'ink-passive'],
  ['repeats', 'Repeated words', 'Same word used close together', 'ink-repeat'],
  ['long', 'Long sentences', 'Over 35 words', 'ink-long'],
  ['dialogue', 'Dialogue only', 'Dim everything outside quotes', 'ink-dialogue'],
];
const active = new Set();
let counts = {};

function renderRevise(body) {
  const r = ctx.settings.revRound || 0;
  body.innerHTML = `
    <section class="rv-sec"><div class="rv-h"><b>Revision rounds</b><span>New writing is coloured by round, so you can see what changed in each draft.</span></div>
      <div class="rounds">${[0, 2, 3, 4, 5, 6].map(n => `<button class="round ${r === n ? 'on' : ''}" data-round="${n}" style="--rc:${ROUND_COLORS[n] || 'var(--muted)'}">${n ? `<i></i>${n}` : 'Off'}</button>`).join('')}</div>
      <div class="toggle-row"><div class="t-text"><b>Show colours</b><span>Hide them to read cleanly</span></div><button class="switch" role="switch" aria-checked="${ctx.settings.showRev !== false}" data-showrev aria-label="Show colours"></button></div>
      <button class="btn btn-ghost btn-sm" data-accept>${icon('check')}Accept all changes in this scene</button>
    </section>
    <section class="rv-sec" id="rvStats"></section>
    <section class="rv-sec"><div class="rv-h"><b>Highlight</b></div>
      ${TOGGLES.map(([k, l, s, h]) => `<button class="hl-row ${active.has(k) ? 'on' : ''}" data-hl="${k}"><i class="hl-sw ${h}"></i><span class="t-text"><b>${l}</b><span>${s}</span></span><b class="hl-n tnum" data-n="${k}"></b></button>`).join('')}
      ${HL ? '' : '<p class="note" style="text-align:left">Your browser can’t draw highlights, but the counts still work.</p>'}
    </section>
    <section class="rv-sec" id="rvOver"></section>
    <section class="rv-sec" id="rvNames"></section>
    <section class="rv-sec"><button class="btn btn-quiet btn-sm" data-listen>${icon('speaker')}Read this scene aloud</button></section>`;
  $$('[data-round]', body).forEach(b => b.onclick = () => { ctx.settings.revRound = +b.dataset.round || 0; if (ctx.settings.revRound) ctx.settings.showRev = true; ctx.saveSettings(); applyRevisionView(); renderRevise(body); });
  $('[data-showrev]', body).onclick = e => { ctx.settings.showRev = ctx.settings.showRev === false; e.currentTarget.setAttribute('aria-checked', ctx.settings.showRev); ctx.saveSettings(); applyRevisionView(); };
  $('[data-accept]', body).onclick = () => { const ins = $$('#editor ins'); if (!ins.length) return toast('No coloured changes in this scene'); ins.forEach(i => i.replaceWith(...i.childNodes)); ctx.markChanged(); toast(`Accepted ${ins.length} change${ins.length === 1 ? '' : 's'}`); };
  $$('[data-hl]', body).forEach(b => b.onclick = () => { const k = b.dataset.hl; active.has(k) ? active.delete(k) : active.add(k); b.classList.toggle('on', active.has(k)); runAnalysis(); });
  $('[data-listen]', body).onclick = () => readAloud();
  updateStatsBlock(); runAnalysis();
}

function sceneText() { return ctx.isMd() ? $('#mdEditor').value : blocksOf($('#editor')).map(b => b.text).join('\n'); }

function updateStatsBlock() {
  const box = $('#rvStats'); if (!box) return;
  const text = sceneText();
  const rd = readability(text);
  box.innerHTML = `<div class="rv-h"><b>Readability</b></div>
    <div class="read-score"><div class="rs-dial" style="--p:${rd.ease}"><b class="tnum">${rd.words > 20 ? rd.ease : '—'}</b></div><div><b>${rd.words > 20 ? easeLabel(rd.ease) : 'Write a little more'}</b><span class="tnum">Grade ${rd.words > 20 ? rd.grade : '—'} · ${rd.avg} words per sentence</span></div></div>
    <div class="rv-grid tnum"><div><b>${num(rd.words)}</b><span>words</span></div><div><b>${num(rd.sentences)}</b><span>sentences</span></div><div><b>${rd.long}</b><span>long sentences</span></div></div>`;
  const over = overused(text);
  $('#rvOver').innerHTML = `<div class="rv-h"><b>Most used words</b><span>Tap one to find it in the scene.</span></div>${over.length ? `<div class="over">${over.map(([w, n]) => `<button data-word="${esc(w)}"><span>${esc(w)}</span><b class="tnum">${n}</b></button>`).join('')}</div>` : '<p class="note" style="text-align:left">Nothing repeats often yet.</p>'}`;
  $$('[data-word]', $('#rvOver')).forEach(b => b.onclick = () => { const on = b.classList.toggle('on'); $$('[data-word]', $('#rvOver')).forEach(x => x !== b && x.classList.remove('on')); highlightFind(on ? new RegExp(`(?<![\\p{L}])${b.dataset.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu') : null, true); });
  const names = nameCheck(text);
  $('#rvNames').innerHTML = `<div class="rv-h"><b>Name check</b><span>Spellings close to a name in your story bible.</span></div>${names.length ? names.map(n => `<div class="nc-row"><span><s>${esc(n.word)}</s> → <b>${esc(n.name)}</b> <small class="tnum">×${n.n}</small></span><button class="btn btn-ghost btn-sm" data-fix="${esc(n.word)}" data-to="${esc(n.name)}">Fix</button></div>`).join('') : `<p class="note" style="text-align:left">${entries().length ? 'All names look consistent.' : 'Add characters and places to the story bible to check names.'}</p>`}`;
  $$('[data-fix]', $('#rvNames')).forEach(b => b.onclick = async () => {
    const n = await replaceInScenes(new RegExp(`\\b${b.dataset.fix}\\b`, 'g'), b.dataset.to, [ctx.state.scene.id]);
    toast(`Fixed ${n} spelling${n === 1 ? '' : 's'}`); updateStatsBlock();
  });
}

export function runAnalysis() {
  const ed = $('#editor'); if (!ed || ctx.isMd()) return;
  counts = {};
  const blocks = blocksOf(ed);
  const R = { adverbs: [], passive: [], repeats: [], long: [], dialogue: [] };
  if (active.has('adverbs') || true) {
    for (const b of blocks) { const re = /(?<![\p{L}])[\p{L}]+ly(?![\p{L}])/giu; let m; while ((m = re.exec(b.text))) if (!ADV_SKIP.has(m[0].toLowerCase())) { const r = rangeIn(b.el, m.index, m.index + m[0].length); if (r) R.adverbs.push(r); } }
    for (const b of blocks) { PASSIVE.lastIndex = 0; let m; while ((m = PASSIVE.exec(b.text))) { const r = rangeIn(b.el, m.index, m.index + m[0].length); if (r) R.passive.push(r); } }
    // repeated words within ~40 words
    const recent = [];
    for (const b of blocks) { const re = /[\p{L}][\p{L}'’]+/gu; let m; while ((m = re.exec(b.text))) {
      const w = m[0].toLowerCase(); const item = { w, el: b.el, s: m.index, e: m.index + m[0].length };
      if (w.length >= 4 && !STOP.has(w)) { const prev = recent.find(x => x.w === w); if (prev) { [prev, item].forEach(x => { if (!x.done) { const r = rangeIn(x.el, x.s, x.e); if (r) R.repeats.push(r); x.done = true; } }); } }
      recent.push(item); if (recent.length > 40) recent.shift();
    } }
    for (const b of blocks) { const re = /[^.!?…]+[.!?…]*["”’)\]]*/g; let m; while ((m = re.exec(b.text))) { if ((m[0].match(/\S+/g) || []).length > 35) { const r = rangeIn(b.el, m.index, m.index + m[0].length); if (r) R.long.push(r); } } }
    for (const b of blocks) { const re = /[“"][^”"\n]*[”"]?/g; let m; while ((m = re.exec(b.text))) { const r = rangeIn(b.el, m.index, m.index + m[0].length); if (r) R.dialogue.push(r); } }
  }
  for (const [k, , , h] of TOGGLES) { counts[k] = R[k].length; setHL(h, active.has(k) ? R[k] : null); const n = $(`[data-n="${k}"]`); if (n) n.textContent = k === 'dialogue' ? '' : counts[k] || ''; }
  ed.classList.toggle('dlg-only', active.has('dialogue'));
}
function clearAnalysis() { for (const [, , , h] of TOGGLES) setHL(h, null); const ed = $('#editor'); if (ed) ed.classList.remove('dlg-only'); setHL('ink-find', null); }

// ---------------------------------------------------------------- find & highlight
export function highlightFind(re, scroll, nth = 0) {
  const ed = $('#editor'); if (!ed) return 0;
  if (!re) { setHL('ink-find', null); return 0; }
  const ranges = rangesFor(ed, re);
  setHL('ink-find', ranges);
  if (scroll && ranges[nth]) {
    const rect = ranges[nth].getBoundingClientRect(), sc = $('#scroller'), sr = sc.getBoundingClientRect();
    sc.scrollBy({ top: rect.top - sr.top - sc.clientHeight * 0.4, behavior: 'smooth' });
    if (!HL) { const s = getSelection(); s.removeAllRanges(); s.addRange(ranges[nth]); }
  }
  return ranges.length;
}

function buildRegex(q, o) {
  if (!q) return null;
  let src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (o.word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try { return new RegExp(src, 'gu' + (o.caseSens ? '' : 'i')); } catch { return 'bad'; }
}

export async function replaceInScenes(re, replacement, sceneIds) {
  await ctx.saveNow();
  let total = 0; const changed = [];
  for (const sc of ctx.state.items.filter(i => i.type === 'scene' && !i.deleted && (!sceneIds || sceneIds.includes(i.id)))) {
    const blocks = htmlToBlocks(sc.content); let n = 0;
    for (const b of blocks) for (const r of b.runs || []) { r.text = r.text.replace(new RegExp(re.source, re.flags), (...m) => { n++; return re.flags.includes('u') || true ? expand(replacement, m) : replacement; }); }
    if (n) { sc.content = blocksToHtml(blocks); sc.words = htmlWords(sc.content); touch(sc); await db.put('items', sc); changed.push(sc); total += n; }
  }
  if (changed.some(s => s.id === ctx.state.scene?.id)) ctx.reloadScene();
  return total;
}
function expand(rep, m) { const groups = m.slice(1, -2); return rep.replace(/\$(\d)/g, (_, d) => groups[+d - 1] ?? '').replace(/\$&/g, m[0]); }

export function findSheet(prefill = '') {
  const o = { caseSens: false, word: false, regex: false };
  const scenes = buildTree(ctx.state.items).flatMap((c, ci) => c.scenes.map((s, si) => ({ s, label: `${ci + 1}.${si + 1}`, ch: c.title })));
  const s = sheet({ title: 'Find & replace', wide: true, foot: null, sub: 'Search every scene in this project.', body: `
    <div class="fr-inputs">
      <div class="fr-field">${icon('search')}<input id="frFind" placeholder="Find" value="${esc(prefill)}" autocomplete="off" spellcheck="false" autofocus></div>
      <div class="fr-field">${icon('replace')}<input id="frRep" placeholder="Replace with" autocomplete="off" spellcheck="false"></div>
      <div class="fr-opts">
        <button class="fr-opt" data-o="caseSens" title="Match case">Aa</button>
        <button class="fr-opt" data-o="word" title="Whole words">ab|</button>
        <button class="fr-opt" data-o="regex" title="Regular expression">.*</button>
        <span style="flex:1"></span>
        <button class="btn btn-primary btn-sm" id="frAll" disabled>Replace all</button>
      </div>
    </div>
    <div class="fr-summary" id="frSum"></div>
    <div class="fr-results" id="frRes"></div>` });
  const find = $('#frFind', s.wrap), rep = $('#frRep', s.wrap);
  const run = () => {
    const re = buildRegex(find.value, o);
    const res = $('#frRes', s.wrap), sum = $('#frSum', s.wrap), all = $('#frAll', s.wrap);
    if (re === 'bad') { sum.textContent = 'That regular expression isn’t valid.'; res.innerHTML = ''; all.disabled = true; return; }
    if (!re) { sum.textContent = ''; res.innerHTML = ''; all.disabled = true; return; }
    let total = 0, html = '', shown = 0;
    for (const { s: sc, label, ch } of scenes) {
      const hits = [];
      htmlToBlocks(sc.content).forEach(b => { const text = (b.runs || []).map(r => r.text).join(''); const r2 = new RegExp(re.source, re.flags); let m; while ((m = r2.exec(text))) { if (!m[0].length) { r2.lastIndex++; continue; } hits.push({ text, i: m.index, len: m[0].length }); } });
      if (!hits.length) continue;
      total += hits.length;
      if (shown > 300) continue;
      html += `<div class="fr-scene"><div class="fr-sh"><b>${esc(sc.title)}</b><span>${esc(label)} · ${esc(ch)} · ${hits.length}</span></div>${hits.slice(0, 40).map((h, k) => { shown++; const a = Math.max(0, h.i - 50), z = Math.min(h.text.length, h.i + h.len + 60); return `<button class="fr-hit" data-scene="${sc.id}" data-k="${k}">${a > 0 ? '…' : ''}${esc(h.text.slice(a, h.i))}<mark>${esc(h.text.slice(h.i, h.i + h.len))}</mark>${esc(h.text.slice(h.i + h.len, z))}${z < h.text.length ? '…' : ''}</button>`; }).join('')}${hits.length > 40 ? `<span class="note">and ${hits.length - 40} more</span>` : ''}</div>`;
    }
    sum.innerHTML = total ? `<b class="tnum">${num(total)}</b> match${total === 1 ? '' : 'es'}` : 'No matches';
    res.innerHTML = html;
    all.disabled = !total;
    $$('.fr-hit', res).forEach(b => b.onclick = async () => { s.close(); await ctx.openScene(b.dataset.scene); setTimeout(() => highlightFind(new RegExp(re.source, re.flags), true, +b.dataset.k), 60); });
  };
  find.oninput = debounce(run, 160);
  $$('.fr-opt', s.wrap).forEach(b => b.onclick = () => { o[b.dataset.o] = !o[b.dataset.o]; b.classList.toggle('on', o[b.dataset.o]); run(); });
  $('#frAll', s.wrap).onclick = async () => {
    const re = buildRegex(find.value, o); if (!re || re === 'bad') return;
    if (!(await confirmSheet({ title: 'Replace everywhere?', sub: `Every match in this project becomes “${esc(rep.value)}”. A snapshot is saved first, so you can undo this from Settings.`, confirm: 'Replace all' }))) return;
    await db.snapshot('Before replace all');
    const n = await replaceInScenes(re, rep.value);
    toast(`Replaced ${num(n)} match${n === 1 ? '' : 'es'}`); run();
    ctx.onChange && ctx.onChange({ skipView: false });
  };
  run();
}

// ---------------------------------------------------------------- version history
export async function saveVersion(sc, label, auto = false) {
  if (!sc || !sc.content) return;
  const vs = await db.versionsOf(sc.id);
  const last = vs.sort((a, b) => b.at - a.at)[0];
  if (last && last.content === sc.content) return;
  await db.put('versions', { id: uid('v-'), sceneId: sc.id, projectId: sc.projectId, at: Date.now(), title: sc.title, content: sc.content, words: sc.words || htmlWords(sc.content), label, auto });
  const all = (await db.versionsOf(sc.id)).sort((a, b) => b.at - a.at);
  const extra = all.length - 60;
  if (extra > 0) for (const v of all.filter(v => v.auto).slice(-extra)) await db.del('versions', v.id);
}

export async function historySheet() {
  await ctx.saveNow();
  const sc = ctx.state.scene;
  let vs = (await db.versionsOf(sc.id)).sort((a, b) => b.at - a.at);
  let sel = vs[0]?.id;
  const s = sheet({ title: 'Version history', wide: 'x', foot: null, sub: `“${esc(sc.title)}”. Inkfold saves a version automatically before each editing session.`, body: `
    <div class="vh">
      <aside class="vh-side">
        <div class="vh-save"><input class="input" id="vhLabel" placeholder="Name this version" maxlength="60"><button class="btn btn-primary btn-sm" id="vhSave">Save</button></div>
        <div class="vh-list" id="vhList"></div>
      </aside>
      <section class="vh-main" id="vhMain"></section>
    </div>` });
  const list = $('#vhList', s.wrap), main = $('#vhMain', s.wrap);
  const draw = () => {
    list.innerHTML = vs.length ? vs.map((v, i) => { const prev = vs[i + 1]; const d = prev ? v.words - prev.words : null; return `<button class="vh-item ${v.id === sel ? 'on' : ''}" data-v="${v.id}"><b>${esc(v.label || (v.auto ? 'Before editing' : 'Saved version'))}</b><span class="tnum">${new Date(v.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${num(v.words)} words${d ? ` <i class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${num(d)}</i>` : ''}</span></button>`; }).join('') : `<div class="sp-empty">${icon('history')}<span>No versions yet. They’re saved automatically each time you start editing this scene, or name one above.</span></div>`;
    $$('[data-v]', list).forEach(b => b.onclick = () => { sel = b.dataset.v; draw(); });
    const v = vs.find(x => x.id === sel);
    if (!v) { main.innerHTML = '<div class="sp-empty"><span>Pick a version to compare it with the scene as it is now.</span></div>'; return; }
    const d = diffHtml(v.content, sc.content);
    main.innerHTML = `<div class="vh-bar"><div class="vh-legend"><span class="del">Removed</span><span class="add">Added</span><span class="tnum">${d.stats}</span></div><div style="display:flex;gap:8px"><button class="btn btn-ghost btn-sm" data-delv>Delete</button><button class="btn btn-primary btn-sm" data-restore>${icon('restore')}Restore this version</button></div></div>
      <div class="diff"><div class="diff-col"><div class="diff-h">${esc(v.label || 'Version')} · ${ago(v.at)}</div><div class="diff-body">${d.left}</div></div><div class="diff-col"><div class="diff-h">Now</div><div class="diff-body">${d.right}</div></div></div>`;
    $('[data-restore]', main).onclick = async () => {
      await saveVersion(sc, 'Before restoring');
      sc.content = v.content; sc.words = htmlWords(v.content); touch(sc); await db.put('items', sc);
      ctx.reloadScene(); s.close(); toast('Version restored. The previous text was saved as a version.');
    };
    $('[data-delv]', main).onclick = async () => { await db.del('versions', v.id); vs = vs.filter(x => x.id !== v.id); sel = vs[0]?.id; draw(); };
  };
  $('#vhSave', s.wrap).onclick = async () => {
    const before = vs.length;
    const label = $('#vhLabel', s.wrap).value.trim() || 'Saved version';
    const last = vs[0];
    if (last && last.content === sc.content) { last.label = label; last.auto = false; await db.put('versions', last); }
    else await saveVersion(sc, label, false);
    vs = (await db.versionsOf(sc.id)).sort((a, b) => b.at - a.at); sel = vs[0]?.id; $('#vhLabel', s.wrap).value = ''; draw();
    toast(vs.length > before ? 'Version saved' : 'Version named');
  };
  draw();
}

// Paragraph-level diff, then word-level inside changed paragraphs
function lcs(a, b, eq = (x, y) => x === y) {
  const n = a.length, m = b.length;
  if (n * m > 4e6) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) { if (eq(a[i], b[j])) { ops.push(['=', i++, j++]); } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', i++, null]); else ops.push(['+', null, j++]); }
  while (i < n) ops.push(['-', i++, null]); while (j < m) ops.push(['+', null, j++]);
  return ops;
}
function diffHtml(oldHtml, newHtml) {
  const para = h => htmlToBlocks(h).map(b => b.type === 'hr' ? '* * *' : (b.runs || []).map(r => r.text).join(''));
  const A = para(oldHtml), B = para(newHtml);
  const ops = lcs(A, B) || [...A.map((_, i) => ['-', i, null]), ...B.map((_, j) => ['+', null, j])];
  let left = '', right = '', added = 0, removed = 0;
  // pair consecutive removals/additions so edits inside a paragraph show word by word
  for (let k = 0; k < ops.length; k++) {
    const [op, i, j] = ops[k];
    if (op === '=') { left += `<p>${esc(A[i])}</p>`; right += `<p>${esc(B[j])}</p>`; continue; }
    const dels = [], adds = [];
    while (k < ops.length && ops[k][0] !== '=') { if (ops[k][0] === '-') dels.push(ops[k][1]); else adds.push(ops[k][2]); k++; }
    k--;
    const pairs = Math.min(dels.length, adds.length);
    for (let p = 0; p < Math.max(dels.length, adds.length); p++) {
      if (p < pairs) { const w = wordDiff(A[dels[p]], B[adds[p]]); left += `<p class="chg">${w.l}</p>`; right += `<p class="chg">${w.r}</p>`; added += w.add; removed += w.del; }
      else if (p < dels.length) { left += `<p class="gone"><del>${esc(A[dels[p]])}</del></p>`; right += '<p class="ph"></p>'; removed += (A[dels[p]].match(/\S+/g) || []).length; }
      else { left += '<p class="ph"></p>'; right += `<p class="new"><ins>${esc(B[adds[p]])}</ins></p>`; added += (B[adds[p]].match(/\S+/g) || []).length; }
    }
  }
  return { left: left || '<p class="ph">Empty</p>', right: right || '<p class="ph">Empty</p>', stats: added || removed ? `+${num(added)} −${num(removed)} words` : 'No differences' };
}
function wordDiff(a, b) {
  const ta = a.match(/\s+|[^\s]+/g) || [], tb = b.match(/\s+|[^\s]+/g) || [];
  const ops = lcs(ta, tb);
  if (!ops) return { l: `<del>${esc(a)}</del>`, r: `<ins>${esc(b)}</ins>`, add: (b.match(/\S+/g) || []).length, del: (a.match(/\S+/g) || []).length };
  let l = '', r = '', add = 0, del = 0;
  for (const [op, i, j] of ops) {
    if (op === '=') { l += esc(ta[i]); r += esc(tb[j]); }
    else if (op === '-') { l += /\S/.test(ta[i]) ? `<del>${esc(ta[i])}</del>` : esc(ta[i]); if (/\S/.test(ta[i])) del++; }
    else { r += /\S/.test(tb[j]) ? `<ins>${esc(tb[j])}</ins>` : esc(tb[j]); if (/\S/.test(tb[j])) add++; }
  }
  return { l: l.replace(/<\/del>(\s*)<del>/g, '$1'), r: r.replace(/<\/ins>(\s*)<ins>/g, '$1'), add, del };
}

// ---------------------------------------------------------------- reference pane (split view)
function renderReference(body) {
  const tree = buildTree(ctx.state.items);
  const opts = [
    ...tree.flatMap((c, ci) => c.scenes.filter(s => s.id !== ctx.state.scene?.id).map((s, si) => ({ id: s.id, label: `${ci + 1}.${si + 1}  ${s.title}`, group: 'Scenes' }))),
    ...entries().map(e => ({ id: e.id, label: e.title || 'Unnamed', group: e.type === 'character' ? 'Characters' : e.type === 'place' ? 'Places' : 'Lore' })),
  ];
  if (!refId || !opts.some(o => o.id === refId)) refId = opts[0]?.id || null;
  const groups = [...new Set(opts.map(o => o.group))];
  body.innerHTML = `<select class="input ref-pick" id="refPick">${groups.map(g => `<optgroup label="${g}">${opts.filter(o => o.group === g).map(o => `<option value="${o.id}" ${o.id === refId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</optgroup>`).join('')}</select><div class="ref-body" id="refBody"></div>`;
  $('#refPick', body).onchange = e => { refId = e.target.value; renderReference(body); };
  const it = ctx.state.items.find(i => i.id === refId), rb = $('#refBody', body);
  if (!it) { rb.innerHTML = '<div class="sp-empty"><span>Nothing to show yet.</span></div>'; return; }
  if (it.type === 'scene') rb.innerHTML = `<h3 class="ref-title">${esc(it.title)}</h3><div class="ref-text">${it.content || '<p class="note">This scene is empty.</p>'}</div><button class="btn btn-ghost btn-sm" data-ref-open>${icon('pen')}Open this scene</button>`;
  else {
    const d = it.data || {};
    const row = (l, v) => v ? `<div class="ref-row"><span>${l}</span><p>${esc(v)}</p></div>` : '';
    rb.innerHTML = `<div class="ref-entry">${avatar(it, 64)}<div><h3 class="ref-title">${esc(it.title || 'Unnamed')}</h3><span class="note">${esc([d.role, d.age, d.occupation, d.kind, d.region, d.category].filter(Boolean).join(' · '))}</span></div></div>
      ${(d.traits || []).length ? `<div class="hc-traits">${d.traits.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${row('Wants', d.want)}${row('Needs', d.need)}${d.arcStart || d.arcEnd ? row('Arc', `${d.arcStart || '…'} → ${d.arcEnd || '…'}`) : ''}${row('Notes', (d.notes || '').replace(/\[\[|\]\]/g, ''))}`;
  }
  const ob = $('[data-ref-open]', rb); if (ob) ob.onclick = () => ctx.openScene(it.id);
}

// ---------------------------------------------------------------- read aloud
let speech = null;
export function readAloud() {
  if (!('speechSynthesis' in window)) return toast('Read-aloud isn’t available in this browser');
  stopSpeech();
  const ed = $('#editor');
  const sentences = [];
  for (const b of blocksOf(ed)) { const re = /[^.!?…]+[.!?…]*["”’)\]]*\s*/g; let m; while ((m = re.exec(b.text))) if (/\p{L}/u.test(m[0])) sentences.push({ el: b.el, s: m.index, e: m.index + m[0].trimEnd().length, text: m[0].trim() }); }
  if (!sentences.length) return toast('This scene has nothing to read yet');
  // start from the paragraph with the caret, if any
  const sel = getSelection(); let start = 0;
  if (sel.rangeCount && ed.contains(sel.anchorNode)) { const k = sentences.findIndex(x => x.el.contains(sel.anchorNode)); if (k > 0) start = k; }
  speech = { sentences, i: start, playing: true, rate: ctx.settings.speechRate || 1, voice: ctx.settings.speechVoice || '' };
  const bar = el(`<div class="speech-bar" id="speechBar" role="region" aria-label="Read aloud">
    <button class="icon-btn" data-sp-play aria-label="Pause">${icon('pause')}</button>
    <div class="sb-meta"><b>Reading aloud</b><span class="tnum" id="sbPos"></span></div>
    <select id="sbRate" aria-label="Speed">${[0.8, 0.9, 1, 1.15, 1.3, 1.5].map(r => `<option value="${r}" ${r === speech.rate ? 'selected' : ''}>${r}×</option>`).join('')}</select>
    <select id="sbVoice" aria-label="Voice"></select>
    <button class="icon-btn" data-sp-stop aria-label="Stop">${icon('x')}</button></div>`);
  document.body.appendChild(bar);
  const fillVoices = () => {
    const vs = speechSynthesis.getVoices(); const lang = (document.documentElement.lang || 'en').slice(0, 2);
    const list = vs.filter(v => v.lang.startsWith(lang)).concat(vs.filter(v => !v.lang.startsWith(lang)));
    $('#sbVoice').innerHTML = list.slice(0, 40).map(v => `<option value="${esc(v.name)}" ${v.name === speech?.voice ? 'selected' : ''}>${esc(v.name.replace(/Microsoft |Google /, ''))}</option>`).join('');
  };
  fillVoices(); speechSynthesis.onvoiceschanged = fillVoices;
  $('#sbRate').onchange = e => { speech.rate = +e.target.value; ctx.settings.speechRate = speech.rate; ctx.saveSettings(); restart(); };
  $('#sbVoice').onchange = e => { speech.voice = e.target.value; ctx.settings.speechVoice = speech.voice; ctx.saveSettings(); restart(); };
  $('[data-sp-play]', bar).onclick = () => { if (speech.playing) { speech.playing = false; speechSynthesis.cancel(); setPlayIcon(); } else { speech.playing = true; setPlayIcon(); speak(); } };
  $('[data-sp-stop]', bar).onclick = stopSpeech;
  speak();
}
function setPlayIcon() { const b = $('[data-sp-play]'); if (b && speech) { b.innerHTML = icon(speech.playing ? 'pause' : 'play'); b.setAttribute('aria-label', speech.playing ? 'Pause' : 'Play'); } }
function restart() { if (!speech) return; speechSynthesis.cancel(); if (speech.playing) setTimeout(speak, 60); }
function speak() {
  if (!speech || !speech.playing) return;
  const x = speech.sentences[speech.i];
  if (!x) { stopSpeech(); toast('Finished reading'); return; }
  const u = new SpeechSynthesisUtterance(x.text);
  u.rate = speech.rate;
  const v = speechSynthesis.getVoices().find(v => v.name === speech.voice); if (v) u.voice = v;
  const r = rangeIn(x.el, x.s, x.e);
  if (r) { setHL('ink-speak', [r]); const rect = r.getBoundingClientRect(), sc = $('#scroller'); if (sc) { const sr = sc.getBoundingClientRect(); if (rect.top < sr.top + 60 || rect.bottom > sr.bottom - 80) sc.scrollBy({ top: rect.top - sr.top - sc.clientHeight * 0.38, behavior: 'smooth' }); } }
  const pos = $('#sbPos'); if (pos) pos.textContent = `Sentence ${speech.i + 1} of ${speech.sentences.length}`;
  const token = speech;
  u.onend = () => { if (speech !== token || !speech.playing) return; speech.i++; speak(); };
  speechSynthesis.speak(u);
}
export function stopSpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  speech = null; setHL('ink-speak', null);
  const b = $('#speechBar'); if (b) b.remove();
}
