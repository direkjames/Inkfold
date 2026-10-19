// Inkfold — Story bible: characters, places and lore, with [[links]], mentions and hover cards.
import { uid } from './db.js';
import { touch } from './model.js';
import { htmlToText } from './text.js';
import { $, $$, esc, num, el, icon, popover, closePop, menu, sheet, confirmSheet, haptic, toast, debounce, pickFiles } from './ui.js';
import { renderMap } from './relmap.js';

let ctx; // { state, saveItem, openScene, findInScene, onChange }
export function initBible(c) { ctx = c; }

export const KINDS = {
  character: { many: 'Characters', one: 'Character', icon: 'user' },
  place: { many: 'Places', one: 'Place', icon: 'pin' },
  lore: { many: 'Lore', one: 'Lore entry', icon: 'book' },
};
export const ROLES = ['Protagonist', 'Antagonist', 'Supporting', 'Minor'];
export const REL_KINDS = [
  { id: 'parent', name: 'Parent of', inverse: 'Child of', color: '#c49a2c', family: true, dir: true },
  { id: 'spouse', name: 'Married to', color: '#cf5f57', family: true },
  { id: 'sibling', name: 'Sibling of', color: '#d8873a', family: true },
  { id: 'romance', name: 'In love with', color: '#d4668c' },
  { id: 'friend', name: 'Friends with', color: '#4f9c66' },
  { id: 'ally', name: 'Allied with', color: '#3f9696' },
  { id: 'mentor', name: 'Mentor to', inverse: 'Mentored by', color: '#5583cc', dir: true },
  { id: 'colleague', name: 'Works with', color: '#848a99' },
  { id: 'rival', name: 'Rival of', color: '#9168c4' },
  { id: 'enemy', name: 'Enemy of', color: '#b4483a' },
];
export const relKind = id => REL_KINDS.find(k => k.id === id) || REL_KINDS[4];

const AV = ['#2f6f62', '#7a4e3a', '#4a5f8f', '#7b5a8a', '#5f7346', '#8a5a5a', '#3f6b7f', '#866b34'];
const hue = s => { let h = 0; for (const c of s || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
const initials = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export function avatar(it, size = 40, cls = '') {
  const d = it.data || {};
  return d.photo
    ? `<span class="av ${cls}" style="width:${size}px;height:${size}px;background-image:url('${d.photo}')"></span>`
    : `<span class="av ${cls} ${it.type !== 'character' ? 'sq' : ''}" style="width:${size}px;height:${size}px;background:${hue(it.title)};font-size:${Math.round(size * .38)}px">${it.type === 'character' ? esc(initials(it.title)) : icon(KINDS[it.type].icon)}</span>`;
}

export const entries = (type) => ctx.state.items.filter(i => !i.deleted && (type ? i.type === type : KINDS[i.type])).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
export const rels = () => ctx.state.items.filter(i => !i.deleted && i.type === 'rel');
const fullNames = it => [it.title, ...((it.data && it.data.aliases) || [])].map(s => (s || '').trim()).filter(s => s.length > 1);

// ---------- First names ----------
// "Luna Valentino" also matches plain "Luna", unless another entry is also called Luna (then only full names count).
const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'sir', 'dame', 'lady', 'lord', 'king', 'queen', 'prince', 'princess', 'duke', 'duchess', 'count', 'countess', 'baron', 'baroness', 'emperor', 'empress', 'captain', 'capt', 'general', 'professor', 'prof', 'father', 'mother', 'sister', 'brother', 'saint', 'st', 'aunt', 'uncle', 'master', 'madam', 'madame', 'detective', 'officer', 'agent', 'commander', 'colonel', 'lieutenant', 'sergeant', 'major', 'high', 'grand']);
export function firstNameOf(it) {
  if (!it || it.type !== 'character' || !it.title) return null;
  const words = it.title.trim().split(/\s+/);
  while (words.length > 1 && HONORIFICS.has(words[0].replace(/\.$/, '').toLowerCase())) words.shift();
  const first = (words[0] || '').replace(/[.,;:!?]+$/, '');
  if (first.length < 2 || first === it.title.trim()) return null;
  return first;
}
let fnCache = null; // { key, info: Map(id -> { name, clash: [entries], off }) }
function firstNames() {
  const list = entries();
  const key = list.map(e => e.id + '\u0001' + e.title + '\u0001' + ((e.data && e.data.aliases) || []).join('|') + '\u0001' + (e.data && e.data.firstName === false ? 0 : 1)).join('\u0002');
  if (fnCache && fnCache.key === key) return fnCache.info;
  const info = new Map(), byName = new Map();
  for (const e of list) { const n = firstNameOf(e); if (!n) continue; info.set(e.id, { name: n, clash: [], off: !!(e.data && e.data.firstName === false) }); if (!info.get(e.id).off) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(e); } }
  for (const [id, x] of info) {
    if (x.off) continue;
    const others = (byName.get(x.name) || []).filter(e => e.id !== id);
    // also clashes with another entry's full name or alias ("Luna" the place, or someone nicknamed Luna)
    for (const e of list) if (e.id !== id && !others.includes(e) && fullNames(e).includes(x.name)) others.push(e);
    x.clash = others;
  }
  fnCache = { key, info };
  return info;
}
export const namesOf = it => names(it);
// Create a story bible entry from elsewhere (e.g. a map pin or a scene's place)
export async function createEntry(type, title) {
  const it = touch({ id: uid(type.slice(0, 2) + '-'), projectId: ctx.state.project.seriesId || ctx.state.project.id, type, parentId: null, order: entries(type).length + 1, title: title || '', content: '', deleted: false, data: { aliases: [], traits: [] } });
  ctx.state.items.push(it);
  await ctx.saveItem(it);
  return it;
}
export function firstNameInfo(it) { return firstNames().get(it.id) || null; }
const names = it => {
  const full = fullNames(it);
  const f = firstNames().get(it.id);
  return f && !f.off && !f.clash.length && !full.includes(f.name) ? [...full, f.name] : full;
};

// Every name and alias, longest first, for highlighting and hover cards
export function nameIndex() {
  const idx = [];
  for (const e of entries()) for (const n of names(e)) idx.push({ term: n, id: e.id });
  return idx.sort((a, b) => b.term.length - a.term.length);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function nameRegex(terms) {
  if (!terms.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(reEsc).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

// ---------------------------------------------------------------- View
let tab = 'character', selected = null, query = '', mapMode = 'web';
export function setTab(t) { tab = t; }

export function renderBible(root, opts = {}) {
  if (opts.select) { const it = ctx.state.items.find(i => i.id === opts.select); if (it) { tab = it.type; selected = it.id; } }
  const list = tab === 'map' ? [] : entries(tab).filter(e => !query || names(e).some(n => n.toLowerCase().includes(query.toLowerCase())));
  const narrow = matchMedia('(max-width: 860px)').matches;
  if (tab !== 'map' && selected && !list.some(e => e.id === selected)) selected = null;
  if (tab !== 'map' && !selected && !narrow) selected = list[0]?.id || null;
  root.innerHTML = `<div class="bible ${tab === 'map' ? 'is-map' : ''} ${selected ? 'has-sel' : ''}">
    <aside class="bb-side">
      <div class="seg bb-tabs" role="tablist">
        ${Object.entries(KINDS).map(([k, v]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${v.many}</button>`).join('')}
        <button data-tab="map" class="${tab === 'map' ? 'on' : ''}">Relationships</button>
      </div>
      ${ctx.state.series ? `<div class="bb-shared" title="Changes here show up in every book of the series">${icon('stack')}<span>Shared with the series <b>${esc(ctx.state.series.title)}</b></span></div>` : ''}
      ${tab !== 'map' ? `
      <div class="bb-search">${icon('search')}<input id="bbSearch" placeholder="Search ${KINDS[tab].many.toLowerCase()}" value="${esc(query)}" autocomplete="off"></div>
      <div class="bb-list">${list.map(e => `<button class="bb-item ${e.id === selected ? 'on' : ''}" data-sel="${e.id}">${avatar(e, 38)}<span class="bi-text"><b>${esc(e.title || 'Unnamed')}</b><span>${esc(subline(e))}</span></span></button>`).join('') || `<div class="bb-empty">${icon(KINDS[tab].icon)}<b>No ${KINDS[tab].many.toLowerCase()} yet</b><span>${tab === 'character' ? 'Everyone in your story, with their wants, flaws and arcs.' : tab === 'place' ? 'Where things happen, so details stay consistent.' : 'Rules, history and objects of your world.'}</span></div>`}</div>
      <button class="btn btn-primary btn-sm bb-new" data-new="${tab}">${icon('plus')}New ${KINDS[tab].one.toLowerCase()}</button>` : ''}
    </aside>
    <section class="bb-main" id="bbMain"></section>
  </div>`;
  $$('[data-tab]', root).forEach(b => b.onclick = () => { tab = b.dataset.tab; selected = null; renderBible(root); });
  const s = $('#bbSearch', root);
  if (s) { s.oninput = debounce(() => { query = s.value; renderBible(root); const n = $('#bbSearch', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 180); }
  $$('[data-sel]', root).forEach(b => b.onclick = () => { selected = b.dataset.sel; renderBible(root); });
  const nb = $('[data-new]', root); if (nb) nb.onclick = () => newEntry(tab, root);
  const main = $('#bbMain', root);
  if (tab === 'map') renderMap(main, { ...ctx, mode: mapMode, setMode: m => { mapMode = m; }, openEntry: id => { tab = 'character'; selected = id; renderBible(root); }, relSheet });
  else if (selected) renderDetail(main, ctx.state.items.find(i => i.id === selected), root);
  else main.innerHTML = '';
}

function subline(e) {
  const d = e.data || {};
  if (e.type === 'character') return [d.role, d.age && `${d.age}`, d.occupation].filter(Boolean).join(' · ') || 'Character';
  if (e.type === 'place') return [d.kind, d.region].filter(Boolean).join(' · ') || 'Place';
  return d.category || 'Lore';
}

async function newEntry(type, root) {
  const order = entries(type).length + 1;
  const it = touch({ id: uid(type.slice(0, 2) + '-'), projectId: ctx.state.project.seriesId || ctx.state.project.id, type, parentId: null, order, title: '', content: '', deleted: false, data: { aliases: [], traits: [] } });
  ctx.state.items.push(it);
  await ctx.saveItem(it);
  selected = it.id; query = '';
  renderBible(root);
  setTimeout(() => { const n = $('#bdName', root); if (n) n.focus(); }, 30);
}

// ---------------------------------------------------------------- Detail editor
function renderDetail(main, it, root) {
  const d = it.data = it.data || {};
  const isChar = it.type === 'character', isPlace = it.type === 'place';
  const tabs = isChar ? tabsFor(it) : [];
  let active = isChar ? (activeTab.get(it.id) || 'profile') : 'profile';
  if (active !== 'profile' && !tabs.some(t => t.id === active)) active = 'profile';
  const related = isChar ? rels().filter(r => r.data.a === it.id || r.data.b === it.id) : [];
  main.innerHTML = `<article class="bd">
    <button class="icon-btn bd-back only-narrow" data-back aria-label="Back to list">${icon('back')}</button>
    <header class="bd-head">
      <button class="bd-photo" data-photo title="Change photo">${avatar(it, 104, 'big')}<span class="bd-cam">${icon('camera')}</span></button>
      <div class="bd-id">
        <span class="eyebrow">${KINDS[it.type].one}</span>
        <input class="bd-name" id="bdName" value="${esc(it.title)}" placeholder="${isChar ? 'Name' : isPlace ? 'Place name' : 'Title'}" maxlength="80" data-f="title">
        <input class="bd-alias" data-f="aliases" value="${esc((d.aliases || []).join(', '))}" placeholder="Also known as (comma separated)" maxlength="160">
        ${isChar ? `<div class="bd-first" id="bdFirst">${firstNameLine(it)}</div>` : ''}
        ${isChar ? `<div class="role-chips">${ROLES.map(r => `<button class="rchip ${d.role === r ? 'on' : ''}" data-role="${r}">${r}</button>`).join('')}</div>` : ''}
      </div>
      <button class="icon-btn" data-entry-menu aria-label="More">${icon('more')}</button>
    </header>
    ${isChar ? tabStrip(it, tabs, active) : ''}
    ${active === 'profile' ? `
    <div class="bd-grid ${isChar ? 'four' : ''}">
      ${isChar ? `${fld('age', 'Age', d.age, 'e.g. 34')}${sel('gender', 'Gender', d.gender, GENDERS)}${fld('occupation', 'Occupation', d.occupation, 'What they do')}${fld('home', 'Lives in', d.home, 'Where they live')}`
        : isPlace ? `${fld('kind', 'Type', d.kind, 'Town, room, planet…')}${fld('region', 'Region', d.region, 'Where it is')}${fld('era', 'Era', d.era, 'When')}`
        : `${fld('category', 'Category', d.category, 'Magic, history, object…')}`}
    </div>
    ${isChar ? `
    <div class="field"><span class="field-label">Traits</span><div class="chips-input" id="bdTraits">${(d.traits || []).map((t, i) => `<span class="chip-t">${esc(t)}<button data-rmtrait="${i}" aria-label="Remove ${esc(t)}">${icon('x')}</button></span>`).join('')}<input id="bdTraitIn" placeholder="${(d.traits || []).length ? 'Add trait' : 'Brave, guarded, funny… press Enter'}" maxlength="30"></div></div>
    <div class="split2">
      ${area('want', 'Wants', d.want, 'What they’re chasing')}
      ${area('need', 'Needs', d.need, 'What they actually need, or the flaw in the way')}
    </div>
    <div class="field"><span class="field-label">Arc</span><div class="arc">${area('arcStart', '', d.arcStart, 'Who they are at the start', true)}<span class="arc-arrow">${icon('arrowRight')}</span>${area('arcEnd', '', d.arcEnd, 'Who they become', true)}</div></div>` : ''}
    <div class="field"><span class="field-label">Notes</span><div class="bd-notes" contenteditable="true" id="bdNotes" data-placeholder="Anything worth remembering. Type [[ to link another entry.">${notesHtml(d.notes)}</div></div>
    ${isChar ? `<section class="bd-sec"><div class="bd-sec-h"><span class="group-title">Relationships</span><button class="btn btn-ghost btn-sm" data-addrel>${icon('plus')}Add</button></div>
      ${related.length ? `<div class="rel-list">${related.map(r => relRow(r, it.id)).join('')}</div>` : `<p class="note" style="text-align:left">No relationships yet. Add family, friends, rivals and more. They appear on the Relationships map.</p>`}</section>` : ''}
    <section class="bd-sec" id="bdMentions"><div class="bd-sec-h"><span class="group-title">Appears in</span></div><div class="note" style="text-align:left">Looking through your scenes…</div></section>
` : customPane(it, tabs.find(t => t.id === active))}
  </article>`;

  const save = debounce(() => ctx.saveItem(it).then(() => ctx.onChange && ctx.onChange({ skipView: true })), 400);
  const refreshList = () => { const b = $(`[data-sel="${it.id}"]`, root); if (b) { $('b', b).textContent = it.title || 'Unnamed'; $('.bi-text span', b).textContent = subline(it); } };
  $$('[data-f]', main).forEach(inp => inp.addEventListener('input', () => {
    const f = inp.dataset.f;
    if (f === 'title') it.title = inp.value.trim();
    else if (f === 'aliases') d.aliases = inp.value.split(',').map(s => s.trim()).filter(Boolean);
    else d[f] = inp.value;
    refreshList(); save();
    if ((f === 'title' || f === 'aliases') && isChar) { const fl = $('#bdFirst', main); if (fl) { fl.innerHTML = firstNameLine(it); bindFirst(); } }
  }));
  const bindFirst = () => { const t = $('[data-firstname]', main); if (t) t.onclick = () => { d.firstName = d.firstName === false ? true : false; if (d.firstName) delete d.firstName; $('#bdFirst', main).innerHTML = firstNameLine(it); bindFirst(); save(); }; };
  bindFirst();
  $$('[data-role]', main).forEach(b => b.onclick = () => { d.role = d.role === b.dataset.role ? '' : b.dataset.role; $$('[data-role]', main).forEach(x => x.classList.toggle('on', x.dataset.role === d.role)); refreshList(); save(); });
  const tin = $('#bdTraitIn', main);
  if (tin) tin.onkeydown = e => {
    if ((e.key === 'Enter' || e.key === ',') && tin.value.trim()) { e.preventDefault(); d.traits = [...(d.traits || []), tin.value.trim()]; save(); renderDetail(main, it, root); $('#bdTraitIn', main).focus(); }
    if (e.key === 'Backspace' && !tin.value && (d.traits || []).length) { d.traits.pop(); save(); renderDetail(main, it, root); $('#bdTraitIn', main).focus(); }
  };
  $$('[data-rmtrait]', main).forEach(b => b.onclick = () => { d.traits.splice(+b.dataset.rmtrait, 1); save(); renderDetail(main, it, root); });
  const back = $('[data-back]', main); if (back) back.onclick = () => { selected = null; renderBible(root); };
  const persist = async () => { await ctx.saveItem(it); ctx.onChange && ctx.onChange({ skipView: true }); renderBible(root); };
  $('[data-photo]', main).onclick = () => pickPhoto(it, persist);
  $('[data-entry-menu]', main).onclick = e => menu(e.currentTarget, [
    ...(d.photo ? [{ k: 'rmphoto', icon: 'image', label: 'Remove photo', run: async () => { delete d.photo; await persist(); } }] : []),
    { k: 'del', icon: 'trash', label: `Delete ${KINDS[it.type].one.toLowerCase()}`, danger: true, run: async () => {
      if (!(await confirmSheet({ title: `Delete “${esc(it.title || 'Unnamed')}”?`, sub: 'It moves to Trash for 30 days. Its relationships are removed with it.', confirm: 'Delete', danger: true }))) return;
      const now = Date.now();
      it.deleted = true; it.deletedAt = now; await ctx.saveItem(it);
      for (const r of rels().filter(r => r.data.a === it.id || r.data.b === it.id)) { r.deleted = true; r.deletedAt = now; r.deletedWith = it.id; await ctx.saveItem(r); }
      selected = null; renderBible(root); ctx.onChange && ctx.onChange({ skipView: true });
    } }]);
  const addRel = $('[data-addrel]', main); if (addRel) addRel.onclick = () => relSheet({ a: it.id }, () => renderDetail(main, it, root));
  $$('[data-rel]', main).forEach(b => b.onclick = () => relSheet(rels().find(r => r.id === b.dataset.rel), () => renderDetail(main, it, root)));
  $$('[data-goto]', main).forEach(b => b.onclick = () => { const t = ctx.state.items.find(i => i.id === b.dataset.goto); if (t) { tab = t.type; selected = t.id; renderBible(root); } });
  if ($('#bdNotes', main)) bindNotes($('#bdNotes', main), it, save, root);
  $$('.bd textarea', main).forEach(autosize);
  if ($('#bdMentions', main)) mentions(it, $('#bdMentions', main), root);
  if (isChar) bindTabs(main, it, root, save, tabs, active);
}

function firstNameLine(it) {
  const f = firstNameInfo(it);
  if (!f) return '';
  const sw = `<button class="switch sm" role="switch" aria-checked="${!f.off}" data-firstname aria-label="Match the first name on its own"></button>`;
  if (f.off) return `${sw}<span>“${esc(f.name)}” on its own isn’t matched. Only the full name and aliases are.</span>`;
  if (f.clash.length) return `${sw}<span class="warn">${icon('alert')}<span>“${esc(f.name)}” is also ${f.clash.map(e => `<b>${esc(e.title)}</b>`).join(', ')}, so it isn’t matched on its own. Add it as an alias to the one you mean, or use full names.</span></span>`;
  return `${sw}<span>Also found as “<b>${esc(f.name)}</b>” in your scenes.</span>`;
}

export const GENDERS = ['Male', 'Female', 'Non-binary', 'Other'];
const sel = (f, label, v, opts) => `<label class="field"><span class="field-label">${label}</span><select class="input" data-f="${f}"><option value="">Not set</option>${opts.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;

// ---------------------------------------------------------------- Custom profile tabs
// The shared layout (tab names and field labels) is one item per project or series: { type: 'charTabs', data: { tabs } }.
// One-off tabs live on the character (data.ownTabs). Values for both live in data.custom[tabId][fieldId].
const activeTab = new Map();
const ownerId = () => ctx.state.project.seriesId || ctx.state.project.id;
function layoutItem(create = false) {
  const id = 'tabs-' + ownerId();
  let it = ctx.state.items.find(i => i.id === id) || ctx.state.items.find(i => i.type === 'charTabs' && !i.deleted);
  if (!it && create) { it = touch({ id, projectId: ownerId(), type: 'charTabs', parentId: null, order: 0, title: 'Profile tabs', content: '', deleted: false, data: { tabs: [] } }); ctx.state.items.push(it); }
  return it;
}
function tabsFor(it) {
  const shared = ((layoutItem() || {}).data || {}).tabs || [];
  return [...shared.map(t => ({ ...t, shared: true })), ...(((it.data || {}).ownTabs) || []).map(t => ({ ...t, shared: false }))];
}
function tabStrip(it, tabs, active) {
  return `<nav class="bd-tabs" role="tablist">
    <button role="tab" class="bd-tab ${active === 'profile' ? 'on' : ''}" data-ptab="profile">Profile</button>
    ${tabs.map(t => `<button role="tab" class="bd-tab ${active === t.id ? 'on' : ''}" data-ptab="${t.id}" title="${t.shared ? 'On every character' : 'Only on this character'}">${esc(t.name)}${t.shared ? '' : '<i class="own-dot"></i>'}</button>`).join('')}
    <button class="bd-tab add" data-addtab title="Add a tab">${icon('plus')}<span>Tab</span></button>
  </nav>`;
}
function customPane(it, tab) {
  if (!tab) return '';
  const vals = ((it.data.custom || {})[tab.id]) || {};
  return `<section class="bd-custom">
    <div class="bd-custom-h"><span class="note" style="text-align:left">${tab.shared ? 'This tab is on every character. Field names are shared; what you write is for this character.' : 'This tab is only on this character.'}</span><button class="icon-btn" data-tabmenu aria-label="Tab options">${icon('more')}</button></div>
    ${(tab.fields || []).map(f => `<div class="cf-row" data-field="${f.id}">
      <div class="cf-head"><input class="cf-label" data-cflabel="${f.id}" value="${esc(f.label)}" placeholder="Field name" maxlength="60" aria-label="Field name"><button class="icon-btn cf-rm" data-cfrm="${f.id}" aria-label="Remove field">${icon('x')}</button></div>
      <textarea class="input prose bd-area" data-cf="${f.id}" rows="1" placeholder="${esc(f.label || 'Write here')}…" maxlength="4000">${esc(vals[f.id] || '')}</textarea>
    </div>`).join('') || `<p class="note" style="text-align:left">No fields yet.</p>`}
    <button class="btn btn-quiet btn-sm" data-addfield>${icon('plus')}Add field</button>
  </section>`;
}
function bindTabs(main, it, root, save, tabs, active) {
  const d = it.data;
  const again = () => renderDetail(main, it, root);
  $$('[data-ptab]', main).forEach(b => b.onclick = () => { activeTab.set(it.id, b.dataset.ptab); again(); });
  const tab = tabs.find(t => t.id === active);
  // where this tab's definition lives, and how to save it
  const defOf = () => tab.shared ? (layoutItem().data.tabs.find(t => t.id === tab.id)) : d.ownTabs.find(t => t.id === tab.id);
  const saveDef = async () => { if (tab.shared) { await ctx.saveItem(layoutItem()); } else save(); };
  $('[data-addtab]', main).onclick = e => {
    const p = popover(e.currentTarget, `<div class="type-panel tab-new">
      <div><h4>New tab</h4><p class="sp-sub">For things like Royal Titles, Powers or Backstory.</p></div>
      <input class="input" id="ntName" placeholder="Tab name" maxlength="40">
      <div class="seg" id="ntWho"><button data-v="all" class="on">All characters</button><button data-v="one">Just ${esc((it.title || 'this one').split(/\s+/)[0])}</button></div>
      <button class="btn btn-primary btn-sm" id="ntAdd">${icon('plus')}Add tab</button></div>`, { align: 'start' });
    let who = 'all';
    $$('#ntWho button', p).forEach(b => b.onclick = () => { who = b.dataset.v; $$('#ntWho button', p).forEach(x => x.classList.toggle('on', x === b)); });
    const add = async () => {
      const name = $('#ntName', p).value.trim(); if (!name) return $('#ntName', p).focus();
      const t = { id: uid('tb-'), name, fields: [{ id: uid('f-'), label: 'Details' }] };
      if (who === 'all') { const L = layoutItem(true); L.data = { tabs: [...(L.data.tabs || []), t] }; await ctx.saveItem(L); }
      else { d.ownTabs = [...(d.ownTabs || []), t]; await ctx.saveItem(it); }
      closePop(); activeTab.set(it.id, t.id); haptic(6); again();
      setTimeout(() => { const l = $(`[data-cflabel]`, main); if (l) { l.focus(); l.select(); } }, 40);
    };
    $('#ntAdd', p).onclick = add;
    $('#ntName', p).onkeydown = ev => { if (ev.key === 'Enter') add(); };
    setTimeout(() => $('#ntName', p).focus(), 30);
  };
  if (!tab) return;
  const saveDefSoon = debounce(saveDef, 500);
  $$('[data-cf]', main).forEach(t => t.addEventListener('input', () => {
    d.custom = d.custom || {}; d.custom[tab.id] = { ...(d.custom[tab.id] || {}), [t.dataset.cf]: t.value }; save();
  }));
  $$('[data-cflabel]', main).forEach(inp => inp.addEventListener('input', () => {
    const f = (defOf().fields || []).find(x => x.id === inp.dataset.cflabel); if (f) f.label = inp.value; saveDefSoon();
    const ta = $(`[data-cf="${inp.dataset.cflabel}"]`, main); if (ta) ta.placeholder = (inp.value || 'Write here') + '…';
  }));
  $$('[data-cfrm]', main).forEach(b => b.onclick = async () => {
    const def = defOf(); const f = def.fields.find(x => x.id === b.dataset.cfrm);
    if (tab.shared && !(await confirmSheet({ title: `Remove “${esc(f.label || 'this field')}”?`, sub: 'It’s removed from this tab on every character, along with what was written in it.', confirm: 'Remove', danger: true }))) return;
    def.fields = def.fields.filter(x => x.id !== f.id); await saveDef(); again();
  });
  $('[data-addfield]', main).onclick = async () => {
    const def = defOf(); def.fields = [...(def.fields || []), { id: uid('f-'), label: '' }]; await saveDef(); again();
    setTimeout(() => { const ls = $$('[data-cflabel]', main); const l = ls[ls.length - 1]; if (l) l.focus(); }, 40);
  };
  $('[data-tabmenu]', main).onclick = e => menu(e.currentTarget, [
    { k: 'rename', icon: 'edit', label: 'Rename tab', run: () => {
      const b = $(`[data-ptab="${tab.id}"]`, main); const inp = el(`<input class="bd-tab-edit" value="${esc(tab.name)}" maxlength="40">`);
      b.replaceWith(inp); inp.focus(); inp.select();
      const fin = async ok => { const v = inp.value.trim(); if (ok && v) { defOf().name = v; await saveDef(); } again(); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') { ev.stopPropagation(); fin(false); } };
      inp.onblur = () => fin(true);
    } },
    ...(tab.shared ? [] : [{ k: 'share', icon: 'users', label: 'Put this tab on every character', run: async () => {
      const L = layoutItem(true); L.data = { tabs: [...(L.data.tabs || []), { id: tab.id, name: tab.name, fields: tab.fields }] }; await ctx.saveItem(L);
      d.ownTabs = d.ownTabs.filter(t => t.id !== tab.id); await ctx.saveItem(it); again(); toast(`“${tab.name}” is now on every character`);
    } }]),
    '-',
    { k: 'del', icon: 'trash', label: 'Delete tab', danger: true, run: async () => {
      if (!(await confirmSheet({ title: `Delete the “${esc(tab.name)}” tab?`, sub: tab.shared ? 'It’s removed from every character, along with what was written in it.' : 'What was written in it is removed too.', confirm: 'Delete tab', danger: true }))) return;
      if (tab.shared) { const L = layoutItem(); L.data = { tabs: L.data.tabs.filter(t => t.id !== tab.id) }; await ctx.saveItem(L); }
      else { d.ownTabs = d.ownTabs.filter(t => t.id !== tab.id); }
      if (d.custom) delete d.custom[tab.id];
      await ctx.saveItem(it); activeTab.set(it.id, 'profile'); again();
    } },
  ]);
}

const fld = (f, label, v, ph) => `<label class="field"><span class="field-label">${label}</span><input class="input" data-f="${f}" value="${esc(v || '')}" placeholder="${ph}" maxlength="80"></label>`;
const area = (f, label, v, ph, bare) => `${bare ? '' : `<label class="field"><span class="field-label">${label}</span>`}<textarea class="input prose bd-area" data-f="${f}" rows="2" placeholder="${ph}" maxlength="600">${esc(v || '')}</textarea>${bare ? '' : '</label>'}`;
function autosize(t) { const f = () => { t.style.height = 'auto'; t.style.height = Math.max(64, t.scrollHeight + 2) + 'px'; }; t.addEventListener('input', f); f(); }

function relRow(r, me) {
  const k = relKind(r.data.kind);
  const otherId = r.data.a === me ? r.data.b : r.data.a;
  const other = ctx.state.items.find(i => i.id === otherId);
  if (!other || other.deleted) return '';
  const phrase = r.data.a === me ? k.name : (k.inverse || k.name);
  return `<div class="rel-row"><i class="rel-sw" style="--k:${k.color}"></i><span class="rel-phrase">${phrase}</span><button class="rel-who" data-goto="${other.id}">${avatar(other, 26)}<b>${esc(other.title || 'Unnamed')}</b></button>${r.data.note ? `<span class="rel-note">${esc(r.data.note)}</span>` : ''}<button class="icon-btn" data-rel="${r.id}" aria-label="Edit relationship">${icon('edit')}</button></div>`;
}

// Notes: plain paragraphs; [[Name]] becomes a link chip
function notesHtml(text) {
  return (text || '').split('\n').map(line => `<div>${esc(line).replace(/\[\[([^\]]+)\]\]/g, (m, n) => `<a class="wl" contenteditable="false" data-wl="${esc(n)}">${esc(n)}</a>`) || '<br>'}</div>`).join('');
}
function notesText(elm) {
  const c = elm.cloneNode(true);
  $$('a.wl', c).forEach(a => a.replaceWith(`[[${a.dataset.wl}]]`));
  return Array.from(c.childNodes).map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join('\n').replace(/ /g, ' ').replace(/\n+$/, '');
}
function bindNotes(box, it, save, root) {
  box.addEventListener('input', () => { it.data.notes = notesText(box); save(); autocomplete(box, it, save); });
  box.addEventListener('click', e => {
    const a = e.target.closest('a.wl'); if (!a) return;
    const t = entries().find(x => names(x).some(n => n.toLowerCase() === a.dataset.wl.toLowerCase()));
    if (t) { tab = t.type; selected = t.id; renderBible(root); } else toast(`No entry called “${a.dataset.wl}” yet`);
  });
  box.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
}
function autocomplete(box, it, save) {
  const sel = getSelection(); if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0); const n = r.startContainer;
  if (n.nodeType !== 3) return closePop();
  const before = n.nodeValue.slice(0, r.startOffset);
  const m = before.match(/\[\[([^\]\n]{0,30})$/);
  if (!m) return closePop();
  const q = m[1].toLowerCase();
  const opts = entries().filter(e => e.id !== it.id && e.title && e.title.toLowerCase().includes(q)).slice(0, 6);
  if (!opts.length) return closePop();
  const anchor = { getBoundingClientRect: () => r.getBoundingClientRect() };
  const p = popover(anchor, `<div class="ac">${opts.map(o => `<button class="mi" data-ac="${o.id}">${avatar(o, 22)}<span>${esc(o.title)}</span></button>`).join('')}</div>`, { align: 'start' });
  $$('[data-ac]', p).forEach(b => b.onmousedown = e => {
    e.preventDefault();
    const o = opts.find(x => x.id === b.dataset.ac);
    const rr = document.createRange(); rr.setStart(n, r.startOffset - m[0].length); rr.setEnd(n, r.startOffset);
    sel.removeAllRanges(); sel.addRange(rr);
    document.execCommand('insertHTML', false, `<a class="wl" contenteditable="false" data-wl="${esc(o.title)}">${esc(o.title)}</a>&nbsp;`);
    closePop(); it.data.notes = notesText(box); save();
  });
}

function mentions(it, box, root) {
  const terms = names(it);
  const re = nameRegex(terms);
  const scenes = ctx.state.items.filter(i => i.type === 'scene' && !i.deleted);
  const hits = re ? scenes.map(s => ({ s, n: (htmlToText(s.content).match(re) || []).length })).filter(x => x.n) : [];
  const linkers = entries().filter(e => e.id !== it.id && terms.some(t => ((e.data && e.data.notes) || '').toLowerCase().includes(`[[${t.toLowerCase()}]]`)));
  const total = hits.reduce((s, x) => s + x.n, 0);
  const setHere = it.type === 'place' ? scenes.filter(sc => sc.place === it.id) : [];
  const onMaps = it.type === 'place' ? ctx.state.items.filter(i => i.type === 'mapmark' && !i.deleted && i.data && i.data.placeId === it.id)
    .map(mk => ({ mk, map: ctx.state.items.find(i => i.id === mk.parentId) })).filter(x => x.map && !x.map.deleted && ctx.openMap) : [];
  box.innerHTML = `<div class="bd-sec-h"><span class="group-title">Appears in</span>${total ? `<span class="note">${num(total)} mention${total === 1 ? '' : 's'} in ${hits.length} scene${hits.length === 1 ? '' : 's'}</span>` : ''}</div>
    ${hits.length ? `<div class="mention-list">${hits.map(x => `<button class="mention" data-scene="${x.s.id}">${icon('file')}<span>${esc(x.s.title)}</span><b class="tnum">${x.n}</b></button>`).join('')}</div>` : `<p class="note" style="text-align:left">${it.title ? `“${esc(it.title)}” isn’t mentioned in any scene yet.` : 'Give this entry a name to find it in your scenes.'}</p>`}
    ${setHere.length ? `<div class="bd-sec-h" style="margin-top:14px"><span class="group-title">Scenes set here</span><span class="note">${setHere.length}</span></div><div class="mention-list">${setHere.map(x => `<button class="mention" data-open-sc="${x.id}">${icon('pin')}<span>${esc(x.title || 'Untitled')}</span></button>`).join('')}</div>` : ''}
    ${onMaps.length ? `<div class="bd-sec-h" style="margin-top:14px"><span class="group-title">On maps</span></div><div class="mention-list">${onMaps.map(x => `<button class="mention" data-open-map="${x.map.id}" data-mk="${x.mk.id}">${icon('image')}<span>${esc(x.map.title || 'Map')}</span></button>`).join('')}</div>` : ''}
    ${linkers.length ? `<div class="bd-sec-h" style="margin-top:14px"><span class="group-title">Linked from</span></div><div class="mention-list">${linkers.map(e => `<button class="mention" data-goto="${e.id}">${avatar(e, 22)}<span>${esc(e.title)}</span></button>`).join('')}</div>` : ''}`;
  $$('[data-scene]', box).forEach(b => b.onclick = () => ctx.findInScene(b.dataset.scene, terms));
  $$('[data-open-sc]', box).forEach(b => b.onclick = () => ctx.openScene(b.dataset.openSc));
  $$('[data-open-map]', box).forEach(b => b.onclick = () => ctx.openMap(b.dataset.openMap, b.dataset.mk));
  $$('[data-goto]', box).forEach(b => b.onclick = () => { const t = ctx.state.items.find(i => i.id === b.dataset.goto); tab = t.type; selected = t.id; renderBible(root); });
}

const PHOTO_MAX_BYTES = 40 * 1024 * 1024;
async function pickPhoto(it, done) {
  const [f] = await pickFiles({ accept: 'image/*' });
  if (!f) return;
  if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name)) return toast('Choose an image file (JPG, PNG or WebP).');
  if (f.size > PHOTO_MAX_BYTES) return toast('That picture is too large. Choose one under 40 MB.');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('empty');
    const S = 360, c = document.createElement('canvas'); c.width = S; c.height = S;
    const k = Math.max(S / w, S / h);
    c.getContext('2d').drawImage(img, (S - w * k) / 2, (S - h * k) / 2.6, w * k, h * k);
    it.data = it.data || {};
    it.data.photo = c.toDataURL('image/jpeg', 0.82);
    await done();
    haptic(8);
  } catch { toast('That image couldn’t be opened.'); } finally { URL.revokeObjectURL(url); }
}

// ---------------------------------------------------------------- Relationship editor
export function relSheet(rel, after) {
  const chars = entries('character');
  if (chars.length < 2) { toast('Add at least two characters first'); return; }
  const isNew = !rel || !rel.id;
  const d = { a: rel?.data?.a || rel?.a || chars[0].id, b: rel?.data?.b || '', kind: rel?.data?.kind || 'friend', note: rel?.data?.note || '' };
  if (!d.b) d.b = (chars.find(c => c.id !== d.a) || chars[1]).id;
  const opt = (sel) => chars.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.title || 'Unnamed')}</option>`).join('');
  const s = sheet({
    title: isNew ? 'New relationship' : 'Relationship',
    body: `<div class="rel-builder">
      <select class="input" id="rsA">${opt(d.a)}</select>
      <div class="rel-kinds">${REL_KINDS.map(k => `<button class="rk ${k.id === d.kind ? 'on' : ''}" data-k="${k.id}" style="--k:${k.color}"><i></i>${k.name.replace(/ of$| to$| with$/, '')}</button>`).join('')}</div>
      <select class="input" id="rsB">${opt(d.b)}</select>
      <p class="rel-sentence" id="rsSentence"></p>
      <div class="field"><label class="field-label" for="rsNote">Note</label><input class="input" id="rsNote" value="${esc(d.note)}" placeholder="Optional, e.g. ‘estranged since the flood’" maxlength="120"></div>
    </div>`,
    foot: `${isNew ? '' : '<button class="btn btn-danger" data-del>Remove</button><span style="flex:1"></span>'}<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-save>${isNew ? 'Add relationship' : 'Save'}</button>`
  });
  const sentence = () => {
    const A = chars.find(c => c.id === $('#rsA').value), B = chars.find(c => c.id === $('#rsB').value), k = relKind(d.kind);
    $('#rsSentence').innerHTML = `<b>${esc(A?.title || '?')}</b> is <span style="color:${k.color}">${k.name.toLowerCase()}</span> <b>${esc(B?.title || '?')}</b>`;
  };
  $$('.rk', s.wrap).forEach(b => b.onclick = () => { d.kind = b.dataset.k; $$('.rk', s.wrap).forEach(x => x.classList.toggle('on', x === b)); sentence(); });
  $('#rsA').onchange = sentence; $('#rsB').onchange = sentence; sentence();
  $('[data-c]', s.wrap).onclick = s.close;
  const del = $('[data-del]', s.wrap);
  if (del) del.onclick = async () => { rel.deleted = true; rel.deletedAt = Date.now(); await ctx.saveItem(rel); s.close(); after && after(); };
  $('[data-save]', s.wrap).onclick = async () => {
    const a = $('#rsA').value, b = $('#rsB').value;
    if (a === b) return toast('Pick two different characters');
    const data = { a, b, kind: d.kind, note: $('#rsNote').value.trim() };
    let r = rel && rel.id ? rel : null;
    if (!r) { r = touch({ id: uid('rl-'), projectId: ctx.state.project.seriesId || ctx.state.project.id, type: 'rel', parentId: null, order: 0, title: '', content: '', deleted: false, data }); ctx.state.items.push(r); }
    else r.data = data;
    await ctx.saveItem(r); haptic(8); s.close(); after && after();
  };
}

// ---------------------------------------------------------------- Hover cards in the manuscript
let hoverTimer = null, hoverCard = null, hoverId = null;
export function hoverCardFor(id, rect) {
  const it = ctx.state.items.find(i => i.id === id); if (!it) return;
  if (hoverId === id && hoverCard) return;
  hideHover(true);
  const d = it.data || {};
  const line = it.type === 'character' ? (d.want ? `Wants: ${d.want}` : d.notes) : d.notes;
  hoverCard = el(`<div class="hovercard" role="tooltip">
    <div class="hc-top">${avatar(it, 44)}<div><b>${esc(it.title)}</b><span>${esc(subline(it))}</span></div></div>
    ${line ? `<p>${esc(line.replace(/\[\[|\]\]/g, '').slice(0, 160))}${line.length > 160 ? '…' : ''}</p>` : ''}
    ${(d.traits || []).length ? `<div class="hc-traits">${d.traits.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    <button class="btn btn-quiet btn-sm" data-open-entry>Open ${KINDS[it.type].one.toLowerCase()}</button>
  </div>`);
  document.body.appendChild(hoverCard);
  const w = hoverCard.offsetWidth, h = hoverCard.offsetHeight;
  let left = Math.min(Math.max(12, rect.left), innerWidth - w - 12);
  let top = rect.bottom + 8; if (top + h > innerHeight - 12) top = rect.top - h - 8;
  Object.assign(hoverCard.style, { left: left + 'px', top: top + 'px' });
  hoverId = id;
  hoverCard.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
  hoverCard.addEventListener('mouseleave', () => hideHover());
  $('[data-open-entry]', hoverCard).onclick = () => { hideHover(true); ctx.openEntry(id); };
}
export function hideHover(now) {
  clearTimeout(hoverTimer);
  const go = () => { if (hoverCard) hoverCard.remove(); hoverCard = null; hoverId = null; };
  if (now) go(); else hoverTimer = setTimeout(go, 220);
}
