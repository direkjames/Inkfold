// Inkfold — shared UI helpers: icons, toasts, popovers, sheets
// ---------------------------------------------------------------- Icons
export const ICONS = {
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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/>',
  board: '<rect x="3" y="4" width="7.5" height="7" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="7" rx="1.5"/><rect x="3" y="14" width="7.5" height="7" rx="1.5"/><rect x="13.5" y="14" width="7.5" height="7" rx="1.5"/>',
  outline: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  pen: '<path d="M14 4l6 6-9.5 9.5H4.5v-6z"/><path d="M12 6l6 6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  flame: '<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.6-2.5-5.6-3.8-8.7-.6 2.4-1.8 3.4-3 4C11.9 7 10.5 4.6 8.4 3c.3 3.6-2.9 6.2-2.9 11.2C5.5 18.2 8 21 12 21z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5.5-5.5L6 20"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  rain: '<path d="M7 15a4.5 4.5 0 01-.6-9A6 6 0 0118 7.5a4 4 0 01-.5 7.5"/><path d="M8 18l-1 2.5M12 17l-1 3.5M16 18l-1 2.5"/>',
  fire: '<path d="M12 21c4 0 6.5-2.6 6.5-6.3 0-3.6-2.5-5.6-3.8-8.7-.6 2.4-1.8 3.4-3 4C11.9 7 10.5 4.6 8.4 3c.3 3.6-2.9 6.2-2.9 11.2C5.5 18.2 8 21 12 21z"/><path d="M12 21c-1.8 0-3-1.2-3-3 0-2 1.6-2.9 2.3-4.6.9 1.4 3.7 2.3 3.7 4.6 0 1.8-1.2 3-3 3z"/>',
  cup: '<path d="M4 9h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5z"/><path d="M17 10.5h1.5a2.5 2.5 0 010 5H17M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/>',
  wave: '<path d="M2 13c2.5 0 2.5-2.5 5-2.5S9.5 13 12 13s2.5-2.5 5-2.5 2.5 2.5 5 2.5M2 18c2.5 0 2.5-2.5 5-2.5S9.5 18 12 18s2.5-2.5 5-2.5 2.5 2.5 5 2.5"/><path d="M5 7.5c2-2.5 5-3 8-1.5"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M15.5 4.8a3.5 3.5 0 010 6.4M18 14.4c2.2.7 3.5 2.8 3.5 5.6"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0113 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  arrowRight: '<path d="M4 12h15M14 6l6 6-6 6"/>',
  history: '<path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7.5V12l3 2"/>',
  comment: '<path d="M5 4.5h14a2 2 0 012 2v9a2 2 0 01-2 2H11l-4.5 3.5V17.5H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
  replace: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
  pause: '<rect x="6.5" y="5" width="3.8" height="14" rx="1"/><rect x="13.7" y="5" width="3.8" height="14" rx="1"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
  fit: '<path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4"/><circle cx="12" cy="12" r="2.5"/>',
  tree: '<rect x="9" y="3" width="6" height="5" rx="1.2"/><rect x="3" y="16" width="6" height="5" rx="1.2"/><rect x="15" y="16" width="6" height="5" rx="1.2"/><path d="M12 8v4M6 16v-4h12v4"/>',
  web: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/><path d="M10.8 7.2L6.2 14.8M13.2 7.2l4.6 7.6M7.5 17h9"/>',
  bible: '<path d="M5 4a1 1 0 011-1h12v17H6a1 1 0 01-1-1z"/><path d="M5 18a2 2 0 012-2h11M12 7v6M9.5 9.5h5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 017.6-1.7"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  feather: '<path d="M20 4c-6 0-11 4-12.5 10.5L6 20"/><path d="M20 4c0 7-4.5 11.5-11 12.5M14 9.5l-7 7"/>',
  timeline: '<path d="M3 12h18"/><circle cx="7" cy="12" r="2"/><circle cx="14" cy="12" r="2"/><path d="M7 7v3M14 14v3M19 8v8"/>',
  command: '<path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.4 0 2-1 1.6-2.1-.5-1.2.3-2.4 1.6-2.4H17a4 4 0 004-4c0-5-4-9.5-9-9.5z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  align: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  quoteMark: '<path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/>',
};
export const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
export const MARK = `<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 4.5h12.5L25 10v17.5H7z" fill="var(--text)"/><path d="M19.5 4.5V10H25z" fill="var(--accent)"/><path d="M16 12.6s-3.9 4.3-3.9 6.8a3.9 3.9 0 0 0 7.8 0c0-2.5-3.9-6.8-3.9-6.8z" fill="var(--bg)"/></svg>`;

// ---------------------------------------------------------------- Utilities
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = n => (n || 0).toLocaleString();
export const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };
export function ago(ts) {
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
export const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

export function toast(msg, action, ms = 3600) {
  const t = el(`<div class="toast"><span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}</div>`);
  const remove = () => { t.classList.add('leaving'); setTimeout(() => t.remove(), 300); };
  if (action) $('button', t).onclick = () => { action.run(); remove(); };
  $('#toasts').appendChild(t);
  if (ms) setTimeout(remove, ms);
  return remove;
}
export const errorToast = e => { console.error(e); toast(e && e.message ? e.message : 'Something went wrong. Please try again.'); };

// Popovers
let openPop = null;
export const popOpen = () => !!openPop;
export function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
export function popover(anchor, content, { align = 'end', cls = '' } = {}) {
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
export function menu(anchor, items) {
  const html = items.map(it => it === '-' ? '<hr>' : `<button class="mi ${it.danger ? 'danger' : ''}" data-k="${it.k}">${icon(it.icon)}<span>${esc(it.label)}</span></button>`).join('');
  const p = popover(anchor, html);
  $$('.mi', p).forEach(b => b.onclick = () => { closePop(); items.find(i => i.k === b.dataset.k).run(); });
}

// Sheets
export const sheets = [];
export function sheet({ title, sub = '', body = '', foot = '', wide = false, onClose }) {
  const size = wide === 'x' ? 'xwide' : wide ? 'wide' : '';
  const wrap = el(`<div class="sheet-wrap"><div class="sheet ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
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
export function confirmSheet({ title, sub, confirm = 'Confirm', danger = false }) {
  return new Promise(res => {
    let done = false;
    const s = sheet({ title, sub, body: '', foot: `<button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>`, onClose: () => { if (!done) res(false); } });
    s.body.remove();
    $('[data-no]', s.wrap).onclick = () => s.close();
    $('[data-yes]', s.wrap).onclick = () => { done = true; s.close(); res(true); };
  });
}
