// Inkfold — command palette (Ctrl/Cmd+K) and the keyboard shortcuts sheet.
import { $, $$, esc, icon, el, sheet } from './ui.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
export const kbd = s => s.split('+').map(k => `<kbd>${k === 'Mod' ? MOD : k === 'Shift' ? (isMac ? '⇧' : 'Shift') : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k}</kbd>`).join('');

function score(q, text) {
  if (!q) return 1;
  const t = text.toLowerCase(), s = q.toLowerCase();
  const i = t.indexOf(s);
  if (i === 0) return 100 - t.length / 100;
  if (i > 0) return (/\s/.test(t[i - 1]) ? 80 : 60) - t.length / 100;
  let ti = 0, hits = 0, streak = 0, best = 0;
  for (const ch of s) { const k = t.indexOf(ch, ti); if (k < 0) return 0; streak = k === ti ? streak + 1 : 1; best = Math.max(best, streak); ti = k + 1; hits++; }
  return 20 + best * 3 - t.length / 100;
}

let open = null;
export function openPalette(getItems) {
  if (open) return open.close();
  const items = getItems();
  const wrap = el(`<div class="pal-wrap"><div class="pal" role="dialog" aria-label="Command palette">
    <div class="pal-in">${icon('search')}<input id="palQ" placeholder="Search commands, scenes and characters…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
    <div class="pal-list" id="palList" role="listbox"></div>
    <div class="pal-foot"><span>${kbd('↑')}${kbd('↓')} to move</span><span>${kbd('↵')} to open</span><span>${kbd('Mod+K')} to close</span></div>
  </div></div>`);
  document.body.appendChild(wrap);
  let sel = 0, shown = [];
  const q = $('#palQ', wrap), list = $('#palList', wrap);
  const draw = () => {
    const query = q.value.trim();
    shown = items.map(it => ({ it, s: Math.max(score(query, it.label), it.alt ? score(query, it.alt) * 0.9 : 0) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || (a.it.rank || 0) - (b.it.rank || 0)).slice(0, query ? 40 : 60).map(x => x.it);
    if (!query) { const order = ['Actions', 'Go to', 'Scenes', 'Story bible', 'Projects']; shown.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)); }
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let lastGroup = '';
    list.innerHTML = shown.length ? shown.map((it, i) => { const g = it.group !== lastGroup ? `<div class="pal-g">${esc(it.group)}</div>` : ''; lastGroup = it.group; return `${g}<button class="pal-it ${i === sel ? 'on' : ''}" data-i="${i}" role="option">${it.avatar || icon(it.icon || 'arrowRight')}<span class="pal-l">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.keys ? `<span class="pal-k">${kbd(it.keys)}</span>` : ''}</button>`; }).join('') : `<div class="pal-empty">Nothing matches “${esc(query)}”</div>`;
    $$('.pal-it', list).forEach(b => { b.onclick = () => run(+b.dataset.i); b.onmousemove = () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; $$('.pal-it', list).forEach(x => x.classList.toggle('on', x === b)); } }; });
    const on = $('.pal-it.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { wrap.remove(); open = null; };
  const run = i => { const it = shown[i]; if (!it) return; close(); setTimeout(() => it.run(), 0); };
  q.oninput = () => { sel = 0; draw(); };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
  open = { close };
  draw(); q.focus();
}
export const paletteOpen = () => !!open;
export const closePalette = () => open && open.close();

export const SHORTCUTS = [
  ['Everywhere', [['Mod+K', 'Command palette'], ['Mod+/', 'Keyboard shortcuts'], ['Mod+Shift+L', 'Lock Inkfold (when a PIN is set)'], ['Esc', 'Close a sheet, menu or focus mode']]],
  ['Writing', [['Mod+S', 'Save now'], ['Mod+.', 'Focus mode'], ['Mod+F', 'Find & replace'], ['Mod+B', 'Bold'], ['Mod+I', 'Italic'], ['Mod+Shift+M', 'Add a margin note'], ['Mod+Shift+N', 'New scene in this chapter']]],
  ['Views', [['Mod+Shift+1', 'Write'], ['Mod+Shift+2', 'Board or Calendar'], ['Mod+Shift+3', 'Outline'], ['Mod+Shift+4', 'Timeline'], ['Mod+Shift+5', 'Story bible']]],
  ['Screenplay', [['Tab', 'Next element (Action → Character → Transition…)'], ['Shift+Tab', 'Previous element'], ['Enter', 'New line with the element that usually follows'], ['Mod+Alt+1–7', 'Heading, Action, Character, Paren, Dialogue, Transition, Centered']]],
  ['Markdown shortcuts', [['# ', 'Heading'], ['> ', 'Quote'], ['- ', 'List'], ['***', 'Scene break (then Enter)'], ['**text**', 'Bold'], ['*text*', 'Italic']]],
];
export function shortcutsSheet() {
  sheet({ title: 'Keyboard shortcuts', wide: true, foot: null, body: `<div class="kb-grid">${SHORTCUTS.map(([g, list]) => `<div class="kb-group"><div class="group-title">${g}</div>${list.map(([k, l]) => `<div class="kb-row"><span>${esc(l)}</span><span class="kb-keys">${/^[#>\-*]/.test(k) ? `<code>${esc(k)}</code>` : kbd(k)}</span></div>`).join('')}</div>`).join('')}</div>` });
}
