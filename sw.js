// Inkfold service worker — makes the whole app work offline.
const VERSION = 'inkfold-v1.7.1';
const SOUNDS = 'inkfold-sounds';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/model.js', './js/text.js', './js/io.js', './js/sync.js', './js/libs.js', './js/ui.js', './js/stats.js', './js/sound.js', './js/board.js', './js/bible.js', './js/relmap.js', './js/revise.js', './js/screenplay.js', './js/modes.js', './js/timeline.js', './js/compile.js', './js/security.js', './js/palette.js', './js/images.js', './js/series.js', './js/level.js', './js/maps.js', './js/mapfold.js', './js/reader.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
];
// Libraries used by import/export/sync. Cached up front so they work offline too.
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Instrument+Serif:ital@0;1&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await Promise.all([...LIBS, FONT_CSS].map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // the soundscape recordings are big and don't change, so they outlive app updates
    for (const k of await caches.keys()) if (k !== VERSION && k !== SOUNDS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // PeerJS signalling must always go to the network
  if (url.hostname.endsWith('peerjs.com')) return;
  if (url.origin === location.origin && /\/sounds\/[\w-]+\.mp3$/.test(url.pathname)) { e.respondWith(soundResponse(req, url)); return; }

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match('./index.html')) || fetch(req);
    })());
    return;
  }
  // Cache first, then network (and remember fonts and libraries for next time)
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      const cacheable = res.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$|unpkg\.com$|cdn\.jsdelivr\.net$/.test(url.hostname));
      if (cacheable) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

// Soundscapes: keep the whole file after its first play. Audio players ask for byte ranges,
// and the cache can't store those, so fetch the whole file once and answer ranges from it.
async function soundResponse(req, url) {
  const cache = await caches.open(SOUNDS);
  let res = await cache.match(url.pathname);
  if (!res) {
    let net;
    try { net = await fetch(url.href); } catch { return new Response('', { status: 504, statusText: 'Offline' }); }
    if (!net.ok) return net;
    await cache.put(url.pathname, net.clone());
    res = net;
  }
  const range = req.headers.get('range');
  if (!range) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - +m[2]); end = size - 1; } // "last N bytes"
  if (start >= size || end < start) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
