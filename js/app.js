// Inkfold — app
import { db, deviceInfo } from './db.js';
import { COVERS, buildTree, flatScenes, newProjectRecord, newChapter, newScene, seedSample, projectStats, touch, createProjectFrom, STATUSES, LABELS, statusOf, labelOf } from './model.js';
import * as stats from './stats.js';
import * as sound from './sound.js';
import { initBoard, renderBoard, renderOutline, sceneDetails, labelMenu } from './board.js';
import { initBible, renderBible, nameIndex, nameRegex, hoverCardFor, hideHover, relSheet, KINDS } from './bible.js';
import * as revise from './revise.js';
import { MODES, modeOf, T, poetryEnter, renderSyllables, MOODS, moodFace, entryFor, renderCalendar, resetCalendar, dateKey } from './modes.js';
import * as sp from './screenplay.js';
import { initTimeline, renderTimeline, whenSheet, whenLabel } from './timeline.js';
import { compileSheet } from './compile.js';
import * as sec from './security.js';
import { openPalette, paletteOpen, closePalette, shortcutsSheet } from './palette.js';
import { sanitizeHtml, htmlWords, htmlToMd, mdToHtml, countWords, blocksToHtml, plainToBlocks, htmlToBlocks, imgHtml, htmlToText } from './text.js';
import * as io from './io.js';
import { compressImage, newImageItem, hydrateImages, IMG_SIZES } from './images.js';
import * as series from './series.js';
import { computeExp, EXP_RULES } from './level.js';
import { initMaps, renderMaps, scenePlaceSheet, castSheet, castCount, placeName, showOnMap, allMaps } from './maps.js';
import * as sync from './sync.js';
import { loadLib, LIBS } from './libs.js';
import { ICONS, icon, MARK, $, $$, esc, num, el, debounce, ago, haptic, toast, errorToast, closePop, popOpen, popover, menu, sheets, sheet, confirmSheet, pickFiles } from './ui.js';

const VERSION = '1.5.6';

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (popOpen()) return closePop();
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
const DEFAULTS = { theme: 'light', font: 'newsreader', size: 19, lh: 1.7, width: 680, typewriter: true, smart: true, indent: false, dim: 'off', dailyGoal: 500, volume: 0.5, revRound: 0, showRev: true, nameHints: true, darkTheme: 'dark', syllables: true };
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
  const dark = isDark();
  $$('[data-act="theme"]').forEach(b => { b.innerHTML = icon(dark ? 'sun' : 'moon'); b.title = dark ? 'Switch to Paper (light)' : 'Switch to Ink (dark)'; b.setAttribute('aria-label', b.title); });
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (dark ? '#0d1017' : '#eff0ec')));
  applyDim();
}
const DARK_THEMES = ['dark', 'midnight', 'sepia', 'oled'];
const THEMES = [['light', 'Paper', '#eff0ec', '#fafbf8', '#2a7865'], ['dark', 'Ink', '#0d1017', '#151a24', '#86cdb9'], ['midnight', 'Midnight', '#0b1020', '#141c36', '#8fb4ff'], ['sepia', 'Sepia Night', '#17120d', '#241c14', '#e0a95a'], ['oled', 'OLED Black', '#000000', '#0c0c0c', '#86cdb9'], ['system', 'Match device', '#eff0ec', '#0d1017', '#2a7865']];
const isDark = () => DARK_THEMES.includes(settings.theme) || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
function toggleTheme() {
  document.documentElement.classList.add('theme-fade');
  if (DARK_THEMES.includes(settings.theme)) settings.darkTheme = settings.theme;
  settings.theme = isDark() ? 'light' : (settings.darkTheme || 'dark');
  saveSettings(); haptic(6);
  setTimeout(() => document.documentElement.classList.remove('theme-fade'), 500);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings());
async function saveSettings() { await db.setMeta('settings', settings); applySettings(); }

// Progress ring (0..1+), drawn as SVG
function ring(p, size = 28, stroke = 3) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p || 0));
  return `<svg class="ring ${v >= 1 ? 'done' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-fg" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>${v >= 1 ? `<path d="M${size * .34} ${size * .52}l${size * .11} ${size * .11} ${size * .2}-${size * .22}" fill="none" stroke-width="${stroke * .8}" stroke-linecap="round" stroke-linejoin="round" class="ring-check"/>` : ''}</svg>`;
}

// ---------------------------------------------------------------- State
const state = { projects: [], project: null, series: null, items: [], scene: null, dirty: false, installEvt: null, device: null, view: 'write', sprint: null, today: 0 };

// ---------------------------------------------------------------- Library
async function renderLibrary() {
  document.title = 'Inkfold';
  const lib = $('#library');
  const everything = (await db.all('projects')).filter(p => !p.deleted);
  const seriesList = everything.filter(series.isSeries).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const projects = everything.filter(p => !series.isSeries(p))
    .sort((a, b) => (b.lastEdited || b.updatedAt) - (a.lastEdited || a.updatedAt));
  state.projects = projects;
  const pstats = await Promise.all(projects.map(p => projectStats(p.id)));
  const total = pstats.reduce((s, x) => s + x.words, 0);
  const sum = await stats.summary(settings.dailyGoal);
  const xp = computeExp(sum.byDay);
  noteLevel(xp, false);
  const welcome = await lastPlace(projects);
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
        <button class="icon-btn" data-act="stats" title="Goals & stats" aria-label="Goals and stats">${icon('chart')}</button>
        <button class="icon-btn" data-act="sync" title="Nearby Sync" aria-label="Nearby Sync">${icon('sync')}</button>
        <button class="icon-btn" data-act="theme"></button>
        <button class="icon-btn" data-act="settings" title="Settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </header>
    <section class="lib-hero">
      <div>
        <div class="eyebrow">Your library</div>
        <h1>${welcome ? `${greeting()}, <em>welcome back.</em>` : projects.length ? 'Pick up <em>where you left off.</em>' : 'Every book starts <em>on a blank page.</em>'}</h1>
        <div class="sum tnum">${projects.length} project${projects.length === 1 ? '' : 's'} · ${num(total)} words in your manuscripts</div>
      </div>
      <div class="lib-hero-actions">
        <button class="btn btn-quiet" data-act="import">${icon('upload')}Import</button>
        <button class="btn btn-quiet" data-act="new-series">${icon('stack')}New series</button>
        <button class="btn btn-primary" data-act="new">${icon('plus')}New project</button>
      </div>
    </section>
    ${welcomeHtml(welcome, sum, xp)}
    ${banner}
    ${seriesList.map(sr => {
      const books = projects.map((p, i) => ({ p, st: pstats[i] })).filter(x => x.p.seriesId === sr.id).sort((a, b) => (a.p.seriesOrder ?? 1e9) - (b.p.seriesOrder ?? 1e9) || (a.p.createdAt || 0) - (b.p.createdAt || 0));
      const words = books.reduce((n, x) => n + x.st.words, 0);
      return `<section class="series-block">
        <div class="series-head"><span class="series-ic">${icon('stack')}</span><div class="sh-text"><span class="eyebrow">Series</span><h2>${esc(sr.title)}</h2><span class="tnum">${books.length} book${books.length === 1 ? '' : 's'} · ${num(words)} words · shared characters, places and lore</span></div><button class="btn btn-quiet btn-sm" data-series="${sr.id}">${icon('edit')}<span class="hide-narrow">Manage</span></button></div>
        <div class="shelf">${books.map(x => coverHtml(x.p, x.st, books.indexOf(x) + 1)).join('')}
          <button class="book" data-series-add="${sr.id}" aria-label="Add a book to ${esc(sr.title)}"><div class="cover new"><div class="plus">${icon('plus')}</div><b>Add a book</b></div><div class="b-meta"><span>&nbsp;</span></div></button></div>
      </section>`;
    }).join('')}
    ${seriesList.length ? `<div class="shelf-label"><span class="eyebrow">Standalone books</span></div>` : ''}
    <section class="shelf">
      ${projects.map((p, i) => ({ p, st: pstats[i] })).filter(x => !x.p.seriesId || !seriesList.some(sr => sr.id === x.p.seriesId)).map(x => coverHtml(x.p, x.st)).join('')}
      <button class="book" data-act="new" aria-label="New project"><div class="cover new"><div class="plus">${icon('plus')}</div><b>New project</b></div><div class="b-meta"><span>&nbsp;</span></div></button>
    </section>
    <footer class="lib-foot"><span>${icon('shield')}Private and offline. Your writing never leaves this device unless you sync or export it.</span><span>Inkfold ${VERSION}</span></footer>
  </div>`;

  applySettings();
  lib.onclick = async e => {
    const b = e.target.closest('[data-act], [data-open], [data-series], [data-series-add]');
    if (!b) return;
    if (b.dataset.open) return openProject(b.dataset.open, b.dataset.scene || undefined);
    if (b.dataset.series) return seriesSheet(b.dataset.series);
    if (b.dataset.seriesAdd) return seriesSheet(b.dataset.seriesAdd, true);
    const a = b.dataset.act;
    if (a === 'new') newProjectSheet();
    else if (a === 'new-series') seriesSheet(null);
    else if (a === 'import') pickFile();
    else if (a === 'settings') settingsSheet();
    else if (a === 'sync') syncSheet();
    else if (a === 'install') installApp();
    else if (a === 'backup') doBackup();
    else if (a === 'backup-status') settingsSheet('data');
    else if (a === 'stats') statsSheet();
    else if (a === 'level') levelSheet();
    else if (a === 'theme') toggleTheme();
    else if (a === 'folder-grant') {
      try { const { dir } = await io.folderPermission(); if ((await dir.requestPermission({ mode: 'readwrite' })) === 'granted') { await io.writeFolderBackup(dir); toast('Backed up to your folder'); renderLibrary(); } }
      catch (err) { errorToast(err); }
    }
  };
}

// ---------- Welcome back ----------
const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
// The scene you were last writing, with the last lines of it
async function lastPlace(projects) {
  const pid = await db.meta('lastProject');
  const p = projects.find(x => x.id === pid) || projects.filter(x => !x.sample).sort((a, b) => (b.lastEdited || 0) - (a.lastEdited || 0))[0];
  if (!p || (p.sample && !p.lastEdited)) return null;
  const sid = await db.meta('lastScene:' + p.id);
  const locked = p.enc && !sec.isUnlocked(p.id);
  let sc = sid ? await db.get('items', sid) : null;
  if (!sc || sc.deleted || sc.projectId !== p.id) sc = null;
  let excerpt = '';
  if (sc && !locked) {
    const text = htmlToText(sc.content || '').replace(/\s+/g, ' ').trim();
    if (text.length > 260) { const cut = text.slice(-260); excerpt = '…' + cut.slice(cut.indexOf(' ') + 1); } else excerpt = text;
  }
  return { p, sc, excerpt, locked, at: (sc && sc.updatedAt) || p.lastEdited || p.updatedAt };
}
function welcomeHtml(w, sum, xp) {
  const goal = settings.dailyGoal;
  const tiles = `<div class="wb-stats">
      <button class="wb-tile" data-act="stats">${ring(sum.today / goal, 44, 4)}<span><b class="tnum">${num(sum.today)}<small> / ${num(goal)}</small></b><span>words today</span></span></button>
      <button class="wb-tile" data-act="stats"><span class="wb-ic flame">${icon('flame')}</span><span><b class="tnum">${sum.streak}<small> day${sum.streak === 1 ? '' : 's'}</small></b><span>${sum.streak ? 'writing streak' : 'start a streak today'} · best ${sum.best}</span></span></button>
      <button class="wb-tile wb-level" data-act="level"><span class="lv-badge"><small>Lv</small>${xp.level}</span><span class="lv-text"><b>${esc(xp.title)}</b><span class="lv-bar"><i style="width:${Math.max(2, xp.pct * 100)}%"></i></span><span class="tnum">${num(xp.into)} / ${num(xp.need)} EXP to level ${xp.level + 1}</span></span></button>
    </div>`;
  if (!w) return `<section class="welcome solo">${tiles}</section>`;
  const where = w.sc ? `<b>${esc(w.sc.title || 'Untitled scene')}</b> in <i>${esc(w.p.title)}</i>` : `<i>${esc(w.p.title)}</i>`;
  return `<section class="welcome">
    <div class="wb-main">
      <span class="eyebrow">Where you left off · ${ago(w.at)}</span>
      <p class="wb-where">${where}</p>
      ${w.locked ? `<p class="wb-excerpt locked">${icon('lock')}This project is encrypted. Unlock it to see your last lines.</p>`
        : w.excerpt ? `<blockquote class="wb-excerpt">${esc(w.excerpt)}</blockquote>` : `<p class="wb-excerpt empty">This scene is still a blank page.</p>`}
      <button class="btn btn-primary" data-open="${w.p.id}" ${w.sc ? `data-scene="${w.sc.id}"` : ''}>${icon('pen')}Continue writing</button>
    </div>
    ${tiles}
  </section>`;
}
// Level-ups: celebrate when the level goes past the last one seen on this device
async function noteLevel(xp, celebrateIt = true) {
  const seen = await db.meta('levelSeen');
  if (seen === null || seen === undefined) { await db.setMeta('levelSeen', xp.level); return; }
  if (xp.level > seen) {
    await db.setMeta('levelSeen', xp.level);
    if (celebrateIt) celebrate(`Level ${xp.level} · ${xp.title}`, `You’ve earned ${num(xp.exp)} EXP from your writing.`);
  }
}
function levelSheet() {
  stats.summary(settings.dailyGoal).then(sum => {
    const xp = computeExp(sum.byDay), R = EXP_RULES;
    sheet({ title: 'Level & EXP', foot: null, body: `
      <div class="lv-hero"><span class="lv-badge big"><small>Lv</small>${xp.level}</span><div><b>${esc(xp.title)}</b><span class="tnum">${num(xp.exp)} EXP in total</span></div></div>
      <div class="lv-bar big"><i style="width:${Math.max(2, xp.pct * 100)}%"></i></div>
      <p class="note tnum" style="text-align:left">${num(xp.need - xp.into)} EXP to level ${xp.level + 1}${xp.nextTitle ? `, where you become <b>${esc(xp.nextTitle)}</b>` : ''}.</p>
      <div class="group"><div class="group-title">How you earn EXP</div><div class="card-list">
        <div class="li"><div class="li-icon">${icon('pen')}</div><div class="li-text"><b>${R.perWord} EXP for every word you write</b><span>Deleting or rewriting never takes EXP away</span></div></div>
        <div class="li"><div class="li-icon">${icon('calendar')}</div><div class="li-text"><b>+${R.writingDay} EXP for each writing day</b><span>Any day with at least ${R.writingDayMin} new words</span></div></div>
        <div class="li"><div class="li-icon">${icon('flame')}</div><div class="li-text"><b>+${R.streakStep} EXP more for each day in a row</b><span>Up to +${R.streakStep * R.streakCap} EXP a day on a long run</span></div></div>
      </div></div>` });
  });
}

function coverHtml(p, st, bookNo) {
  const c = COVERS[p.cover % COVERS.length] || COVERS[0];
  return `<button class="book" data-open="${p.id}" aria-label="Open ${esc(p.title)}">
    ${p.coverImage ? `<div class="cover has-img" style="--cbg:${c.bg};background-image:url('${p.coverImage}')"></div>` : `<div class="cover" style="--cbg:${c.bg};--cfg:${c.fg};--cline:${c.line}">
      <div class="frame"></div>
      <div class="c-kicker">${p.sample ? 'Sample' : modeOf(p) === 'novel' ? `${st.chapters} chapter${st.chapters === 1 ? '' : 's'}` : MODES[modeOf(p)].name}</div>
      <div><div class="c-title">${esc(p.title)}</div>${p.subtitle && !p.sample ? `<div class="c-sub">${esc(p.subtitle)}</div>` : ''}</div>
      <div class="c-foot"><span>${esc(p.author || '')}</span><svg class="c-fold" viewBox="0 0 16 16"><path d="M3 2h7l3 3v9H3z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M10 2v3h3" fill="none" stroke="currentColor" stroke-width="1"/></svg></div>
    </div>`}
    ${p.enc ? `<span class="cover-lock" title="Encrypted">${icon('lock')}</span>` : ''}
    <div class="b-meta">${bookNo ? `<span class="book-no">Book ${bookNo}</span>` : ''}<b>${esc(p.title)}${p.sample ? '<span class="tag-sample">Sample</span>' : ''}</b><span class="tnum">${num(st.words)} words · ${ago(p.lastEdited || p.updatedAt)}</span></div>
  </button>`;
}

function newProjectSheet() {
  let cover = Math.floor(Math.random() * COVERS.length);
  const s = sheet({
    title: 'New project', sub: 'Pick what you’re writing and give it a working title. You can change everything later.',
    body: `<div class="mode-picks">${Object.entries(MODES).map(([k, m], i) => `<button class="mode-pick ${i === 0 ? 'on' : ''}" data-mode="${k}"><span class="mp-ic">${icon(m.icon)}</span><b>${m.name}</b><span>${m.blurb}</span></button>`).join('')}</div>
      <div class="field"><label class="field-label" for="np-title">Title</label><input class="input" id="np-title" placeholder="The Long Way Home" autofocus maxlength="120"></div>
      <div class="field"><label class="field-label" for="np-author">Author</label><input class="input" id="np-author" placeholder="Your name or pen name" maxlength="80"></div>
      <div class="field"><span class="field-label">Cover</span><div class="cover-picks">${COVERS.map((c, i) => `<button class="cover-pick ${i === cover ? 'on' : ''}" data-i="${i}" style="--cbg:${c.bg}" aria-label="${c.name}"></button>`).join('')}</div></div>`,
    foot: `<button class="btn btn-ghost" data-close2>Cancel</button><button class="btn btn-primary" data-create>Create project</button>`
  });
  let mode = 'novel';
  $$('.mode-pick', s.wrap).forEach(b => b.onclick = () => { mode = b.dataset.mode; $$('.mode-pick', s.wrap).forEach(x => x.classList.toggle('on', x === b)); const ph = { novel: 'The Long Way Home', screenplay: 'Night Ferry', poetry: 'Salt and Small Hours', journal: 'My Journal' }; $('#np-title').placeholder = ph[mode]; });
  $$('.cover-pick', s.wrap).forEach(b => b.onclick = () => { cover = +b.dataset.i; $$('.cover-pick', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-close2]', s.wrap).onclick = s.close;
  const create = async () => {
    const author = $('#np-author').value.trim();
    const p = { ...newProjectRecord($('#np-title').value.trim() || $('#np-title').placeholder || 'Untitled project'), cover, author, mode };
    let ch, sc;
    if (mode === 'journal') { const r = entryFor([], p.id, new Date(), { chapter: newChapter, scene: newScene }); ch = r.chapter; sc = r.scene; touch(ch); touch(sc); }
    else if (mode === 'screenplay') { ch = newChapter(p.id, 1, 'Act One'); sc = newScene(p.id, ch.id, 1, 'Opening', '<p data-el="heading"><br></p>'); }
    else if (mode === 'poetry') { ch = newChapter(p.id, 1, 'Poems'); sc = newScene(p.id, ch.id, 1, 'Untitled poem'); }
    else { ch = newChapter(p.id, 1, 'Chapter One'); sc = newScene(p.id, ch.id, 1, 'Scene 1'); }
    if (mode !== 'novel') p.format = 'rich';
    await db.writeBatch({ projects: [touch(p)], items: [ch, sc] });
    if (author) await db.setMeta('lastAuthor', author);
    s.close(); haptic(); openProject(p.id, sc.id);
  };
  db.meta('lastAuthor').then(a => { if (a) $('#np-author').value = a; });
  $('[data-create]', s.wrap).onclick = create;
  $('#np-title').onkeydown = e => { if (e.key === 'Enter') create(); };
}

// ---------------------------------------------------------------- Series
// Create or manage a series: its name, its books (in order), adding standalone books, deleting it.
async function seriesSheet(seriesId, focusAdd = false) {
  const all = (await db.all('projects')).filter(p => !p.deleted);
  const sr = seriesId ? all.find(p => p.id === seriesId) : null;
  const books = sr ? await series.booksIn(sr.id) : [];
  const free = all.filter(p => !series.isSeries(p) && (!p.seriesId || !all.some(x => x.id === p.seriesId && series.isSeries(x))));
  const row = (p, inSeries, i) => `<div class="li sr-book" data-pid="${p.id}">
      <div class="sr-cover" style="background:${p.coverImage ? `center/cover url('${p.coverImage}')` : (COVERS[p.cover % COVERS.length] || COVERS[0]).bg}"></div>
      <div class="li-text"><b>${inSeries ? `<span class="sr-no">Book ${i + 1}</span>` : ''}${esc(p.title)}</b><span>${p.enc ? 'Encrypted, can’t join a series' : MODES[modeOf(p)].name}</span></div>
      ${inSeries ? `<button class="icon-btn" data-up="${p.id}" aria-label="Move earlier" ${i === 0 ? 'disabled' : ''}>${icon('chev')}</button><button class="btn btn-ghost btn-sm" data-out="${p.id}">Remove</button>`
        : `<button class="switch" role="switch" aria-checked="false" data-pick="${p.id}" ${p.enc ? 'disabled' : ''} aria-label="Add ${esc(p.title)}"></button>`}
    </div>`;
  const s = sheet({
    title: sr ? 'Manage series' : 'New series',
    sub: 'Books in a series share one story bible: characters, places, lore and relationships. Edit Luna in Book 1 and she’s updated in Book 2.',
    body: `<div class="field"><label class="field-label" for="sr-title">Series name</label><input class="input" id="sr-title" value="${esc(sr ? sr.title : '')}" placeholder="The Valentino Saga" maxlength="120"></div>
      ${sr ? `<div class="group"><div class="group-title">Books in this series</div><div class="card-list">${books.length ? books.map((p, i) => row(p, true, i)).join('') : '<div class="empty-note">No books yet. Add some below.</div>'}</div></div>` : ''}
      <div class="group" id="sr-add"><div class="group-title">${sr ? 'Add books' : 'Books to put in it'}</div><div class="card-list">${free.length ? free.map(p => row(p, false)).join('') : '<div class="empty-note">Every book is already in a series. Create a new project to add one.</div>'}</div>
      <p class="note" style="text-align:left">When a book joins, its characters, places and lore move into the series. If the series already has an entry with the same name, the two are merged into one.</p></div>`,
    foot: `${sr ? '<button class="btn btn-danger" data-del>Delete series</button><span style="flex:1"></span>' : ''}<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-save>${sr ? 'Save' : 'Create series'}</button>`,
  });
  if (focusAdd) setTimeout(() => $('#sr-add', s.wrap)?.scrollIntoView({ block: 'start' }), 80);
  else if (!sr) setTimeout(() => $('#sr-title', s.wrap).focus(), 60);
  const picked = new Set(), out = new Set(); let order = books.map(b => b.id);
  $$('[data-pick]', s.wrap).forEach(b => b.onclick = () => { const id = b.dataset.pick; if (picked.has(id)) picked.delete(id); else picked.add(id); b.setAttribute('aria-checked', picked.has(id)); });
  $$('[data-out]', s.wrap).forEach(b => b.onclick = () => { const id = b.dataset.out; const r = b.closest('.sr-book'); if (out.has(id)) { out.delete(id); r.classList.remove('leaving'); b.textContent = 'Remove'; } else { out.add(id); r.classList.add('leaving'); b.textContent = 'Keep'; } });
  $$('[data-up]', s.wrap).forEach(b => b.onclick = () => { const id = b.dataset.up, i = order.indexOf(id); if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; const r = b.closest('.sr-book'); r.parentNode.insertBefore(r, r.previousElementSibling); $$('.sr-book', s.wrap).filter(x => order.includes(x.dataset.pid)).forEach((x, k) => { const n = $('.sr-no', x); if (n) n.textContent = `Book ${k + 1}`; const up = $('[data-up]', x); if (up) up.disabled = k === 0; }); } });
  $('[data-c]', s.wrap).onclick = s.close;
  const del = $('[data-del]', s.wrap);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet({ title: `Delete “${esc(sr.title)}”?`, sub: 'The books stay in your library. Each one keeps its own copy of the story bible, so nothing is lost. The series goes to Trash for 30 days.', confirm: 'Delete series', danger: true }))) return;
    await saveNow(); await series.deleteSeries(sr); s.close(); toast('Series deleted. Each book kept a copy of the story bible.'); refreshAfterDataChange();
  };
  $('[data-save]', s.wrap).onclick = async () => {
    const title = $('#sr-title', s.wrap).value.trim();
    if (!sr && !title) { $('#sr-title', s.wrap).focus(); return toast('Give the series a name'); }
    await saveNow();
    const t = toast('Updating the series…', null, 0);
    try {
      let rec = sr;
      if (!rec) { rec = series.newSeriesRecord(title); await db.put('projects', rec); }
      else if (title && title !== rec.title) { rec.title = title; touch(rec); await db.put('projects', rec); }
      let merged = 0;
      for (const id of picked) { const b = await db.get('projects', id); if (b && !b.enc) { const r = await series.joinSeries(b, rec.id); merged += r.merged; } }
      for (const id of out) { const b = await db.get('projects', id); if (b) await series.leaveSeries(b); }
      // book order
      const keep = order.filter(id => !out.has(id));
      for (let i = 0; i < keep.length; i++) { const b = await db.get('projects', keep[i]); if (b && b.seriesOrder !== i + 1) { b.seriesOrder = i + 1; touch(b); await db.put('projects', b); } }
      t(); s.close(); haptic(10);
      toast(merged ? `Series saved. ${merged} matching entr${merged === 1 ? 'y was' : 'ies were'} merged.` : (sr ? 'Series saved' : `“${rec.title}” created`));
      refreshAfterDataChange();
    } catch (e) { t(); errorToast(e); }
  };
}

// ---------------------------------------------------------------- Workspace
async function openProject(id, sceneId) {
  const p = await db.get('projects', id);
  if (!p || p.deleted) return renderLibrary();
  if (p.enc && !sec.isUnlocked(id)) {
    const pass = await sec.passwordSheet({ title: 'Unlock project', sub: `“${esc(p.title)}” is encrypted. Enter its password to open it.`, confirm: false, action: 'Unlock' });
    if (!pass) return;
    if (!(await sec.unlockProject(p, pass))) { toast('That password isn’t right'); haptic([30, 40, 30]); return openProject(id, sceneId); }
  }
  resetCalendar();
  state.project = p;
  state.series = p.seriesId ? await db.get('projects', p.seriesId) : null;
  if (state.series && state.series.deleted) state.series = null;
  state.items = await series.loadItems(p);
  const tree = buildTree(state.items);
  const scenes = flatScenes(tree);
  const last = sceneId || (await db.meta('lastScene:' + id));
  let scene = scenes.find(s => s.id === last) || scenes[0];
  if (!scene) { // project with no scenes yet
    const existing = tree.find(c => c.id !== '__loose');
    const ch = existing ? state.items.find(i => i.id === existing.id) : newChapter(id, 1, 'Chapter One');
    scene = newScene(id, ch.id, 1, 'Scene 1');
    await db.writeBatch({ items: existing ? [scene] : [ch, scene] });
    state.items = await series.loadItems(p);
  }
  await db.setMeta('lastProject', id);
  $('#library').hidden = true;
  const ws = $('#workspace'); ws.hidden = false;
  renderWorkspace();
  await loadScene(scene.id);
  await setView(await db.meta('view:' + id, 'write'), { save: false });
}

function renderWorkspace() {
  const ws = $('#workspace');
  const mode = modeOf(state.project);
  document.body.dataset.mode = mode;
  ws.innerHTML = `
    <aside class="binder" aria-label="Binder">
      <div class="binder-head">
        <div class="bh-top"><button class="back" data-act="library">${icon('back')}Library</button><button class="icon-btn" data-act="theme"></button></div>
        <div class="proj-title"><div style="min-width:0"><h2 id="projTitle"></h2><p id="projMeta" class="tnum"></p></div><button class="icon-btn" data-act="project-menu" aria-label="Project options">${icon('more')}</button></div>
      </div>
      <div class="binder-list" id="binderList"></div>
      <div class="binder-foot">
        <button class="goal-strip" data-act="stats" id="goalStrip"></button>
        <div id="targetStrip"></div>
        <div class="totals tnum"><span>Manuscript</span><span><b id="projWords">0</b> words</span></div>
        ${mode === 'journal' ? `<button class="btn btn-primary btn-sm" data-act="today">${icon('pen')}Today’s entry</button>` : `<button class="btn btn-quiet btn-sm" data-act="add-chapter">${icon('plus')}New ${T(state.project).chapter.toLowerCase()}</button>`}
      </div>
    </aside>
    <div class="drawer-scrim" data-act="close-drawer"></div>
    <section class="main">
      <header class="topbar">
        <button class="icon-btn only-narrow" data-act="drawer" aria-label="Open binder">${icon('sidebar')}</button>
        <div class="crumbs"><span class="c1" id="crumbChapter"></span><span class="sep">/</span><span class="c2" id="crumbScene"></span></div>
        <div class="seg view-seg" id="viewSeg" role="tablist" aria-label="View">
          <button data-view="write" role="tab" title="Write">${icon('pen')}<span>Write</span></button>
          ${mode === 'journal' ? `<button data-view="calendar" role="tab" title="Calendar">${icon('calendar')}<span>Calendar</span></button>` : `<button data-view="board" role="tab" title="Corkboard">${icon('board')}<span>Board</span></button>`}
          <button data-view="outline" role="tab" title="Outline">${icon('outline')}<span>Outline</span></button>
          ${mode === 'novel' || mode === 'screenplay' ? `<button data-view="timeline" role="tab" title="Timeline">${icon('timeline')}<span>Timeline</span></button>` : ''}
          ${['novel', 'screenplay', 'journal'].includes(mode) ? `<button data-view="map" role="tab" title="Map">${icon('pin')}<span>Map</span></button>` : ''}
          <button data-view="bible" role="tab" title="Story bible">${icon('bible')}<span>Bible</span></button>
        </div>
        <div class="fmt" id="fmtBar" role="toolbar" aria-label="Formatting">
          ${mode === 'screenplay' ? `<button class="el-pick" data-act="element" id="elPick" title="Element (Tab to change)"><span id="elName">Action</span>${icon('chev')}</button>` : ''}
          <button class="icon-btn" data-fmt="bold" title="Bold (Ctrl+B)" aria-label="Bold"><b>B</b></button>
          <button class="icon-btn" data-fmt="italic" title="Italic (Ctrl+I)" aria-label="Italic"><i>I</i></button>
          ${mode === 'screenplay' ? '' : `${mode === 'poetry' ? `<button class="icon-btn ${state.project.align === 'center' ? 'on' : ''}" data-act="poem-align" title="Centre the poem" aria-label="Centre the poem">${icon('align')}</button><button class="icon-btn syl-btn ${settings.syllables ? 'on' : ''}" data-act="syllables" title="Syllable counts" aria-label="Syllable counts"><span class="h">7</span></button>` : `<button class="icon-btn" data-fmt="heading" title="Heading (# then space)" aria-label="Heading"><span class="h">H</span></button>
          <button class="icon-btn" data-fmt="quote" title="Quote (> then space)" aria-label="Quote">${icon('quote')}</button>
          <button class="icon-btn" data-fmt="list" title="List (- then space)" aria-label="List">${icon('list')}</button>`}
          <button class="icon-btn" data-fmt="break" title="${mode === 'poetry' ? 'Section break' : 'Scene break (*** then Enter)'}" aria-label="Scene break"><span class="ast">⁂</span></button>
          <button class="icon-btn" data-fmt="image" title="Insert a picture (or drop / paste one)" aria-label="Insert a picture">${icon('image')}</button>`}
          <button class="icon-btn" data-fmt="comment" title="Add a margin note" aria-label="Add a margin note">${icon('comment')}</button>
        </div>
        <span class="rev-ind" id="revIndicator" hidden></span>
        <button class="icon-btn" data-act="panel" title="Notes, revision tools and reference" aria-label="Side panel">${icon('panel')}</button>
        <button class="icon-btn" data-act="sprint" title="Writing sprint" aria-label="Writing sprint">${icon('timer')}</button>
        <button class="icon-btn" data-act="type" title="Typography" aria-label="Typography">${icon('type')}</button>
        <button class="icon-btn hide-narrow" data-act="focus" title="Focus mode (Ctrl+.)" aria-label="Focus mode">${icon('focus')}</button>
        <button class="icon-btn" data-act="more-tools" title="More" aria-label="More tools">${icon('more')}</button>
      </header>
      <div class="scroller" id="scroller">
        <article class="page">
          <div class="scene-kicker" id="sceneKicker"></div>
          <input class="scene-title" id="sceneTitle" placeholder="Untitled scene" aria-label="Scene title" maxlength="140" autocomplete="off">
          <div class="ed-wrap"><div class="editor ${mode === 'screenplay' ? 'sp' : ''} ${mode === 'poetry' ? 'poem' : ''} ${mode === 'poetry' && state.project.align === 'center' ? 'poem-center' : ''}" id="editor" contenteditable="true" spellcheck="true" data-placeholder="${mode === 'poetry' ? 'First line… (Enter for a new line, Enter twice for a new stanza)' : mode === 'journal' ? 'What happened today?' : 'Begin here…'}" role="textbox" aria-multiline="true" aria-label="Scene text"></div>${mode === 'poetry' ? '<div class="syl-gutter" id="sylGutter" aria-hidden="true"></div>' : ''}</div>
          <textarea class="md-editor" id="mdEditor" spellcheck="true" hidden aria-label="Scene text (Markdown)" placeholder="Begin here… (Markdown)"></textarea>
        </article>
      </div>
      <div class="view-scroll" id="boardView" hidden></div>
      <div class="view-scroll" id="outlineView" hidden></div>
      <div class="view-fill" id="bibleView" hidden></div>
      <div class="view-fill" id="mapView" hidden></div>
      <aside class="sidepanel" id="sidePanel" hidden aria-label="Side panel"></aside>
      <div class="statusbar tnum" id="statusbar">
        <button class="sprint-pill" id="sprintPill" data-act="sprint" hidden></button>
        <span class="sb-extra" id="sbExtra" hidden></span><span class="sb-words"><b id="sceneWords">0</b><span id="sceneTarget"></span> words</span><span class="proj-total"><span id="projWords2">0</span> in project</span><span class="saved" id="saveState"><span class="dot"></span>Saved</span>
      </div>
    </section>`;
  ws.onclick = onWorkspaceClick;
  // keep the text selection when tapping formatting buttons
  $('#fmtBar').addEventListener('pointerdown', e => e.preventDefault());
  $('#fmtBar').addEventListener('mousedown', e => e.preventDefault());
  $$('#viewSeg button').forEach(b => b.onclick = () => setView(b.dataset.view));
  document.execCommand('defaultParagraphSeparator', false, 'p');
  bindEditor();
  renderBinder();
  applySettings();
  renderGoalStrip();
  renderSprintPill();
}

async function setView(v, opts = {}) {
  const save = opts.save !== false;
  if (!$(`#viewSeg [data-view="${v}"]`)) v = 'write';
  await saveNow();
  state.view = v;
  if (save) db.setMeta('view:' + state.project.id, v);
  document.body.dataset.view = v;
  $$('#viewSeg button').forEach(b => { b.classList.toggle('on', b.dataset.view === v); b.setAttribute('aria-selected', b.dataset.view === v); });
  $('#scroller').hidden = v !== 'write';
  $('#boardView').hidden = !['board', 'calendar', 'timeline'].includes(v);
  $('#outlineView').hidden = v !== 'outline';
  $('#bibleView').hidden = v !== 'bible';
  $('#mapView').hidden = v !== 'map';
  if (v === 'map') renderMaps($('#mapView'), opts.map || {});
  if (v === 'board') renderBoard($('#boardView'));
  if (v === 'outline') renderOutline($('#outlineView'));
  if (v === 'bible') renderBible($('#bibleView'), opts.select ? { select: opts.select } : {});
  if (v === 'calendar') renderCalendar($('#boardView'), calendarCtx());
  if (v === 'timeline') renderTimeline($('#boardView'));
  if (v !== 'write') { revise.closePanel(); hideHover(true); }
  else refreshNames();
  if (v !== 'write' && document.body.classList.contains('focus')) setFocusMode(false);
}
function renderCurrentView() {
  if (state.view === 'board') renderBoard($('#boardView'));
  else if (state.view === 'outline') renderOutline($('#outlineView'));
  else if (state.view === 'bible') renderBible($('#bibleView'));
  else if (state.view === 'calendar') renderCalendar($('#boardView'), calendarCtx());
  else if (state.view === 'timeline') renderTimeline($('#boardView'));
  else if (state.view === 'map') renderMaps($('#mapView'));
}

async function saveItem(it) {
  touch(it);
  if (state.scene && it.id === state.scene.id) {
    $('#sceneTitle').value = it.title;
  }
  await db.put('items', it);
}

async function renderGoalStrip() {
  const strip = $('#goalStrip'); if (!strip) return;
  const sum = await stats.summary(settings.dailyGoal);
  state.today = sum.today;
  const xp = computeExp(sum.byDay);
  strip.innerHTML = `${ring(sum.today / settings.dailyGoal, 34, 3.2)}<span class="gs-text"><b class="tnum">${num(sum.today)} <small>/ ${num(settings.dailyGoal)}</small></b><span>${sum.today >= settings.dailyGoal ? 'Goal reached today' : 'words today'}${sum.streak ? ` · ${sum.streak}-day streak` : ''}</span></span><span class="gs-lv" title="${esc(xp.title)} · ${num(xp.into)} / ${num(xp.need)} EXP"><small>Lv</small>${xp.level}<i style="--p:${xp.pct * 100}%"></i></span>`;
  const p = state.project, ts = $('#targetStrip');
  if (p && p.target && ts) {
    const words = state.items.filter(i => i.type === 'scene' && !i.deleted).reduce((s, i) => s + (i.words || 0), 0);
    const pl = stats.plan(p, words, sum.byProjectDay);
    const when = pl.daysLeft === undefined ? '' : pl.remaining === 0 ? 'Target reached' : pl.daysLeft > 0 ? `${num(pl.perDay)} words a day · ${pl.daysLeft} day${pl.daysLeft === 1 ? '' : 's'} left` : 'Deadline passed';
    ts.innerHTML = `<div class="target-strip"><div class="ts-row tnum"><span>Target</span><span>${Math.round(pl.pct * 100)}% of ${num(p.target)}</span></div><div class="bar"><i style="width:${pl.pct * 100}%"></i></div>${when ? `<div class="ts-when tnum">${when}</div>` : ''}</div>`;
  } else if (ts) ts.innerHTML = '';
}

function renderProjectHead() {
  const p = state.project;
  $('#projTitle').textContent = p.title;
  const live = state.items.filter(i => !i.deleted);
  const tm = T(p), nc = live.filter(i => i.type === 'chapter').length, ns = live.filter(i => i.type === 'scene').length;
  const pl = w => w === 'Entry' ? 'entries' : w.toLowerCase() + 's';
  $('#projMeta').textContent = `${MODES[modeOf(p)].name} · ${nc} ${nc === 1 ? tm.chapter.toLowerCase() : pl(tm.chapter)} · ${ns} ${ns === 1 ? tm.scene.toLowerCase() : pl(tm.scene)}`;
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
          <i class="st-dot st-${statusOf(s).id}" title="${statusOf(s).name}"></i>
          <span class="r-title">${esc(s.title || 'Untitled scene')}</span>${labelOf(s) ? `<i class="lbl-dot" style="--lbl:${labelOf(s).color}" title="${labelOf(s).name} label"></i>` : ''}
          <span class="r-count">${num(s.words)}</span>
          <button class="r-more" data-more="${s.id}" aria-label="Scene options">${icon('more')}</button>
        </div>`).join('')}
        ${c.id !== '__loose' && modeOf(state.project) !== 'journal' ? `<button class="add-scene" data-add-scene="${c.id}">${icon('plus')}New ${T(state.project).scene.toLowerCase()}</button>` : ''}
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
  if (act === 'library') return goLibrary();
  if (act === 'drawer') return document.body.classList.add('binder-open');
  if (act === 'theme') return toggleTheme();
  if (act === 'stats') return statsSheet();
  if (act === 'sound') return soundPanel(t.closest('[data-act]'));
  if (act === 'sprint') return state.sprint ? sprintMenu(t.closest('[data-act]')) : sprintPanel(t.closest('[data-act]'));
  if (act === 'scene-status') return statusMenu(t.closest('[data-act]'));
  if (act === 'scene-details') return sceneDetails(state.scene.id);
  if (act === 'panel') return revise.togglePanel();
  if (act === 'today') return openEntry(new Date());
  if (act === 'poem-align') { state.project.align = state.project.align === 'center' ? null : 'center'; touch(state.project); await db.put('projects', state.project); $('#editor').classList.toggle('poem-center', state.project.align === 'center'); t.closest('[data-act]').classList.toggle('on', state.project.align === 'center'); return updateSyllables(); }
  if (act === 'syllables') { settings.syllables = !settings.syllables; saveSettings(); t.closest('[data-act]').classList.toggle('on', settings.syllables); return updateSyllables(); }
  if (act === 'element') return menu(t.closest('[data-act]'), sp.ELEMENTS.map(e => ({ k: e.id, icon: 'file', label: e.name, run: () => { const ed = $('#editor'); ed.focus(); sp.setElement(ed, e.id); changed(); updateElementLabel(); } })));
  if (act === 'mood') return moodMenu(t.closest('[data-act]'));
  if (act === 'when') return whenSheet(state.scene.id, () => updateCrumbs());
  if (act === 'more-tools') { const a = t.closest('[data-act]'); return menu(a, [
    { k: 'find', icon: 'search', label: 'Find & replace', run: openFind },
    { k: 'history', icon: 'history', label: 'Version history', run: () => { if (state.view !== 'write') setView('write').then(revise.historySheet); else revise.historySheet(); } },
    { k: 'listen', icon: 'speaker', label: 'Read aloud', run: () => { if (state.view !== 'write') setView('write').then(revise.readAloud); else revise.readAloud(); } },
    { k: 'revise', icon: 'sparkle', label: 'Revision tools', run: () => { if (state.view !== 'write') setView('write').then(() => revise.openPanel('revise')); else revise.openPanel('revise'); } },
    '-',
    { k: 'sound', icon: 'headphones', label: 'Soundscapes', run: () => soundPanel(a) },
    { k: 'stats', icon: 'chart', label: 'Goals & stats', run: statsSheet },
    ...(matchMedia('(max-width: 860px)').matches ? [{ k: 'focus', icon: 'focus', label: 'Focus mode', run: () => setFocusMode(true) }] : []),
    { k: 'export', icon: 'export', label: 'Compile & export', run: exportSheet },
  ]); }
  if (act === 'close-drawer') return document.body.classList.remove('binder-open');
  if (act === 'add-chapter') return addChapter();
  if (act === 'focus') return setFocusMode(!document.body.classList.contains('focus'));
  if (act === 'type') return typographyPanel(t.closest('[data-act]'));
  if (act === 'export') return exportSheet();
  if (act === 'where') return scenePlaceSheet(state.scene.id, () => { updateCrumbs(); if (state.view !== 'write') renderCurrentView(); }, currentHtml());
  if (act === 'cast') { await saveNow(); return castSheet(state.scene.id, () => updateCrumbs()); }
  if (act === 'project-menu') return menu(t.closest('[data-act]'), [
    { k: 'edit', icon: 'edit', label: 'Project details', run: projectSheet },
    { k: 'export', icon: 'export', label: 'Export…', run: exportSheet },
    { k: 'file', icon: 'share', label: 'Share project file (.inkfold)', run: () => io.exportProjectFile(state.project.id).catch(errorToast) },
    { k: 'series', icon: 'stack', label: state.series ? `Series: ${state.series.title}` : 'Add to a series…', run: () => state.series ? seriesSheet(state.series.id) : projectSheet('series') },
    '-',
    ...(state.project.seriesId ? [] : state.project.enc ? [
      { k: 'lockp', icon: 'lock', label: 'Lock project now', run: async () => { await saveNow(); sec.lockProject(state.project.id); goLibrary(); toast('Project locked'); } },
      { k: 'pw', icon: 'edit', label: 'Change password', run: changeProjectPassword },
      { k: 'decrypt', icon: 'unlock', label: 'Remove encryption', run: removeEncryption },
    ] : [{ k: 'encrypt', icon: 'lock', label: 'Encrypt project…', run: encryptCurrentProject }]),
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
    } else { if (state.view !== 'write') await setView('write'); await loadScene(row.dataset.id); document.body.classList.remove('binder-open'); }
  }
}
document.addEventListener('dblclick', e => { const r = e.target.closest('#binderList .row'); if (r && r.dataset.id !== '__loose') renameInline(r.dataset.id); });

function itemMenu(anchor, id) {
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  const items = [{ k: 'rename', icon: 'edit', label: 'Rename', run: () => renameInline(id) }];
  if (it.type === 'chapter') items.push({ k: 'add', icon: 'plus', label: 'New scene in chapter', run: () => addScene(id) });
  if (it.type === 'scene') items.push({ k: 'details', icon: 'edit', label: 'Scene details', run: () => sceneDetails(id) }, { k: 'dup', icon: 'copy', label: 'Duplicate', run: () => duplicateScene(id) });
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

async function addChapter({ stay = false } = {}) {
  const sibs = sortedSiblings('chapter');
  const ch = newChapter(state.project.id, (sibs.at(-1)?.order || 0) + 1, `Chapter ${sibs.length + 1}`);
  const sc = newScene(state.project.id, ch.id, 1, 'Scene 1');
  await db.writeBatch({ items: [ch, sc] });
  state.items.push(ch, sc); haptic();
  if (stay && state.view !== 'write') { renderBinder(); renderCurrentView(); return; }
  await loadScene(sc.id);
  renderBinder(); if (state.view !== 'write') renderCurrentView(); // the binder has to be redrawn or the new chapter only shows up after something else redraws it
  const row = $(`#binderList .row[data-id="${ch.id}"]`);
  if (row) row.scrollIntoView({ block: 'nearest' });
  renameInline(ch.id);
}
async function addScene(chapterId, { stay = false } = {}) {
  const sibs = sortedSiblings('scene', chapterId);
  const sc = newScene(state.project.id, chapterId, (sibs.at(-1)?.order || 0) + 1, `Scene ${sibs.length + 1}`);
  await db.put('items', sc); state.items.push(sc); haptic();
  if (stay && state.view !== 'write') { renderBinder(); renderCurrentView(); sceneDetails(sc.id); return; }
  if (state.view !== 'write') await setView('write');
  await loadScene(sc.id);
  openChapter(chapterId); renderBinder();
  $('#sceneTitle').focus(); $('#sceneTitle').select();
}
// make sure a chapter is expanded in the binder (e.g. after adding a scene to a collapsed one)
function openChapter(id) {
  const key = 'closed:' + state.project.id;
  try { const closed = JSON.parse(sessionStorage.getItem(key) || '[]').filter(x => x !== id); sessionStorage.setItem(key, JSON.stringify(closed)); } catch {}
}
async function duplicateScene(id) {
  await saveNow();
  const src = state.items.find(i => i.id === id);
  const sc = newScene(state.project.id, src.parentId, src.order + 0.5, src.title + ' (copy)', src.content);
  await db.put('items', sc); state.items.push(sc);
  await loadScene(sc.id); renderBinder(); toast('Scene duplicated');
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
  else { ed.innerHTML = sc.content || (modeOf(state.project) === 'screenplay' ? '<p data-el="heading"><br></p>' : modeOf(state.project) === 'poetry' ? '<p><br></p>' : ''); hydrateImages(ed, state.items); }
  updateSyllables(); updateElementLabel(); markEmpty();
  $$('#binderList .scene-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
  updateCrumbs(); updateCounts();
  $('#scroller').scrollTop = 0;
  setSaveState(true);
  document.title = `${sc.title || 'Untitled'} — ${state.project.title}`;
  revise.stopSpeech();
  revise.applyRevisionView();
  refreshNames();
  revise.onSceneChanged();
}

function updateCrumbs() {
  if (!state.scene) return;
  const tree = buildTree(state.items);
  const ci = tree.findIndex(c => c.scenes.some(s => s.id === state.scene.id));
  const ch = tree[ci];
  const si = ch ? ch.scenes.findIndex(s => s.id === state.scene.id) : 0;
  $('#crumbChapter').textContent = ch ? ch.title : '';
  $('#crumbScene').textContent = state.scene.title || 'Untitled scene';
  const st = statusOf(state.scene), lb = labelOf(state.scene);
  const mode = modeOf(state.project), term = T(state.project), sc = state.scene;
  const hasMap = ['novel', 'screenplay', 'journal'].includes(mode);
  const where = hasMap ? `<button class="k-when k-where ${sc.place && placeName(sc.place) ? 'set' : ''}" data-act="where" title="Where does it happen?">${icon('pin')}<span>${esc(placeName(sc.place) || 'Set place')}</span></button><button class="k-when k-cast" data-act="cast" title="Who’s in this scene (for journeys)">${icon('users')}<span class="tnum">${castCount(sc)}</span></button>` : '';
  const lead = mode === 'journal'
    ? `<span>${esc(ch ? ch.title : '')}</span><span class="k-dot"></span><button class="k-mood" data-act="mood" title="How was the day?">${sc.data && sc.data.mood ? moodFace(sc.data.mood, 18) + `<span>${MOODS[sc.data.mood - 1].name}</span>` : `${icon('plus')}<span>Mood</span>`}</button>${where}`
    : `<span>${term.chapter} ${ci + 1}</span><span class="k-dot"></span><span>${term.scene} ${si + 1}</span>${(mode === 'novel' || mode === 'screenplay') ? `<button class="k-when" data-act="when" title="When does it happen?">${icon('clock')}<span>${esc(whenLabel(sc.when) || 'Set time')}</span></button>` : ''}${where}`;
  $('#sceneKicker').innerHTML = (ch ? lead + (sc.conflictOf ? '<span class="k-dot"></span><span style="color:var(--warn)">Conflicted copy</span>' : '') : '')
    + `<span class="k-spacer"></span><button class="pill st-${st.id} k-pill" data-act="scene-status" title="Change status">${st.name}</button>${lb ? `<i class="lbl-dot" style="--lbl:${lb.color}"></i>` : ''}${state.scene.pov ? `<span class="k-pov">${esc(state.scene.pov)}</span>` : ''}<button class="k-more" data-act="scene-details" title="Scene details" aria-label="Scene details">${icon('more')}</button>`;
}

function currentHtml() { return isMd() ? mdToHtml($('#mdEditor').value) : sanitizeHtml($('#editor').innerHTML); }
function liveWords() { return isMd() ? countWords($('#mdEditor').value.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/[#>*_\-`]/g, ' ')) : countWords($('#editor').innerText); }

function updateCounts() {
  const w = state.scene ? liveWords() : 0;
  const others = state.items.filter(i => i.type === 'scene' && !i.deleted && i.id !== state.scene?.id).reduce((s, i) => s + (i.words || 0), 0);
  $('#sceneWords').textContent = num(w);
  const mode = modeOf(state.project), extra = $('#sbExtra');
  if (extra) {
    if (mode === 'screenplay') { const pg = sp.pageCount(htmlToBlocks($('#editor').innerHTML)); const all = state.items.filter(i => i.type === 'scene' && !i.deleted && i.id !== state.scene?.id).reduce((s2, i) => s2 + sp.pageCount(htmlToBlocks(i.content)), 0); extra.textContent = `${pg.toFixed(1)} page${pg >= 1.05 || pg < .95 ? 's' : ''} · script ${Math.max(1, Math.round(pg + all))}`; }
    else if (mode === 'poetry') { const lines = $('#editor').innerText.split('\n').filter(l => l.trim()).length; extra.textContent = `${lines} line${lines === 1 ? '' : 's'}`; }
    else extra.textContent = '';
    extra.hidden = !extra.textContent;
  }
  const tg = state.scene && state.scene.target;
  $('#sceneTarget').textContent = tg ? ` / ${num(tg)}` : '';
  if (state.sprint && state.sprint.phase === 'write') renderSprintPill();
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
  const before = sc.words || 0;
  sc.words = htmlWords(sc.content);
  touch(sc);
  const delta = sc.words - before;
  if (delta > 0) afterWordsAdded(delta, before, sc);
  state.project.lastEdited = Date.now();
  await db.writeBatch({ items: [sc], projects: [state.project] });
  setSaveState(true);
  const row = $(`#binderList .scene-row[data-id="${sc.id}"]`);
  if (row) { $('.r-title', row).textContent = sc.title; $('.r-count', row).textContent = num(sc.words); const ch = row.closest('.chapter'); if (ch) { const cid = ch.dataset.chapter; $('.chapter-row .r-count', ch).textContent = num(state.items.filter(i => i.type === 'scene' && !i.deleted && i.parentId === cid).reduce((s, i) => s + (i.words || 0), 0)); } }
}
const saveSoon = debounce(saveNow, 450);
const countSoon = debounce(updateCounts, 180);
const versionedAt = new Map();
function changed() {
  const sc = state.scene;
  if (sc && Date.now() - (versionedAt.get(sc.id) || 0) > 30 * 60 * 1000) { versionedAt.set(sc.id, Date.now()); revise.saveVersion({ ...sc }, 'Before editing', true); }
  state.dirty = true; setSaveState(false); saveSoon(); countSoon(); refreshNamesSoon(); revise.onEditorInput();
}

async function goLibrary() {
  await saveNow(); revise.stopSpeech(); revise.closePanel(); sp.hideSuggest();
  $('#workspace').hidden = true; $('#library').hidden = false; document.body.classList.remove('binder-open'); setFocusMode(false);
  state.project = null; delete document.body.dataset.mode; delete document.body.dataset.view;
  return renderLibrary();
}

// ---------- Project encryption ----------
async function reloadItems() {
  state.items = await series.loadItems(state.project);
  if (state.scene) state.scene = state.items.find(i => i.id === state.scene.id) || state.scene;
  renderBinder();
}
async function encryptCurrentProject() {
  const p = state.project;
  const pass = await sec.passwordSheet({ title: 'Encrypt project', sub: `“${esc(p.title)}” will be encrypted on this device with a password only you know. You’ll enter it each time you open the project.`, action: 'Encrypt', warn: true });
  if (!pass) return;
  await saveNow();
  const t = toast('Encrypting…', null, 0);
  await sec.encryptProject(p, pass);
  await reloadItems();
  t(); toast('Project encrypted'); haptic(10);
}
async function changeProjectPassword() {
  const pass = await sec.passwordSheet({ title: 'Change password', sub: 'Choose a new password for this project.', action: 'Change password', warn: true });
  if (!pass) return;
  await saveNow(); await sec.changeProjectPassword(state.project, pass);
  await reloadItems(); toast('Password changed');
}
async function removeEncryption() {
  if (!(await confirmSheet({ title: 'Remove encryption?', sub: 'This project will be stored without a password on this device.', confirm: 'Remove encryption', danger: true }))) return;
  await saveNow(); await sec.decryptProject(state.project);
  await reloadItems(); toast('Encryption removed');
}

// ---------- Command palette ----------
function paletteItems() {
  const items = [];
  const A = (label, iconName, run, keys, alt) => items.push({ group: 'Actions', label, icon: iconName, run, keys, alt });
  const inWs = !$('#workspace').hidden && state.project;
  if (inWs) {
    const term = T(state.project), mode = modeOf(state.project);
    const ch = state.items.find(i => i.id === state.scene?.parentId);
    if (mode === 'journal') A('Write today’s entry', 'pen', () => openEntry(new Date()));
    else if (ch) A(`New ${term.scene.toLowerCase()} in “${ch.title}”`, 'plus', () => addScene(ch.id), 'Mod+Shift+N', 'add scene');
    if (mode !== 'journal') A(`New ${term.chapter.toLowerCase()}`, 'plus', () => addChapter(), null, 'add chapter');
    A('Focus mode', 'focus', () => { setView('write').then(() => setFocusMode(true)); }, 'Mod+.');
    A('Start a writing sprint', 'timer', () => sprintPanel($('.topbar [data-act="sprint"]')));
    A('Find & replace', 'search', openFind, 'Mod+F', 'search');
    A('Version history', 'history', () => setView('write').then(revise.historySheet), null, 'versions snapshots');
    A('Add a margin note', 'comment', () => revise.addComment(), 'Mod+Shift+M', 'comment');
    A('Revision tools', 'sparkle', () => setView('write').then(() => revise.openPanel('revise')), null, 'readability adverbs passive');
    A('Read aloud', 'speaker', () => setView('write').then(revise.readAloud), null, 'listen speech');
    A('Compile & export', 'export', exportSheet, null, 'export pdf docx epub fountain');
    A('Soundscapes', 'headphones', () => soundPanel($('.topbar [data-act="more-tools"]')), null, 'rain music ambient');
    A('Project details', 'edit', projectSheet, null, 'cover title author');
    A('Back to library', 'back', goLibrary);
    $$('#viewSeg button').forEach((b, i) => items.push({ group: 'Go to', label: b.title || b.textContent, icon: 'arrowRight', run: () => setView(b.dataset.view), keys: `Mod+Shift+${i + 1}` }));
    buildTree(state.items).forEach((c, ci) => c.scenes.forEach((x, si) => items.push({ group: 'Scenes', label: x.title || 'Untitled', sub: `${ci + 1}.${si + 1} · ${c.title}`, icon: 'file', run: () => setView('write').then(() => loadScene(x.id)) })));
    state.items.filter(i => KINDS[i.type] && !i.deleted && i.title).forEach(i => items.push({ group: 'Story bible', label: i.title, sub: KINDS[i.type].one, icon: KINDS[i.type].icon, run: () => setView('bible', { select: i.id }) }));
    if ($('#viewSeg [data-view="map"]')) allMaps().forEach(mp => items.push({ group: 'Maps', label: mp.title || 'Untitled map', sub: 'Map', icon: 'pin', run: () => setView('map', { map: { mapId: mp.id } }) }));
  } else {
    A('New project', 'plus', newProjectSheet);
    A('Import a file', 'upload', pickFile, null, 'docx markdown fountain');
    A('Back up now', 'shield', doBackup);
    A('Nearby Sync', 'sync', syncSheet);
  }
  A('Goals & stats', 'chart', statsSheet, null, 'streak heatmap');
  A('Level & EXP', 'star', levelSheet, null, 'xp experience level up');
  A(isDark() ? 'Switch to Paper (light)' : 'Switch to dark theme', isDark() ? 'sun' : 'moon', toggleTheme, null, 'theme dark light');
  A('Settings', 'settings', settingsSheet);
  A('Keyboard shortcuts', 'keyboard', shortcutsSheet, 'Mod+/');
  if (sec.lockEnabled()) A('Lock Inkfold', 'lock', () => sec.lockNow(), 'Mod+Shift+L');
  (state.projects || []).filter(p => !inWs || p.id !== state.project.id).forEach(p => items.push({ group: 'Projects', label: p.title, sub: MODES[modeOf(p)].name, icon: 'book', run: () => (inWs ? goLibrary().then(() => openProject(p.id)) : openProject(p.id)) }));
  return items;
}

// ---------- Mode helpers ----------
function calendarCtx() { return { state, openEntry }; }
async function openEntry(date) {
  const r = entryFor(state.items, state.project.id, date, { chapter: newChapter, scene: newScene });
  if (r.created) { r.newItems.forEach(touch); await db.writeBatch({ items: r.newItems }); state.items.push(...r.newItems); renderBinder(); }
  if (state.view !== 'write') await setView('write');
  await loadScene(r.scene.id);
  document.body.classList.remove('binder-open');
  $('#editor').focus();
}
function moodMenu(anchor) {
  menu(anchor, [...MOODS.map(m => ({ k: 'm' + m.v, icon: 'user', label: m.name, run: async () => { state.scene.data = { ...(state.scene.data || {}), mood: m.v }; await saveItem(state.scene); updateCrumbs(); } })), '-', { k: 'none', icon: 'x', label: 'No mood', run: async () => { if (state.scene.data) delete state.scene.data.mood; await saveItem(state.scene); updateCrumbs(); } }]);
  $$('.pop .mi').forEach((b, i) => { if (i < MOODS.length) b.querySelector('svg').outerHTML = moodFace(MOODS[i].v, 18); });
}
let sylRaf = 0;
function updateSyllables() {
  const g = $('#sylGutter'); if (!g) return;
  cancelAnimationFrame(sylRaf);
  sylRaf = requestAnimationFrame(() => { if (!settings.syllables) { g.innerHTML = ''; g.hidden = true; return; } g.hidden = false; renderSyllables($('#editor'), g); });
}
function markEmpty() {
  if (modeOf(state.project) !== 'screenplay') return;
  $$('#editor > p').forEach(p => p.classList.toggle('e', !p.textContent.trim()));
}
function updateElementLabel() {
  const n = $('#elName'); if (!n) return;
  const b = sp.blockOf($('#editor'));
  n.textContent = sp.elName(b ? b.dataset.el || 'action' : 'action');
}
document.addEventListener('selectionchange', () => { if (document.activeElement && document.activeElement.id === 'editor' && modeOf(state.project) === 'screenplay') updateElementLabel(); });
function bibleCharacterNames() { return state.items.filter(i => i.type === 'character' && !i.deleted && i.title).map(i => i.title.split(/\s+/)[0]); }
function scriptBlocks() {
  return state.items.filter(i => i.type === 'scene' && !i.deleted && i.id !== state.scene?.id).flatMap(i => htmlToBlocks(i.content)).concat(htmlToBlocks($('#editor').innerHTML)).map(b => ({ el: b.el, text: (b.runs || []).map(r => r.text).join('') }));
}

// ---------- Goals, celebrations ----------
async function afterWordsAdded(delta, before, sc) {
  const goal = settings.dailyGoal;
  const prevToday = state.today;
  await stats.logWords(state.project.id, delta);
  state.today = prevToday + delta;
  if (state.sprint && state.sprint.phase === 'write') { state.sprint.words += delta; renderSprintPill(); }
  if (prevToday < goal && state.today >= goal) celebrate('Daily goal reached', `${num(goal)} words today. Lovely work.`);
  else if (sc.target && before < sc.target && sc.words >= sc.target) celebrate('Scene target reached', `“${sc.title}” hit ${num(sc.target)} words.`, true);
  renderGoalStrip();
  levelCheckSoon();
}

const levelCheckSoon = debounce(async () => { const sum = await stats.summary(settings.dailyGoal); noteLevel(computeExp(sum.byDay)); }, 1500);

function celebrate(title, sub, small = false) {
  haptic([12, 60, 18]);
  const c = el(`<div class="celebrate ${small ? 'small' : ''}" role="status"><div class="cb-burst"><i></i><i></i><i></i><svg viewBox="0 0 24 24" class="cb-check"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><div class="cb-text"><b>${esc(title)}</b><span>${esc(sub)}</span></div></div>`);
  document.body.appendChild(c);
  setTimeout(() => c.classList.add('out'), small ? 2200 : 3200);
  setTimeout(() => c.remove(), small ? 2800 : 3800);
}

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
  if (e.inputType !== 'insertText' || !e.data) return;
  const d = e.data, prev = prevChars(2), p1 = prev.slice(-1);
  let ins = null, del = 0;
  if (settings.smart) {
    const opening = !p1 || /[\s(\[{—–"“‘ -]/.test(p1);
    if (d === '"') ins = opening ? '“' : '”';
    else if (d === "'") ins = opening ? '‘' : '’';
    else if (d === '-' && p1 === '-') { ins = '—'; del = 1; }
    else if (d === '.' && prev === '..') { ins = '…'; del = 2; }
  }
  const revising = settings.revRound && !isMd() && e.target.id === 'editor';
  if (!ins && !revising) return;
  e.preventDefault();
  for (let i = 0; i < del; i++) document.execCommand('delete');
  if (revising) revise.revisionInsert(e, ins || d);
  else document.execCommand('insertText', false, ins);
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
  ed.addEventListener('keydown', e => {
    const mode = modeOf(state.project);
    if (mode === 'screenplay' && sp.handleKey(e, ed, () => { changed(); updateElementLabel(); markEmpty(); })) { e.stopImmediatePropagation(); requestAnimationFrame(centerCaret); return; }
    if (mode === 'poetry' && poetryEnter(e, ed)) { e.stopImmediatePropagation(); changed(); updateSyllables(); requestAnimationFrame(centerCaret); }
  });
  ed.addEventListener('input', e => {
    const mode = modeOf(state.project);
    if (mode === 'screenplay') { sp.suggest(ed, scriptBlocks(), bibleCharacterNames()); updateElementLabel(); markEmpty(); }
    else if (mode !== 'poetry') markdownShortcuts(e);
    if (mode === 'poetry') updateSyllables();
    changed(); markTyping(); requestAnimationFrame(centerCaret);
  });
  ed.addEventListener('blur', () => sp.hideSuggest());
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
    const pics = [...(e.clipboardData.files || [])].filter(f => /^image\//.test(f.type));
    if (pics.length && modeOf(state.project) !== 'screenplay') { pics.forEach(f => insertImage(f)); return; }
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    let out = html ? sanitizeHtml(html) : blocksToHtml(plainToBlocks(text)) || esc(text);
    const blocks = htmlToBlocks(out);
    if (settings.revRound && blocks.length === 1 && blocks[0].runs) {
      // single paragraph pasted during a revision round: insert it coloured, inline
      blocks[0].runs.forEach(r => { r.r = settings.revRound; });
      const tpl = document.createElement('template'); tpl.innerHTML = blocksToHtml(blocks).replace(/^<(p|h2|h3|li)>|<\/(p|h2|h3|li)>$/g, '');
      const sel = getSelection(); const r = sel.getRangeAt(0); r.deleteContents();
      const last = tpl.content.lastChild; r.insertNode(tpl.content);
      if (last) { const c = document.createRange(); c.setStartAfter(last); c.collapse(true); sel.removeAllRanges(); sel.addRange(c); }
      changed(); return;
    }
    document.execCommand('insertHTML', false, out);
  });
  ed.addEventListener('drop', e => {
    if (!(e.dataTransfer && e.dataTransfer.files.length)) return;
    e.preventDefault();
    const pics = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type));
    if (!pics.length || modeOf(state.project) === 'screenplay') return;
    const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (r && ed.contains(r.startContainer)) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
    pics.forEach(f => insertImage(f));
  });
  ed.addEventListener('click', e => {
    const m = e.target.closest('mark.cmt'); if (m) revise.focusNote(m.dataset.c);
    const fig = e.target.closest('figure[data-img]'); if (fig) imageMenu(fig);
  });
  md.addEventListener('drop', e => {
    const pics = e.dataTransfer ? [...e.dataTransfer.files].filter(f => /^image\//.test(f.type)) : [];
    if (!pics.length) return; e.preventDefault(); pics.forEach(f => insertImage(f));
  });
  // character hover cards
  let raf = 0;
  ed.addEventListener('mousemove', e => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => nameHover(e.clientX, e.clientY)); });
  ed.addEventListener('mouseleave', () => hideHover());
}

// ---------- Names from the story bible: underline + hover cards ----------
let nameRanges = [];
function refreshNames() {
  nameRanges = [];
  const ed = $('#editor');
  const ok = window.CSS && CSS.highlights && window.Highlight;
  if (!ed || isMd() || !settings.nameHints || !ok) { if (ok) CSS.highlights.delete('ink-name'); return; }
  const idx = nameIndex(); const byTerm = new Map(idx.map(x => [x.term, x.id]));
  const re = nameRegex(idx.map(x => x.term));
  if (re) for (const blk of ed.querySelectorAll(':scope > *, :scope > ul > li, :scope > ol > li, :scope > blockquote > *')) {
    if (/^(UL|OL|BLOCKQUOTE|HR)$/.test(blk.tagName)) continue;
    const text = blk.textContent; re.lastIndex = 0; let m;
    while ((m = re.exec(text))) { const r = revise.rangeIn(blk, m.index, m.index + m[0].length); if (r) nameRanges.push({ r, id: byTerm.get(m[0]) }); }
  }
  if (nameRanges.length) CSS.highlights.set('ink-name', new Highlight(...nameRanges.map(x => x.r))); else CSS.highlights.delete('ink-name');
}
const refreshNamesSoon = debounce(refreshNames, 900);
function nameHover(x, y) {
  if (!nameRanges.length) return;
  for (const n of nameRanges) {
    for (const rect of n.r.getClientRects()) {
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) return hoverCardFor(n.id, rect);
    }
  }
  hideHover();
}

// ---------- Pictures in scenes ----------
function pickImage() {
  const fi = el('<input type="file" accept="image/*" multiple hidden>');
  // remember where the caret was, the file picker takes focus away
  const sel = getSelection(); const keep = sel.rangeCount && $('#editor').contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  fi.onchange = async () => { const files = [...fi.files]; fi.remove(); for (const f of files) await insertImage(f, keep); };
  document.body.appendChild(fi); // some mobile browsers only open the picker for inputs that are on the page
  fi.click();
}
async function insertImage(file, range = null) {
  if (!state.scene) return;
  let data;
  try { data = await compressImage(file); } catch (e) { return errorToast(e); }
  const it = newImageItem(state.project.id, state.scene.id, data);
  await db.put('items', it); state.items.push(it);
  if (isMd()) {
    const ta = $('#mdEditor'); ta.focus();
    document.execCommand('insertText', false, `\n\n![](inkfold-image:${it.id})\n\n`);
    toast('Picture added. It shows in the rich-text editor and in exports.');
    return;
  }
  const ed = $('#editor'); ed.focus();
  const sel = getSelection();
  if (range) { sel.removeAllRanges(); sel.addRange(range); }
  // the picture goes after the paragraph the caret is in (or replaces it if it's empty); writing carries on below it
  let block = sel.rangeCount ? sel.anchorNode : null;
  while (block && block.parentNode !== ed) block = block.parentNode;
  if (block && block.nodeType !== 1) block = null;
  const tpl = document.createElement('template');
  tpl.innerHTML = imgHtml({ img: it.id, w: data.w < 500 ? 55 : 100 });
  const fig = tpl.content.firstChild;
  const emptyP = n => n && n.tagName === 'P' && !n.textContent.trim() && !n.querySelector('img');
  if (block && emptyP(block)) block.replaceWith(fig);
  else if (block) block.after(fig);
  else ed.appendChild(fig);
  let next = fig.nextElementSibling;
  if (!emptyP(next)) { next = document.createElement('p'); next.innerHTML = '<br>'; fig.after(next); }
  const r = document.createRange(); r.setStart(next, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  hydrateImages(ed, state.items);
  changed(); haptic(8);
  requestAnimationFrame(centerCaret);
}
function imageMenu(fig) {
  const cur = +fig.dataset.w || 100;
  const p = popover(fig, `<div class="type-panel img-panel">
    <div><h4>Picture size</h4><div class="seg" id="imSize">${IMG_SIZES.map(z => `<button data-w="${z.w}" class="${Math.abs(cur - z.w) < 6 ? 'on' : ''}">${z.name}</button>`).join('')}</div></div>
    <div class="field" style="margin:0"><label class="field-label" for="imCap" style="margin:0">Caption</label><input class="input" id="imCap" value="${esc(fig.dataset.cap || '')}" placeholder="Optional" maxlength="300"></div>
    <div style="display:flex;gap:8px;justify-content:space-between"><button class="btn btn-ghost btn-sm" id="imReplace">${icon('image')}Replace</button><button class="btn btn-danger btn-sm" id="imRemove">${icon('trash')}Remove</button></div>
  </div>`, { align: 'start' });
  fig.classList.add('sel');
  const done = () => { fig.style.width = fig.dataset.w + '%'; changed(); };
  $$('#imSize button', p).forEach(b => b.onclick = () => { fig.dataset.w = b.dataset.w; $$('#imSize button', p).forEach(x => x.classList.toggle('on', x === b)); done(); });
  const cap = $('#imCap', p);
  cap.oninput = () => { const v = cap.value.trim(); if (v) fig.dataset.cap = v; else delete fig.dataset.cap; const img = $('img', fig); if (img) img.alt = v; changed(); };
  cap.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); closePop(); } };
  $('#imRemove', p).onclick = () => { const next = fig.nextElementSibling; fig.remove(); if (next && next.tagName === 'P' && !next.textContent.trim() && next.previousElementSibling && next.previousElementSibling.tagName === 'P' && !next.previousElementSibling.textContent.trim()) next.remove(); closePop(); changed(); toast('Picture removed', null, 1600); };
  $('#imReplace', p).onclick = () => {
    const fi = el('<input type="file" accept="image/*" hidden>'); document.body.appendChild(fi);
    fi.onchange = async () => {
      fi.remove(); if (!fi.files[0]) return;
      try { const data = await compressImage(fi.files[0]); const it = newImageItem(state.project.id, state.scene.id, data); await db.put('items', it); state.items.push(it); fig.dataset.img = it.id; hydrateImages($('#editor'), state.items); changed(); closePop(); }
      catch (e) { errorToast(e); }
    };
    fi.click();
  };
  const obs = new MutationObserver(() => { if (!document.body.contains(p)) { fig.classList.remove('sel'); obs.disconnect(); } });
  obs.observe(document.body, { childList: true, subtree: true });
}

function openFind() {
  const sel = getSelection();
  const pre = sel && !sel.isCollapsed && $('#editor')?.contains(sel.anchorNode) ? sel.toString().trim().slice(0, 80) : '';
  revise.findSheet(pre);
}

function applyFormat(f) {
  if (f === 'comment') return revise.addComment();
  if (f === 'image') return pickImage();
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
  if (!mod || sec.isLocked()) return;
  const k = e.key.toLowerCase();
  if (k === 'k' && !e.shiftKey) { e.preventDefault(); return openPalette(paletteItems); }
  if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); return shortcutsSheet(); }
  if (k === 'l' && e.shiftKey) { e.preventDefault(); if (sec.lockEnabled()) sec.lockNow(); else toast('Set a PIN in Settings to use app lock'); return; }
  if ($('#workspace').hidden) return;
  if (e.shiftKey && /^Digit[1-7]$/.test(e.code)) { e.preventDefault(); const views = $$('#viewSeg button').map(b => b.dataset.view); const v = views[+e.code.slice(5) - 1]; if (v) setView(v); return; }
  if (e.altKey && /^Digit[1-7]$/.test(e.code) && modeOf(state.project) === 'screenplay') { e.preventDefault(); const ed = $('#editor'); sp.setElement(ed, sp.ELEMENTS[+e.code.slice(5) - 1].id); changed(); updateElementLabel(); return; }
  if (e.shiftKey && k === 'n') { e.preventDefault(); const ch = state.items.find(i => i.id === state.scene?.parentId); if (ch) addScene(ch.id); return; }
  if (e.shiftKey && k === 'm') { e.preventDefault(); revise.addComment(); return; }
  if (e.key === 's') { e.preventDefault(); state.dirty = true; saveNow().then(() => toast('Saved', null, 1400)); }
  if (e.key === '.') { e.preventDefault(); setFocusMode(!document.body.classList.contains('focus')); }
  if (e.key === 'f' && !e.shiftKey) { e.preventDefault(); openFind(); }
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
    <div><h4>Focus dimming</h4><div class="seg" id="t-dim">${[['off', 'Off'], ['paragraph', 'Paragraph'], ['sentence', 'Sentence']].map(([k, l]) => `<button data-v="${k}" class="${settings.dim === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
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
  $$('#t-dim button', p).forEach(b => b.onclick = () => { settings.dim = b.dataset.v; $$('#t-dim button', p).forEach(x => x.classList.toggle('on', x === b)); saveSettings(); });
  $$('.font-opt', p).forEach(b => b.onclick = () => { settings.font = b.dataset.font; $$('.font-opt', p).forEach(x => x.classList.toggle('on', x === b)); saveSettings(); });
  bindToggles(p);
}
const toggleRow = (key, label, sub) => `<div class="toggle-row"><div class="t-text"><b>${label}</b><span>${sub}</span></div><button class="switch" role="switch" aria-checked="${!!settings[key]}" data-toggle="${key}" aria-label="${label}"></button></div>`;
function bindToggles(root) {
  $$('[data-toggle]', root).forEach(b => b.onclick = () => { const k = b.dataset.toggle; settings[k] = !settings[k]; b.setAttribute('aria-checked', settings[k]); saveSettings(); haptic(5); });
}

// ---------- Project details ----------
async function projectSheet(focus) {
  const p = state.project;
  const seriesList = await series.allSeries();
  let cover = p.cover, format = p.format || 'rich', coverImage = p.coverImage || null;
  const s = sheet({
    title: 'Project details',
    body: `<div class="field"><label class="field-label" for="pd-title">Title</label><input class="input" id="pd-title" value="${esc(p.title)}" maxlength="120"></div>
      <div class="field"><label class="field-label" for="pd-sub">Subtitle</label><input class="input" id="pd-sub" value="${esc(p.subtitle || '')}" placeholder="Optional" maxlength="120"></div>
      <div class="field"><label class="field-label" for="pd-author">Author</label><input class="input" id="pd-author" value="${esc(p.author || '')}" maxlength="80"></div>
      <div class="field"><span class="field-label">Cover</span>
        <div class="cover-edit"><div class="cover-thumb" id="pd-thumb"></div>
          <div class="cover-edit-side"><div class="cover-picks">${COVERS.map((c, i) => `<button class="cover-pick ${i === cover ? 'on' : ''}" data-i="${i}" style="--cbg:${c.bg}" aria-label="${c.name}"></button>`).join('')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-quiet btn-sm" id="pd-upload">${icon('image')}Upload cover art</button><button class="btn btn-ghost btn-sm" id="pd-remove" ${coverImage ? '' : 'hidden'}>Remove</button></div>
          <span class="note" style="text-align:left">Portrait images work best (2 : 3).</span></div></div></div>
      <div class="split2">
        <div class="field"><label class="field-label" for="pd-target">Word target</label><input class="input tnum" id="pd-target" type="number" min="0" step="1000" value="${p.target || ''}" placeholder="e.g. 80000"></div>
        <div class="field"><label class="field-label" for="pd-deadline">Deadline</label><input class="input tnum" id="pd-deadline" type="date" value="${p.deadline || ''}"></div>
      </div>
      <div class="field" id="pd-series-f"><label class="field-label" for="pd-series">Series</label>
        <select class="input" id="pd-series" ${p.enc ? 'disabled' : ''}><option value="">Not in a series</option>${seriesList.map(x => `<option value="${x.id}" ${p.seriesId === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}<option value="__new">New series…</option></select>
        <input class="input" id="pd-series-new" placeholder="Name of the new series" maxlength="120" hidden>
        <span class="note" style="text-align:left">${p.enc ? 'Encrypted projects can’t join a series.' : 'Books in a series share their characters, places and lore.'}</span></div>
      <div class="field"><span class="field-label">Type of project</span><div class="seg" id="pd-mode">${Object.entries(MODES).map(([k, m]) => `<button data-v="${k}" class="${modeOf(p) === k ? 'on' : ''}">${m.name}</button>`).join('')}</div></div>
      <div class="field"><span class="field-label">Editor</span><div class="seg" id="pd-format"><button data-v="rich" class="${format === 'rich' ? 'on' : ''}">Rich text</button><button data-v="markdown" class="${format === 'markdown' ? 'on' : ''}">Markdown</button></div><span class="note" style="text-align:left">Rich text supports Markdown shortcuts too. Switching keeps your formatting.</span></div>`,
    foot: `<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-save>Save</button>`
  });
  const thumb = () => { const c = COVERS[cover % COVERS.length]; const t = $('#pd-thumb', s.wrap); t.style.background = coverImage ? `center/cover url('${coverImage}')` : c.bg; t.innerHTML = coverImage ? '' : `<span style="color:${c.fg}">${esc($('#pd-title', s.wrap).value || p.title)}</span>`; $('#pd-remove', s.wrap).hidden = !coverImage; };
  $$('.cover-pick', s.wrap).forEach(b => b.onclick = () => { cover = +b.dataset.i; coverImage = null; $$('.cover-pick', s.wrap).forEach(x => x.classList.toggle('on', x === b)); thumb(); });
  $('#pd-upload', s.wrap).onclick = async () => {
    const [f] = await pickFiles({ accept: 'image/*' });
    if (!f) return;
    try { coverImage = await coverFromFile(f); thumb(); } catch (e) { errorToast(e); }
  };
  $('#pd-remove', s.wrap).onclick = () => { coverImage = null; thumb(); };
  thumb();
  let pmode = modeOf(p);
  $$('#pd-mode button', s.wrap).forEach(b => b.onclick = () => { pmode = b.dataset.v; $$('#pd-mode button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $$('#pd-format button', s.wrap).forEach(b => b.onclick = () => { format = b.dataset.v; $$('#pd-format button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); });
  $('[data-c]', s.wrap).onclick = s.close;
  $('#pd-series', s.wrap).onchange = e => { const n = $('#pd-series-new', s.wrap); n.hidden = e.target.value !== '__new'; if (!n.hidden) n.focus(); };
  if (focus === 'series') setTimeout(() => { $('#pd-series-f', s.wrap).scrollIntoView({ block: 'center' }); $('#pd-series', s.wrap).focus(); }, 80);
  $('[data-save]', s.wrap).onclick = async () => {
    await saveNow();
    // series change first: it moves the story bible around
    let want = $('#pd-series', s.wrap).value, newName = '';
    if (want === '__new') {
      newName = $('#pd-series-new', s.wrap).value.trim();
      if (!newName) { $('#pd-series-new', s.wrap).focus(); return toast('Give the new series a name'); }
    }
    if (want !== (p.seriesId || '')) {
      const target = seriesList.find(x => x.id === want);
      const ok = await confirmSheet(want
        ? { title: `Add to “${esc(newName || (target ? target.title : 'the series'))}”?`, sub: 'This book’s characters, places and lore move into the series and are shared with its other books. Entries with the same name are merged into one.', confirm: 'Add to series' }
        : { title: 'Take this book out of its series?', sub: 'It keeps its own copy of the shared characters, places and lore. Changes you make afterwards won’t reach the other books.', confirm: 'Take it out' });
      if (!ok) return;
      try {
        if (newName) { const rec = series.newSeriesRecord(newName); await db.put('projects', rec); want = rec.id; }
        if (p.seriesId) await series.leaveSeries(p);
        if (want) await series.joinSeries(p, want);
      } catch (e) { return errorToast(e); }
    }
    Object.assign(p, { title: $('#pd-title').value.trim() || 'Untitled project', subtitle: $('#pd-sub').value.trim(), author: $('#pd-author').value.trim(), cover, format, coverImage, target: parseInt($('#pd-target').value, 10) || null, deadline: $('#pd-deadline').value || null });
    if (p.sample) p.sample = false;
    touch(p); await db.put('projects', p);
    const modeChanged = pmode !== modeOf(p);
    if (modeChanged) { p.mode = pmode; if (pmode !== 'novel') p.format = 'rich'; touch(p); await db.put('projects', p); }
    s.close();
    if (want !== (state.series ? state.series.id : '')) { toast(want ? 'Added to the series' : 'Taken out of the series'); return openProject(p.id, state.scene && state.scene.id); }
    renderProjectHead(); renderGoalStrip();
    if (modeChanged) { const id = state.scene && state.scene.id; renderWorkspace(); if (id) await loadScene(id); await setView('write'); }
    else if (state.scene) await loadScene(state.scene.id);
    toast('Project updated');
  };
}

// ---------- Export ----------
function exportSheet() {
  compileSheet({ state, saveNow, saveProject: async () => { touch(state.project); await db.put('projects', state.project); } });
}

// ---------- Scene status ----------
function statusMenu(anchor) {
  menu(anchor, STATUSES.map(st => ({ k: st.id, icon: statusOf(state.scene).id === st.id ? 'check' : 'file', label: st.name, run: async () => {
    state.scene.status = st.id; await saveItem(state.scene); updateCrumbs(); renderBinder();
  } })));
}

// ---------- Cover art ----------
async function coverFromFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be opened.')); i.src = url; });
    const W = 600, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
    const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
    c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.84);
  } finally { URL.revokeObjectURL(url); }
}

// ---------- Focus dimming (paragraph / sentence) ----------
const HL = !!(window.CSS && CSS.highlights && window.Highlight);
function applyDim() {
  const ed = $('#editor'); if (!ed) return;
  ed.classList.toggle('dim', settings.dim !== 'off');
  ed.classList.toggle('dim-s', settings.dim === 'sentence' && HL);
  if (HL && settings.dim !== 'sentence') CSS.highlights.delete('ink-sentence');
  trackDim();
}
function textRange(root, start, end) {
  const r = document.createRange();
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0, n, setStart = false;
  while ((n = w.nextNode())) {
    const len = n.nodeValue.length;
    if (!setStart && start <= pos + len) { r.setStart(n, start - pos); setStart = true; }
    if (setStart && end <= pos + len) { r.setEnd(n, end - pos); return r; }
    pos += len;
  }
  if (setStart) r.setEnd(root, root.childNodes.length);
  return setStart ? r : null;
}
function trackDim() {
  if (settings.dim === 'off') return;
  const ed = $('#editor'); if (!ed || document.activeElement !== ed) return;
  const b = currentBlock();
  $$(':scope > .cur', ed).forEach(x => { if (x !== b) x.classList.remove('cur'); });
  if (!b) return;
  b.classList.add('cur');
  if (settings.dim !== 'sentence' || !HL) return;
  const sel = getSelection(); if (!sel.rangeCount) return;
  const caret = sel.getRangeAt(0);
  const pre = document.createRange(); pre.selectNodeContents(b);
  try { pre.setEnd(caret.startContainer, caret.startOffset); } catch { return; }
  const off = pre.toString().length, text = b.textContent;
  const re = /[.!?…]+["”’)\]]*\s+/g; let m, start = 0, end = text.length;
  while ((m = re.exec(text))) { const e = m.index + m[0].length; if (e <= off) start = e; else { end = e; break; } }
  const r = textRange(b, start, end);
  if (r) CSS.highlights.set('ink-sentence', new Highlight(r));
}
let dimRaf = 0;
document.addEventListener('selectionchange', () => { if (settings.dim === 'off') return; cancelAnimationFrame(dimRaf); dimRaf = requestAnimationFrame(trackDim); });

// ---------- Writing sprints ----------
let sprintTimer = null;
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function sprintPanel(anchor) {
  let min = settings.sprintMin || 25, pomodoro = !!settings.pomodoro;
  const p = popover(anchor, `<div class="type-panel sprint-panel">
    <div><h4>Writing sprint</h4><p class="sp-sub">Write without stopping until the timer ends.</p></div>
    <div class="dur-grid">${[10, 15, 25, 45, 60].map(m => `<button class="dur ${m === min ? 'on' : ''}" data-m="${m}"><b class="tnum">${m}</b><small>min</small></button>`).join('')}</div>
    <div class="field"><label class="field-label" for="sp-goal" style="margin:0">Word goal (optional)</label><input class="input tnum" id="sp-goal" type="number" min="0" step="50" placeholder="e.g. 500" value="${settings.sprintGoal || ''}"></div>
    <div class="toggle-row"><div class="t-text"><b>Pomodoro</b><span>Take a 5-minute break after each sprint</span></div><button class="switch" role="switch" aria-checked="${pomodoro}" id="sp-pomo" aria-label="Pomodoro"></button></div>
    <button class="btn btn-primary" id="sp-start">${icon('play')}Start ${min}-minute sprint</button>
  </div>`);
  $$('.dur', p).forEach(b => b.onclick = () => { min = +b.dataset.m; $$('.dur', p).forEach(x => x.classList.toggle('on', x === b)); $('#sp-start', p).innerHTML = `${icon('play')}Start ${min}-minute sprint`; });
  $('#sp-pomo', p).onclick = e => { pomodoro = !pomodoro; e.currentTarget.setAttribute('aria-checked', pomodoro); };
  $('#sp-start', p).onclick = () => {
    const goal = parseInt($('#sp-goal', p).value, 10) || null;
    Object.assign(settings, { sprintMin: min, sprintGoal: goal, pomodoro }); saveSettings();
    closePop(); startSprint(min, goal, pomodoro);
  };
}
function startSprint(min, goal, pomodoro, round = 1) {
  clearInterval(sprintTimer);
  state.sprint = { phase: 'write', start: Date.now(), dur: min * 60000, min, goal, pomodoro, round, words: 0 };
  sprintTimer = setInterval(tickSprint, 500);
  if (state.view !== 'write') setView('write');
  (isMd() ? $('#mdEditor') : $('#editor')).focus();
  haptic(10); renderSprintPill();
  toast(`Sprint started. ${min} minutes${goal ? `, aiming for ${num(goal)} words` : ''}.`, null, 2400);
}
function tickSprint() {
  const sp = state.sprint; if (!sp) return clearInterval(sprintTimer);
  if (Date.now() - sp.start >= sp.dur) return sp.phase === 'write' ? finishSprint() : endBreak();
  renderSprintPill();
}
function renderSprintPill() {
  const pill = $('#sprintPill'); if (!pill) return;
  const sp = state.sprint;
  $$('[data-act="sprint"].icon-btn').forEach(b => b.classList.toggle('on', !!sp));
  if (!sp) { pill.hidden = true; return; }
  pill.hidden = false;
  const left = sp.dur - (Date.now() - sp.start);
  const pct = Math.min(1, (Date.now() - sp.start) / sp.dur);
  pill.className = 'sprint-pill ' + sp.phase;
  pill.innerHTML = `${ring(pct, 18, 2.4)}<b class="tnum">${mmss(left)}</b>${sp.phase === 'write' ? `<span class="tnum">+${num(sp.words)}${sp.goal ? ` / ${num(sp.goal)}` : ''}</span>` : '<span>Break</span>'}`;
}
async function finishSprint(early = false) {
  clearInterval(sprintTimer);
  await saveNow();
  const sp = state.sprint; if (!sp) return;
  const mins = early ? Math.max(1, (Date.now() - sp.start) / 60000) : sp.min;
  const wph = Math.round(sp.words / (mins / 60));
  const hit = sp.goal && sp.words >= sp.goal;
  state.sprint = null; renderSprintPill();
  sound.chime(); if (hit) haptic([12, 60, 18]);
  const hist = await db.meta('sprints', []);
  hist.push({ at: Date.now(), min: Math.round(mins), words: sp.words, projectId: state.project?.id }); await db.setMeta('sprints', hist.slice(-200));
  const best = Math.max(...hist.map(h => h.words / (h.min / 60) || 0));
  const s = sheet({ title: early ? 'Sprint ended' : 'Time’s up', foot: null, body: `
    <div class="sprint-result">
      ${hit ? `<div class="sr-badge"><div class="cb-burst"><i></i><i></i><i></i><svg viewBox="0 0 24 24" class="cb-check"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><b>Goal reached</b></div>` : ''}
      <div class="sr-big tnum">${num(sp.words)}<small>words</small></div>
      <div class="sr-row tnum"><div><b>${Math.round(mins)}</b><span>minute${Math.round(mins) === 1 ? '' : 's'}</span></div><div><b>${num(wph)}</b><span>words per hour</span></div><div><b>${sp.goal ? Math.round(sp.words / sp.goal * 100) + '%' : '—'}</b><span>of goal</span></div></div>
      ${wph >= best && hist.length > 1 && sp.words > 0 ? '<p class="note">Your fastest sprint yet.</p>' : ''}
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${sp.pomodoro ? `<button class="btn btn-primary" data-break>${icon('cup')}Start 5-minute break</button><button class="btn btn-quiet" data-again>Skip break</button>` : `<button class="btn btn-primary" data-again>${icon('play')}Another ${sp.min} minutes</button><button class="btn btn-quiet" data-done>Done</button>`}
      </div>
    </div>` });
  const again = $('[data-again]', s.wrap); if (again) again.onclick = () => { s.close(); startSprint(sp.min, sp.goal, sp.pomodoro, sp.round + 1); };
  const done = $('[data-done]', s.wrap); if (done) done.onclick = s.close;
  const br = $('[data-break]', s.wrap); if (br) br.onclick = () => { s.close(); startBreak(sp); };
}
function startBreak(prev) {
  state.sprint = { phase: 'break', start: Date.now(), dur: 5 * 60000, prev };
  sprintTimer = setInterval(tickSprint, 500); renderSprintPill();
}
function endBreak() {
  clearInterval(sprintTimer);
  const prev = state.sprint.prev; state.sprint = null; renderSprintPill(); sound.chime();
  toast('Break’s over', { label: 'Next sprint', run: () => startSprint(prev.min, prev.goal, prev.pomodoro, prev.round + 1) }, 0);
}
function sprintMenu(anchor) {
  const sp = state.sprint;
  menu(anchor, sp.phase === 'write'
    ? [{ k: 'end', icon: 'stop', label: 'End sprint now', run: () => finishSprint(true) }, { k: 'cancel', icon: 'x', label: 'Cancel sprint', danger: true, run: () => { clearInterval(sprintTimer); state.sprint = null; renderSprintPill(); } }]
    : [{ k: 'skip', icon: 'play', label: 'Skip break', run: () => { clearInterval(sprintTimer); const p = state.sprint.prev; state.sprint = null; startSprint(p.min, p.goal, p.pomodoro, p.round + 1); } }, { k: 'stop', icon: 'x', label: 'Stop', run: () => { clearInterval(sprintTimer); state.sprint = null; renderSprintPill(); } }]);
}

// ---------- Soundscapes ----------
function soundPanel(anchor) {
  const cur = sound.playing();
  const p = popover(anchor, `<div class="type-panel">
    <div><h4>Soundscapes</h4><p class="sp-sub">Generated on your device, so they play offline.</p></div>
    <div class="snd-grid">${sound.SOUNDS.map(x => `<button class="snd ${cur === x.id ? 'on' : ''}" data-s="${x.id}">${icon(x.icon)}<span>${x.name}</span></button>`).join('')}</div>
    <label class="slider-row"><span>${icon('volume')}</span><input type="range" id="snd-vol" min="0" max="1" step="0.05" value="${settings.volume}"><output></output></label>
    <button class="btn btn-quiet btn-sm" id="snd-off" ${cur ? '' : 'hidden'}>${icon('stop')}Stop</button>
  </div>`);
  const vol = $('#snd-vol', p);
  const fill = () => vol.style.setProperty('--p', vol.value * 100 + '%');
  fill();
  vol.oninput = () => { settings.volume = +vol.value; sound.setVolume(settings.volume); fill(); };
  vol.onchange = saveSettings;
  const mark = () => { const c = sound.playing(); $$('.snd', p).forEach(b => b.classList.toggle('on', b.dataset.s === c)); $('#snd-off', p).hidden = !c; $$('[data-act="sound"]').forEach(b => b.classList.toggle('on', !!c)); };
  $$('.snd', p).forEach(b => b.onclick = () => { if (sound.playing() === b.dataset.s) sound.stop(); else { sound.setVolume(settings.volume); sound.play(b.dataset.s); } mark(); haptic(5); });
  $('#snd-off', p).onclick = () => { sound.stop(); mark(); };
}

// ---------- Goals & stats ----------
async function statsSheet() {
  if (state.project) await saveNow();
  const goal = settings.dailyGoal;
  const sum = await stats.summary(goal);
  const projects = (await db.all('projects')).filter(p => !p.deleted && !series.isSeries(p)).sort((a, b) => (b.lastEdited || b.updatedAt) - (a.lastEdited || a.updatedAt));
  const pst = await Promise.all(projects.map(p => projectStats(p.id)));
  const weekDelta = sum.lastWeek ? Math.round((sum.week - sum.lastWeek) / sum.lastWeek * 100) : null;

  // heatmap: 26 weeks, Monday-first
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const start = stats.addDays(today, -(25 * 7 + dow));
  let cells = '', months = '', lastMonth = -1;
  for (let w = 0; w < 26; w++) {
    const first = stats.addDays(start, w * 7);
    const m = first.getMonth();
    months += `<span style="grid-column:${w + 1}">${m !== lastMonth ? first.toLocaleDateString(undefined, { month: 'short' }) : ''}</span>`;
    lastMonth = m;
    for (let d = 0; d < 7; d++) {
      const day = stats.addDays(start, w * 7 + d);
      if (day > today) { cells += `<i style="grid-column:${w + 1};grid-row:${d + 1}" class="fut"></i>`; continue; }
      const words = sum.byDay.get(stats.dayKey(day)) || 0;
      const lv = !words ? 0 : words >= goal ? 4 : words >= goal * 0.5 ? 3 : words >= goal * 0.25 ? 2 : 1;
      cells += `<i style="grid-column:${w + 1};grid-row:${d + 1}" class="l${lv}" title="${day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${num(words)} words"></i>`;
    }
  }
  // best hours chart
  const maxH = Math.max(1, ...sum.hours);
  const bars = sum.hours.map((v, h) => `<div class="hb ${h === sum.peak ? 'peak' : v ? 'has' : ''}" title="${stats.hourLabel(h)}: ${num(v)} words"><i style="height:${v ? Math.max(4, v / maxH * 100) : 0}%"></i></div>`).join('');
  const hourAxis = [0, 6, 12, 18].map(h => `<span style="left:${(h + 0.5) / 24 * 100}%">${stats.hourLabel(h)}</span>`).join('');

  const projRows = projects.map((p, i) => {
    const pl = stats.plan(p, pst[i].words, sum.byProjectDay);
    const c = COVERS[p.cover % COVERS.length];
    let line = 'Set a word target to see your pace';
    if (pl) {
      if (pl.remaining === 0) line = `<b class="ok">Target reached</b>`;
      else if (pl.daysLeft === undefined) line = `${num(pl.remaining)} words to go · add a deadline to plan your pace`;
      else if (pl.daysLeft <= 0) line = `<b class="late">Deadline passed</b> · ${num(pl.remaining)} words to go`;
      else line = `<b class="${pl.onTrack ? 'ok' : 'late'}">${num(pl.perDay)} words a day</b> for ${pl.daysLeft} day${pl.daysLeft === 1 ? '' : 's'} · ${pl.onTrack ? 'on track' : `you’re averaging ${num(pl.pace)}`}`;
    }
    return `<div class="plan-row" data-pid="${p.id}">
      <div class="plan-cover" style="background:${p.coverImage ? `center/cover url('${p.coverImage}')` : c.bg}"></div>
      <div class="plan-main"><div class="plan-top"><b>${esc(p.title)}</b><span class="tnum">${num(pst[i].words)}${p.target ? ` / ${num(p.target)}` : ''} words</span></div>
        <div class="bar"><i style="width:${pl ? pl.pct * 100 : 0}%"></i></div>
        <div class="plan-line">${line}</div></div>
      <div class="plan-inputs"><label><span>Target</span><input class="input tnum" type="number" min="0" step="1000" data-pf="target" value="${p.target || ''}" placeholder="80000"></label><label><span>Deadline</span><input class="input tnum" type="date" data-pf="deadline" value="${p.deadline || ''}"></label></div>
    </div>`;
  }).join('');

  const s = sheet({ title: 'Goals & stats', wide: 'x', foot: null, sub: 'Counted from words you add on this device and the devices you sync with.', body: `
    <div class="tiles">
      <div class="tile tile-today">${ring(sum.today / goal, 72, 5)}<div class="tt-main"><span class="t-label">Today</span><b class="tnum">${num(sum.today)}<small> words</small></b><label class="goal-edit">Daily goal <input class="tnum" type="number" id="st-goal" min="50" step="50" value="${goal}"></label></div></div>
      <div class="tile"><span class="t-label">${icon('flame')}Streak</span><b class="tnum">${sum.streak}<small> day${sum.streak === 1 ? '' : 's'}</small></b><span class="t-sub tnum">Best ${sum.best} · goal met each day</span></div>
      <div class="tile"><span class="t-label">${icon('calendar')}Last 7 days</span><b class="tnum">${num(sum.week)}</b><span class="t-sub tnum">${weekDelta === null ? 'words written' : `${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDelta)}% vs previous week`}</span></div>
      <div class="tile" data-lv style="cursor:pointer"><span class="t-label">${icon('star')}Level</span><b class="tnum">${computeExp(sum.byDay).level}<small> ${esc(computeExp(sum.byDay).title)}</small></b><span class="t-sub tnum">${num(computeExp(sum.byDay).exp)} EXP · tap for details</span></div>
      <div class="tile"><span class="t-label">${icon('timer')}Pace</span><b class="tnum">${sum.wph ? num(sum.wph) : '—'}<small> words/hr</small></b><span class="t-sub tnum">${sum.minutes >= 1 ? `${Math.round(sum.minutes / 60 * 10) / 10} h of active writing` : 'Shows after some writing time'}</span></div>
    </div>
    <div class="group"><div class="group-title">Every day you wrote</div>
      <div class="heat-wrap"><div class="heat-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div>
        <div class="heat-scroll"><div class="heat-months">${months}</div><div class="heat">${cells}</div></div></div>
      <div class="heat-legend"><span>Less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>Goal met</span></div>
    </div>
    <div class="group"><div class="group-title">When you write best</div>
      <div class="card hours-card"><p class="hours-lead">${sum.peak !== null ? `You write the most around <b>${stats.hourLabel(sum.peak)}</b>.` : 'Write for a while and your best hours will show here.'}</p>
      <div class="hours" role="img" aria-label="Words written by hour of day"><div class="hours-bars">${bars}</div><div class="hours-axis">${hourAxis}</div></div></div>
    </div>
    <div class="group"><div class="group-title">Deadlines</div><div class="card-list plans">${projRows || '<div class="empty-note">No projects yet.</div>'}</div></div>` });

  $('[data-lv]', s.wrap).onclick = () => { s.close(); levelSheet(); };
  $('#st-goal', s.wrap).onchange = async e => { settings.dailyGoal = Math.max(50, parseInt(e.target.value, 10) || 500); await saveSettings(); s.close(); statsSheet(); renderGoalStrip(); if (!$('#library').hidden) renderLibrary(); };
  $$('[data-pf]', s.wrap).forEach(inp => inp.onchange = async () => {
    const pid = inp.closest('[data-pid]').dataset.pid;
    const p = await db.get('projects', pid);
    p[inp.dataset.pf] = inp.dataset.pf === 'target' ? (parseInt(inp.value, 10) || null) : (inp.value || null);
    touch(p); await db.put('projects', p);
    if (state.project && state.project.id === pid) Object.assign(state.project, { target: p.target, deadline: p.deadline, rev: p.rev, revs: p.revs, updatedAt: p.updatedAt });
    s.close(); statsSheet(); renderGoalStrip();
  });
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
    if (ext === 'fountain' || ext === 'spmd') {
      const { meta, chapters } = sp.parseFountain(await file.text());
      const p = await createProjectFrom(meta.title || file.name.replace(/\.[^.]+$/, ''), chapters, { mode: 'screenplay', author: meta.author || meta.authors || '' });
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
  const trashI = items.filter(i => i.deleted && !i.deletedWith && ['chapter', 'scene', 'character', 'place', 'lore', 'map'].includes(i.type) && !(projects.find(p => p.id === i.projectId) || {}).deleted);
  const pname = id => (projects.find(p => p.id === id) || {}).title || '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const mb = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

  const s = sheet({ title: 'Settings', wide: true, foot: null, body: `
    <div class="group"><div class="group-title">Appearance</div>
      <div class="theme-picks" id="st-theme">${THEMES.map(([k, l, a, b, c]) => `<button data-v="${k}" class="theme-pick ${settings.theme === k ? 'on' : ''}"><span class="tp-sw" style="--a:${a};--b:${b};--c:${c}">${k === 'system' ? '<i class="half"></i>' : '<i></i><i></i>'}</span><b>${l}</b></button>`).join('')}</div>
    </div>
    <div class="group"><div class="group-title">Privacy</div>
      <div class="card-list">
        <div class="li"><div class="li-icon">${icon('lock')}</div><div class="li-text"><b>App lock</b><span>${sec.lockEnabled() ? 'Inkfold asks for your PIN when it opens' : 'Ask for a PIN when Inkfold opens'}</span></div><button class="switch" role="switch" aria-checked="${sec.lockEnabled()}" data-a="lock-toggle" aria-label="App lock"></button></div>
        ${sec.lockEnabled() ? `<div class="li"><div class="li-icon">${icon('clock')}</div><div class="li-text"><b>Lock automatically</b><span>After this long without use, or away from the app</span></div><select class="input sel-sm" id="st-lockt">${[[0, 'Immediately'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [60, '1 hour']].map(([v, l]) => `<option value="${v}" ${sec.lockTimeout() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="li"><div class="li-icon">${icon('keyboard')}</div><div class="li-text"><b>Change PIN</b></div><button class="btn btn-quiet btn-sm" data-a="pin-change">Change</button><button class="btn btn-ghost btn-sm" data-a="lock-now">Lock now</button></div>` : ''}
        <div class="li"><div class="li-icon">${icon('shield')}</div><div class="li-text"><b>Encrypted projects</b><span>Open a project, then choose Encrypt project from its ••• menu</span></div></div>
      </div>
    </div>
    <div class="group"><div class="group-title">Shortcuts</div><div class="card-list"><div class="li"><div class="li-icon">${icon('command')}</div><div class="li-text"><b>Command palette</b><span>Press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + K anywhere to jump to anything</span></div><button class="btn btn-quiet btn-sm" data-a="shortcuts">All shortcuts</button></div></div></div>
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
      <div class="card-list">${trashP.length + trashI.length ? [...trashP.map(p => ({ id: p.id, kind: 'project', title: p.title, sub: series.isSeries(p) ? 'Series' : 'Project', at: p.deletedAt })), ...trashI.map(i => ({ id: i.id, kind: 'item', title: i.title, sub: `${i.type === 'chapter' ? 'Chapter' : i.type === 'scene' ? 'Scene' : i.type === 'map' ? 'Map' : (KINDS[i.type]?.one || 'Item')} in ${pname(i.projectId)}`, at: i.deletedAt }))]
        .sort((a, b) => b.at - a.at).map(t => `<div class="li"><div class="li-icon">${icon(t.kind === 'project' ? 'book' : 'file')}</div><div class="li-text"><b>${esc(t.title)}</b><span>${esc(t.sub)} · deleted ${ago(t.at)}</span></div><button class="btn btn-ghost btn-sm" data-untrash="${t.kind}:${t.id}">Restore</button><button class="icon-btn" data-purge="${t.kind}:${t.id}" aria-label="Delete forever">${icon('x')}</button></div>`).join('')
        : `<div class="empty-note">Trash is empty. Deleted items stay here for 30 days.</div>`}</div>
    </div>
    <div class="group"><div class="group-title">This device</div>
      <div class="field"><label class="field-label" for="st-name" style="margin:0">Name shown when syncing</label><input class="input" id="st-name" value="${esc(state.device.name)}" maxlength="40"></div>
      ${Object.keys(lastSync).length ? `<div class="card-list">${Object.values(lastSync).sort((a, b) => b.at - a.at).map(x => `<div class="li"><div class="li-icon">${icon('sync')}</div><div class="li-text"><b>${esc(x.name)}</b><span>Last synced ${ago(x.at)}</span></div></div>`).join('')}</div>` : ''}
    </div>
    <p class="note">Inkfold ${VERSION} · Everything is stored on this device. No accounts, no tracking.</p>` });

  if (focus === 'data') setTimeout(() => $('#st-data', s.wrap).scrollIntoView({ block: 'start' }), 80);
  $$('#st-theme button', s.wrap).forEach(b => b.onclick = () => { document.documentElement.classList.add('theme-fade'); settings.theme = b.dataset.v; if (DARK_THEMES.includes(settings.theme)) settings.darkTheme = settings.theme; $$('#st-theme button', s.wrap).forEach(x => x.classList.toggle('on', x === b)); saveSettings(); setTimeout(() => document.documentElement.classList.remove('theme-fade'), 500); });
  const lt = $('#st-lockt', s.wrap); if (lt) lt.onchange = () => sec.setLockTimeout(+lt.value);
  $('#st-name', s.wrap).onchange = async e => { state.device.name = e.target.value.trim() || state.device.name; await db.setMeta('deviceName', state.device.name); };
  s.body.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    try {
      if (a === 'backup') { await doBackup(); s.close(); settingsSheet('data'); }
      else if (a === 'restore') { const fi = $('#fileInput'); fi.value = ''; fi.onchange = () => { if (fi.files[0]) { s.close(); restoreFlow(fi.files[0]); } }; fi.click(); }
      else if (a === 'folder') { const d = await io.chooseBackupFolder(); toast(`Backups will be saved to “${d.name}”`); s.close(); settingsSheet('data'); }
      else if (a === 'persist') { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Storage protected' : 'Your browser decides this. Installing Inkfold usually turns it on.'); s.close(); settingsSheet('data'); }
      else if (a === 'install') { s.close(); installApp(); }
      else if (a === 'lock-toggle') {
        if (sec.lockEnabled()) { if (await confirmSheet({ title: 'Turn off app lock?', sub: 'Inkfold will open without asking for your PIN.', confirm: 'Turn off' })) { await sec.removePin(); toast('App lock is off'); } }
        else { const pin = await sec.pinSetupSheet(); if (pin) { await sec.setPin(pin, 5); toast('App lock is on'); } }
        s.close(); settingsSheet();
      }
      else if (a === 'pin-change') { const pin = await sec.pinSetupSheet(); if (pin) { await sec.setPin(pin); toast('PIN changed'); } }
      else if (a === 'lock-now') { s.close(); sec.lockNow(); }
      else if (a === 'shortcuts') { shortcutsSheet(); }
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
  items.filter(i => i.deletedWith === id && i.type !== 'comment').forEach(i => batch.push(i));
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
async function syncSheet() {
  await saveNow(); // so the scene being typed right now goes along
  let cleanup = null, scanStop = null, mode = 'code', wake = null, approving = false;
  navigator.wakeLock?.request('screen').then(w => { wake = w; }).catch(() => {});
  const s = sheet({ title: 'Nearby Sync', sub: 'Sync your library with another device. Your writing goes straight from one device to the other and is never stored online.', foot: null,
    onClose: () => { cleanup && cleanup(); scanStop && scanStop(); try { wake && wake.release(); } catch {} } });
  const body = s.body;

  const handlers = {
    onStatus: msg => { if (approving) return; const sl = $('#sync-status', body); if (sl) sl.innerHTML = `<span class="spinner"></span><span>${esc(msg)}</span>`; else progress(msg); },
    confirm: peer => new Promise(res => {
      haptic([20, 60, 20]); approving = true;
      view(`<div class="sync-big"><div class="done-mark">${icon('phone')}</div><b style="font-size:18px">Sync with ${esc(peer.name)}?</b><p class="note" style="max-width:40ch">Only continue if you just entered this code on that device. Your libraries will be merged, and a snapshot is saved first.</p><div style="display:flex;gap:8px"><button class="btn btn-ghost" data-no>Decline</button><button class="btn btn-primary" data-yes autofocus>Sync</button></div></div>`);
      $('[data-yes]', body).focus();
      $('[data-yes]', body).onclick = () => { approving = false; progress(`Syncing with ${peer.name}…`); res(true); };
      $('[data-no]', body).onclick = () => { approving = false; res(false); };
    }),
    onError: e => { console.error(e); if (cleanup) { try { cleanup(); } catch {} cleanup = null; } haptic(30); view(`<div class="sync-big"><div class="done-mark" style="background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)">${icon('x')}</div><b style="font-size:16px">Couldn’t sync</b><p class="note" style="max-width:40ch">${esc(e.message || 'The connection dropped.')} Make sure both devices are on the same Wi-Fi and have Inkfold open.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-quiet" data-back>Try again</button>${mode === 'code' ? '<button class="btn btn-ghost" data-offline>Use Offline (QR)</button>' : ''}</div><p class="note" style="max-width:40ch">Still stuck? Back up on one device (Library → Backup) and restore the file on the other.</p></div>`); const off = $('[data-offline]', body); if (off) off.onclick = () => { mode = 'offline'; home(); }; },
    onDone: (summary, peer) => {
      haptic([10, 40, 10]);
      view(`<div class="sync-big"><div class="done-mark">${icon('check')}</div><b style="font-size:18px">Synced with ${esc(peer.name)}</b><p class="note">${esc(sync.describeSummary(summary))}</p>
        ${summary.conflicts.length ? `<div class="card" style="text-align:left;width:100%"><b style="font-size:14px">Edited on both devices</b><p class="note" style="text-align:left;margin:4px 0 8px">Both versions were kept. Look for “conflicted copy” in the binder and keep the one you want.</p>${summary.conflicts.map(c => `<div style="font-size:13.5px;padding:4px 0">• ${esc(c.title)}</div>`).join('')}</div>` : ''}
        <button class="btn btn-primary" data-finish>Done</button></div>`);
      $('[data-finish]', body).onclick = () => s.close();
      refreshAfterDataChange();
    }
  };
  const view = html => { body.innerHTML = html; const b = $('[data-back]', body); if (b) b.onclick = () => { cleanup && cleanup(); cleanup = null; scanStop && scanStop(); home(); }; };
  const progress = msg => view(`<div class="sync-big" style="padding:30px 0"><div class="status-line" id="sync-status"><span class="spinner"></span><span>${esc(msg)}</span></div></div>`);
  const tabs = () => `<div class="seg" id="sync-mode"><button data-m="code" class="${mode === 'code' ? 'on' : ''}">${'Pairing code'}</button><button data-m="offline" class="${mode === 'offline' ? 'on' : ''}">Offline (QR)</button></div>`;

  function home() {
    if (mode === 'code') {
      view(`${tabs()}<div class="split2">
        <button class="choice" data-a="show"><div class="ci">${icon('phone')}</div><b>Show a code</b><span>On this device. Then type the code on the other one.</span></button>
        <button class="choice" data-a="enter"><div class="ci">${icon('edit')}</div><b>Enter a code</b><span>The other device is already showing a code.</span></button></div>
        <p class="note">Both devices need internet for a second to find each other and must be on the same Wi-Fi. Your writing then travels directly between them.</p>`);
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
      try {
        const q = qrcode(0, 'L'); q.addData(code); q.make();
        const n = q.getModuleCount(); let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
        qr = `<svg viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges" aria-label="Pairing QR code"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#0d1017"/></svg>`;
      } catch { qr = ''; }
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
      const detector = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : await loadLib(LIBS.jsqr);
      const video = $('video', body);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream; await video.play();
      const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
      let alive = true;
      scanStop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); scanStop = null; };
      const tick = async () => {
        if (!alive) return;
        if (video.videoWidth) {
          if (detector) {
            try { const hit = (await detector.detect(video)).find(c => /^IF1[OA]/.test(c.rawValue)); if (hit) { haptic(15); return go(hit.rawValue); } } catch {}
          } else {
            const w = Math.min(900, video.videoWidth), h = Math.round(video.videoHeight / video.videoWidth * w);
            cv.width = w; cv.height = h; cx.drawImage(video, 0, 0, w, h);
            const r = jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            if (r && /^IF1[OA]/.test(r.data)) { haptic(15); return go(r.data); }
          }
        }
        setTimeout(tick, 140);
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
    if (!settings.themeV2) { if (settings.theme === 'system') settings.theme = 'light'; settings.themeV2 = true; await db.setMeta('settings', settings); }
    applySettings();
    const openBibleEntry = id => setView('bible', { select: id });
    initMaps({ state, saveItem, openEntry: openBibleEntry, openScene: async id => { await setView('write'); await loadScene(id); }, onChange: () => {} });
    initBible({ state, saveItem, openEntry: openBibleEntry,
      openScene: async id => { await setView('write'); await loadScene(id); },
      findInScene: async (id, terms) => { await setView('write'); await loadScene(id); setTimeout(() => revise.highlightFind(nameRegex(terms), true), 60); },
      openMap: (mapId, markId) => setView('map', { map: { mapId, select: markId } }),
      onChange: () => { refreshNamesSoon(); } });
    revise.initRevise({ state, settings, saveSettings, saveNow, saveItem, isMd,
      reloadScene: async () => { const id = state.scene.id; state.dirty = false; state.items = await series.loadItems(state.project); await loadScene(id); renderBinder(); },
      openScene: async id => { await setView('write'); await loadScene(id); },
      markChanged: () => changed(),
      onChange: () => { renderBinder(); updateCrumbs(); } });
    initBoard({ state, saveItem, openScene: async id => { await setView('write'); await loadScene(id); }, addScene, addChapter,
      placeField: it => ['novel', 'screenplay', 'journal'].includes(modeOf(state.project)) ? { name: placeName(it.place), pick: after => scenePlaceSheet(it.id, () => { if (state.scene && state.scene.id === it.id) updateCrumbs(); after && after(); }) } : null,
      whenField: it => ['novel', 'screenplay'].includes(modeOf(state.project)) ? whenLabel(it.when) : null, whenSheet: id => whenSheet(id, () => renderCurrentView()),
      onChange: (o = {}) => { renderBinder(); updateCrumbs(); updateCounts(); if (!o.skipView) renderCurrentView(); } });
    initTimeline({ state, saveItem, openScene: async id => { await setView('write'); await loadScene(id); }, onChange: (o = {}) => { renderBinder(); updateCrumbs(); if (!o.skipView) renderCurrentView(); } });
    await sec.registerProjects();
    await sec.initLock({
      beforeLock: async () => { await saveNow(); while (sheets.length) sheets[sheets.length - 1].close(); closePop(); closePalette(); revise.stopSpeech(); if (state.project && state.project.enc) await goLibrary(); },
      afterUnlock: () => { if (!$('#library').hidden) renderLibrary(); },
    });
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
    const splash = $('#splash'); if (splash) { splash.classList.add('gone'); setTimeout(() => splash.remove(), 600); }
  }
  registerSW();
}
boot();
