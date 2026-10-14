// Inkfold — backups, project files, import and export.
import { db } from './db.js';
import { loadLib, LIBS } from './libs.js';
import { buildTree, createProjectFrom, touch } from './model.js';
import { htmlToBlocks, blocksToMd, mdToBlocks, plainToBlocks } from './text.js';
import { mergeLibraries } from './sync.js';
import { uid } from './db.js';

const today = () => new Date().toISOString().slice(0, 10);
export const safeName = s => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'Untitled';
const isTouch = () => matchMedia('(pointer: coarse)').matches;

// ---------- Saving files ----------
export async function saveFile(blob, name, { preferShare = false } = {}) {
  if (preferShare && isTouch() && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'downloaded';
}

// ---------- Full-library backups ----------
export async function makeBackupBlob() {
  const JSZip = await loadLib(LIBS.jszip);
  const zip = new JSZip();
  const data = await db.dump();
  zip.file('library.json', JSON.stringify(data));
  zip.file('README.txt', `Inkfold backup — ${new Date().toLocaleString()}\n\nOpen Inkfold → Settings → Restore from backup, and choose this file.\nProjects: ${data.projects.filter(p => !p.deleted).length}\n`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
export const backupName = () => `inkfold-backup-${today()}.zip`;

export async function backupDownload() {
  const blob = await makeBackupBlob();
  const r = await saveFile(blob, backupName(), { preferShare: true });
  if (r !== 'cancelled') await db.setMeta('lastBackup', { at: Date.now(), where: r === 'shared' ? 'shared' : 'download' });
  return r;
}

export const folderBackupSupported = () => 'showDirectoryPicker' in window;

export async function chooseBackupFolder() {
  const dir = await window.showDirectoryPicker({ id: 'inkfold-backups', mode: 'readwrite' });
  await db.setMeta('backupDir', dir);
  await writeFolderBackup(dir);
  return dir;
}

export async function folderPermission() {
  const dir = await db.meta('backupDir');
  if (!dir || !dir.queryPermission) return { dir: null, state: 'none' };
  return { dir, state: await dir.queryPermission({ mode: 'readwrite' }) };
}

export async function writeFolderBackup(dir) {
  const blob = await makeBackupBlob();
  const fh = await dir.getFileHandle(backupName(), { create: true });
  const w = await fh.createWritable(); await w.write(blob); await w.close();
  // keep the 14 most recent daily backups
  const names = [];
  for await (const [name] of dir.entries()) if (/^inkfold-backup-\d{4}-\d\d-\d\d\.zip$/.test(name)) names.push(name);
  names.sort().reverse().slice(14).forEach(n => dir.removeEntry(n).catch(() => {}));
  await db.setMeta('lastBackup', { at: Date.now(), where: 'folder', folder: dir.name });
}

export async function readBackup(file) {
  const JSZip = await loadLib(LIBS.jszip);
  const zip = await JSZip.loadAsync(file);
  const f = zip.file('library.json');
  if (!f) throw new Error('This ZIP isn’t an Inkfold backup.');
  const data = JSON.parse(await f.async('string'));
  if (data.format !== 'inkfold-library') throw new Error('This ZIP isn’t an Inkfold backup.');
  return data;
}

export async function restoreBackup(data, mode) {
  await db.snapshot('Before restoring a backup');
  if (mode === 'replace') { await db.replaceAll(data); return null; }
  const { writes, summary } = mergeLibraries(await db.dump(), data, 'backup');
  await db.writeBatch(writes);
  return summary;
}

// ---------- Single project files (.inkfold) ----------
export async function exportProjectFile(projectId) {
  const project = await db.get('projects', projectId);
  const items = await db.byProject(projectId);
  const blob = new Blob([JSON.stringify({ format: 'inkfold-project', version: 1, exportedAt: Date.now(), project, items })], { type: 'application/json' });
  return saveFile(blob, `${safeName(project.title)}.inkfold`, { preferShare: true });
}

export async function readProjectFile(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'inkfold-project') throw new Error('This file isn’t an Inkfold project.');
  const exists = await db.get('projects', data.project.id);
  return { data, exists: !!exists && !exists.deleted };
}

export async function importProjectData(data, mode) {
  if (mode === 'copy') {
    const map = new Map();
    const newPid = uid('prj-');
    data.items.forEach(i => map.set(i.id, uid(i.type === 'chapter' ? 'ch-' : 'sc-')));
    const project = touch({ ...data.project, id: newPid, revs: [], title: data.project.title + ' (copy)' });
    const items = data.items.map(i => touch({ ...i, id: map.get(i.id), projectId: newPid, parentId: i.parentId ? map.get(i.parentId) || null : null, revs: [] }));
    await db.writeBatch({ projects: [project], items });
    return project;
  }
  await db.snapshot(`Before importing “${data.project.title}”`);
  const old = await db.byProject(data.project.id);
  await db.writeBatch({ projects: [data.project], items: data.items, deleteItems: old.map(i => i.id).filter(id => !data.items.some(i => i.id === id)) });
  return data.project;
}

// ---------- Importing documents ----------
function splitChapters(blocks, fallbackTitle) {
  const chapters = [];
  let ch = null, sc = null;
  const text = b => b.runs.map(r => r.text).join('').trim();
  const ensureCh = () => { if (!ch) { ch = { title: fallbackTitle || 'Chapter 1', scenes: [] }; chapters.push(ch); } return ch; };
  const ensureSc = () => { ensureCh(); if (!sc) { sc = { title: `Scene ${ch.scenes.length + 1}`, blocks: [] }; ch.scenes.push(sc); } return sc; };
  for (const b of blocks) {
    if (b.type === 'h2') { ch = { title: text(b) || `Chapter ${chapters.length + 1}`, scenes: [] }; chapters.push(ch); sc = null; continue; }
    if (b.type === 'h3') { ensureCh(); sc = { title: text(b) || `Scene ${ch.scenes.length + 1}`, blocks: [] }; ch.scenes.push(sc); continue; }
    ensureSc().blocks.push(b);
  }
  return chapters.length ? chapters : [{ title: 'Chapter 1', scenes: [{ title: 'Scene 1', blocks: [] }] }];
}

export async function importDocument(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let blocks;
  if (ext === 'docx') {
    const mammoth = await loadLib(LIBS.mammoth);
    const res = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    blocks = htmlToBlocks(res.value);
  } else if (ext === 'md' || ext === 'markdown') {
    blocks = mdToBlocks(await file.text());
  } else if (ext === 'txt') {
    blocks = plainToBlocks(await file.text()).map(b => {
      const t = b.runs && b.runs[0] ? b.runs[0].text : '';
      return /^(chapter|part|prologue|epilogue)\b.{0,60}$/i.test(t) ? { type: 'h2', runs: b.runs } : b;
    });
  } else throw new Error('Inkfold can import .docx, .md, .txt, .inkfold project files and .zip backups.');
  return createProjectFrom(name, splitChapters(blocks));
}

// ---------- Export ----------
async function projectContent(projectId) {
  const project = await db.get('projects', projectId);
  const tree = buildTree(await db.byProject(projectId));
  return { project, chapters: tree.map(c => ({ title: c.title, scenes: c.scenes.map(s => ({ title: s.title, blocks: htmlToBlocks(s.content) })) })) };
}

export async function exportProject(projectId, format, opts = {}) {
  const { project, chapters } = await projectContent(projectId);
  const base = safeName(project.title);
  if (format === 'md') {
    let md = `# ${project.title}\n`;
    if (project.subtitle) md += `\n*${project.subtitle}*\n`;
    if (project.author) md += `\nby ${project.author}\n`;
    chapters.forEach(c => {
      md += `\n\n## ${c.title}\n`;
      c.scenes.forEach((s, i) => {
        if (opts.sceneTitles) md += `\n### ${s.title}\n`;
        else if (i > 0) md += '\n* * *\n';
        md += '\n' + blocksToMd(s.blocks.map(b => b.type === 'h2' ? { ...b, type: 'h3' } : b)) + '\n';
      });
    });
    return saveFile(new Blob([md], { type: 'text/markdown' }), `${base}.md`, { preferShare: true });
  }
  if (format === 'docx') return saveFile(await buildDocx(project, chapters, opts), `${base}.docx`, { preferShare: true });
  if (format === 'pdf') return saveFile(await buildPdf(project, chapters, opts), `${base}.pdf`, { preferShare: true });
}

// DOCX, built directly as Office Open XML
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wRuns(runs) {
  return runs.map(r => {
    const props = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '');
    const parts = r.text.split('\n').map(t => `<w:t xml:space="preserve">${x(t)}</w:t>`).join('<w:br/>');
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts}</w:r>`;
  }).join('');
}
const wP = (style, inner) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${inner}</w:p>`;

async function buildDocx(project, chapters, opts) {
  const JSZip = await loadLib(LIBS.jszip);
  let body = wP('Title', wRuns([{ text: project.title }]));
  if (project.subtitle) body += wP('Subtitle', wRuns([{ text: project.subtitle }]));
  if (project.author) body += wP('Author', wRuns([{ text: 'by ' + project.author }]));
  chapters.forEach((c, ci) => {
    body += wP('ChapterNumber', wRuns([{ text: `Chapter ${ci + 1}` }]));
    body += wP('Heading1', wRuns([{ text: c.title }]));
    c.scenes.forEach((s, si) => {
      if (opts.sceneTitles) body += wP('Heading2', wRuns([{ text: s.title }]));
      else if (si > 0) body += wP('SceneBreak', wRuns([{ text: '*   *   *' }]));
      let first = true;
      s.blocks.forEach(b => {
        if (b.type === 'hr') { body += wP('SceneBreak', wRuns([{ text: '*   *   *' }])); first = true; return; }
        if (b.type === 'h2' || b.type === 'h3') { body += wP('Heading2', wRuns(b.runs)); first = true; return; }
        if (b.type === 'quote') { body += wP('Quote', wRuns(b.runs)); return; }
        if (b.type === 'ul' || b.type === 'ol') { body += wP('ListItem', wRuns([{ text: '•  ' }, ...b.runs])); return; }
        body += wP(first ? 'FirstParagraph' : 'Normal', wRuns(b.runs)); first = false;
      });
    });
  });
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const font = opts.font || 'Georgia';
  const st = (id, name, ppr, rpr, based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="567"/><w:jc w:val="both"/></w:pPr></w:style>
${st('FirstParagraph', 'First Paragraph', '<w:ind w:firstLine="0"/>', '')}
${st('Title', 'Title', '<w:spacing w:before="3600" w:after="240"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:sz w:val="56"/>')}
${st('Subtitle', 'Subtitle', '<w:jc w:val="center"/><w:ind w:firstLine="0"/><w:spacing w:after="240"/>', '<w:i/><w:sz w:val="28"/>')}
${st('Author', 'Author', '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:caps/><w:spacing w:val="40"/><w:sz w:val="22"/>')}
${st('ChapterNumber', 'Chapter Number', '<w:pageBreakBefore/><w:spacing w:before="2400" w:after="120"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:caps/><w:spacing w:val="60"/><w:sz w:val="20"/>')}
${st('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:after="720"/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="0"/>', '<w:sz w:val="40"/>')}
${st('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="360" w:after="240"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="26"/>')}
${st('SceneBreak', 'Scene Break', '<w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '')}
${st('Quote', 'Quote', '<w:ind w:left="720" w:right="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>', '<w:i/>')}
${st('ListItem', 'List Item', '<w:ind w:left="720" w:hanging="300" w:firstLine="0"/>', '')}
</w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(project.title)}</dc:title><dc:creator>${x(project.author || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', document);
  zip.file('word/styles.xml', styles);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// PDF, typeset word by word with jsPDF
async function buildPdf(project, chapters, opts) {
  const { jsPDF } = (await loadLib(LIBS.jspdf));
  const doc = new jsPDF({ unit: 'pt', format: opts.pageSize || 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 72, size = 11.5, lead = size * 1.55, indent = 20;
  let y = M;
  const clean = t => t.replace(/[^\x09\x0a\x20-\x7e -ÿ–—‘’“”…•]/g, '?');
  const style = r => (r.b && r.i) ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal';
  const newPage = () => { doc.addPage(); y = M; };
  const center = (text, sz, st = 'normal', yy = y, spacing = 0) => {
    doc.setFont('times', st); doc.setFontSize(sz);
    const w = doc.getTextWidth(text) + spacing * (text.length - 1);
    doc.text(text, (W - w) / 2, yy, { charSpace: spacing });
  };
  function para(runs, { first = false, left = M, right = W - M, italic = false, prefix = '' } = {}) {
    doc.setFontSize(size);
    const words = [];
    if (prefix) words.push({ text: prefix, st: 'normal', space: true });
    runs.forEach(r => {
      const st = style({ b: r.b, i: italic ? !r.i : r.i });
      clean(r.text).split(/(\n| +)/).forEach(tok => {
        if (tok === '\n') words.push({ br: true });
        else if (/^ +$/.test(tok)) { if (words.length) words[words.length - 1].space = true; }
        else if (tok) words.push({ text: tok, st, space: false });
      });
    });
    let line = [], lineW = 0, x0 = left + (first ? 0 : indent);
    const spaceW = () => { doc.setFont('times', 'normal'); return doc.getTextWidth(' '); };
    const flush = () => {
      if (y > H - M) newPage();
      let x = x0;
      line.forEach(w => { doc.setFont('times', w.st); doc.text(w.text, x, y); x += w.w + (w.space ? spaceW() : 0); });
      y += lead; line = []; lineW = 0; x0 = left;
    };
    for (const w of words) {
      if (w.br) { flush(); continue; }
      doc.setFont('times', w.st); w.w = doc.getTextWidth(w.text);
      const sp = line.length && line[line.length - 1].space ? spaceW() : 0;
      if (line.length && x0 + lineW + sp + w.w > right) flush();
      lineW += (line.length && line[line.length - 1].space ? spaceW() : 0) + w.w;
      line.push(w);
    }
    if (line.length) flush();
  }
  // Title page
  center(project.title, 30, 'normal', H * 0.38);
  if (project.subtitle) center(project.subtitle, 14, 'italic', H * 0.38 + 34);
  if (project.author) center(('by ' + project.author).toUpperCase(), 10, 'normal', H * 0.38 + 68, 1.5);
  chapters.forEach((c, ci) => {
    newPage(); y = M + 110;
    center(`CHAPTER ${ci + 1}`, 9.5, 'normal', y, 2); y += 30;
    center(c.title, 22, 'normal', y); y += 56;
    c.scenes.forEach((s, si) => {
      let first = true;
      if (opts.sceneTitles) { doc.setFont('times', 'bold'); doc.setFontSize(size); if (y > H - M - lead * 2) newPage(); doc.text(s.title, M, y); y += lead * 1.4; }
      else if (si > 0) { y += lead * 0.4; center('*     *     *', size, 'normal', y); y += lead * 1.4; }
      s.blocks.forEach(b => {
        if (b.type === 'hr') { y += lead * 0.4; center('*     *     *', size, 'normal', y); y += lead * 1.4; first = true; return; }
        if (b.type === 'h2' || b.type === 'h3') { y += lead * 0.5; para(b.runs.map(r => ({ ...r, b: true })), { first: true }); y += lead * 0.3; first = true; return; }
        if (b.type === 'quote') { y += lead * 0.3; para(b.runs, { first: true, left: M + 30, right: W - M - 30, italic: true }); y += lead * 0.3; return; }
        if (b.type === 'ul' || b.type === 'ol') { para(b.runs, { first: true, left: M + 18, prefix: '•' }); return; }
        para(b.runs, { first }); first = false;
      });
    });
  });
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) { doc.setPage(p); doc.setFont('times', 'normal'); doc.setFontSize(9); const t = String(p - 1); doc.text(t, (W - doc.getTextWidth(t)) / 2, H - 40); }
  doc.setProperties({ title: project.title, author: project.author || '' });
  return doc.output('blob');
}
