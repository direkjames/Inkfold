// Inkfold — reader preview: read the project the way a reader would, as a book with turning pages.
// Two pages side by side on wide screens, one page on phones. Pages are laid out with CSS columns,
// one chapter at a time, so only the pages on screen are ever drawn.
import { buildTree, COVERS } from './model.js';
import { htmlToBlocks, blocksToHtml, htmlWords } from './text.js';
import { hydrateImages } from './images.js';
import { $, $$, esc, num, el, icon, haptic } from './ui.js';
import { modeOf, T } from './modes.js';

let ctx; // { state, settings, saveSettings, saveNow }
export function initReader(c) { ctx = c; }

const FONTS = {
  literata: { name: 'Literata', css: "'Literata', Georgia, serif" },
  newsreader: { name: 'Newsreader', css: "'Newsreader', Georgia, serif" },
  source: { name: 'Source Serif', css: "'Source Serif 4', Georgia, serif" },
};
const THEMES = { paper: 'Paper', sepia: 'Sepia', night: 'Night' };
const SIZES = [14, 15, 16, 17, 18, 19, 20, 22, 24];
const GAP = 60; // gap between columns; never seen, each page clips to one column
const WPM = 230;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const words = n => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);

// ---------------------------------------------------------------- the book's content
// Scene HTML without margin notes or revision colours: readers only see the words.
function readerHtml(html) {
  const blocks = htmlToBlocks(html || '');
  for (const b of blocks) for (const r of b.runs || []) { r.c = null; r.r = null; }
  return blocksToHtml(blocks).replace(/<hr>/g, '<p class="rd-sep" aria-hidden="true">⁂</p>');
}
const paras = text => (text || '').split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean).map(s => `<p>${esc(s)}</p>`).join('');

function buildSections(p, items) {
  const mode = modeOf(p), term = T(p);
  const out = [{ id: 'cover', kind: 'cover', label: 'Cover' }, { id: 'title', kind: 'title', label: 'Title page' }];
  if ((p.summary || '').trim()) out.push({ id: 'blurb', kind: 'flow', label: 'About this book', cls: 'rd-front', html: `<div class="rd-blurb"><p class="rd-kicker">About this book</p><div class="rd-blurb-text">${paras(p.summary)}</div></div>` });
  const chapters = [];
  buildTree(items).forEach(c => {
    const scenes = c.scenes.filter(s => htmlWords(s.content || '') > 0 || /data-img/.test(s.content || ''));
    if (!scenes.length) return;
    const n = chapters.length + 1;
    const kicker = mode === 'novel' && c.id !== '__loose' && !/^(chapter|part|prologue|epilogue|book)\b/i.test(c.title || '') ? `${term.chapter} ${words(n)}` : '';
    const showSceneTitles = mode === 'poetry' || mode === 'journal';
    const body = scenes.map((s, i) => (i && !showSceneTitles ? '<p class="rd-sep" aria-hidden="true">⁂</p>' : '') + (showSceneTitles ? `<h3 class="rd-scene-title">${esc(s.title || '')}</h3>` : '') + readerHtml(s.content)).join('');
    chapters.push({
      id: c.id, kind: 'flow', chapter: true, label: c.title || `${term.chapter} ${n}`, cls: mode === 'poetry' ? 'rd-poem' : mode === 'journal' ? 'rd-journal' : '',
      words: scenes.reduce((w, s) => w + (s.words || htmlWords(s.content || '')), 0),
      html: `<header class="rd-ch">${kicker ? `<p class="rd-kicker">${esc(kicker)}</p>` : ''}<h2 class="rd-ch-title">${esc(c.title || '')}</h2></header>${body}`,
    });
  });
  if (chapters.length > 1) out.push({ id: 'toc', kind: 'flow', label: 'Contents', cls: 'rd-front', toc: true, html: '' });
  if (!chapters.length) out.push({ id: 'empty', kind: 'flow', label: 'Empty', cls: 'rd-front', html: `<div class="rd-blurb"><p class="rd-kicker">Nothing to read yet</p><div class="rd-blurb-text"><p>Write a scene and it will appear here as a page of your book.</p></div></div>` });
  return out.concat(chapters);
}
const tocHtml = (sections, firstPage) => `<div class="rd-toc"><p class="rd-kicker">Contents</p><ol>${sections.filter(s => s.chapter).map(s => `<li data-goto="${esc(s.id)}"><span>${esc(s.label)}</span><i></i><b class="tnum">${firstPage ? firstPage(s) : '00'}</b></li>`).join('')}</ol></div>`;

// ---------------------------------------------------------------- the reader
let R = null; // the open reader

export async function openReader() {
  if (R || !ctx.state.project) return;
  await ctx.saveNow();
  const p = ctx.state.project;
  const pref = ctx.settings.reader || {};
  const appTheme = document.documentElement.dataset.theme || 'light';
  R = {
    p, items: ctx.state.items,
    theme: THEMES[pref.theme] ? pref.theme : appTheme === 'sepia' ? 'sepia' : appTheme === 'light' ? 'paper' : 'night',
    size: SIZES.includes(pref.size) ? pref.size : 18,
    font: FONTS[pref.font] ? pref.font : 'literata',
    sections: buildSections(p, ctx.state.items),
    pages: [], view: 0, busy: false, dims: new Map(), listeners: [],
  };
  const c = COVERS[(p.cover || 0) % COVERS.length] || COVERS[0];
  const root = el(`<div class="rd" role="dialog" aria-modal="true" aria-label="Reader preview of ${esc(p.title)}">
    <div class="rd-top">
      <button class="rd-btn" data-rd="close" aria-label="Close preview">${icon('x')}</button>
      <div class="rd-where"><b>${esc(p.title)}</b><span id="rdChapter"></span></div>
      <button class="rd-btn" data-rd="toc" aria-label="Contents">${icon('list')}</button>
      <button class="rd-btn rd-aa" data-rd="type" aria-label="Text settings">Aa</button>
    </div>
    <div class="rd-stage" id="rdStage"><div class="rd-book" id="rdBook"></div></div>
    <div class="rd-bottom">
      <input type="range" class="rd-range" id="rdRange" min="0" max="0" value="0" aria-label="Page">
      <div class="rd-meta tnum"><span id="rdPage"></span><span id="rdLeft"></span></div>
    </div>
    <div class="rd-measure" aria-hidden="true"></div>
  </div>`);
  root.style.setProperty('--cv-bg', c.bg); root.style.setProperty('--cv-fg', c.fg); root.style.setProperty('--cv-line', c.line);
  R.root = root;
  document.body.appendChild(root);
  document.body.classList.add('reading');
  applyLook();
  await Promise.all([preloadImages(), fontsReady()]);
  if (!R) return;
  layout();
  const saved = loadSpot();
  goToPage(saved != null ? saved : 0, false);
  bind();
  requestAnimationFrame(() => root.classList.add('in'));
}

export function closeReader() {
  if (!R) return;
  saveSpot();
  R.listeners.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o));
  const root = R.root; R = null;
  document.body.classList.remove('reading');
  root.classList.remove('in'); root.classList.add('out');
  setTimeout(() => root.remove(), reduced() ? 0 : 260);
}
const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); R.listeners.push([t, ev, fn, o]); };

function applyLook() {
  const r = R.root;
  r.dataset.rtheme = R.theme;
  r.style.setProperty('--rd-font', FONTS[R.font].css);
  r.style.setProperty('--rd-size', R.size + 'px');
}
function savePrefs() {
  ctx.settings.reader = { theme: R.theme, size: R.size, font: R.font };
  ctx.saveSettings();
}

// Pages are measured with the real typeface: measuring with a fallback font would lose the last lines
// of a chapter once the real one arrives. Never wait more than a couple of seconds (offline, no font).
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const fam = FONTS[R.font].css.split(',')[0];
  const want = [`400 18px ${fam}`, `italic 400 18px ${fam}`, `600 18px ${fam}`, `400 30px 'Instrument Serif'`, `600 12px 'Hanken Grotesk'`];
  return Promise.race([Promise.all(want.map(f => document.fonts.load(f).catch(() => {}))), new Promise(r => setTimeout(r, 2500))]);
}

// Picture sizes, so pages can be laid out before the pictures finish loading
async function preloadImages() {
  const ids = new Set();
  for (const s of R.sections) if (s.html) for (const m of s.html.matchAll(/data-img="([\w-]+)"/g)) ids.add(m[1]);
  const byId = new Map(R.items.filter(i => i.type === 'image').map(i => [i.id, i]));
  await Promise.all([...ids].map(id => new Promise(res => {
    const src = byId.get(id)?.data?.src; if (!src) return res();
    const im = new Image(); im.onload = () => { R && R.dims.set(id, [im.naturalWidth, im.naturalHeight]); res(); }; im.onerror = res; im.src = src;
  })));
}
function hydrate(node) {
  hydrateImages(node, R.items);
  node.querySelectorAll('figure[data-img] img').forEach(img => { const d = R.dims.get(img.closest('figure').dataset.img); if (d) { img.width = d[0]; img.height = d[1]; } });
}

// ---------------------------------------------------------------- layout and pagination
function geometry() {
  const W = innerWidth, H = innerHeight;
  const spread = W >= 900 && W > H * 1.15;
  const phone = W < 600;
  const chromeH = phone ? 128 : 148;
  let ph, pw;
  if (spread) {
    ph = Math.min(H - chromeH, 1000); pw = Math.round(ph * 0.67);
    const maxW = Math.floor((W - 80) / 2);
    if (pw > maxW) { pw = maxW; ph = Math.min(ph, Math.round(pw / 0.6)); }
  } else {
    pw = phone ? W - 20 : Math.min(W - 64, 640); ph = Math.min(H - chromeH, phone ? 2000 : Math.round(pw * 1.55));
  }
  const padX = Math.round(clamp(pw * 0.1, 22, 60)), padT = Math.round(clamp(ph * 0.075, 34, 70)), padB = Math.round(clamp(ph * 0.08, 38, 72));
  return { spread, pw, ph, padX, padT, padB, cw: pw - padX * 2, ch: ph - padT - padB };
}

function layout() {
  const g = R.g = geometry();
  const book = $('#rdBook', R.root);
  book.classList.toggle('spread', g.spread);
  Object.assign(book.style, { width: (g.spread ? g.pw * 2 : g.pw) + 'px', height: g.ph + 'px' });
  R.root.style.setProperty('--pw', g.pw + 'px'); R.root.style.setProperty('--ph', g.ph + 'px');
  R.root.style.setProperty('--padx', g.padX + 'px'); R.root.style.setProperty('--padt', g.padT + 'px'); R.root.style.setProperty('--padb', g.padB + 'px');
  R.root.style.setProperty('--cw', g.cw + 'px'); R.root.style.setProperty('--ch', g.ch + 'px');
  const meas = $('.rd-measure', R.root);
  const count = s => {
    meas.innerHTML = `<div class="rd-flow ${s.cls || ''}">${s.html}</div>`;
    hydrate(meas);
    return Math.max(1, Math.round((meas.scrollWidth + GAP) / (g.cw + GAP)));
  };
  const toc = R.sections.find(s => s.toc);
  if (toc) toc.html = tocHtml(R.sections);
  const paginate = () => {
    R.pages = []; let folio = 0;
    for (const s of R.sections) {
      s.start = R.pages.length;
      s.count = s.kind === 'flow' ? count(s) : 1;
      for (let k = 0; k < s.count; k++) R.pages.push({ s, k, folio: s.chapter ? ++folio : 0 });
    }
  };
  paginate();
  // the contents page lists page numbers, which are only known now
  if (toc) { const before = toc.count; toc.html = tocHtml(R.sections, s => R.pages[s.start].folio); if (count(toc) !== before) paginate(); toc.html = tocHtml(R.sections, s => R.pages[s.start].folio); }
  meas.innerHTML = '';
  const range = $('#rdRange', R.root); range.max = Math.max(0, R.pages.length - 1); range.step = 1;
}

// Spreads: the cover sits alone on the right, then pages 1–2, 3–4…
const viewsCount = () => R.g.spread ? Math.floor(R.pages.length / 2) + 1 : R.pages.length;
const viewOf = i => R.g.spread ? Math.floor((i + 1) / 2) : i;
const pagesIn = v => R.g.spread ? [v * 2 - 1, v * 2] : [v];
const firstPageOf = v => pagesIn(v).find(i => i >= 0 && i < R.pages.length) ?? 0;

function pageNode(i, side) {
  const pg = R.pages[i];
  if (!pg) return el(`<div class="rd-page blank ${side || ''}"></div>`);
  const p = R.p, s = pg.s;
  if (s.kind === 'cover') {
    return el(p.coverImage
      ? `<div class="rd-page rd-cover has-img ${side || ''}"><div class="rd-cover-img" style="background-image:url('${p.coverImage}')"></div></div>`
      : `<div class="rd-page rd-cover ${side || ''}"><div class="rd-cover-frame"></div><div class="rd-cover-in"><span class="rd-cover-kicker">${esc(T(p).name)}</span><div><h1>${esc(p.title)}</h1>${p.subtitle && !p.sample ? `<p class="rd-cover-sub">${esc(p.subtitle)}</p>` : ''}</div><span class="rd-cover-author">${esc(p.author || '')}</span></div></div>`);
  }
  if (s.kind === 'title') {
    return el(`<div class="rd-page rd-titlepage ${side || ''}"><div><h1>${esc(p.title)}</h1>${p.subtitle && !p.sample ? `<p class="rd-tp-sub">${esc(p.subtitle)}</p>` : ''}<span class="rd-orn" aria-hidden="true">❦</span>${p.author ? `<p class="rd-tp-author">${esc(p.author)}</p>` : ''}</div></div>`);
  }
  const run = s.chapter && pg.k > 0 ? (side === 'left' ? esc(p.title) : esc(s.label)) : '';
  const node = el(`<div class="rd-page ${side || ''}"><div class="rd-run">${run}</div><div class="rd-body"><div class="rd-flow ${s.cls || ''}" style="transform:translateX(${-pg.k * (R.g.cw + GAP)}px)">${s.html}</div></div><div class="rd-folio tnum">${pg.folio || ''}</div></div>`);
  hydrate(node);
  return node;
}

function draw() {
  const book = $('#rdBook', R.root);
  book.innerHTML = '';
  const [a, b] = pagesIn(R.view);
  book.classList.toggle('closed', R.g.spread && R.view === 0);
  if (R.g.spread) {
    const L = el('<div class="rd-half rd-left"></div>'), Rt = el('<div class="rd-half rd-right"></div>');
    if (a >= 0) L.appendChild(pageNode(a, 'left'));
    Rt.appendChild(pageNode(b, 'right'));
    book.append(L, Rt);
  } else {
    const H = el('<div class="rd-half rd-solo"></div>'); H.appendChild(pageNode(a, 'solo')); book.appendChild(H);
  }
  updateMeta();
}

function updateMeta() {
  const i = firstPageOf(R.view); let pg = R.pages[i]; if (!pg) return;
  const last = Math.min(R.pages.length - 1, pagesIn(R.view).slice(-1)[0]);
  if (!pg.s.chapter && R.pages[last] && R.pages[last].s.chapter) pg = R.pages[last]; // front matter beside chapter one
  const shown = R.pages[last] && R.pages[last].s === pg.s ? R.pages[last] : pg;
  $('#rdChapter', R.root).textContent = pg.s.chapter ? pg.s.label : '';
  const totalFolio = R.pages.reduce((m, x) => Math.max(m, x.folio), 0);
  $('#rdPage', R.root).textContent = pg.folio ? `Page ${num(shown.folio)} of ${num(totalFolio)}` : pg.s.label;
  let left = '';
  if (pg.s.chapter && pg.s.words) {
    const mins = Math.round(pg.s.words * (1 - (shown.k + 1) / pg.s.count) / WPM);
    left = mins >= 1 ? `${mins} min left in chapter` : (shown.k + 1 >= pg.s.count ? 'End of chapter' : 'Less than a minute left in chapter');
  }
  $('#rdLeft', R.root).textContent = left;
  const range = $('#rdRange', R.root); range.value = i;
  range.style.setProperty('--p', (R.pages.length > 1 ? i / (R.pages.length - 1) * 100 : 0) + '%');
}

function goToPage(i, save = true) {
  R.view = clamp(viewOf(clamp(i, 0, R.pages.length - 1)), 0, viewsCount() - 1);
  draw();
  if (save) saveSpot();
}

// remember the place by chapter and how far in, so it survives a different page size
const spotKey = () => 'inkfold-reader:' + R.p.id;
function saveSpot() {
  if (!R || !R.pages.length) return;
  const pg = R.pages[firstPageOf(R.view)]; if (!pg) return;
  try { localStorage.setItem(spotKey(), JSON.stringify({ s: pg.s.id, f: pg.s.count > 1 ? pg.k / pg.s.count : 0 })); } catch {}
}
function loadSpot() {
  try {
    const v = JSON.parse(localStorage.getItem(spotKey()) || 'null'); if (!v) return null;
    const s = R.sections.find(x => x.id === v.s); if (!s) return null;
    return s.start + Math.min(s.count - 1, Math.round((v.f || 0) * s.count));
  } catch { return null; }
}

// ---------------------------------------------------------------- page turns
// A turn lifts one leaf: its front is the page you're leaving, its back the page you're going to.
function makeTurn(dir) {
  if (R.busy) return null;
  const to = R.view + dir;
  if (to < 0 || to >= viewsCount()) return null;
  const book = $('#rdBook', R.root), g = R.g;
  const [a, b] = pagesIn(R.view), [na, nb] = pagesIn(to);
  let under, leaf, from, end;
  if (g.spread) {
    const L = el('<div class="rd-half rd-left"></div>'), Rt = el('<div class="rd-half rd-right"></div>');
    if (dir > 0) { if (a >= 0) L.appendChild(pageNode(a, 'left')); Rt.appendChild(pageNode(nb, 'right')); }
    else { if (na >= 0) L.appendChild(pageNode(na, 'left')); Rt.appendChild(pageNode(b, 'right')); }
    under = [L, Rt];
    leaf = el(`<div class="rd-leaf ${dir > 0 ? 'on-right' : 'on-left'}"><div class="rd-face front"></div><div class="rd-face back"></div></div>`);
    $('.front', leaf).appendChild(dir > 0 ? pageNode(b, 'right') : pageNode(a, 'left'));
    $('.back', leaf).appendChild(dir > 0 ? pageNode(na, 'left') : pageNode(nb, 'right'));
    from = 0; end = dir > 0 ? -180 : 180;
    // opening the cover or closing back onto it slides the book to stay centred
    if (R.view === 0 || to === 0) book.classList.add('sliding');
  } else {
    const H = el('<div class="rd-half rd-solo"></div>');
    H.appendChild(pageNode(dir > 0 ? na : a, 'solo'));
    under = [H];
    leaf = el('<div class="rd-leaf solo"><div class="rd-face front"></div><div class="rd-face back"><div class="rd-page blank solo"></div></div></div>');
    $('.front', leaf).appendChild(pageNode(dir > 0 ? a : na, 'solo'));
    from = dir > 0 ? 0 : -180; end = dir > 0 ? -180 : 0;
  }
  const cast = el('<div class="rd-cast"></div>');
  book.innerHTML = ''; book.append(...under, leaf, cast);
  R.busy = true;
  const t = { dir, to, leaf, cast, book, from, end, p: 0 };
  setTurn(t, 0);
  return t;
}
function setTurn(t, p) {
  t.p = p;
  const ang = t.from + (t.end - t.from) * p;
  const f = Math.abs(ang) / 180; // 0 flat on its side … 1 flat on the other
  t.leaf.style.transform = `rotateY(${ang}deg)`;
  t.leaf.style.setProperty('--sf', (f < .5 ? f * 0.55 : 0).toFixed(3));
  t.leaf.style.setProperty('--sb', (f > .5 ? (1 - f) * 0.55 : 0).toFixed(3));
  t.leaf.style.setProperty('--gl', Math.sin(f * Math.PI).toFixed(3));
  t.cast.style.opacity = (Math.sin(f * Math.PI) * 0.9).toFixed(3);
  t.cast.dataset.side = (t.leaf.classList.contains('on-left') ? f < .5 : f > .5) ? 'left' : 'right';
  if (t.leaf.classList.contains('solo')) t.cast.dataset.side = 'solo';
  if (t.book.classList.contains('sliding')) {
    // cover alone = shifted half a page left; open book = centred
    const openness = R.view === 0 ? p : 1 - p;
    t.book.style.setProperty('--shift', (1 - openness).toFixed(3));
  }
}
function animateTurn(t, target, ms) {
  return new Promise(res => {
    if (reduced()) { setTurn(t, target); return res(); }
    const start = performance.now(), from = t.p, dur = Math.max(90, ms * Math.abs(target - from));
    const step = now => {
      const k = Math.min(1, (now - start) / dur);
      setTurn(t, from + (target - from) * easeOut(k));
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
async function finishTurn(t, done) {
  await animateTurn(t, done ? 1 : 0, done ? 620 : 380);
  R.busy = false;
  t.book.classList.remove('sliding'); t.book.style.removeProperty('--shift');
  if (done) { R.view = t.to; haptic(4); saveSpot(); }
  draw();
}
async function turn(dir) {
  if (!R || R.busy) return;
  if (reduced()) { const to = R.view + dir; if (to < 0 || to >= viewsCount()) return; const b = $('#rdBook', R.root); b.classList.add('fade'); setTimeout(() => { if (!R) return; R.view = to; draw(); saveSpot(); b.classList.remove('fade'); }, 120); return; }
  const t = makeTurn(dir); if (!t) return bump(dir);
  await finishTurn(t, true);
}
function bump(dir) { const b = $('#rdBook', R.root); b.classList.remove('bump-l', 'bump-r'); void b.offsetWidth; b.classList.add(dir > 0 ? 'bump-r' : 'bump-l'); }

// ---------------------------------------------------------------- input
function bind() {
  const root = R.root, stage = $('#rdStage', root);
  $('[data-rd="close"]', root).onclick = closeReader;
  $('[data-rd="toc"]', root).onclick = e => { e.stopPropagation(); tocPanel(); };
  $('[data-rd="type"]', root).onclick = e => { e.stopPropagation(); typePanel(); };
  const range = $('#rdRange', root);
  range.oninput = () => { if (!R.busy) goToPage(+range.value, false); };
  range.onchange = saveSpot;

  // drag a page to turn it; tap the sides to turn, the middle to hide the controls
  let d = null;
  on(stage, 'pointerdown', e => {
    if (e.button !== 0 || R.busy || e.target.closest('.rd-panel')) return;
    closePanels();
    d = { x: e.clientX, y: e.clientY, t0: performance.now(), turn: null, id: e.pointerId, moved: false };
  });
  on(window, 'pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      d.moved = true;
      d.turn = makeTurn(dx < 0 ? 1 : -1);
      if (!d.turn) bump(dx < 0 ? 1 : -1);
      try { stage.setPointerCapture(d.id); } catch {}
    }
    if (d.turn) {
      const span = R.g.pw * (R.g.spread ? 1.5 : 1.05);
      setTurn(d.turn, clamp((d.turn.dir > 0 ? -dx : dx) / span, 0, 1));
      d.vx = dx / Math.max(1, performance.now() - d.t0);
    }
  });
  const up = e => {
    if (!d || e.pointerId !== d.id) return;
    const g = d; d = null;
    if (g.turn) {
      const fast = Math.abs(g.vx || 0) > 0.55 && Math.sign(-(g.vx || 0)) === g.turn.dir;
      finishTurn(g.turn, g.turn.p > 0.4 || (fast && g.turn.p > 0.05));
      return;
    }
    if (g.moved || Math.abs(e.clientY - g.y) > 10) return;
    const link = e.target.closest('[data-goto]');
    if (link) { const s = R.sections.find(x => x.id === link.dataset.goto); if (s) goToPage(s.start); return; }
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x > 0.62) turn(1); else if (x < 0.38) turn(-1); else root.classList.toggle('calm');
  };
  on(window, 'pointerup', up); on(window, 'pointercancel', e => { if (d && d.turn) { finishTurn(d.turn, false); } d = null; });

  on(document, 'keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select') && e.target.id !== 'rdRange') return;
    const k = e.key;
    let used = true;
    if (k === 'Escape') { if ($('.rd-panel', root)) closePanels(); else closeReader(); }
    else if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) turn(1);
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) turn(-1);
    else if (k === 'Home') goToPage(0);
    else if (k === 'End') goToPage(R.pages.length - 1);
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  let wheelLock = 0, acc = 0;
  on(stage, 'wheel', e => {
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(acc) > 60) { turn(acc > 0 ? 1 : -1); acc = 0; wheelLock = performance.now() + 700; }
  }, { passive: false });

  let rt = 0;
  const soon = () => { clearTimeout(rt); rt = setTimeout(relayout, 180); };
  on(window, 'resize', soon);
  if (document.fonts) on(document.fonts, 'loadingdone', soon);
}

function relayout() {
  if (!R) return;
  if (R.busy) return setTimeout(relayout, 400);
  const pg = R.pages[firstPageOf(R.view)];
  const s = pg && pg.s, f = pg && s.count > 1 ? pg.k / s.count : 0;
  layout();
  goToPage(s ? s.start + Math.min(s.count - 1, Math.round(f * s.count)) : 0, false);
}

// ---------------------------------------------------------------- panels
function closePanels() { $$('.rd-panel', R.root).forEach(x => x.remove()); }
function panel(html, cls) {
  closePanels();
  const p = el(`<div class="rd-panel ${cls}">${html}</div>`);
  R.root.appendChild(p);
  p.addEventListener('pointerdown', e => e.stopPropagation());
  setTimeout(() => {
    const off = e => { if (!R || !p.isConnected) return document.removeEventListener('pointerdown', off, true); if (!p.contains(e.target) && !e.target.closest('[data-rd]')) { p.remove(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  });
  return p;
}
function tocPanel() {
  if ($('.rd-panel.toc', R.root)) return closePanels();
  const cur = R.pages[firstPageOf(R.view)];
  const list = R.sections.filter(s => s.chapter || s.id === 'cover' || s.id === 'blurb');
  const p = panel(`<div class="rd-panel-h">Contents</div><div class="rd-toc-list">${list.map(s => `<button data-s="${esc(s.id)}" class="${cur && cur.s === s ? 'on' : ''}"><span>${esc(s.chapter ? s.label : s.id === 'cover' ? 'Cover' : 'About this book')}</span><b class="tnum">${s.chapter ? R.pages[s.start].folio : ''}</b></button>`).join('')}</div>`, 'toc');
  $$('[data-s]', p).forEach(b => b.onclick = () => { const s = R.sections.find(x => x.id === b.dataset.s); closePanels(); if (s) goToPage(s.start); });
  const on_ = $('.on', p); if (on_) on_.scrollIntoView({ block: 'center' });
}
function typePanel() {
  if ($('.rd-panel.type', R.root)) return closePanels();
  const p = panel(`<div class="rd-panel-h">Text</div>
    <div class="rd-size"><button data-z="-1" aria-label="Smaller text">A</button><span class="tnum">${R.size}</span><button data-z="1" aria-label="Larger text">A</button></div>
    <div class="rd-panel-h">Typeface</div>
    <div class="rd-seg">${Object.entries(FONTS).map(([k, f]) => `<button data-f="${k}" class="${R.font === k ? 'on' : ''}" style="font-family:${f.css.replace(/"/g, '&quot;')}">${f.name}</button>`).join('')}</div>
    <div class="rd-panel-h">Page</div>
    <div class="rd-themes">${Object.entries(THEMES).map(([k, n]) => `<button data-t="${k}" class="rd-sw sw-${k} ${R.theme === k ? 'on' : ''}" aria-label="${n}"><i>Aa</i><span>${n}</span></button>`).join('')}</div>`, 'type');
  const redo = async () => { applyLook(); savePrefs(); await fontsReady(); relayout(); };
  $$('[data-z]', p).forEach(b => b.onclick = () => { const i = SIZES.indexOf(R.size) + +b.dataset.z; if (i < 0 || i >= SIZES.length) return; R.size = SIZES[i]; $('.rd-size span', p).textContent = R.size; redo(); });
  $$('[data-f]', p).forEach(b => b.onclick = () => { R.font = b.dataset.f; $$('[data-f]', p).forEach(x => x.classList.toggle('on', x === b)); redo(); });
  $$('[data-t]', p).forEach(b => b.onclick = () => { R.theme = b.dataset.t; $$('[data-t]', p).forEach(x => x.classList.toggle('on', x === b)); applyLook(); savePrefs(); });
}

export const readerOpen = () => !!R;
export const _test = { buildSections, readerHtml };
