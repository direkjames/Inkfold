// Third-party libraries, loaded only when needed and cached by the service worker for offline use.
export const LIBS = {
  jszip: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', global: 'JSZip' },
  jspdf: { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', global: 'jspdf' },
  mammoth: { url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', global: 'mammoth' },
  peerjs: { url: 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', global: 'Peer' },
  qrcode: { url: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', global: 'qrcode' },
  jsqr: { url: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', global: 'jsQR' },
};

const loading = new Map();
export function loadLib(lib) {
  if (window[lib.global]) return Promise.resolve(window[lib.global]);
  if (loading.has(lib.url)) return loading.get(lib.url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = lib.url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window[lib.global]);
    s.onerror = () => { loading.delete(lib.url); reject(new Error('This feature needs to download once while you’re online. Connect to the internet and try again.')); };
    document.head.appendChild(s);
  });
  loading.set(lib.url, p);
  return p;
}
