// Inkfold — app
import { db, deviceInfo } from './db.js';
import { COVERS, buildTree, flatScenes, newProjectRecord, newChapter, newScene, seedSample, projectStats, touch } from './model.js';
import { sanitizeHtml, htmlWords, htmlToMd, mdToHtml, countWords, blocksToHtml, plainToBlocks } from './text.js';
import * as io from './io.js';
import * as sync from './sync.js';
import { loadLib, LIBS } from './libs.js';

const VERSION = '1.0.0';

// ---------------------------------------------------------------- Icons
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  focus: '<path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4"/>',
  type: '<path d="M4 7V5h11v2M9.5 5v14M7 19h5M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>',
  quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/>',
  sceneBreak: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  sync: '<path d="M4 12a8 8 0 0113.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 01-13.7 5.6L4 15.3M4 20v-4.7h4.7"/>',
  shield: '<path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
  restore: '<path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  export: '<path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  wifi: '<path d="M2 8.8a15 15 0 0120 0M5 12.6a10 10 0 0114 0M8.5 16.4a5 5 0 017 0M12 20h.01"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1.5"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M8 7h7"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  share: '<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const MARK = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 4.5h12.5L25 10v17.5H7z" fill="var(--text)"/><path d="M19.5 4.5V10H25z" fill="var(--accent)"/><path d="M16 12.6s-3.9 4.3-3.9 6.8a3.9 3.9 0 0 0 7.8 0c0-2.5-3.9-6.8-3.9-6.8z" fill="var(--bg)"/></svg>`;

// ---------------------------------------------------------------- Utilities
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (n || 0).toLocaleString();
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };
function ago(ts) {
  if (!ts) return 'never';
  const s = (Date.now() - ts) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

function toast(msg, action, ms = 3600) {
  const t = el(`<div class="toast"><span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}</div>`);
  const remove = () => { t.classList.add('leaving'); setTimeout(() => t.remove(), 300); };
  if (action) $('button', t).onclick = () => { action.run(); remove(); };
  $('#toasts').appendChild(t);
  if (ms) setTimeout(remove, ms);
  return remove;
}
const errorToast = e => { console.error(e); toast(e && e.message ? e.message : 'Something went wrong. Please try again.'); };

// Popovers
let openPop = null;
function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
function popover(anchor, content, { align = 'end', cls = '' } = {}) {
  closePop();
  const p = el(`<div class="pop ${cls}" role="menu"></div>`);
  if (typeof content === 'string') p.innerHTML = content; else p.appendChild(content);
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let left = align === 'end' ? r.right - pw : r.left;
  left = Math.max(12, Math.min(left, innerWidth - pw - 12));
  let top = r.bottom + 6;
  if (top + ph > innerHeight - 12) top = Math.max(12, r.top - ph - 6);
  p.style.left = left + 'px'; p.style.top = top + 'px';
  openPop = p;
  setTimeout(() => {
    const off = e => { if (!p.contains(e.target)) { closePop(); document.removeEventListener('pointerdown', off, true); } };
    document.addEventListener('pointerdown', off, true);
  });
  return p;
}
function menu(anchor, items) {
  const html = items.map(it => it === '-' ? '<hr>' : `<button class="mi ${it.danger ? 'danger' : ''}" data-k="${it.k}">${icon(it.icon)}<span>${esc(it.label)}</span></button>`).join('');
  const p = popover(anchor, html);
  $$('.mi', p).forEach(b => b.onclick = () => { closePop(); items.find(i => i.k === b.dataset.k).run(); });
}

// Sheets
const sheets = [];
function sheet({ title, sub = '', body = '', foot = '', wide = false, onClose }) {
  const wrap = el(`<div class="sheet-wrap"><div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><div><h3>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-body"></div>${foot !== null ? '<div class="sheet-foot"></div>' : ''}</div></div>`);
  const s = { wrap, body: $('.sheet-body', wrap), foot: $('.sheet-foot', wrap) };
  if (typeof body === 'string') s.body.innerHTML = body; else s.body.appendChild(body);
  if (s.foot) { if (foot) s.foot.innerHTML = foot; else s.foot.remove(); }
  s.close = () => { wrap.remove(); const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); onClose && onClose(); };
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) s.close(); });
  $('[data-close]', wrap).onclick = s.close;
  document.body.appendChild(wrap);
  sheets.push(s);
  setTimeout(() => { const f = $('[autofocus]', wrap); if (f) f.focus(); }, 60);
  return s;
}
function confirmSheet({ title, sub, confirm = 'Confirm', danger = false }) {
  return new Promise(res => {
    let done = false;
    const s = sheet({ title, sub, body: '', foot: `<button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>`, onClose: () => { if (!done) res(false); } });
    s.body.remove();
    $('[data-no]', s.wrap).onclick = () => s.close();
    $('[data-yes]', s.wrap).onclick = () => { done = true; s.close(); res(true); };
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (openPop) return closePop();
    if (sheets.length) return sheets[sheets.length - 1].close();
    if (document.body.classList.contains('focus')) setFocusMode(false);
    else if (document.body.classList.contains('binder-open')) document.body.classList.remove('binder-open');
  }
});

// ---------------------------------------------------------------- Settings
const FONTS = {
  newsreader: { name: 'Newsreader', css: "'Newsreader', Georgia, serif", note: 'Editorial serif' },
  literata: { name: 'Literata', css: "'Literata', Georgia, serif", note: 'Made for long reading' },
  source: { name: 'Source Serif', css: "'Source Serif 4', Georgia, serif", note: 'Crisp, classic' },
  hanken: { name: 'Hanken', css: "'Hanken Grotesk', system-ui, sans-serif", note: 'Clean sans' },
  plex: { name: 'Plex Mono', css: "'IBM Plex Mono', ui-monospace, monospace", note: 'Typewriter' },
};
const DEFAULTS = { theme: 'system', font: 'newsreader', size: 19, lh: 1.7, width: 680, typewriter: true, smart: true, indent: false };
let settings = { ...DEFAULTS };

function applySettings() {
  const r = document.documentElement;
  if (settings.theme === 'system') delete r.dataset.theme; else r.dataset.theme = settings.theme;
  try { localStorage.setItem('inkfold-theme', settings.theme); } catch {}
  r.style.setProperty('--ed-font', (FONTS[settings.font] || FONTS.newsreader).css);
  r.style.setProperty('--ed-size', settings.size + 'px');
  r.style.setProperty('--ed-lh', settings.lh);
  r.style.setProperty('--measure', settings.width + 'px');
  const ed = $('#editor'); if (ed) ed.classList.toggle('indent', !!settings.indent);
}
async function saveSettings() { await db.setMeta('settings', settings); applySettings(); }

// ---------------------------------------------------------------- State
const state = { projects: [], project: null, items: [], scene: null, dirty: false, installEvt: null, device: null };

// ---------------------------------------------------------------- Library
async function renderLibrary() {
  document.title = 'Inkfold';
  const lib = $('#library');
  const projects = (await db.all('projects')).filter(p => !p.deleted)
    .sort((a, b) => (b.lastEdited || b.updatedAt) - (a.lastEdited || a.updatedAt));
  state.projects = projects;
  const stats = await Promise.all(projects.map(p => projectStats(p.id)));
  const total = stats.reduce((s, x) => s + x.words, 0);
  const lastBackup = await db.meta('lastBackup');
  const backupAge = lastBackup ? Date.now() - lastBackup.at : Infinity;
  const fresh = backupAge < 3 * 864e5;
  const hasRealWork = projects.some(p => !p.sample);
  const folder = await io.folderPermission().catch(() => ({ state: 'none' }));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const canInstall = !standalone && (state.installEvt || ios);

  let banner = '';
  if (folder.state === 'prompt') {
    banner = `<div class="banner"><div class="b-icon">${icon('folder')}</div><div class="b-text"><strong>Back up to “${esc(folder.dir.name)}”</strong><span>Your browser needs a tap before Inkfold can save today’s backup to your folder.</span></div><button class="btn btn-primary btn-sm" data-act="folder-grant">Back up now</button></div>`;
  } else if (hasRealWork && !fresh) {
    banner = `<div class="banner warn"><div class="b-icon">${icon('shield')}</div><div class="b-text"><strong>${lastBackup ? `Last backup was ${ago(lastBackup.at)}` : 'You haven’t backed up yet'}</strong><span>Your writing lives in this browser. Keep a copy somewhere safe in case browsing data gets cleared.</span></div><button class="btn btn-primary btn-sm" data-act="backup">Back up now</button></div>`;
  }

  lib.innerHTML = `<div class="lib-wrap">
    <header class="lib-top">
      <div class="brand">${MARK}<span class="brand-word">Ink<em>fold</em></span></div>
      <div class="lib-actions">
        ${canInstall ? `<button class="chip hide-narrow" data-act="install">${icon('install')}Install app</button>` : ''}
        <button class="chip" data-act="backup-status" title="Backups"><span class="dot ${fresh ? '' : 'warn'}"></span><span class="hide-narrow">${lastBackup ? 'Backed up ' + ago(lastBackup.at) : 'Not backed up'}</span></button>
        <button class="icon-btn" data-act="sync" title="Nearby Sync" aria-label="Nearby Sync">${icon('sync')}</button>
        <button class="icon-btn" data-act="settings" title="Settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </header>
    <section class="lib-hero">
      <div>
        <div class="eyebrow">Your library</div>
        <h1>${projects.length ? 'Pick up <em>where you left off.</em>' : 'Every book starts <em>on a blank page.</em>'}</h1>
        <div class="sum tnum">${projects.length} project${projects.length === 1 ? '' : 's'} · ${num(total)} words written</div>
      </div>
      <div class="lib-hero-actions">
        <button class="btn btn-quiet" data-act="import">${icon('upload')}Import</button>
        <button class="btn btn-primary" data-act="new">${icon('plus')}New project</button>
      </div>
    </section>
    ${banner}
    <section class="shelf">
      ${projects.map((p, i) => coverHtml(p, stats[i])).join('')}
      <button class="book" data-act="new" aria-label="New project"><div class="cover new"><div class="plus">${icon('plus')}</div><b>New project</b></div><div class="b-meta"><span>&nbsp;</span></div></button>
    </section>
    <footer class="lib-foot"><span>${icon('shield')}Private and offline. Your writing never leaves this device unless you sync or export it.</span><span>Inkfold ${VERSION}</span></footer>
  </div>`;

  lib.onclick = async e => {
    const b = e.target.closest('[data-act], [data-open]');
    if (!b) return;
    if (b.dataset.open) return openProject(b.dataset.open);
    const a = b.dataset.act;
    if (a === 'new') newProjectSheet();
    else if (a === 'import') pickFile();
    else if (a === 'settings') settingsSheet();
    else if (a === 'sync') syncSheet();
    else if (a === 'install') installApp();
    else if (a === 'backup') doBackup();
    else if (a === 'backup-status') settingsSheet('data');
    else if (a === 'folder-grant') {
      try { const { dir } = await io.folderPermission(); if ((await dir.requestPermission({ mode: 'readwrite' })) === 'granted') { await io.writeFolderBackup(dir); toast('Backed up to your folder'); renderLibrary(); } }
      catch (err) { errorToast(err); }
    }
  };
}

function coverHtml(p, st) {
  const c = COVERS[p.cover % COVERS.length] || COVERS[0];
  return `<button class="book" data-open="${p.id}" aria-label="Open ${esc(p.title)}">
    <div class="cover" style="--cbg:${c.bg};--cfg:${c.fg};--cline:${c.line}">
      <div class="frame"></div>
      <div class="c-kicker">${p.sample ? 'Sample' : `${st.chapters} chapter${st.chapters === 1 ? '' : 's'}`}</div>
      <div><div class="c-title">${esc(p.title)}</div>${p.subtitle && !p.sample ? `<div class="c-sub">${esc(p.subtitle)}</div>` : ''}</div>
      <div class="c-foot"><span>${esc(p.author || '')}</span><svg class="c-fold" viewBox="0 0 16 16"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M10 2v3h3" fill="none" stroke="currentColor" stroke-width="1"/></svg></div>
    </div>
    <div class="b-meta"><b>${esc(p.title)}${p.sample ? '<span class="tag-sample">Sample</span>' : ''}</b><span class="tnum">${num(st.words)} words · ${ago(p.lastEdited || p.updatedAt)}</span></div>
  </button>`;
}

function newProjectSheet() {
  let cover = Math.floor(Math.random() * COVERS.length);
  const s = sheet({
    title: 'New project', sub: 'Give it a working title. You can change everything later.',
    body: `<div class="field"><label class="field-label" for="np-title">Title</label><input class="input" id="np-title" placeholder="The Long Way Home" autofocus maxlength="120"></div>
      <div class="field"><label class="field-label" for="np-author">Author</label><input class="input" id="np-author" placeholder="Your name or pen name" maxlength="80"></div>
      <div class="field"><span class="field-label">Cover</span><div class="cover-picks">${COVERS.map((c, i) => `<button class="cover-pick ${i === cover ? 'on' : ''}" data-i="${i}" style="--cbg:${c.bg}" aria-label="${c.name}"></button>`).join('')}</div></div>`,
    foot: `<button class="btn btn-ghost" data-close2>Cancel</button><button class="btn btn-primary" data-create>Create project</button>`
  });
  $$('.cover-pick', s.wrap).forEach(b => b.onclick = () => { cover = +b.dataset.i; $$('.cover-pick', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-close2]', s.wrap).onclick = s.close;
  const create = async () => {
    const author = $('#np-author').value.trim();
    const p = { ...newProjectRecord($('#np-title').value.trim() || 'Untitled project'), cover, author };
    const ch = newChapter(p.id, 1, 'Chapter One');
    const sc = newScene(p.id, ch.id, 1, 'Scene 1');
    await db.writeBatch({ projects: [touch(p)], items: [ch, sc] });
    if (author) await db.setMeta('lastAuthor', author);
    s.close(); haptic(); openProject(p.id, sc.id);
  };
  db.meta('lastAuthor').then(a => { if (a) $('#np-author').value = a; });
  $('[data-create]', s.wrap).onclick = create;
  $('#np-title').onkeydown = e => { if (e.key === 'Enter') create(); };
}

// ---------------------------------------------------------------- Workspace
async function openProject(id, sceneId) {
  const p = await db.get('projects', id);
  if (!p || p.deleted) return renderLibrary();
  state.project = p;
  state.items = await db.byProject(id);
  const tree = buildTree(state.items);
  const scenes = flatScenes(tree);
  const last = sceneId || (await db.meta('lastScene:' + id));
  let scene = scenes.find(s => s.id === last) || scenes[0];
  if (!scene) { // project with no scenes yet
    const existing = tree.find(c => c.id !== '__loose');
    const ch = existing ? state.items.find(i => i.id === existing.id) : newChapter(id, 1, 'Chapter One');
    scene = newScene(id, ch.id, 1, 'Scene 1');
    await db.writeBatch({ items: existing ? [scene] : [ch, scene] });
    state.items = await db.byProject(id);
  }
  await db.setMeta('lastProject', id);
  $('#library').hidden = true;
  const ws = $('#workspace'); ws.hidden = false;
  renderWorkspace();
  await loadScene(scene.id);
}

function renderWorkspace() {
  const ws = $('#workspace');
  ws.innerHTML = `
    <aside class="binder" aria-label="Binder">
      <div class="binder-head">
        <button class="back" data-act="library">${icon('back')}Library</button>
        <div class="proj-title"><div style="min-width:0"><h2 id="projTitle"></h2><p id="projMeta" class="tnum"></p></div><button class="icon-btn" data-act="project-menu" aria-label="Project options">${icon('more')}</button></div>
      </div>
      <div class="binder-list" id="binderList"></div>
      <div class="binder-foot">
        <div class="totals tnum"><span>Manuscript</span><span><b id="projWords">0</b> words</span></div>
        <button class="btn btn-quiet btn-sm" data-act="add-chapter">${icon('plus')}New chapter</button>
      </div>
    </aside>
    <div class="drawer-scrim" data-act="close-drawer"></div>
    <section class="main">
      <header class="topbar">
        <button class="icon-btn only-narrow" data-act="drawer" aria-label="Open binder">${icon('sidebar')}</button>
        <div class="crumbs"><span class="c1" id="crumbChapter"></span><span class="sep">/</span><span class="c2" id="crumbScene"></span></div>
        <div class="fmt" id="fmtBar" role="toolbar" aria-label="Formatting">
          <button class="icon-btn" data-fmt="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
          <button class="icon-btn" data-fmt="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
          <button class="icon-btn" data-fmt="heading" title="Heading (# then space)" aria-label="Heading"><span class="h">H</span></button>
          <button class="icon-btn" data-fmt="quote" title="Quote (> then space)" aria-label="Quote">${icon('quote')}</button>
          <button class="icon-btn" data-fmt="list" title="List (- then space)" aria-label="List">${icon('list')}</button>
          <button class="icon-btn" data-fmt="break" title="Scene break (*** then Enter)" aria-label="Scene break"><span class="ast">⁂</span></button>
        </div>
        <button class="icon-btn" data-act="type" title="Typography" aria-label="Typography">${icon('type')}</button>
        <button class="icon-btn" data-act="focus" title="Focus mode (Ctrl+.)" aria-label="Focus mode">${icon('focus')}</button>
        <button class="icon-btn" data-act="export" title="Export" aria-label="Export">${icon('export')}</button>
      </header>
      <div class="scroller" id="scroller">
        <article class="page">
          <div class="scene-kicker" id="sceneKicker"></div>
          <input class="scene-title" id="sceneTitle" placeholder="Untitled scene" aria-label="Scene title" maxlength="140" autocomplete="off">
          <div class="editor" id="editor" contenteditable="true" spellcheck="true" data-placeholder="Begin here…" role="textbox" aria-multiline="true" aria-label="Scene text"></div>
          <textarea class="md-editor" id="mdEditor" spellcheck="true" hidden aria-label="Scene text (Markdown)" placeholder="Begin here… (Markdown)"></textarea>
        </article>
      </div>
      <div class="statusbar tnum" id="statusbar"><span><b id="sceneWords">0</b> words</span><span class="proj-total"><span id="projWords2">0</span> in project</span><span class="saved" id="saveState"><span class="dot"></span>Saved</span></div>
    </section>`;
  ws.onclick = onWorkspaceClick;
  // keep the text selection when tapping formatting buttons
  $('#fmtBar').addEventListener('pointerdown', e => e.preventDefault());
  $('#fmtBar').addEventListener('mousedown', e => e.preventDefault());
  document.execCommand('defaultParagraphSeparator', false, 'p');
  bindEditor();
  renderBinder();
  applySettings();
}

function renderProjectHead() {
  const p = state.project;
  $('#projTitle').textContent = p.title;
  const live = state.items.filter(i => !i.deleted);
  $('#projMeta').textContent = `${live.filter(i => i.type === 'chapter').length} chapters · ${live.filter(i => i.type === 'scene').length} scenes`;
  updateCounts();
}

function renderBinder() {
  const tree = buildTree(state.items);
  const closed = new Set(JSON.parse(sessionStorage.getItem('closed:' + state.project.id) || '[]'));
  $('#binderList').innerHTML = `<div class="binder-label"><span>Manuscript</span></div>` + tree.map(c => `
    <div class="chapter ${closed.has(c.id) ? 'closed' : ''}" data-chapter="${c.id}">
      <div class="row chapter-row" data-id="${c.id}" data-type="chapter">
        ${c.id !== '__loose' ? `<span class="grip" data-grip aria-label="Drag to reorder">${icon('grip')}</span>` : '<span class="grip"></span>'}
        <span class="caret">${icon('chev')}</span>
        <span class="r-title">${esc(c.title)}</span>
        <span class="r-count">${num(c.scenes.reduce((s, x) => s + (x.words || 0), 0))}</span>
        ${c.id !== '__loose' ? `<button class="r-more" data-more="${c.id}" aria-label="Chapter options">${icon('more')}</button>` : ''}
      </div>
      <div class="scenes">
        ${c.scenes.map(s => `<div class="row scene-row ${s.id === state.scene?.id ? 'active' : ''} ${s.conflictOf ? 'conflict' : ''}" data-id="${s.id}" data-type="scene">
          <span class="grip" data-grip aria-label="Drag to reorder">${icon('grip')}</span>
          <span class="r-title">${esc(s.title || 'Untitled scene')}</span>
          <span class="r-count">${num(s.words)}</span>
          <button class="r-more" data-more="${s.id}" aria-label="Scene options">${icon('more')}</button>
        </div>`).join('')}
        ${c.id !== '__loose' ? `<button class="add-scene" data-add-scene="${c.id}">${icon('plus')}New scene</button>` : ''}
      </div>
    </div>`).join('');
  renderProjectHead();
  bindDrag();
}

async function onWorkspaceClick(e) {
  const t = e.target;
  const act = t.closest('[data-act]')?.dataset.act;
  const fmt = t.closest('[data-fmt]')?.dataset.fmt;
  if (fmt) return applyFormat(fmt);
  if (act === 'library') { await saveNow(); $('#workspace').hidden = true; $('#library').hidden = false; document.body.classList.remove('binder-open'); setFocusMode(false); state.project = null; return renderLibrary(); }
  if (act === 'drawer') return document.body.classList.add('binder-open');
  if (act === 'close-drawer') return document.body.classList.remove('binder-open');
  if (act === 'add-chapter') return addChapter();
  if (act === 'focus') return setFocusMode(!document.body.classList.contains('focus'));
  if (act === 'type') return typographyPanel(t.closest('[data-act]'));
  if (act === 'export') return exportSheet();
  if (act === 'project-menu') return menu(t.closest('[data-act]'), [
    { k: 'edit', icon: 'edit', label: 'Project details', run: projectSheet },
    { k: 'export', icon: 'export', label: 'Export…', run: exportSheet },
    { k: 'file', icon: 'share', label: 'Share project file (.inkfold)', run: () => io.exportProjectFile(state.project.id).catch(errorToast) },
    '-',
    { k: 'del', icon: 'trash', label: 'Move project to Trash', danger: true, run: deleteProject },
  ]);
  const more = t.closest('[data-more]');
  if (more) { e.stopPropagation(); return itemMenu(more, more.dataset.more); }
  const add = t.closest('[data-add-scene]');
  if (add) return addScene(add.dataset.addScene);
  if (t.closest('[data-grip]')) return;
  const row = t.closest('.row');
  if (row && !row.querySelector('input.rename')) {
    if (row.dataset.type === 'chapter') {
      const ch = row.closest('.chapter'); ch.classList.toggle('closed');
      const closed = $$('.chapter.closed').map(x => x.dataset.chapter);
      sessionStorage.setItem('closed:' + state.project.id, JSON.stringify(closed));
    } else { await loadScene(row.dataset.id); document.body.classList.remove('binder-open'); }
  }
}
document.addEventListener('dblclick', e => { const r = e.target.closest('#binderList .row'); if (r && r.dataset.id !== '__loose') renameInline(r.dataset.id); });

function itemMenu(anchor, id) {
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  const items = [{ k: 'rename', icon: 'edit', label: 'Rename', run: () => renameInline(id) }];
  if (it.type === 'chapter') items.push({ k: 'add', icon: 'plus', label: 'New scene in chapter', run: () => addScene(id) });
  if (it.type === 'scene') items.push({ k: 'dup', icon: 'copy', label: 'Duplicate', run: () => duplicateScene(id) });
  items.push('-', { k: 'del', icon: 'trash', label: 'Move to Trash', danger: true, run: () => trashItem(id) });
  menu(anchor, items);
}

function renameInline(id) {
  const row = $(`#binderList .row[data-id="${id}"]`);
  const it = state.items.find(i => i.id === id);
  if (!row || !it) return;
  const title = $('.r-title', row);
  const input = el(`<input class="rename" value="${esc(it.title)}" maxlength="140">`);
  title.replaceWith(input); input.focus(); input.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    const v = input.value.trim();
    if (save && v && v !== it.title) {
      it.title = v; touch(it); await db.put('items', it);
      if (state.scene && state.scene.id === id) { state.scene = it; $('#sceneTitle').value = v; }
    }
    renderBinder(); updateCrumbs();
  };
  input.onkeydown = e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
  input.onblur = () => finish(true);
}

const sortedSiblings = (type, parentId) => state.items.filter(i => !i.deleted && i.type === type && (type === 'chapter' || i.parentId === parentId)).sort((a, b) => a.order - b.order);

async function addChapter() {
  const sibs = sortedSiblings('chapter');
  const ch = newChapter(state.project.id, (sibs.at(-1)?.order || 0) + 1, `Chapter ${sibs.length + 1}`);
  const sc = newScene(state.project.id, ch.id, 1, 'Scene 1');
  await db.writeBatch({ items: [ch, sc] });
  state.items.push(ch, sc); haptic();
  await loadScene(sc.id);
  renameInline(ch.id);
}
async function addScene(chapterId) {
  const sibs = sortedSiblings('scene', chapterId);
  const sc = newScene(state.project.id, chapterId, (sibs.at(-1)?.order || 0) + 1, `Scene ${sibs.length + 1}`);
  await db.put('items', sc); state.items.push(sc); haptic();
  await loadScene(sc.id);
  $('#sceneTitle').focus(); $('#sceneTitle').select();
}
async function duplicateScene(id) {
  await saveNow();
  const src = state.items.find(i => i.id === id);
  const sc = newScene(state.project.id, src.parentId, src.order + 0.5, src.title + ' (copy)', src.content);
  await db.put('items', sc); state.items.push(sc);
  await loadScene(sc.id); toast('Scene duplicated');
}
async function trashItem(id) {
  await saveNow();
  const it = state.items.find(i => i.id === id);
  const now = Date.now();
  const changed = [it];
  it.deleted = true; it.deletedAt = now; touch(it);
  if (it.type === 'chapter') state.items.filter(s => s.parentId === id && !s.deleted).forEach(s => { s.deleted = true; s.deletedAt = now; s.deletedWith = id; touch(s); changed.push(s); });
  await db.writeBatch({ items: changed });
  const remaining = flatScenes(buildTree(state.items));
  if (!remaining.length) { const ch = sortedSiblings('chapter')[0]; if (ch) { await addScene(ch.id); } else { await addChapter(); } }
  else if (!state.scene || state.scene.deleted) await loadScene(remaining[0].id);
  renderBinder();
  toast(`“${it.title}” moved to Trash`, { label: 'Undo', run: async () => { for (const c of changed) { c.deleted = false; delete c.deletedAt; delete c.deletedWith; touch(c); } await db.writeBatch({ items: changed }); renderBinder(); } });
}
async function deleteProject() {
  const ok = await confirmSheet({ title: 'Move to Trash?', sub: `“${esc(state.project.title)}” will stay in Trash for 30 days. You can restore it from Settings.`, confirm: 'Move to Trash', danger: true });
  if (!ok) return;
  const p = state.project; p.deleted = true; p.deletedAt = Date.now(); touch(p);
  await db.put('projects', p);
  $('#workspace').hidden = true; $('#library').hidden = false; state.project = null;
  renderLibrary();
  toast(`“${p.title}” moved to Trash`, { label: 'Undo', run: async () => { p.deleted = false; delete p.deletedAt; touch(p); await db.put('projects', p); renderLibrary(); } });
}

// ---------- Drag to reorder (mouse + touch) ----------
function bindDrag() {
  $$('#binderList [data-grip]').forEach(g => g.addEventListener('pointerdown', startDrag));
}
function startDrag(e) {
  const row = e.currentTarget.closest('.row');
  const id = row.dataset.id, type = row.dataset.type;
  const list = $('#binderList');
  let line = null, target = null, started = false;
  const sx = e.clientX, sy = e.clientY;
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  const move = ev => {
    if (!started) { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return; started = true; row.classList.add('dragging'); haptic(6); }
    $$('.drop-into', list).forEach(x => x.classList.remove('drop-into'));
    if (line) line.remove(); line = null; target = null;
    const lr = list.getBoundingClientRect();
    if (ev.clientY < lr.top + 30) list.scrollTop -= 8; else if (ev.clientY > lr.bottom - 30) list.scrollTop += 8;
    const rows = $$(type === 'chapter' ? '.chapter-row' : '.row', list).filter(r => r !== row && r.dataset.id !== '__loose');
    let best = null, bestD = Infinity;
    for (const r of rows) { const rr = r.getBoundingClientRect(); const d = Math.abs(ev.clientY - (rr.top + rr.height / 2)); if (d < bestD) { bestD = d; best = r; } }
    if (!best) return;
    const rr = best.getBoundingClientRect();
    const after = ev.clientY > rr.top + rr.height / 2;
    if (type === 'scene' && best.dataset.type === 'chapter') { best.classList.add('drop-into'); target = { into: best.dataset.id }; return; }
    target = { id: best.dataset.id, after };
    const ref = type === 'chapter' && after ? best.closest('.chapter') : best;
    const rb = ref.getBoundingClientRect();
    line = el('<div class="drop-line"></div>');
    line.style.top = ((after ? rb.bottom : rb.top) - lr.top + list.scrollTop - 1) + 'px';
    list.style.position = 'relative'; list.appendChild(line);
  };
  const up = async () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    row.classList.remove('dragging'); if (line) line.remove();
    $$('.drop-into', list).forEach(x => x.classList.remove('drop-into'));
    if (!started || !target) return;
    const it = state.items.find(i => i.id === id);
    if (target.into) {
      const sibs = sortedSiblings('scene', target.into);
      it.parentId = target.into; it.order = (sibs.at(-1)?.order || 0) + 1;
    } else {
      const ref = state.items.find(i => i.id === target.id);
      const parent = type === 'scene' ? ref.parentId : null;
      const sibs = sortedSiblings(type, parent).filter(s => s.id !== id);
      const idx = sibs.findIndex(s => s.id === ref.id);
      const a = target.after ? sibs[idx] : sibs[idx - 1];
      const b = target.after ? sibs[idx + 1] : sibs[idx];
      it.order = a && b ? (a.order + b.order) / 2 : a ? a.order + 1 : b ? b.order - 1 : 1;
      if (type === 'scene') it.parentId = parent;
    }
    touch(it); await db.put('items', it); haptic(10);
    renderBinder(); updateCrumbs();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

// ---------- Editor ----------
const isMd = () => state.project && state.project.format === 'markdown';

async function loadScene(id) {
  await saveNow();
  const sc = state.items.find(i => i.id === id);
  if (!sc) return;
  state.scene = sc;
  db.setMeta('lastScene:' + state.project.id, id);
  $('#sceneTitle').value = sc.title || '';
  const ed = $('#editor'), md = $('#mdEditor');
  ed.hidden = isMd(); md.hidden = !isMd();
  if (isMd()) { md.value = htmlToMd(sc.content || ''); autoGrow(md); }
  else ed.innerHTML = sc.content || '';
  $$('#binderList .scene-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  updateCrumbs(); updateCounts();
  $('#scroller').scrollTop = 0;
  setSaveState(true);
  document.title = `${sc.title || 'Untitled'} — ${state.project.title}`;
}

function updateCrumbs() {
  if (!state.scene) return;
  const tree = buildTree(state.items);
  const ci = tree.findIndex(c => c.scenes.some(s => s.id === state.scene.id));
  const ch = tree[ci];
  const si = ch ? ch.scenes.findIndex(s => s.id === state.scene.id) : 0;
  $('#crumbChapter').textContent = ch ? ch.title : '';
  $('#crumbScene').textContent = state.scene.title || 'Untitled scene';
  $('#sceneKicker').innerHTML = ch ? `<span>Chapter ${ci + 1}</span><span class="k-dot"></span><span>Scene ${si + 1}</span>${state.scene.conflictOf ? '<span class="k-dot"></span><span style="color:var(--warn)">Conflicted copy</span>' : ''}` : '';
}

function currentHtml() { return isMd() ? mdToHtml($('#mdEditor').value) : sanitizeHtml($('#editor').innerHTML); }
function liveWords() { return isMd() ? countWords($('#mdEditor').value.replace(/[#>*_\-`]/g, ' ')) : countWords($('#editor').innerText); }

function updateCounts() {
  const w = state.scene ? liveWords() : 0;
  const others = state.items.filter(i => i.type === 'scene' && !i.deleted && i.id !== state.scene?.id).reduce((s, i) => s + (i.words || 0), 0);
  $('#sceneWords').textContent = num(w);
  $('#projWords').textContent = num(others + w);
  $('#projWords2').textContent = num(others + w);
}
function setSaveState(saved) {
  const s = $('#saveState'); if (!s) return;
  s.classList.toggle('pending', !saved);
  s.lastChild.textContent = saved ? 'Saved' : 'Saving…';
}

async function saveNow() {
  if (!state.dirty || !state.scene) return;
  state.dirty = false;
  const sc = state.scene;
  sc.content = currentHtml();
  sc.title = $('#sceneTitle').value.trim() || 'Untitled scene';
  sc.words = htmlWords(sc.content);
  touch(sc);
  state.project.lastEdited = Date.now();
  await db.writeBatch({ items: [sc], projects: [state.project] });
  setSaveState(true);
  const row = $(`#binderList .scene-row[data-id="${sc.id}"]`);
  if (row) { $('.r-title', row).textContent = sc.title; $('.r-count', row).textContent = num(sc.words); const ch = row.closest('.chapter'); if (ch) { const cid = ch.dataset.chapter; $('.chapter-row .r-count', ch).textContent = num(state.items.filter(i => i.type === 'scene' && !i.deleted && i.parentId === cid).reduce((s, i) => s + (i.words || 0), 0)); } }
}
const saveSoon = debounce(saveNow, 450);
const countSoon = debounce(updateCounts, 180);
function changed() { state.dirty = true; setSaveState(false); saveSoon(); countSoon(); }

function autoGrow(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

let typingTimer;
function markTyping() {
  if (!document.body.classList.contains('focus')) return;
  document.body.classList.add('typing');
  clearTimeout(typingTimer);
}
document.addEventListener('mousemove', () => { if (document.body.classList.contains('typing')) { clearTimeout(typingTimer); typingTimer = setTimeout(() => {}, 0); document.body.classList.remove('typing'); } });

function centerCaret() {
  if (!settings.typewriter) return;
  const sc = $('#scroller'); if (!sc) return;
  let rect;
  if (isMd()) return; // textarea: browser keeps caret in view
  const sel = getSelection(); if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0).cloneRange(); r.collapse(true);
  rect = r.getClientRects()[0];
  if (!rect) { const n = sel.anchorNode; const e = n && (n.nodeType === 1 ? n : n.parentElement); if (e && e.getBoundingClientRect) rect = e.getBoundingClientRect(); }
  if (!rect || (!rect.top && !rect.bottom)) return;
  const sr = sc.getBoundingClientRect();
  const target = sr.top + sc.clientHeight * 0.42;
  const delta = rect.top - target;
  if (Math.abs(delta) > 4) sc.scrollBy({ top: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function prevChars(n) {
  const ta = $('#mdEditor');
  if (isMd()) return ta.value.slice(Math.max(0, ta.selectionStart - n), ta.selectionStart);
  const sel = getSelection(); if (!sel.rangeCount) return '';
  const r = sel.getRangeAt(0);
  if (r.startContainer.nodeType !== 3) return '';
  return r.startContainer.nodeValue.slice(Math.max(0, r.startOffset - n), r.startOffset);
}
function smartPunct(e) {
  if (!settings.smart || e.inputType !== 'insertText' || !e.data) return;
  const d = e.data, prev = prevChars(2), p1 = prev.slice(-1);
  const opening = !p1 || /[\s(\[{—–"“‘ -]/.test(p1);
  let ins = null, del = 0;
  if (d === '"') ins = opening ? '“' : '”';
  else if (d === "'") ins = opening ? '‘' : '’';
  else if (d === '-' && p1 === '-') { ins = '—'; del = 1; }
  else if (d === '.' && prev === '..') { ins = '…'; del = 2; }
  if (!ins) return;
  e.preventDefault();
  for (let i = 0; i < del; i++) document.execCommand('delete');
  document.execCommand('insertText', false, ins);
}

function currentBlock() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  let n = sel.anchorNode; const ed = $('#editor');
  while (n && n.parentNode !== ed) n = n.parentNode;
  return n && n.nodeType === 1 ? n : null;
}
function stripMarker(block, len) {
  const tn = block.firstChild && block.firstChild.nodeType === 3 ? block.firstChild : null;
  if (!tn) return false;
  const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, Math.min(len, tn.length));
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  document.execCommand('delete');
  return true;
}
function markdownShortcuts(e) {
  if (e.inputType !== 'insertText') return;
  if (e.data === ' ') {
    const b = currentBlock(); if (!b) return;
    const t = b.textContent.replace(/ /g, ' ');
    const rules = [[/^#{1,2} $/, 'h2'], [/^#{3,6} $/, 'h3'], [/^> $/, 'blockquote'], [/^[-*] $/, 'ul'], [/^1[.)] $/, 'ol']];
    for (const [re, tag] of rules) {
      if (re.test(t) && b.tagName !== tag.toUpperCase()) {
        stripMarker(b, t.length);
        if (tag === 'ul') document.execCommand('insertUnorderedList');
        else if (tag === 'ol') document.execCommand('insertOrderedList');
        else document.execCommand('formatBlock', false, tag);
        return;
      }
    }
  }
  if (e.data === '*' || e.data === '_') {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0); const tn = r.startContainer;
    if (tn.nodeType !== 3) return;
    const before = tn.nodeValue.slice(0, r.startOffset);
    const m = before.match(/(\*\*|__)([^*_\n]+?)\1$/) || before.match(/(?:^|[^*_\w])(\*|_)([^*_\s][^*_\n]*?)\1$/);
    if (!m) return;
    const full = m[1] + m[2] + m[1];
    const start = r.startOffset - full.length;
    const rr = document.createRange(); rr.setStart(tn, start); rr.setEnd(tn, r.startOffset);
    sel.removeAllRanges(); sel.addRange(rr);
    const tag = m[1].length === 2 ? 'strong' : 'em';
    document.execCommand('insertHTML', false, `<${tag}>${esc(m[2])}</${tag}>&#8203;`);
  }
}

function bindEditor() {
  const ed = $('#editor'), md = $('#mdEditor'), title = $('#sceneTitle');
  ed.addEventListener('beforeinput', smartPunct);
  md.addEventListener('beforeinput', smartPunct);
  ed.addEventListener('input', e => { markdownShortcuts(e); changed(); markTyping(); requestAnimationFrame(centerCaret); });
  md.addEventListener('input', () => { autoGrow(md); changed(); markTyping(); });
  title.addEventListener('input', () => { changed(); $('#crumbScene').textContent = title.value || 'Untitled scene'; });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (isMd() ? md : ed).focus(); } });
  ed.addEventListener('keyup', e => { if (/Arrow|Page|Home|End/.test(e.key)) centerCaret(); });
  ed.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const b = currentBlock();
      if (b && /^\s*(\*\s*){3}$|^\s*-{3}\s*$/.test(b.textContent)) { e.preventDefault(); b.innerHTML = '<br>'; document.execCommand('insertHTML', false, '<hr><p><br></p>'); changed(); return; }
      if (b && /^H[23]$/.test(b.tagName)) { setTimeout(() => { const nb = currentBlock(); if (nb && /^H[23]$/.test(nb.tagName)) document.execCommand('formatBlock', false, 'p'); }); }
    }
  });
  ed.addEventListener('paste', e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? sanitizeHtml(html) : blocksToHtml(plainToBlocks(text)) || esc(text));
  });
  ed.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
}

function applyFormat(f) {
  if (isMd()) {
    const ta = $('#mdEditor'); ta.focus();
    const map = { bold: ['**', '**'], italic: ['*', '*'], heading: ['## ', ''], quote: ['> ', ''], list: ['- ', ''], break: ['\n* * *\n', ''] };
    const [a, b] = map[f]; const s = ta.selectionStart, en = ta.selectionEnd;
    const sel = ta.value.slice(s, en);
    if (b) document.execCommand('insertText', false, a + sel + b);
    else { const ls = ta.value.lastIndexOf('\n', s - 1) + 1; ta.setSelectionRange(ls, ls); document.execCommand('insertText', false, a); }
    return;
  }
  const ed = $('#editor'); ed.focus();
  const b = currentBlock();
  if (f === 'bold' || f === 'italic') document.execCommand(f);
  else if (f === 'heading') document.execCommand('formatBlock', false, b && b.tagName === 'H2' ? 'p' : 'h2');
  else if (f === 'quote') document.execCommand('formatBlock', false, b && b.tagName === 'BLOCKQUOTE' ? 'p' : 'blockquote');
  else if (f === 'list') document.execCommand('insertUnorderedList');
  else if (f === 'break') document.execCommand('insertHTML', false, '<hr><p><br></p>');
  changed();
}

function setFocusMode(on) {
  document.body.classList.toggle('focus', on);
  document.body.classList.remove('typing');
  const b = $('[data-act="focus"]'); if (b) b.classList.toggle('on', on);
  if (on) { toast('Focus mode. Move the mouse to see controls, press Esc to leave.', null, 2600); (isMd() ? $('#mdEditor') : $('#editor')).focus(); }
}

document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || $('#workspace').hidden) return;
  if (e.key === 's') { e.preventDefault(); state.dirty = true; saveNow().then(() => toast('Saved', null, 1400)); }
  if (e.key === '.') { e.preventDefault(); setFocusMode(!document.body.classList.contains('focus')); }
});
window.addEventListener('pagehide', () => { saveNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// ---------- Typography ----------
function typographyPanel(anchor) {
  const p = popover(anchor, `<div class="type-panel">
    <div><h4>Typeface</h4><div class="font-grid">${Object.entries(FONTS).map(([k, f]) => `<button class="font-opt ${settings.font === k ? 'on' : ''}" data-font="${k}"><span style="font-family:${f.css}">Aa</span><small>${f.name}</small></button>`).join('')}</div></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <h4>Page</h4>
      <label class="slider-row"><span>Size</span><input type="range" id="t-size" min="14" max="26" step="1" value="${settings.size}"><output>${settings.size}</output></label>
      <label class="slider-row"><span>Spacing</span><input type="range" id="t-lh" min="1.3" max="2.2" step="0.05" value="${settings.lh}"><output>${settings.lh.toFixed(2)}</output></label>
      <label class="slider-row"><span>Width</span><input type="range" id="t-width" min="480" max="900" step="20" value="${settings.width}"><output>${settings.width}</output></label>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${toggleRow('typewriter', 'Typewriter scrolling', 'Keep the line you’re writing centred')}
      ${toggleRow('indent', 'Book-style paragraphs', 'Indent instead of spacing')}
      ${toggleRow('smart', 'Smart punctuation', 'Curly quotes, em dashes, ellipses')}
    </div>
  </div>`, { cls: '' });
  const fillRange = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  $$('input[type=range]', p).forEach(r => {
    fillRange(r);
    r.oninput = () => {
      fillRange(r);
      const key = r.id.slice(2); settings[key] = +r.value;
      r.nextElementSibling.textContent = key === 'lh' ? (+r.value).toFixed(2) : r.value;
      applySettings();
    };
    r.onchange = saveSettings;
  });
  $$('.font-opt', p).forEach(b => b.onclick = () => { settings.font = b.dataset.font; $$('.font-opt', p).forEach(x => x.classList.toggle('on', x === b)); saveSettings(); });
  bindToggles(p);
}
const toggleRow = (key, label, sub) => `<div class="toggle-row"><div class="t-text"><b>${label}</b><span>${sub}</span></div><button class="switch" role="switch" aria-checked="${!!settings[key]}" data-toggle="${key}" aria-label="${label}"></button></div>`;
function bindToggles(root) {
  $$('[data-toggle]', root).forEach(b => b.onclick = () => { const k = b.dataset.toggle; settings[k] = !settings[k]; b.setAttribute('aria-checked', settings[k]); saveSettings(); haptic(5); });
}

// ---------- Project details ----------
function projectSheet() {
  const p = state.project;
  let cover = p.cover, format = p.format || 'rich';
  const s = sheet({
    title: 'Project details',
    body: `<div class="field"><label class="field-label" for="pd-title">Title</label><input class="input" id="pd-title" value="${esc(p.title)}" maxlength="120"></div>
      <div class="field"><label class="field-label" for="pd-sub">Subtitle</label><input class="input" id="pd-sub" value="${esc(p.subtitle || '')}" placeholder="Optional" maxlength="120"></div>
      <div class="field"><label class="field-label" for="pd-author">Author</label><input class="input" id="pd-author" value="${esc(p.author || '')}" maxlength="80"></div>
      <div class="field"><span class="field-label">Cover</span><div class="cover-picks">${COVERS.map((c, i) => `<button class="cover-pick ${i === cover ? 'on' : ''}" data-i="${i}" style="--cbg:${c.bg}" aria-label="${c.name}"></button>`).join('')}</div></div>
      <div class="field"><span class="field-label">Editor</span><div class="seg" id="pd-format"><button data-v="rich" class="${format === 'rich' ? 'on' : ''}">Rich text</button><button data-v="markdown" class="${format === 'markdown' ? 'on' : ''}">Markdown</button></div><span class="note" style="text-align:left">Rich text supports Markdown shortcuts too. Switching keeps your formatting.</span></div>`,
    foot: `<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-save>Save</button>`
  });
  $$('.cover-pick', s.wrap).forEach(b => b.onclick = () => { cover = +b.dataset.i; $$('.cover-pick', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $$('#pd-format button', s.wrap).forEach(b => b.onclick = () => { format = b.dataset.v; $$('#pd-format button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-c]', s.wrap).onclick = s.close;
  $('[data-save]', s.wrap).onclick = async () => {
    await saveNow();
    Object.assign(p, { title: $('#pd-title').value.trim() || 'Untitled project', subtitle: $('#pd-sub').value.trim(), author: $('#pd-author').value.trim(), cover, format });
    if (p.sample) p.sample = false;
    touch(p); await db.put('projects', p);
    s.close(); renderProjectHead();
    if (state.scene) await loadScene(state.scene.id);
    toast('Project updated');
  };
}

// ---------- Export ----------
function exportSheet() {
  let fmt = 'docx';
  const opts = { sceneTitles: false, pageSize: 'a4' };
  const formats = [
    ['docx', 'Word document', 'For editors, agents and Google Docs', '.docx'],
    ['pdf', 'PDF', 'Typeset, ready to read or print', '.pdf'],
    ['md', 'Markdown', 'Plain text with formatting marks', '.md'],
    ['inkfold', 'Inkfold project', 'Move this project to another device', '.inkfold'],
  ];
  const s = sheet({
    title: 'Export', sub: `Export “${esc(state.project.title)}” as a file you can share, submit or print.`,
    body: `<div class="formats">${formats.map(([k, t, d, e]) => `<button class="fmt-card ${k === fmt ? 'on' : ''}" data-f="${k}"><span class="ext">${e}</span><b>${t}</b><span>${d}</span></button>`).join('')}</div>
      <div class="group" id="ex-opts">
        ${`<div class="toggle-row"><div class="t-text"><b>Include scene titles</b><span>Otherwise scenes are separated by * * *</span></div><button class="switch" role="switch" aria-checked="false" id="ex-titles" aria-label="Include scene titles"></button></div>`}
        <div class="field" id="ex-page"><span class="field-label">Page size</span><div class="seg"><button data-p="a4" class="on">A4</button><button data-p="letter">US Letter</button></div></div>
      </div>`,
    foot: `<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-go>${icon('download')}Export</button>`
  });
  const refresh = () => { $('#ex-opts').hidden = fmt === 'inkfold'; $('#ex-page').hidden = fmt !== 'pdf'; };
  $$('.fmt-card', s.wrap).forEach(b => b.onclick = () => { fmt = b.dataset.f; $$('.fmt-card', s.wrap).forEach(x => x.classList.toggle('on', x === b)); refresh(); });
  $('#ex-titles').onclick = e => { opts.sceneTitles = !opts.sceneTitles; e.currentTarget.setAttribute('aria-checked', opts.sceneTitles); };
  $$('#ex-page button', s.wrap).forEach(b => b.onclick = () => { opts.pageSize = b.dataset.p; $$('#ex-page button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-c]', s.wrap).onclick = s.close;
  $('[data-go]', s.wrap).onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Preparing…';
    try {
      await saveNow();
      const r = fmt === 'inkfold' ? await io.exportProjectFile(state.project.id) : await io.exportProject(state.project.id, fmt, opts);
      s.close(); if (r !== 'cancelled') toast(r === 'shared' ? 'Exported' : 'Export saved to your downloads');
    } catch (err) { errorToast(err); btn.disabled = false; btn.innerHTML = `${icon('download')}Export`; }
  };
  refresh();
}

// ---------------------------------------------------------------- Import
function pickFile() { const fi = $('#fileInput'); fi.value = ''; fi.onchange = () => fi.files[0] && importFile(fi.files[0]); fi.click(); }

async function importFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'zip') return restoreFlow(file);
    if (ext === 'inkfold' || ext === 'json') {
      const { data, exists } = await io.readProjectFile(file);
      let mode = 'replace';
      if (exists) {
        mode = await new Promise(res => {
          let picked = null;
          const s = sheet({ title: 'This project is already here', sub: `“${esc(data.project.title)}” is already in your library. What should Inkfold do with the file?`,
            body: `<div class="split2"><button class="choice" data-m="replace"><div class="ci">${icon('restore')}</div><b>Replace</b><span>Use the file’s version. A snapshot is saved first.</span></button><button class="choice" data-m="copy"><div class="ci">${icon('copy')}</div><b>Keep both</b><span>Add the file as a separate copy.</span></button></div>`, foot: null, onClose: () => res(picked) });
          $$('[data-m]', s.wrap).forEach(b => b.onclick = () => { picked = b.dataset.m; s.close(); });
        });
        if (!mode) return;
      }
      const p = await io.importProjectData(data, mode);
      toast(`Imported “${p.title}”`); return openProject(p.id);
    }
    const p = await io.importDocument(file);
    toast(`Imported “${p.title}”`); openProject(p.id);
  } catch (e) { errorToast(e); }
}

// ---------------------------------------------------------------- Backups & Settings
async function doBackup() {
  try {
    const { dir, state: st } = await io.folderPermission();
    if (dir && (st === 'granted' || (await dir.requestPermission({ mode: 'readwrite' })) === 'granted')) { await io.writeFolderBackup(dir); toast(`Backed up to “${dir.name}”`); }
    else { const r = await io.backupDownload(); if (r === 'cancelled') return; toast('Backup saved'); }
    if (!$('#library').hidden) renderLibrary();
  } catch (e) { errorToast(e); }
}

async function restoreFlow(file) {
  try {
    const data = await io.readBackup(file);
    const n = data.projects.filter(p => !p.deleted).length;
    const s = sheet({ title: 'Restore backup', sub: `This backup has ${n} project${n === 1 ? '' : 's'}, saved ${ago(data.exportedAt)}. A snapshot of your current library is taken first, so you can undo this.`,
      body: `<div class="split2"><button class="choice" data-m="merge"><div class="ci">${icon('layers')}</div><b>Merge</b><span>Add what’s missing and keep your newer changes.</span></button><button class="choice" data-m="replace"><div class="ci">${icon('restore')}</div><b>Replace everything</b><span>Make this device match the backup exactly.</span></button></div>`, foot: null });
    $$('[data-m]', s.wrap).forEach(b => b.onclick = async () => {
      s.close();
      const summary = await io.restoreBackup(data, b.dataset.m);
      toast(summary ? `Backup merged · ${sync.describeSummary(summary)}` : 'Library restored from backup');
      refreshAfterDataChange();
    });
  } catch (e) { errorToast(e); }
}

async function refreshAfterDataChange() {
  if (state.project && !$('#workspace').hidden) { state.dirty = false; return openProject(state.project.id, state.scene && state.scene.id); }
  renderLibrary();
}

async function settingsSheet(focus) {
  const [lastBackup, folder, snaps, projects, items, est, persisted, lastSync] = await Promise.all([
    db.meta('lastBackup'), io.folderPermission().catch(() => ({ state: 'none' })), db.all('snapshots'), db.all('projects'), db.all('items'),
    navigator.storage?.estimate?.().catch(() => null), navigator.storage?.persisted?.().catch(() => false), db.meta('lastSync', {})
  ]);
  const trashP = projects.filter(p => p.deleted);
  const trashI = items.filter(i => i.deleted && !i.deletedWith && !(projects.find(p => p.id === i.projectId) || {}).deleted);
  const pname = id => (projects.find(p => p.id === id) || {}).title || '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const mb = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

  const s = sheet({ title: 'Settings', wide: true, foot: null, body: `
    <div class="group"><div class="group-title">Appearance</div>
      <div class="seg" id="st-theme">${[['system', 'Match device'], ['dark', 'Ink'], ['light', 'Paper']].map(([k, l]) => `<button data-v="${k}" class="${settings.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="group" id="st-data"><div class="group-title">Keep your writing safe</div>
      <div class="card-list">
        <div class="li"><div class="li-icon">${icon('shield')}</div><div class="li-text"><b>${lastBackup ? 'Last backup ' + ago(lastBackup.at) : 'No backups yet'}</b><span>${lastBackup?.where === 'folder' ? 'Saved to your backup folder' : 'A ZIP of every project, to keep anywhere'}</span></div><button class="btn btn-primary btn-sm" data-a="backup">Back up now</button></div>
        <div class="li"><div class="li-icon">${icon('restore')}</div><div class="li-text"><b>Restore from backup</b><span>Merge or replace using a backup ZIP</span></div><button class="btn btn-quiet btn-sm" data-a="restore">Choose file</button></div>
        ${io.folderBackupSupported() ? `<div class="li"><div class="li-icon">${icon('folder')}</div><div class="li-text"><b>${folder.dir ? `Auto-backup to “${esc(folder.dir.name)}”` : 'Automatic folder backups'}</b><span>${folder.dir ? 'A fresh backup is saved each day you open Inkfold' : 'Save a daily backup to a folder like Documents or Google Drive'}</span></div><button class="btn btn-quiet btn-sm" data-a="folder">${folder.dir ? 'Change' : 'Choose folder'}</button></div>` : ''}
        <div class="li"><div class="li-icon">${icon('layers')}</div><div class="li-text"><b>${persisted ? 'Protected storage is on' : 'Storage not yet protected'}</b><span>${persisted ? 'Your browser won’t clear Inkfold to free up space' : 'Install Inkfold so your browser keeps its data'}${est ? ` · ${mb(est.usage || 0)} used` : ''}</span></div>${persisted ? '' : `<button class="btn btn-quiet btn-sm" data-a="persist">Protect</button>`}</div>
        ${!standalone ? `<div class="li"><div class="li-icon">${icon('install')}</div><div class="li-text"><b>Install Inkfold</b><span>Opens like an app, works offline, safer storage</span></div><button class="btn btn-quiet btn-sm" data-a="install">Install</button></div>` : ''}
      </div>
    </div>
    <div class="group"><div class="group-title">Snapshots</div>
      <div class="card-list">${snaps.length ? snaps.sort((a, b) => b.createdAt - a.createdAt).map(sn => `<div class="li"><div class="li-icon">${icon('clock')}</div><div class="li-text"><b>${esc(sn.reason)}</b><span>${ago(sn.createdAt)} · ${sn.counts.projects} projects, ${sn.counts.scenes} scenes</span></div><button class="btn btn-ghost btn-sm" data-snap="${sn.id}">Restore</button></div>`).join('') : `<div class="empty-note">Inkfold saves a snapshot automatically before every sync, import and restore.</div>`}</div>
    </div>
    <div class="group"><div class="group-title">Trash</div>
      <div class="card-list">${trashP.length + trashI.length ? [...trashP.map(p => ({ id: p.id, kind: 'project', title: p.title, sub: 'Project', at: p.deletedAt })), ...trashI.map(i => ({ id: i.id, kind: 'item', title: i.title, sub: `${i.type === 'chapter' ? 'Chapter' : 'Scene'} in ${pname(i.projectId)}`, at: i.deletedAt }))]
        .sort((a, b) => b.at - a.at).map(t => `<div class="li"><div class="li-icon">${icon(t.kind === 'project' ? 'book' : 'file')}</div><div class="li-text"><b>${esc(t.title)}</b><span>${esc(t.sub)} · deleted ${ago(t.at)}</span></div><button class="btn btn-ghost btn-sm" data-untrash="${t.kind}:${t.id}">Restore</button><button class="icon-btn" data-purge="${t.kind}:${t.id}" aria-label="Delete forever">${icon('x')}</button></div>`).join('')
        : `<div class="empty-note">Trash is empty. Deleted items stay here for 30 days.</div>`}</div>
    </div>
    <div class="group"><div class="group-title">This device</div>
      <div class="field"><label class="field-label" for="st-name" style="margin:0">Name shown when syncing</label><input class="input" id="st-name" value="${esc(state.device.name)}" maxlength="40"></div>
      ${Object.keys(lastSync).length ? `<div class="card-list">${Object.values(lastSync).sort((a, b) => b.at - a.at).map(x => `<div class="li"><div class="li-icon">${icon('sync')}</div><div class="li-text"><b>${esc(x.name)}</b><span>Last synced ${ago(x.at)}</span></div></div>`).join('')}</div>` : ''}
    </div>
    <p class="note">Inkfold ${VERSION} · Everything is stored on this device. No accounts, no tracking.</p>` });

  if (focus === 'data') setTimeout(() => $('#st-data', s.wrap).scrollIntoView({ block: 'start' }), 80);
  $$('#st-theme button', s.wrap).forEach(b => b.onclick = () => { settings.theme = b.dataset.v; $$('#st-theme button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); saveSettings(); });
  $('#st-name', s.wrap).onchange = async e => { state.device.name = e.target.value.trim() || state.device.name; await db.setMeta('deviceName', state.device.name); };
  s.body.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    try {
      if (a === 'backup') { await doBackup(); s.close(); settingsSheet('data'); }
      else if (a === 'restore') { const fi = $('#fileInput'); fi.value = ''; fi.onchange = () => { if (fi.files[0]) { s.close(); restoreFlow(fi.files[0]); } }; fi.click(); }
      else if (a === 'folder') { const d = await io.chooseBackupFolder(); toast(`Backups will be saved to “${d.name}”`); s.close(); settingsSheet('data'); }
      else if (a === 'persist') { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected' : 'Your browser decides this. Installing Inkfold usually turns it on.'); s.close(); settingsSheet('data'); }
      else if (a === 'install') { s.close(); installApp(); }
    } catch (err) { if (err.name !== 'AbortError') errorToast(err); }
    const snap = e.target.closest('[data-snap]');
    if (snap) {
      const sn = snaps.find(x => x.id === snap.dataset.snap);
      if (await confirmSheet({ title: 'Restore this snapshot?', sub: `Your library goes back to how it was ${ago(sn.createdAt)}. Your current library is saved as a snapshot first.`, confirm: 'Restore' })) {
        await db.snapshot('Before restoring a snapshot'); await db.replaceAll(sn.data); s.close(); toast('Snapshot restored'); refreshAfterDataChange();
      }
    }
    const un = e.target.closest('[data-untrash]');
    if (un) { await untrash(un.dataset.untrash); s.close(); settingsSheet(); refreshAfterDataChange(); }
    const pg = e.target.closest('[data-purge]');
    if (pg && await confirmSheet({ title: 'Delete forever?', sub: 'This can’t be undone, and it will also be removed from devices you sync with.', confirm: 'Delete forever', danger: true })) { await purge(pg.dataset.purge); s.close(); settingsSheet(); }
  };
}

async function untrash(key) {
  const [kind, id] = key.split(':');
  if (kind === 'project') { const p = await db.get('projects', id); p.deleted = false; delete p.deletedAt; touch(p); await db.put('projects', p); return; }
  const items = await db.all('items');
  const it = items.find(i => i.id === id);
  const batch = [it];
  if (it.type === 'chapter') items.filter(i => i.deletedWith === id).forEach(i => batch.push(i));
  if (it.type === 'scene') { const parent = items.find(i => i.id === it.parentId); if (parent && parent.deleted) { parent.deleted = false; delete parent.deletedAt; touch(parent); batch.push(parent); } }
  batch.forEach(i => { i.deleted = false; delete i.deletedAt; delete i.deletedWith; touch(i); });
  await db.writeBatch({ items: batch });
}
async function purge(key) {
  const [kind, id] = key.split(':');
  const now = Date.now();
  if (kind === 'project') {
    const items = await db.byProject(id);
    await db.writeBatch({ deleteProjects: [id], deleteItems: items.map(i => i.id), tombstones: [{ id, at: now }, ...items.map(i => ({ id: i.id, at: now }))] });
  } else {
    const items = await db.all('items');
    const ids = [id, ...items.filter(i => i.deletedWith === id).map(i => i.id)];
    await db.writeBatch({ deleteItems: ids, tombstones: ids.map(x => ({ id: x, at: now })) });
  }
}
async function purgeOldTrash() {
  const cutoff = Date.now() - 30 * 864e5;
  const [projects, items] = await Promise.all([db.all('projects'), db.all('items')]);
  for (const p of projects) if (p.deleted && p.deletedAt < cutoff) await purge('project:' + p.id);
  for (const i of items) if (i.deleted && !i.deletedWith && i.deletedAt < cutoff) await purge('item:' + i.id);
}

// ---------------------------------------------------------------- Nearby Sync
function syncSheet() {
  let cleanup = null, scanStop = null, mode = 'code';
  const s = sheet({ title: 'Nearby Sync', sub: 'Sync your library with another device. Your writing goes straight from one device to the other and is never stored online.', foot: null,
    onClose: () => { cleanup && cleanup(); scanStop && scanStop(); } });
  const body = s.body;

  const handlers = {
    onStatus: msg => { const sl = $('#sync-status', body); if (sl) sl.innerHTML = `<span class="spinner"></span><span>${esc(msg)}</span>`; else progress(msg); },
    onError: e => { console.error(e); haptic(30); view(`<div class="sync-big"><div class="done-mark" style="background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)">${icon('x')}</div><b style="font-size:16px">Couldn’t sync</b><p class="note" style="max-width:40ch">${esc(e.message || 'The connection dropped.')} Make sure both devices are on the same Wi-Fi and have Inkfold open.</p><button class="btn btn-quiet" data-back>Try again</button></div>`); },
    onDone: (summary, peer) => {
      haptic([10, 40, 10]);
      view(`<div class="sync-big"><div class="done-mark">${icon('check')}</div><b style="font-size:18px">Synced with ${esc(peer.name)}</b><p class="note">${esc(sync.describeSummary(summary))}</p>
        ${summary.conflicts.length ? `<div class="card" style="text-align:left;width:100%"><b style="font-size:14px">Edited on both devices</b><p class="note" style="text-align:left;margin:4px 0 8px">Both versions were kept. Look for “conflicted copy” in the binder and keep the one you want.</p>${summary.conflicts.map(c => `<div style="font-size:13.5px;padding:4px 0">• ${esc(c.title)}</div>`).join('')}</div>` : ''}
        <button class="btn btn-primary" data-finish>Done</button></div>`);
      $('[data-finish]', body).onclick = () => s.close();
      refreshAfterDataChange();
    }
  };
  const view = html => { body.innerHTML = html; const b = $('[data-back]', body); if (b) b.onclick = () => { cleanup && cleanup(); cleanup = null; home(); }; };
  const progress = msg => view(`<div class="sync-big" style="padding:30px 0"><div class="status-line" id="sync-status"><span class="spinner"></span><span>${esc(msg)}</span></div></div>`);
  const tabs = () => `<div class="seg" id="sync-mode"><button data-m="code" class="${mode === 'code' ? 'on' : ''}">${'Pairing code'}</button><button data-m="offline" class="${mode === 'offline' ? 'on' : ''}">Offline (QR)</button></div>`;

  function home() {
    if (mode === 'code') {
      view(`${tabs()}<div class="split2">
        <button class="choice" data-a="show"><div class="ci">${icon('phone')}</div><b>Show a code</b><span>On this device. Then type the code on the other one.</span></button>
        <button class="choice" data-a="enter"><div class="ci">${icon('edit')}</div><b>Enter a code</b><span>The other device is already showing a code.</span></button></div>
        <p class="note">Both devices need internet for a second to find each other. Your writing then travels directly over your Wi-Fi.</p>`);
    } else {
      view(`${tabs()}<div class="split2">
        <button class="choice" data-a="ostart"><div class="ci">${icon('qr')}</div><b>Start here</b><span>Show a QR code for the other device to scan.</span></button>
        <button class="choice" data-a="ojoin"><div class="ci">${icon('camera')}</div><b>Join</b><span>Scan the QR code the other device is showing.</span></button></div>
        <p class="note">Works with no internet at all. Both devices must be on the same Wi-Fi. No camera? Copy and paste the codes instead.</p>`);
    }
    $$('#sync-mode button', body).forEach(b => b.onclick = () => { mode = b.dataset.m; home(); });
  }
  body.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    try {
      if (a === 'show') {
        const code = sync.newCode();
        view(`<div class="sync-big"><p class="note">On your other device open Inkfold → Nearby Sync → Enter a code</p><div class="code-display">${code.slice(0, 3)} ${code.slice(3)}</div><div class="status-line" id="sync-status"><span class="spinner"></span><span>Getting ready…</span></div><button class="btn btn-ghost btn-sm" data-back>Cancel</button></div>`);
        cleanup = await sync.hostWithCode(code, handlers);
      } else if (a === 'enter') {
        view(`<div class="sync-big"><p class="note">Type the code shown on your other device</p><input class="input code-input" id="sync-code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC 123" autofocus><div style="display:flex;gap:8px"><button class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary" data-a="connect">Connect</button></div></div>`);
        const inp = $('#sync-code', body); inp.focus();
        inp.oninput = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); inp.value = v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v; };
        inp.onkeydown = ev => { if (ev.key === 'Enter') $('[data-a="connect"]', body).click(); };
      } else if (a === 'connect') {
        const code = $('#sync-code', body).value.replace(/\s/g, '');
        if (code.length !== 6) return toast('The code has 6 characters');
        progress('Finding your other device…');
        cleanup = await sync.joinWithCode(code, handlers);
      } else if (a === 'ostart') {
        progress('Preparing a pairing code…');
        const session = await sync.offlineStart(handlers);
        cleanup = () => session.close();
        await showCode(session.code, 'Scan this with your other device (Nearby Sync → Offline → Join).', 'Then scan the reply code it shows.', async reply => { progress('Connecting over Wi-Fi…'); await session.acceptReply(reply); });
      } else if (a === 'ojoin') {
        await askForCode('Scan the QR code on your other device', async offer => {
          progress('Creating a reply code…');
          const session = await sync.offlineJoin(offer, handlers);
          cleanup = () => session.close();
          await showCode(session.code, 'Now scan this reply on the first device.', 'Waiting for the first device to connect…', null);
        });
      }
    } catch (err) { handlers.onError(err); }
  });

  async function showCode(code, line1, line2, onReply) {
    const qrcode = await loadLib(LIBS.qrcode).catch(() => null);
    let qr = '';
    if (qrcode) {
      const q = qrcode(0, 'L'); q.addData(code); q.make();
      const n = q.getModuleCount(); let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      qr = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-label="Pairing QR code"><path d="${d}" fill="#0d1017"/></svg>`;
    }
    view(`<div class="sync-big">${qr ? `<div class="qr">${qr}</div>` : ''}<p class="note" style="max-width:40ch">${esc(line1)}</p>
      <button class="btn btn-quiet btn-sm" data-copy>${icon('copy')}Copy code instead</button>
      ${onReply ? `<div style="width:100%;display:flex;flex-direction:column;gap:10px;margin-top:6px"><div class="status-line">${esc(line2)}</div><div style="display:flex;gap:8px;justify-content:center"><button class="btn btn-primary" data-scanreply>${icon('camera')}Scan reply</button><button class="btn btn-quiet" data-pastereply>Paste reply</button></div></div>`
      : `<div class="status-line" id="sync-status"><span class="spinner"></span><span>${esc(line2)}</span></div>`}
      <button class="btn btn-ghost btn-sm" data-back>Cancel</button></div>`);
    $('[data-copy]', body).onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Code copied. Send it to your other device.'); } catch { pasteBox(code, true); } };
    if (onReply) {
      $('[data-scanreply]', body).onclick = () => askForCode('Scan the reply code', onReply, true);
      $('[data-pastereply]', body).onclick = () => askForCode('Paste the reply code', onReply, false);
    }
  }
  function pasteBox(code, readonly) {
    const box = el(`<textarea class="input" ${readonly ? 'readonly' : ''}>${esc(code)}</textarea>`);
    body.querySelector('.sync-big').insertBefore(box, $('[data-back]', body)); box.select();
  }
  async function askForCode(title, onCode, camera = true) {
    scanStop && scanStop();
    view(`<div class="sync-big"><b style="font-size:15px">${esc(title)}</b>
      ${camera ? `<div class="scan-box"><video playsinline muted></video></div>` : ''}
      <textarea class="input" id="code-paste" placeholder="${camera ? 'Or paste the code here' : 'Paste the code here'}"></textarea>
      <div style="display:flex;gap:8px"><button class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary" data-use>Continue</button></div></div>`);
    let done = false;
    const go = async v => { if (done) return; done = true; scanStop && scanStop(); try { await onCode(v); } catch (err) { handlers.onError(err); } };
    $('[data-use]', body).onclick = () => { const v = $('#code-paste', body).value.trim(); if (v) go(v); };
    if (!camera) return;
    try {
      const jsQR = await loadLib(LIBS.jsqr);
      const video = $('video', body);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream; await video.play();
      const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
      let alive = true;
      scanStop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); scanStop = null; };
      const tick = () => {
        if (!alive) return;
        if (video.videoWidth) {
          const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w);
          cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
          const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (r && /^IF1[OA]/.test(r.data)) { haptic(15); return go(r.data); }
        }
        setTimeout(tick, 160);
      };
      tick();
    } catch (err) {
      const sb = $('.scan-box', body); if (sb) sb.remove();
      toast('Camera unavailable. Paste the code instead.');
    }
  }
  home();
}

// ---------------------------------------------------------------- Install, storage, updates
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installEvt = e; if (!$('#library').hidden) renderLibrary(); });
window.addEventListener('appinstalled', () => { state.installEvt = null; toast('Inkfold is installed'); navigator.storage?.persist?.(); if (!$('#library').hidden) renderLibrary(); });
async function installApp() {
  if (state.installEvt) { state.installEvt.prompt(); await state.installEvt.userChoice; state.installEvt = null; return renderLibrary(); }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  sheet({ title: 'Install Inkfold', sub: 'Installed, Inkfold opens like an app, works fully offline, and your browser is far less likely to clear its data.', foot: null,
    body: ios ? `<ol class="steps"><li>Tap the Share button in Safari’s toolbar.</li><li>Scroll down and tap “Add to Home Screen”.</li><li>Tap “Add”. Open Inkfold from your Home Screen from now on.</li></ol>`
      : `<ol class="steps"><li>Open your browser’s menu (⋮ or ⋯).</li><li>Choose “Install app” or “Add to Home screen”.</li><li>Open Inkfold from your apps from now on.</li></ol><p class="note">Chrome and Edge support installing. In Firefox on desktop, pin the tab instead.</p>` });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const prompt = w => toast('A new version of Inkfold is ready', { label: 'Update', run: () => w.postMessage('skipWaiting') }, 0);
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(e => console.warn('SW', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; saveNow().finally(() => location.reload()); });
}

async function autoFolderBackup() {
  try {
    const last = await db.meta('lastBackup');
    if (last && new Date(last.at).toDateString() === new Date().toDateString()) return;
    const { dir, state: st } = await io.folderPermission();
    if (dir && st === 'granted') { await io.writeFolderBackup(dir); }
  } catch (e) { console.warn('auto backup', e); }
}

// ---------------------------------------------------------------- Boot
async function boot() {
  try {
    settings = { ...DEFAULTS, ...(await db.meta('settings', {})) };
    applySettings();
    state.device = await deviceInfo();
    if (!(await db.meta('seeded'))) { await seedSample(); await db.setMeta('seeded', true); }
    if (!(await db.meta('askedPersist'))) { await db.setMeta('askedPersist', true); navigator.storage?.persist?.().catch(() => {}); }
    await purgeOldTrash();
    await autoFolderBackup();
    await renderLibrary();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui;max-width:520px;margin:auto"><h2>Inkfold couldn’t open its storage</h2><p>This browser may be blocking site storage (private browsing does this). Open Inkfold in a normal window.</p></div>`;
  } finally {
    const sp = $('#splash'); if (sp) { sp.classList.add('gone'); setTimeout(() => sp.remove(), 600); }
  }
  registerSW();
}
boot();
