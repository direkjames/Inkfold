// Inkfold — local storage layer (IndexedDB). Everything stays on this device.
const DB_NAME = 'inkfold';
const DB_VERSION = 3;
const STORES = ['projects', 'items', 'meta', 'snapshots', 'tombstones', 'log', 'versions'];

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tombstones')) db.createObjectStore('tombstones', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('versions')) { const v = db.createObjectStore('versions', { keyPath: 'id' }); v.createIndex('sceneId', 'sceneId'); } // scene history (this device)
      if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id' }); // daily writing log (this device)
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Optional record hooks (used for per-project encryption). Raw reads (dump/backup/sync) bypass them.
let hooks = { write: null, read: null };
export function setHooks(h) { hooks = { ...hooks, ...h }; }
const wr = async (store, v) => hooks.write ? hooks.write(store, v) : v;
const rd = async (store, v) => (hooks.read && v) ? hooks.read(store, v) : v;
const rdAll = async (store, arr) => hooks.read ? Promise.all(arr.map(v => hooks.read(store, v))) : arr;

export const db = {
  async get(store, key) { return rd(store, await tx([store], 'readonly', t => wrap(t.objectStore(store).get(key)))); },
  async all(store) { return rdAll(store, await this.rawAll(store)); },
  async rawAll(store) { return tx([store], 'readonly', t => wrap(t.objectStore(store).getAll())); },
  async put(store, value, key) {
    value = await wr(store, value);
    return tx([store], 'readwrite', t => wrap(key === undefined ? t.objectStore(store).put(value) : t.objectStore(store).put(value, key)));
  },
  async putMany(store, values) {
    values = await Promise.all(values.map(v => wr(store, v)));
    return tx([store], 'readwrite', t => { const s = t.objectStore(store); values.forEach(v => s.put(v)); });
  },
  async del(store, key) { return tx([store], 'readwrite', t => wrap(t.objectStore(store).delete(key))); },
  async versionsOf(sceneId) {
    return rdAll('versions', await tx(['versions'], 'readonly', t => wrap(t.objectStore('versions').index('sceneId').getAll(sceneId))));
  },
  async byProject(projectId) {
    return rdAll('items', await tx(['items'], 'readonly', t => wrap(t.objectStore('items').index('projectId').getAll(projectId))));
  },
  async meta(key, fallback = null) {
    const v = await this.get('meta', key);
    return v === undefined ? fallback : v;
  },
  async setMeta(key, value) { return this.put('meta', value, key); },

  // Full library dump (used for backups, snapshots and sync)
  async dump() {
    const [projects, items, tombstones, log] = await Promise.all([this.rawAll('projects'), this.rawAll('items'), this.rawAll('tombstones'), this.rawAll('log')]);
    return { format: 'inkfold-library', version: 1, exportedAt: Date.now(), projects, items, tombstones, log };
  },
  // Replace everything with a dump
  async replaceAll(data) {
    return tx(['projects', 'items', 'tombstones', 'log'], 'readwrite', t => {
      ['projects', 'items', 'tombstones'].forEach(s => t.objectStore(s).clear());
      if (data.log) { t.objectStore('log').clear(); data.log.forEach(l => t.objectStore('log').put(l)); }
      (data.projects || []).forEach(p => t.objectStore('projects').put(p));
      (data.items || []).forEach(i => t.objectStore('items').put(i));
      (data.tombstones || []).forEach(x => t.objectStore('tombstones').put(x));
    });
  },
  async writeBatch({ projects = [], items = [], tombstones = [], deleteItems = [], deleteProjects = [], log = [] }) {
    items = await Promise.all(items.map(i => wr('items', i)));
    return tx(['projects', 'items', 'tombstones', 'log'], 'readwrite', t => {
      log.forEach(l => t.objectStore('log').put(l));
      projects.forEach(p => t.objectStore('projects').put(p));
      items.forEach(i => t.objectStore('items').put(i));
      tombstones.forEach(x => t.objectStore('tombstones').put(x));
      deleteItems.forEach(id => t.objectStore('items').delete(id));
      deleteProjects.forEach(id => t.objectStore('projects').delete(id));
    });
  },

  // Snapshots: a full copy of the library, taken before sync / restore / import.
  async snapshot(reason) {
    const data = await this.dump();
    delete data.log; // snapshots cover writing, not stats
    const snap = { id: 'snap-' + Date.now(), createdAt: Date.now(), reason, data,
      counts: { projects: data.projects.filter(p => !p.deleted && p.kind !== 'series').length, scenes: data.items.filter(i => i.type === 'scene' && !i.deleted).length } };
    await this.put('snapshots', snap);
    const all = (await this.all('snapshots')).sort((a, b) => b.createdAt - a.createdAt);
    for (const old of all.slice(10)) await this.del('snapshots', old.id);
    return snap;
  },
  STORES
};

export function uid(prefix = '') {
  const a = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export async function deviceInfo() {
  let id = await db.meta('deviceId');
  if (!id) { id = uid('dev-'); await db.setMeta('deviceId', id); }
  let name = await db.meta('deviceName');
  if (!name) {
    const ua = navigator.userAgent;
    name = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
      : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'This device';
    await db.setMeta('deviceName', name);
  }
  return { id, name };
}
