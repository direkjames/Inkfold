// Inkfold — app lock (PIN) and per-project encryption (AES-GCM, keys never leave memory).
import { db, setHooks } from './db.js';
import { $, $$, esc, icon, el, sheet, toast, haptic, MARK } from './ui.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2(secret, salt, iter, usage) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  if (usage === 'bits') return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, 256);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(key, obj) { const iv = rand(12); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))); return { iv: b64(iv), ct: b64(ct) }; }
async function open_(key, box) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)); return JSON.parse(dec.decode(pt)); }

// ---------------------------------------------------------------- project encryption
const keys = new Map();          // projectId -> CryptoKey (memory only)
const encrypted = new Set();     // projectIds known to be encrypted
const SECRET = { items: ['title', 'content', 'synopsis', 'pov', 'data', 'when'], versions: ['title', 'content'] };
export const isEncrypted = p => !!(p && p.enc);
export const isUnlocked = pid => keys.has(pid);

async function writeHook(store, rec) {
  if (!SECRET[store] || !rec || !rec.projectId) return rec;
  const key = keys.get(rec.projectId);
  const out = { ...rec }; delete out._dec;
  if (!key) { if (encrypted.has(rec.projectId) && rec._dec) throw new Error('This project is locked. Unlock it to save changes.'); return out; }
  if (!(rec._dec || (encrypted.has(rec.projectId) && !rec.enc))) return out;
  const secret = {}; SECRET[store].forEach(f => { secret[f] = rec[f] ?? null; });
  out.enc = await seal(key, secret);
  SECRET[store].forEach(f => { out[f] = f === 'title' || f === 'content' || f === 'synopsis' || f === 'pov' ? '' : null; });
  return out;
}
async function readHook(store, rec) {
  if (!SECRET[store] || !rec || !rec.enc) return rec;
  const key = keys.get(rec.projectId);
  if (!key) return { ...rec, title: rec.type === 'scene' || rec.type === 'chapter' ? 'Locked' : rec.title };
  try { const s = await open_(key, rec.enc); const out = { ...rec, ...s, _dec: true }; delete out.enc; return out; }
  catch { return { ...rec, title: 'Unreadable' }; }
}
setHooks({ write: writeHook, read: readHook });

export async function registerProjects() {
  encrypted.clear();
  for (const p of await db.all('projects')) if (p.enc) encrypted.add(p.id);
}

export async function unlockProject(p, pass) {
  const key = await pbkdf2(pass, unb64(p.enc.salt), p.enc.iter, 'key');
  try { const v = await open_(key, p.enc.check); if (v !== 'inkfold') throw 0; } catch { return false; }
  keys.set(p.id, key); encrypted.add(p.id); return true;
}
export function lockProject(pid) { keys.delete(pid); }
export function lockAllProjects() { keys.clear(); }

export async function encryptProject(p, pass) {
  const salt = rand(16), iter = 310000;
  const key = await pbkdf2(pass, salt, iter, 'key');
  p.enc = { v: 1, salt: b64(salt), iter, check: await seal(key, 'inkfold') };
  keys.set(p.id, key); encrypted.add(p.id);
  await db.put('projects', p);
  const items = await db.byProject(p.id); // plaintext reads
  await db.writeBatch({ items: items.map(i => ({ ...i, _dec: true })) });
  for (const v of (await db.all('versions')).filter(v => v.projectId === p.id)) await db.put('versions', { ...v, _dec: true });
}
export async function decryptProject(p) {
  const items = await db.byProject(p.id);        // decrypted through the hook
  const versions = (await db.all('versions')).filter(v => v.projectId === p.id);
  keys.delete(p.id); encrypted.delete(p.id);
  delete p.enc; await db.put('projects', p);
  await db.writeBatch({ items: items.map(i => { const o = { ...i }; delete o._dec; delete o.enc; return o; }) });
  for (const v of versions) { const o = { ...v }; delete o._dec; delete o.enc; await db.put('versions', o); }
}
export async function changeProjectPassword(p, pass) {
  const items = await db.byProject(p.id);
  const versions = (await db.all('versions')).filter(v => v.projectId === p.id);
  const salt = rand(16), iter = 310000;
  const key = await pbkdf2(pass, salt, iter, 'key');
  p.enc = { v: 1, salt: b64(salt), iter, check: await seal(key, 'inkfold') };
  keys.set(p.id, key);
  await db.put('projects', p);
  await db.writeBatch({ items: items.map(i => ({ ...i, _dec: true })) });
  for (const v of versions) await db.put('versions', { ...v, _dec: true });
}

export function passwordSheet({ title, sub, confirm = true, action = 'Continue', warn = false }) {
  return new Promise(res => {
    let done = false;
    const s = sheet({ title, sub, onClose: () => { if (!done) res(null); },
      body: `<div class="field"><label class="field-label" for="pw1">Password</label><input class="input" type="password" id="pw1" autocomplete="new-password" autofocus></div>
        ${confirm ? `<div class="field"><label class="field-label" for="pw2">Type it again</label><input class="input" type="password" id="pw2" autocomplete="new-password"></div><div class="pw-meter"><i id="pwBar"></i><span id="pwHint">Use at least 8 characters. A short sentence is easy to remember and hard to guess.</span></div>` : ''}
        ${warn ? `<label class="cp-check warn-box"><input type="checkbox" id="pwAck"><span>I understand that if I forget this password, nobody can recover this project. Not even Inkfold.</span></label>` : ''}
        <p class="pw-err" id="pwErr" hidden></p>`,
      foot: `<button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" data-ok>${action}</button>` });
    const p1 = $('#pw1', s.wrap), p2 = $('#pw2', s.wrap), err = $('#pwErr', s.wrap);
    if (p2) p1.oninput = () => { const v = p1.value; const score = Math.min(4, (v.length >= 8) + (v.length >= 12) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + (/\d|\W/.test(v))); $('#pwBar').style.width = (score / 4 * 100) + '%'; $('#pwBar').dataset.s = score; $('#pwHint').textContent = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][score]; };
    const go = () => {
      const fail = m => { err.textContent = m; err.hidden = false; haptic(30); };
      if (!p1.value) return fail('Enter a password.');
      if (confirm && p1.value.length < 8) return fail('Use at least 8 characters.');
      if (confirm && p1.value !== p2.value) return fail('The two passwords don’t match.');
      if (warn && !$('#pwAck').checked) return fail('Please confirm you understand the risk.');
      done = true; s.close(); res(p1.value);
    };
    $('[data-c]', s.wrap).onclick = s.close; $('[data-ok]', s.wrap).onclick = go;
    $$('input[type=password]', s.wrap).forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  });
}

// ---------------------------------------------------------------- app lock (PIN)
let lockCfg = null, locked = false, lastActive = Date.now(), hiddenAt = 0, onLock = null, onUnlock = null, fails = 0, waitUntil = 0;
export const lockEnabled = () => !!(lockCfg && lockCfg.hash);
export const isLocked = () => locked;
export const lockTimeout = () => lockCfg ? lockCfg.timeout : 5;

export async function initLock({ beforeLock, afterUnlock }) {
  onLock = beforeLock; onUnlock = afterUnlock;
  lockCfg = await db.meta('lock', null);
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (!lockEnabled()) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= lockCfg.timeout * 60000) lockNow();
  });
  setInterval(() => { if (lockEnabled() && !locked && lockCfg.timeout > 0 && Date.now() - lastActive > lockCfg.timeout * 60000) lockNow(); }, 15000);
  if (lockEnabled()) await lockNow(true);
}

export async function setPin(pin, timeout) {
  const salt = rand(16), iter = 210000;
  const hash = b64(await pbkdf2(pin, salt, iter, 'bits'));
  lockCfg = { salt: b64(salt), iter, hash, len: pin.length, timeout: timeout ?? (lockCfg ? lockCfg.timeout : 5) };
  await db.setMeta('lock', lockCfg);
}
export async function setLockTimeout(min) { if (!lockCfg) return; lockCfg.timeout = min; await db.setMeta('lock', lockCfg); }
export async function removePin() { lockCfg = null; await db.setMeta('lock', null); }
async function checkPin(pin) { const h = b64(await pbkdf2(pin, unb64(lockCfg.salt), lockCfg.iter, 'bits')); return h === lockCfg.hash; }

export async function lockNow(boot = false) {
  if (!lockEnabled() || locked) return;
  locked = true;
  if (!boot && onLock) await onLock();
  lockAllProjects();
  showLockScreen();
}

function showLockScreen() {
  let entry = '';
  const scr = el(`<div class="lock" id="lockScreen" role="dialog" aria-label="Inkfold is locked">
    <div class="lock-inner">
      ${MARK}
      <h2>Inkfold is locked</h2>
      <p id="lockMsg">Enter your PIN</p>
      <div class="pin-dots" id="pinDots">${Array.from({ length: lockCfg.len }, () => '<i></i>').join('')}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<span></span><button data-k="0">0</button><button data-k="del" aria-label="Delete">${icon('back')}</button></div>
      <button class="lock-forgot" data-forgot>Forgot your PIN?</button>
    </div></div>`);
  document.body.appendChild(scr);
  document.body.classList.add('is-locked');
  const dots = () => $$('#pinDots i', scr).forEach((d, i) => d.classList.toggle('on', i < entry.length));
  const press = async k => {
    if (Date.now() < waitUntil) return;
    if (k === 'del') { entry = entry.slice(0, -1); dots(); return; }
    if (entry.length >= lockCfg.len) return;
    entry += k; dots(); haptic(4);
    if (entry.length === lockCfg.len) {
      const ok = await checkPin(entry);
      if (ok) { fails = 0; locked = false; scr.classList.add('out'); document.body.classList.remove('is-locked'); setTimeout(() => scr.remove(), 380); removeEventListener('keydown', onKey, true); lastActive = Date.now(); onUnlock && onUnlock(); return; }
      fails++; haptic([30, 40, 30]);
      $('#pinDots', scr).classList.add('shake'); setTimeout(() => $('#pinDots', scr).classList.remove('shake'), 500);
      entry = ''; setTimeout(dots, 300);
      if (fails >= 5) {
        waitUntil = Date.now() + 30000;
        const msg = $('#lockMsg', scr);
        const t = setInterval(() => { const s = Math.ceil((waitUntil - Date.now()) / 1000); if (s <= 0) { clearInterval(t); msg.textContent = 'Enter your PIN'; fails = 3; } else msg.textContent = `Too many tries. Wait ${s} s`; }, 250);
      } else $('#lockMsg', scr).textContent = 'Wrong PIN. Try again';
    }
  };
  const onKey = e => { if (!locked) return; if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); press('del'); } else { e.stopPropagation(); if (e.key !== 'Tab') e.preventDefault(); } };
  addEventListener('keydown', onKey, true);
  $$('[data-k]', scr).forEach(b => b.onclick = () => press(b.dataset.k));
  $('[data-forgot]', scr).onclick = () => {
    const box = $('#lockMsg', scr);
    box.innerHTML = 'For your privacy the PIN can’t be reset from here. Clear Inkfold’s site data in your browser settings, then restore from a backup.';
    box.classList.add('long');
  };
}

// PIN entry sheet used when turning the lock on or changing the PIN
export function pinSetupSheet() {
  return new Promise(res => {
    let step = 1, first = '', entry = '', done = false;
    const s = sheet({ title: 'Set a PIN', sub: 'Use 4 to 8 digits. You’ll enter it when Inkfold opens and after it locks itself.', foot: null, onClose: () => { if (!done) res(null); },
      body: `<div class="pin-setup"><p id="psMsg">Choose a PIN</p><div class="pin-field" id="psField"></div><div class="keypad small">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button data-k="del" aria-label="Delete">${icon('back')}</button><button data-k="0">0</button><button data-k="ok" class="ok" aria-label="Next">${icon('check')}</button></div></div>` });
    const field = $('#psField', s.wrap), msg = $('#psMsg', s.wrap);
    const draw = () => { field.innerHTML = Array.from({ length: Math.max(4, entry.length) }, (_, i) => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join(''); };
    const press = k => {
      if (k === 'del') entry = entry.slice(0, -1);
      else if (k === 'ok') {
        if (entry.length < 4) { msg.textContent = 'Use at least 4 digits'; haptic(30); return; }
        if (step === 1) { first = entry; entry = ''; step = 2; msg.textContent = 'Enter it again to confirm'; }
        else if (entry !== first) { entry = ''; step = 1; first = ''; msg.textContent = 'They didn’t match. Choose a PIN'; haptic(30); }
        else { done = true; s.close(); res(entry); return; }
      } else if (entry.length < 8) entry += k;
      draw();
    };
    $$('[data-k]', s.wrap).forEach(b => b.onclick = () => press(b.dataset.k));
    s.wrap.addEventListener('keydown', e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press('ok'); });
    s.wrap.tabIndex = -1; s.wrap.focus();
    draw();
  });
}
void esc;
