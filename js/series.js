// Inkfold — Series and universes. A series is a record in the projects store ({ kind: 'series' }).
// Books in a series (project.seriesId) share one story bible: characters, places, lore, relationships and
// custom profile tabs live in the series (projectId = series id) instead of in each book.
import { db, uid } from './db.js';
import { touch } from './model.js';

export const SHARED_TYPES = ['character', 'place', 'lore', 'rel', 'charTabs', 'map', 'mapmark'];

// Items point at other items by id (relationships, map marks, a scene's place and cast).
// When ids change (copies, merges), these references move with them.
export function remapRefs(it, map) {
  const m = id => (id && map.get(id)) || id;
  let changed = false;
  const set = (o, k) => { if (o && o[k] && map.has(o[k])) { o[k] = map.get(o[k]); changed = true; } };
  if (it.type === 'rel' && it.data) { it.data = { ...it.data }; set(it.data, 'a'); set(it.data, 'b'); }
  if (it.type === 'mapmark') { if (it.parentId && map.has(it.parentId)) { it.parentId = map.get(it.parentId); changed = true; } if (it.data) { it.data = { ...it.data }; set(it.data, 'placeId'); set(it.data, 'opensMap'); } }
  if (it.type === 'scene') {
    if (it.place && map.has(it.place)) { it.place = m(it.place); changed = true; }
    if (it.cast) { const c = { in: (it.cast.in || []).map(m), out: (it.cast.out || []).map(m) }; if (JSON.stringify(c) !== JSON.stringify(it.cast)) { it.cast = c; changed = true; } }
  }
  if (typeof it.content === 'string' && it.content.includes('data-img=')) { const c = it.content.replace(/data-img="([\w-]+)"/g, (x, id) => `data-img="${m(id)}"`); if (c !== it.content) { it.content = c; changed = true; } }
  return changed;
}
export const isSeries = p => !!(p && p.kind === 'series');
export const isShared = it => SHARED_TYPES.includes(it.type);

export function newSeriesRecord(title) {
  const now = Date.now();
  return touch({ id: uid('srs-'), kind: 'series', title: title || 'Untitled series', createdAt: now, updatedAt: now, deleted: false });
}

export async function allSeries() {
  return (await db.all('projects')).filter(p => isSeries(p) && !p.deleted).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}
export async function booksIn(seriesId) {
  return (await db.all('projects')).filter(p => !isSeries(p) && !p.deleted && p.seriesId === seriesId)
    .sort((a, b) => (a.seriesOrder ?? 1e9) - (b.seriesOrder ?? 1e9) || (a.createdAt || 0) - (b.createdAt || 0));
}

// Everything a book needs in memory: its own items plus the shared bible of its series
export async function loadItems(project) {
  const own = await db.byProject(project.id);
  if (!project.seriesId) return own;
  const series = await db.get('projects', project.seriesId);
  if (!series || series.deleted) return own;
  const shared = (await db.byProject(project.seriesId)).filter(isShared);
  return own.concat(shared);
}

// Where new bible entries of this book belong
export const bibleOwner = project => project.seriesId || project.id;

const norm = s => (s || '').trim().toLowerCase();
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

// Move a book's story bible into a series. Entries with the same name and kind as one already in the
// series are merged into it (empty fields filled in, aliases and traits combined) instead of duplicated.
export async function joinSeries(book, seriesId) {
  if (book.enc) throw new Error('Encrypted books can’t join a series. Remove the encryption first.');
  const mine = (await db.byProject(book.id)).filter(i => isShared(i));
  const theirs = (await db.byProject(seriesId)).filter(i => isShared(i) && !i.deleted);
  const writes = [], removed = [], idMap = new Map();
  let merged = 0;
  for (const it of mine.filter(i => !['rel', 'charTabs', 'map', 'mapmark'].includes(i.type))) {
    const twin = !it.deleted && it.title && theirs.find(t => t.type === it.type && norm(t.title) === norm(it.title));
    if (twin) {
      const d = twin.data = { ...(twin.data || {}) };
      for (const [k, v] of Object.entries(it.data || {})) {
        if (k === 'aliases' || k === 'traits') d[k] = [...new Set([...(d[k] || []), ...(v || [])])];
        else if (k === 'custom') { d.custom = d.custom || {}; for (const [tab, vals] of Object.entries(v || {})) d.custom[tab] = { ...(vals || {}), ...(d.custom[tab] || {}) }; }
        else if (empty(d[k]) && !empty(v)) d[k] = v;
      }
      writes.push(touch(twin)); idMap.set(it.id, twin.id); removed.push(it.id); merged++;
    } else { it.projectId = seriesId; writes.push(touch(it)); }
  }
  // maps and their marks move into the series too (their place links follow merged entries)
  for (const it of mine.filter(i => i.type === 'map' || i.type === 'mapmark')) { remapRefs(it, idMap); it.projectId = seriesId; writes.push(touch(it)); }
  // the book's scenes may point at entries that were merged away
  if (idMap.size) for (const sc of (await db.byProject(book.id)).filter(i => i.type === 'scene')) if (remapRefs(sc, idMap)) writes.push(touch(sc));
  // relationships: point at the merged entries, skip ones the series already has
  const relKey = r => [r.data.a, r.data.b, r.data.kind].join('|');
  const have = new Set(theirs.filter(t => t.type === 'rel' && t.data).map(relKey));
  for (const r of mine.filter(i => i.type === 'rel' && i.data)) {
    r.data = { ...r.data, a: idMap.get(r.data.a) || r.data.a, b: idMap.get(r.data.b) || r.data.b };
    if (!r.deleted && have.has(relKey(r))) { removed.push(r.id); continue; }
    have.add(relKey(r)); r.projectId = seriesId; writes.push(touch(r));
  }
  // custom tab layouts: merge into the series layout
  const myTabs = mine.find(i => i.type === 'charTabs');
  if (myTabs) {
    const seriesTabs = theirs.find(i => i.type === 'charTabs');
    if (seriesTabs) {
      const names = new Set((seriesTabs.data.tabs || []).map(t => t.id));
      seriesTabs.data = { tabs: [...(seriesTabs.data.tabs || []), ...((myTabs.data && myTabs.data.tabs) || []).filter(t => !names.has(t.id))] };
      writes.push(touch(seriesTabs)); removed.push(myTabs.id);
    } else { myTabs.projectId = seriesId; myTabs.id = 'tabs-' + seriesId; writes.push(touch(myTabs)); removed.push('tabs-' + book.id); }
  }
  book.seriesId = seriesId;
  const order = (await booksIn(seriesId)).length + 1;
  book.seriesOrder = order;
  touch(book);
  const now = Date.now();
  const rm = removed.filter(id => !writes.some(w => w.id === id));
  await db.writeBatch({ projects: [book], items: writes, deleteItems: rm, tombstones: rm.map(id => ({ id, at: now })) });
  return { moved: writes.length - merged, merged };
}

// Copy the series bible into a book (used when a book leaves a series, or the series is deleted)
async function copyBibleInto(book, seriesId) {
  const shared = (await db.byProject(seriesId)).filter(i => isShared(i) && !i.deleted);
  const map = new Map(shared.map(i => [i.id, i.type === 'charTabs' ? 'tabs-' + book.id : uid(i.type.slice(0, 2) + '-')]));
  const items = shared.map(i => {
    const c = { ...i, id: map.get(i.id), projectId: book.id, revs: [] };
    remapRefs(c, map);
    delete c.rev; return touch(c);
  });
  return { items, map };
}

export async function leaveSeries(book) {
  const sid = book.seriesId; if (!sid) return;
  const { items, map } = await copyBibleInto(book, sid);
  // the book's scenes now point at its own copies of places and characters
  const scenes = (await db.byProject(book.id)).filter(i => i.type === 'scene' && remapRefs(i, map)).map(touch);
  delete book.seriesId; delete book.seriesOrder; touch(book);
  await db.writeBatch({ projects: [book], items: [...items, ...scenes] });
}

export async function deleteSeries(series) {
  for (const b of await booksIn(series.id)) await leaveSeries(b);
  series.deleted = true; series.deletedAt = Date.now(); touch(series);
  await db.put('projects', series);
}

// A plain copy of the shared bible for a standalone project file
export async function bibleCopyFor(book) {
  if (!book.seriesId) return { items: [], map: new Map() };
  const { items, map } = await copyBibleInto(book, book.seriesId);
  return { items: items.map(i => { const o = { ...i }; delete o._dec; delete o.enc; return o; }), map };
}
