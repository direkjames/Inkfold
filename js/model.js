// Inkfold — project structure helpers
import { db, uid } from './db.js';
import { blocksToHtml, htmlWords } from './text.js';

export const COVERS = [
  { name: 'Oxblood', bg: '#5a1f24', fg: '#f1e4d6', line: '#c58b6c' },
  { name: 'Deep Teal', bg: '#123c3f', fg: '#e3efe9', line: '#7fc8b4' },
  { name: 'Ink Blue', bg: '#1b2550', fg: '#e6e8f4', line: '#9aa8e6' },
  { name: 'Moss', bg: '#2f3a22', fg: '#ecebd8', line: '#b9c27d' },
  { name: 'Plum', bg: '#3c2236', fg: '#f2e5ec', line: '#d79bbf' },
  { name: 'Graphite', bg: '#26282d', fg: '#ecebe7', line: '#b9b4a8' },
];

// Every change gets a new revision id. Sync compares revision histories to tell
// "edited on one device" (safe to take) from "edited on both" (keep both versions).
export function touch(rec) {
  rec.updatedAt = Date.now();
  rec.rev = uid('r');
  rec.revs = [...(rec.revs || []), rec.rev].slice(-40);
  return rec;
}

const byOrder = (a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1);

export function buildTree(items) {
  const live = items.filter(i => !i.deleted);
  const chapters = live.filter(i => i.type === 'chapter').sort(byOrder);
  const ids = new Set(chapters.map(c => c.id));
  return chapters.map(c => ({ ...c, scenes: live.filter(i => i.type === 'scene' && i.parentId === c.id).sort(byOrder) }))
    .concat(live.some(i => i.type === 'scene' && !ids.has(i.parentId))
      ? [{ id: '__loose', type: 'chapter', title: 'Unfiled scenes', scenes: live.filter(i => i.type === 'scene' && !ids.has(i.parentId)).sort(byOrder) }] : []);
}

export function flatScenes(tree) { return tree.flatMap(c => c.scenes); }

export function newProjectRecord(title) {
  const now = Date.now();
  return touch({ id: uid('prj-'), title: title || 'Untitled project', subtitle: '', author: '', cover: Math.floor(Math.random() * COVERS.length),
    format: 'rich', createdAt: now, updatedAt: now, deleted: false });
}
export function newChapter(projectId, order, title) {
  return touch({ id: uid('ch-'), projectId, type: 'chapter', parentId: null, order, title: title || 'New chapter', content: '', words: 0, deleted: false });
}
export function newScene(projectId, parentId, order, title, content = '') {
  return touch({ id: uid('sc-'), projectId, type: 'scene', parentId, order, title: title || 'New scene', content, words: htmlWords(content), deleted: false });
}

// Build a project from parsed chapters: [{ title, scenes: [{ title, blocks }] }]
export async function createProjectFrom(title, chapters, extra = {}, { fixedIds = null } = {}) {
  const p = touch({ ...newProjectRecord(title), ...extra });
  const items = [];
  // Fixed ids + a shared revision let the same seeded project merge cleanly across devices.
  const fix = (rec, id) => { if (fixedIds) { rec.id = id; rec.rev = 'seed'; rec.revs = ['seed']; } return rec; };
  fix(p, fixedIds);
  chapters.forEach((ch, ci) => {
    const c = fix(newChapter(p.id, ci + 1, ch.title), `${fixedIds}-c${ci}`);
    items.push(c);
    (ch.scenes.length ? ch.scenes : [{ title: 'Scene 1', blocks: [] }]).forEach((s, si) => {
      items.push(fix(newScene(p.id, c.id, si + 1, s.title, blocksToHtml(s.blocks)), `${fixedIds}-c${ci}-s${si}`));
    });
  });
  await db.writeBatch({ projects: [p], items });
  return p;
}

export async function seedSample() {
  const P = (t, i = false) => ({ type: 'p', runs: [{ text: t, b: false, i }] });
  const chapters = [
    { title: 'The Light at Carro Point', scenes: [
      { title: 'Arrival', blocks: [
        P('The ferry left Mara on the jetty with two suitcases and a letter she had already read eleven times.'),
        P('Carro Point was smaller than the photographs. The lighthouse stood at the end of a spit of black rock, white paint gone to the colour of old teeth, and the keeper’s cottage leaned against it like a tired dog against its owner.'),
        P('“You’ll be the new one,” said the man waiting by the bollard. He did not offer to take her bags.'),
      ] },
      { title: 'The Log Book', blocks: [
        P('The last entry was dated the fourth of March. After that, nothing. Not a line about weather, not a note on the lamp.'),
        { type: 'hr', runs: [] },
        P('Mara turned the page anyway, and found a pressed sprig of sea lavender, and under it, written very small: '),
        { type: 'quote', runs: [{ text: 'Don’t trust the second fog.', b: false, i: true }] },
      ] },
    ] },
    { title: 'Weather Coming In', scenes: [
      { title: 'First Night', blocks: [P('She climbed the hundred and twelve steps at dusk, counting them out loud because the silence seemed to want something from her.')] },
    ] },
  ];
  const p = await createProjectFrom('The Lighthouse Keeper', chapters, { subtitle: 'Sample project', author: 'Inkfold', cover: 1, sample: true, createdAt: 0, updatedAt: 0 }, { fixedIds: 'prj-sample' });
  return p;
}

export async function projectStats(projectId) {
  const items = await db.byProject(projectId);
  const scenes = items.filter(i => i.type === 'scene' && !i.deleted);
  return { words: scenes.reduce((s, i) => s + (i.words || 0), 0), scenes: scenes.length, chapters: items.filter(i => i.type === 'chapter' && !i.deleted).length };
}

export const STATUSES = [
  { id: 'idea', name: 'Idea' },
  { id: 'draft', name: 'Draft' },
  { id: 'revised', name: 'Revised' },
  { id: 'final', name: 'Final' },
];
export const LABELS = [
  { id: 'red', name: 'Red', color: '#d0625a' },
  { id: 'amber', name: 'Amber', color: '#d8913f' },
  { id: 'gold', name: 'Gold', color: '#c9ad3c' },
  { id: 'green', name: 'Green', color: '#58a06b' },
  { id: 'blue', name: 'Blue', color: '#5a88cf' },
  { id: 'violet', name: 'Violet', color: '#9670c6' },
];
export const statusOf = it => STATUSES.find(s => s.id === (it.status || 'draft')) || STATUSES[1];
export const labelOf = it => LABELS.find(l => l.id === it.label) || null;
