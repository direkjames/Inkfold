// Inkfold — pictures inside scenes. Each picture is its own item (type 'image'); scenes only hold a reference,
// so versions, sync and search stay light and a picture is sent once even if it's used in many places.
import { uid } from './db.js';
import { touch } from './model.js';

export const IMG_SIZES = [{ w: 33, name: 'Small' }, { w: 55, name: 'Medium' }, { w: 80, name: 'Large' }, { w: 100, name: 'Full width' }];
const MAX = 1600; // longest side, in pixels

// Shrink a picture so backups and Nearby Sync stay fast. Keeps PNG when the picture has transparency.
export async function compressImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Choose an image file (JPG, PNG, WebP or GIF).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image couldn’t be opened.')); i.src = url; });
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    let alpha = false;
    if (/png|webp|gif/.test(file.type)) {
      const d = cx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; }
    }
    let src;
    if (alpha) src = c.toDataURL('image/png');
    else {
      // paint a white background first so JPEG has nothing to turn black
      const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const x2 = c2.getContext('2d'); x2.fillStyle = '#fff'; x2.fillRect(0, 0, w, h); x2.drawImage(c, 0, 0);
      src = c2.toDataURL('image/jpeg', 0.85);
    }
    return { src, w, h, name: (file.name || 'Picture').replace(/\.[^.]+$/, '').slice(0, 80) };
  } finally { URL.revokeObjectURL(url); }
}

export function newImageItem(projectId, sceneId, data) {
  return touch({ id: uid('im-'), projectId, type: 'image', parentId: sceneId || null, order: 0, title: data.name || 'Picture', content: '', deleted: false, data });
}

// Fill in the picture data for every <figure data-img> under root
export function hydrateImages(root, items) {
  if (!root) return;
  const figs = root.querySelectorAll('figure[data-img]');
  if (!figs.length) return;
  const byId = new Map(items.filter(i => i.type === 'image').map(i => [i.id, i]));
  figs.forEach(f => {
    const it = byId.get(f.dataset.img);
    const img = f.querySelector('img') || f.appendChild(document.createElement('img'));
    f.style.width = (Math.max(15, Math.min(100, +f.dataset.w || 100))) + '%';
    if (it && it.data && it.data.src) { if (img.getAttribute('src') !== it.data.src) img.src = it.data.src; f.classList.remove('missing'); }
    else f.classList.add('missing');
  });
}
