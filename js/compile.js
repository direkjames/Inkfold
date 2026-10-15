// Inkfold — Compile: turn a project into a finished file with a template, choosing exactly what goes in.
import { db } from './db.js';
import { loadLib, LIBS } from './libs.js';
import { buildTree, statusOf } from './model.js';
import { htmlToBlocks, blocksToMd, isBlank } from './text.js';
import { saveFile, safeName, exportProjectFile } from './io.js';
import { $, $$, esc, num, icon, sheet, toast, errorToast } from './ui.js';
import { modeOf, T } from './modes.js';
import { toFountain, toFdx, toScreenplayPdf } from './screenplay.js';

export const TEMPLATES = {
  manuscript: { name: 'Standard manuscript', blurb: 'For agents and editors: 12 pt, double-spaced, page header, # between scenes.', font: 'Times New Roman', size: 12, spacing: 2, chapterStyle: 'words', sep: '#', indent: true, sceneTitles: false, titlePage: 'manuscript', header: true, justify: false },
  book: { name: 'Book', blurb: 'Typeset like a printed novel: justified text and numbered chapters.', font: 'Georgia', size: 11.5, spacing: 1.45, chapterStyle: 'number-title', sep: '* * *', indent: true, sceneTitles: false, titlePage: 'book', header: false, justify: true },
  reading: { name: 'Reading copy', blurb: 'Easy on screen, good for beta readers. Scene titles included.', font: 'Georgia', size: 12, spacing: 1.5, chapterStyle: 'title', sep: '⁂', indent: false, sceneTitles: true, titlePage: 'simple', header: false, justify: false },
  custom: { name: 'Custom', blurb: 'Your own typeface, spacing, headings and breaks.', font: 'Georgia', size: 12, spacing: 1.5, chapterStyle: 'number-title', sep: '* * *', indent: true, sceneTitles: false, titlePage: 'book', header: false, justify: false },
};
const FONTS = ['Times New Roman', 'Georgia', 'Garamond', 'Palatino Linotype', 'Helvetica', 'Courier New'];
const CHAPTER_STYLES = { words: 'Chapter One', number: 'Chapter 1', 'number-title': 'Number and title', title: 'Title only', numeral: '1' };
const SEPS = ['* * *', '#', '⁂', '~', '(blank line)'];

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const words = n => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
function chapterLines(i, title, style, term = 'Chapter') {
  const n = i + 1;
  if (style === 'words') return [`${term} ${words(n)}`, title !== `${term} ${words(n)}` && !/^chapter\s/i.test(title) ? title : ''];
  if (style === 'number') return [`${term} ${n}`, !/^chapter\s/i.test(title) ? title : ''];
  if (style === 'numeral') return [String(n), ''];
  if (style === 'title') return ['', title];
  return [`${term} ${n}`.toUpperCase(), title];
}
const sepText = s => s === '(blank line)' ? '' : s;

// ---------------------------------------------------------------- the sheet
export function compileSheet(ctx) {
  const p = ctx.state.project, mode = modeOf(p), term = T(p);
  const screen = mode === 'screenplay';
  const saved = p.compile || {};
  const o = {
    format: saved.format || (screen ? 'pdf' : 'docx'),
    template: saved.template || (mode === 'journal' || mode === 'poetry' ? 'reading' : 'manuscript'),
    custom: { ...TEMPLATES.custom, ...(saved.custom || {}) },
    pageSize: saved.pageSize || 'a4',
    contact: saved.contact || '',
    poemPerPage: saved.poemPerPage !== false,
  };
  const tree = buildTree(ctx.state.items).filter(c => c.id !== '__loose' || c.scenes.length);
  const picked = new Set(tree.flatMap(c => c.scenes.map(s => s.id)));
  const formats = screen
    ? [['pdf', 'Screenplay PDF', 'Courier 12, industry margins', '.pdf'], ['fountain', 'Fountain', 'Plain text screenplay', '.fountain'], ['fdx', 'Final Draft', 'Opens in Final Draft', '.fdx'], ['inkfold', 'Inkfold project', 'Move to another device', '.inkfold']]
    : [['docx', 'Word', 'For editors and agents', '.docx'], ['pdf', 'PDF', 'Ready to read or print', '.pdf'], ['epub', 'EPUB', 'E-readers and Apple Books', '.epub'], ['md', 'Markdown', 'Plain text', '.md'], ['inkfold', 'Inkfold project', 'Move to another device', '.inkfold']];
  if (!formats.some(f => f[0] === o.format)) o.format = formats[0][0];

  const s = sheet({ title: 'Compile', wide: 'x', sub: `Turn “${esc(p.title)}” into a finished file. Choose a format, a look, and what goes in.`, foot: `<span class="cp-sum tnum" id="cpSum"></span><span style="flex:1"></span><button class="btn btn-ghost" data-c>Cancel</button><button class="btn btn-primary" id="cpGo">${icon('download')}Compile</button>` });
  const body = s.body;
  const draw = () => {
    const tpl = o.template === 'custom' ? o.custom : TEMPLATES[o.template];
    const usesTpl = !screen && ['docx', 'pdf', 'epub'].includes(o.format);
    body.innerHTML = `
      <div class="group"><div class="group-title">Format</div><div class="cp-formats">${formats.map(([k, t, d, e]) => `<button class="fmt-card ${k === o.format ? 'on' : ''}" data-f="${k}"><span class="ext">${e}</span><b>${t}</b><span>${d}</span></button>`).join('')}</div></div>
      ${usesTpl ? `<div class="group"><div class="group-title">Look</div><div class="cp-tpls">${Object.entries(TEMPLATES).map(([k, t]) => `<button class="cp-tpl ${k === o.template ? 'on' : ''}" data-t="${k}"><span class="cp-prev tp-${k}"><i></i><i></i><i></i><i></i></span><b>${t.name}</b><span>${t.blurb}</span></button>`).join('')}</div>
        ${o.template === 'custom' ? customHtml(o.custom) : ''}
        <div class="cp-row">
          <div class="field"><span class="field-label">Page size</span><div class="seg" id="cpPage"><button data-p="a4" class="${o.pageSize === 'a4' ? 'on' : ''}">A4</button><button data-p="letter" class="${o.pageSize === 'letter' ? 'on' : ''}">US Letter</button></div></div>
          ${mode === 'poetry' ? `<div class="toggle-row"><div class="t-text"><b>Each poem on a new page</b></div><button class="switch" role="switch" aria-checked="${o.poemPerPage}" id="cpPoem"></button></div>` : ''}
        </div>
        ${tpl.titlePage === 'manuscript' ? `<div class="field"><label class="field-label" for="cpContact">Your contact details (title page)</label><textarea class="input prose" id="cpContact" rows="3" placeholder="Your legal name&#10;Email · phone&#10;Agent, if you have one">${esc(o.contact)}</textarea></div>` : ''}
      </div>` : ''}
      ${screen && o.format === 'pdf' ? `<div class="group"><div class="field"><span class="field-label">Page size</span><div class="seg" id="cpPage"><button data-p="letter" class="${o.pageSize !== 'a4' ? 'on' : ''}">US Letter</button><button data-p="a4" class="${o.pageSize === 'a4' ? 'on' : ''}">A4</button></div></div>
        <div class="field"><label class="field-label" for="cpContact">Contact (title page)</label><textarea class="input prose" id="cpContact" rows="2" placeholder="Name · email · phone">${esc(o.contact)}</textarea></div></div>` : ''}
      ${o.format !== 'inkfold' ? `<div class="group"><div class="cp-contents-h"><span class="group-title">Contents</span><div class="cp-quick"><button data-q="all">All</button><button data-q="none">None</button><button data-q="final">Final &amp; revised only</button></div></div>
        <div class="cp-tree">${tree.map(c => { const all = c.scenes.length && c.scenes.every(x => picked.has(x.id)), some = c.scenes.some(x => picked.has(x.id)); return `<div class="cp-ch"><label class="cp-check"><input type="checkbox" data-ch="${c.id}" ${all ? 'checked' : ''} ${!all && some ? 'data-mixed="1"' : ''}><b>${esc(c.title)}</b><span class="tnum">${num(c.scenes.reduce((n, x) => n + (picked.has(x.id) ? x.words || 0 : 0), 0))}</span></label>
          <div class="cp-scenes">${c.scenes.map(x => `<label class="cp-check sm"><input type="checkbox" data-sc="${x.id}" ${picked.has(x.id) ? 'checked' : ''}><span>${esc(x.title)}</span><i class="st-dot st-${statusOf(x).id}"></i></label>`).join('')}</div></div>`; }).join('')}</div></div>` : ''}`;
    $$('[data-f]', body).forEach(b => b.onclick = () => { o.format = b.dataset.f; draw(); });
    $$('[data-t]', body).forEach(b => b.onclick = () => { o.template = b.dataset.t; draw(); });
    $$('#cpPage button', body).forEach(b => b.onclick = () => { o.pageSize = b.dataset.p; draw(); });
    const pm = $('#cpPoem', body); if (pm) pm.onclick = () => { o.poemPerPage = !o.poemPerPage; draw(); };
    const ct = $('#cpContact', body); if (ct) ct.oninput = () => { o.contact = ct.value; };
    $$('[data-cu]', body).forEach(inp => inp.onchange = () => { const k = inp.dataset.cu; o.custom[k] = inp.type === 'checkbox' ? inp.checked : ['size', 'spacing'].includes(k) ? +inp.value : inp.value; });
    $$('[data-ch]', body).forEach(cb => { if (cb.dataset.mixed) cb.indeterminate = true; cb.onchange = () => { const c = tree.find(x => x.id === cb.dataset.ch); c.scenes.forEach(x => cb.checked ? picked.add(x.id) : picked.delete(x.id)); draw(); }; });
    $$('[data-sc]', body).forEach(cb => cb.onchange = () => { cb.checked ? picked.add(cb.dataset.sc) : picked.delete(cb.dataset.sc); draw(); });
    $$('[data-q]', body).forEach(b => b.onclick = () => { picked.clear(); tree.forEach(c => c.scenes.forEach(x => { if (b.dataset.q === 'all' || (b.dataset.q === 'final' && ['final', 'revised'].includes(statusOf(x).id))) picked.add(x.id); })); draw(); });
    const chosen = tree.flatMap(c => c.scenes.filter(x => picked.has(x.id)));
    const w = chosen.reduce((n, x) => n + (x.words || 0), 0);
    const pages = screen ? null : Math.max(1, Math.round(w / (o.template === 'manuscript' ? 250 : 320)));
    $('#cpSum', s.wrap).textContent = o.format === 'inkfold' ? 'The whole project, including your story bible' : `${chosen.length} ${chosen.length === 1 ? term.scene.toLowerCase() : term.scene.toLowerCase() + 's'} · ${num(w)} words${pages ? ` · about ${num(pages)} page${pages === 1 ? '' : 's'}` : ''}`;
    $('#cpGo', s.wrap).disabled = o.format !== 'inkfold' && !chosen.length;
  };
  $('[data-c]', s.wrap).onclick = s.close;
  $('#cpGo', s.wrap).onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Compiling…';
    try {
      await ctx.saveNow();
      p.compile = { format: o.format, template: o.template, custom: o.custom, pageSize: o.pageSize, contact: o.contact, poemPerPage: o.poemPerPage };
      await ctx.saveProject();
      const r = await compile(ctx, o, picked);
      s.close(); if (r !== 'cancelled') toast(r === 'shared' ? 'Compiled' : 'Saved to your downloads');
    } catch (err) { errorToast(err); btn.disabled = false; btn.innerHTML = `${icon('download')}Compile`; }
  };
  draw();
}

function customHtml(c) {
  return `<div class="cp-custom">
    <label class="field"><span class="field-label">Typeface</span><select class="input" data-cu="font">${FONTS.map(f => `<option ${c.font === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Size</span><select class="input" data-cu="size">${[10, 10.5, 11, 11.5, 12, 13, 14].map(n => `<option value="${n}" ${c.size === n ? 'selected' : ''}>${n} pt</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Line spacing</span><select class="input" data-cu="spacing">${[[1, 'Single'], [1.15, '1.15'], [1.45, '1.5'], [2, 'Double']].map(([v, l]) => `<option value="${v}" ${c.spacing === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Chapter headings</span><select class="input" data-cu="chapterStyle">${Object.entries(CHAPTER_STYLES).map(([k, l]) => `<option value="${k}" ${c.chapterStyle === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Between scenes</span><select class="input" data-cu="sep">${SEPS.map(x => `<option ${c.sep === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Title page</span><select class="input" data-cu="titlePage">${[['book', 'Centred title'], ['manuscript', 'Manuscript (contact + word count)'], ['simple', 'Simple'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${c.titlePage === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="cp-check"><input type="checkbox" data-cu="indent" ${c.indent ? 'checked' : ''}><span>Indent paragraphs</span></label>
    <label class="cp-check"><input type="checkbox" data-cu="justify" ${c.justify ? 'checked' : ''}><span>Justify text</span></label>
    <label class="cp-check"><input type="checkbox" data-cu="sceneTitles" ${c.sceneTitles ? 'checked' : ''}><span>Scene titles</span></label>
    <label class="cp-check"><input type="checkbox" data-cu="header" ${c.header ? 'checked' : ''}><span>Name and page in header</span></label>
  </div>`;
}

// ---------------------------------------------------------------- build
async function compile(ctx, o, picked) {
  const p = ctx.state.project, mode = modeOf(p);
  const base = safeName(p.title);
  if (o.format === 'inkfold') return exportProjectFile(p.id);
  const chapters = buildTree(ctx.state.items).map(c => ({ title: c.title, scenes: c.scenes.filter(s => picked.has(s.id)).map(s => ({ title: s.title, blocks: htmlToBlocks(s.content) })) })).filter(c => c.scenes.length);
  const share = { preferShare: true };
  if (mode === 'screenplay') {
    if (o.format === 'fountain') return saveFile(new Blob([toFountain(p, chapters)], { type: 'text/plain' }), `${base}.fountain`, share);
    if (o.format === 'fdx') return saveFile(new Blob([toFdx(p, chapters)], { type: 'application/xml' }), `${base}.fdx`, share);
    const { jsPDF } = await loadLib(LIBS.jspdf);
    return saveFile(await toScreenplayPdf(jsPDF, p, chapters, { pageSize: o.pageSize, contact: o.contact }), `${base}.pdf`, share);
  }
  const tpl = { ...(o.template === 'custom' ? o.custom : TEMPLATES[o.template]), pageSize: o.pageSize, contact: o.contact, term: T(p).chapter, mode, poemPerPage: o.poemPerPage };
  if (mode === 'journal' || mode === 'poetry') tpl.sceneTitles = true;
  if (mode === 'poetry') { tpl.indent = false; tpl.justify = false; }
  const total = chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.blocks.reduce((k, b) => k + (b.runs || []).map(r => r.text).join('').split(/\s+/).filter(Boolean).length, 0), 0), 0);
  tpl.wordCount = total;
  // pictures placed in scenes, by id
  tpl.images = new Map(ctx.state.items.filter(i => i.type === 'image' && i.data && i.data.src).map(i => [i.id, i.data]));
  if (o.format === 'md') return saveFile(new Blob([toMarkdown(p, chapters, tpl)], { type: 'text/markdown' }), `${base}.md`, share);
  if (o.format === 'docx') return saveFile(await toDocx(p, chapters, tpl), `${base}.docx`, share);
  if (o.format === 'pdf') return saveFile(await toPdf(p, chapters, tpl), `${base}.pdf`, share);
  if (o.format === 'epub') return saveFile(await toEpub(p, chapters, tpl), `${base}.epub`, share);
}
void db;

const roundWords = n => n < 1000 ? Math.round(n / 10) * 10 : n < 10000 ? Math.round(n / 100) * 100 : Math.round(n / 1000) * 1000;
const surname = a => ((a || '').trim().split(/\s+/).pop() || '').toUpperCase();

function toMarkdown(p, chapters, o) {
  let md = `# ${p.title}\n`;
  if (p.subtitle) md += `\n*${p.subtitle}*\n`;
  if (p.author) md += `\nby ${p.author}\n`;
  chapters.forEach((c, ci) => {
    const [a, b] = chapterLines(ci, c.title, o.chapterStyle, o.term);
    md += `\n\n## ${[a, b].filter(Boolean).join(': ')}\n`;
    c.scenes.forEach((s, si) => {
      if (o.sceneTitles) md += `\n### ${s.title}\n`; else if (si > 0) md += `\n${sepText(o.sep) || '&nbsp;'}\n`;
      md += '\n' + blocksToMd(s.blocks.map(b => b.type === 'h2' ? { ...b, type: 'h3' } : b), {
        blank: '&nbsp;', hardBreaks: true,
        img: b => { const im = o.images && o.images.get(b.img); return im ? `![${(b.cap || '').replace(/[\[\]]/g, '')}](${im.src})` : ''; },
      }) + '\n';
    });
  });
  return md;
}

// ---------- DOCX ----------
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wRuns = (runs, caps) => runs.map(r => {
  const props = (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '');
  const t = caps ? r.text.toUpperCase() : r.text;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${t.split('\n').map(z => `<w:t xml:space="preserve">${x(z)}</w:t>`).join('<w:br/>')}</w:r>`;
}).join('');
const wP = (style, inner, extra = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;
const R = t => [{ text: t }];

async function toDocx(p, chapters, o) {
  const JSZip = await loadLib(LIBS.jszip);
  const ms = o.titlePage === 'manuscript';
  let body = '';
  const A4 = o.pageSize !== 'letter';
  const media = []; // { name, b64, ext, rid }
  const textW = (A4 ? 11906 : 12240) - 2880; // twips between the margins
  function docxImage(bk) {
    const im = o.images && o.images.get(bk.img); if (!im) return '';
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/.exec(im.src); if (!m) return '';
    const ext = m[1] === 'png' ? 'png' : 'jpeg';
    const n = media.length + 1, rid = 'rIdImg' + n;
    media.push({ name: `image${n}.${ext}`, b64: m[2], ext, rid });
    const cx = Math.round(textW * (bk.w || 100) / 100 * 635), cy = Math.round(cx * (im.h || 1) / (im.w || 1));
    const draw = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}" descr="${x(bk.cap || '')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return wP('Figure', draw) + (bk.cap ? wP('Caption', wRuns(R(bk.cap))) : '');
  }
  if (ms) {
    const contact = [p.author, ...(o.contact || '').split('\n')].filter(Boolean);
    body += `<w:p><w:pPr><w:pStyle w:val="Plain"/><w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs></w:pPr>${wRuns(R(contact[0] || ''))}<w:r><w:tab/></w:r>${wRuns(R(`about ${num(roundWords(o.wordCount))} words`))}</w:p>`;
    contact.slice(1).forEach(l => { body += wP('Plain', wRuns(R(l))); });
    body += wP('MsTitle', wRuns(R(p.title)), '') + (p.author ? wP('MsBy', wRuns(R(`by ${p.author}`))) : '');
  } else if (o.titlePage !== 'none') {
    body += wP('Title', wRuns(R(p.title)));
    if (p.subtitle && o.titlePage === 'book') body += wP('Subtitle', wRuns(R(p.subtitle)));
    if (p.author) body += wP('Author', wRuns(R(o.titlePage === 'book' ? p.author : `by ${p.author}`)));
  }
  let firstChapter = true;
  chapters.forEach((c, ci) => {
    const [a, b] = chapterLines(ci, c.title, o.chapterStyle, o.term);
    const brk = o.titlePage === 'none' && firstChapter ? '' : '<w:pageBreakBefore/>';
    if (a) body += wP('ChapterNumber', wRuns(R(a)), brk);
    if (b) body += wP('Heading1', wRuns(R(b)), a ? '' : brk);
    if (!a && !b) body += wP('Heading1', '', brk);
    firstChapter = false;
    c.scenes.forEach((s, si) => {
      if (o.sceneTitles) body += wP('Heading2', wRuns(R(s.title)), o.mode === 'poetry' && o.poemPerPage && si > 0 ? '<w:pageBreakBefore/>' : '');
      else if (si > 0) body += wP('SceneBreak', wRuns(R(sepText(o.sep))));
      let first = true;
      s.blocks.forEach(bk => {
        if (bk.type === 'hr') { body += wP('SceneBreak', wRuns(R(sepText(o.sep)))); first = true; return; }
        if (isBlank(bk)) { body += wP('Blank', ''); first = true; return; }
        if (bk.type === 'img') { body += docxImage(bk); first = true; return; }
        if (bk.type === 'h2' || bk.type === 'h3') { body += wP('Heading3', wRuns(bk.runs)); first = true; return; }
        if (bk.type === 'quote') { body += wP('Quote', wRuns(bk.runs)); return; }
        if (bk.type === 'ul' || bk.type === 'ol') { body += wP('ListItem', wRuns([{ text: '•  ' }, ...bk.runs])); return; }
        body += wP(o.mode === 'poetry' ? 'Stanza' : first ? 'FirstParagraph' : 'Normal', wRuns(bk.runs)); first = false;
      });
    });
  });
  const sect = `<w:sectPr>${o.header ? '<w:headerReference w:type="default" r:id="rIdH"/>' : ''}<w:pgSz w:w="${A4 ? 11906 : 12240}" w:h="${A4 ? 16838 : 15840}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>${o.header ? '<w:titlePg/>' : ''}</w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}${sect}</w:body></w:document>`;
  const font = o.font, sz = Math.round(o.size * 2), line = Math.round(240 * o.spacing);
  const st = (id, name, ppr, rpr, based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const ind = o.indent ? '<w:ind w:firstLine="720"/>' : '<w:ind w:firstLine="0"/><w:spacing w:after="160"/>';
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr>${ind}${o.justify ? '<w:jc w:val="both"/>' : ''}<w:widowControl/></w:pPr></w:style>
${st('FirstParagraph', 'First Paragraph', o.indent ? '<w:ind w:firstLine="0"/>' : '', '')}
${st('Blank', 'Blank Line', '<w:ind w:firstLine="0"/>', '')}
${st('Figure', 'Figure', '<w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:before="200" w:after="120" w:line="240" w:lineRule="auto"/><w:keepNext/>', '')}
${st('Caption', 'Caption', '<w:ind w:firstLine="0"/><w:jc w:val="center"/><w:spacing w:after="240"/>', `<w:i/><w:sz w:val="${Math.round(sz * 0.85)}"/>`)}
${st('Plain', 'Plain', '<w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="left"/>', '')}
${st('Stanza', 'Stanza', '<w:ind w:firstLine="0"/><w:spacing w:after="280"/><w:jc w:val="left"/>', '')}
${st('MsTitle', 'Manuscript Title', '<w:spacing w:before="4200" w:after="240"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:caps/>')}
${st('MsBy', 'Manuscript Byline', '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', '')}
${st('Title', 'Title', '<w:spacing w:before="3600" w:after="240"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', `<w:sz w:val="${sz * 4}"/>`)}
${st('Subtitle', 'Subtitle', '<w:jc w:val="center"/><w:ind w:firstLine="0"/><w:spacing w:after="480"/>', `<w:i/><w:sz w:val="${Math.round(sz * 1.4)}"/>`)}
${st('Author', 'Author', '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:caps/><w:spacing w:val="40"/>')}
${st('ChapterNumber', 'Chapter Number', '<w:spacing w:before="2880" w:after="120"/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:keepNext/>', o.titlePage === 'manuscript' ? '' : `<w:caps/><w:spacing w:val="60"/><w:sz w:val="${Math.round(sz * 0.85)}"/>`)}
${st('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:after="720"/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="0"/>', o.titlePage === 'manuscript' ? '' : `<w:sz w:val="${Math.round(sz * 1.7)}"/>`)}
${st('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="480" w:after="240"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="1"/>', `<w:b/><w:sz w:val="${Math.round(sz * 1.1)}"/>`)}
${st('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="0"/>', '<w:b/>')}
${st('SceneBreak', 'Scene Break', '<w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '')}
${st('Quote', 'Quote', '<w:ind w:left="720" w:right="720" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>', '<w:i/>')}
${st('ListItem', 'List Item', '<w:ind w:left="720" w:hanging="300" w:firstLine="0"/>', '')}
${st('Header', 'header', '<w:jc w:val="right"/><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/>', '')}
</w:styles>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:t xml:space="preserve">${x(surname(p.author))} / ${x(p.title.toUpperCase())} / </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:hdr>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${media.some(m => m.ext === 'png') ? '<Default Extension="png" ContentType="image/png"/>' : ''}${media.some(m => m.ext === 'jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>${o.header ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${o.header ? '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ''}${media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(p.title)}</dc:title><dc:creator>${x(p.author || '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', document);
  zip.file('word/styles.xml', styles);
  // keep lines that end in a manual line break from being stretched in justified text
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:doNotExpandShiftReturn/></w:compat></w:settings>`);
  if (o.header) zip.file('word/header1.xml', header);
  media.forEach(m => zip.file('word/media/' + m.name, m.b64, { base64: true }));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- PDF ----------
async function toPdf(p, chapters, o) {
  const { jsPDF } = await loadLib(LIBS.jspdf);
  const doc = new jsPDF({ unit: 'pt', format: o.pageSize || 'a4' });
  const fam = /Courier/.test(o.font) ? 'courier' : /Helvetica/.test(o.font) ? 'helvetica' : 'times';
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 72, size = o.size, lead = size * 1.2 * o.spacing, indent = o.indent ? size * 3 : 0, gapAfter = o.indent ? 0 : size * 0.7;
  let y = M, page = 1;
  const clean = t => t.replace(/[^\x09\x0a\x20-\x7e -ÿ–—‘’“”…•]/g, m => m === '⁂' ? '* * *' : '?');
  const style = r => (r.b && r.i) ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal';
  const headerOn = () => { if (!o.header || page < 2) return; doc.setFont(fam, 'normal'); doc.setFontSize(size - 1); doc.text(clean(`${surname(p.author)} / ${p.title.toUpperCase()} / ${page - (o.titlePage === 'none' ? 0 : 1)}`), W - M, M - 30, { align: 'right' }); };
  const newPage = () => { doc.addPage(); page++; y = M; headerOn(); };
  const center = (text, sz, st = 'normal', yy = y, spacing = 0) => { doc.setFont(fam, st); doc.setFontSize(sz); doc.text(clean(text), W / 2, yy, { align: 'center', charSpace: spacing }); };
  const spaceW = () => { doc.setFont(fam, 'normal'); doc.setFontSize(size); return doc.getTextWidth(' '); };
  function para(runs, { first = false, left = M, right = W - M, italic = false, prefix = '', justify = o.justify, poem = false } = {}) {
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
    let line = [], lineW = 0, x0 = left + (first || poem ? 0 : indent);
    const sp = spaceW();
    const flush = (last) => {
      if (y > H - M) newPage();
      let xx = x0;
      const gaps = line.filter((w, i) => i < line.length - 1 && w.space).length;
      const extra = justify && !last && gaps ? (right - x0 - lineW) / gaps : 0;
      line.forEach((w, i) => { doc.setFont(fam, w.st); doc.setFontSize(size); doc.text(w.text, xx, y); xx += w.w + (w.space && i < line.length - 1 ? sp + extra : 0); });
      y += lead; line = []; lineW = 0; x0 = left + (poem ? size * 2 : 0);
      if (poem && last) x0 = left;
    };
    for (const w of words) {
      if (w.br) { flush(true); x0 = left; continue; }
      doc.setFont(fam, w.st); doc.setFontSize(size); w.w = doc.getTextWidth(w.text);
      const add = (line.length && line[line.length - 1].space ? sp : 0) + w.w;
      if (line.length && x0 + lineW + add > right) flush(false);
      lineW += (line.length && line[line.length - 1].space ? sp : 0) + w.w;
      line.push(w);
    }
    if (line.length) flush(true);
    y += gapAfter;
  }
  function pdfImage(bk) {
    const im = o.images && o.images.get(bk.img); if (!im) return;
    const m = /^data:image\/(png|jpe?g);base64,/.exec(im.src); if (!m) return;
    const maxW = W - 2 * M, capH = bk.cap ? size * 1.6 : 0;
    let w = maxW * (bk.w || 100) / 100, h = w * (im.h || 1) / (im.w || 1);
    const maxH = H - 2 * M - capH - size;
    if (h > maxH) { w = w * maxH / h; h = maxH; }
    const top = y - size; // y is a text baseline
    if (top + h + capH > H - M) newPage();
    const yy = y - size + size * 0.4;
    doc.addImage(im.src, m[1] === 'png' ? 'PNG' : 'JPEG', (W - w) / 2, yy, w, h);
    y = yy + h + size * 1.2;
    if (bk.cap) { doc.setFont(fam, 'italic'); doc.setFontSize(size * 0.85); doc.text(clean(bk.cap), W / 2, y, { align: 'center', maxWidth: maxW }); y += size * 1.6; }
    y += lead * 0.4;
  }
  // title page
  if (o.titlePage === 'manuscript') {
    doc.setFont(fam, 'normal'); doc.setFontSize(size);
    const contact = [p.author, ...(o.contact || '').split('\n')].filter(Boolean);
    contact.forEach((l, i) => doc.text(clean(l), M, M + i * size * 1.3));
    doc.text(clean(`about ${num(roundWords(o.wordCount))} words`), W - M, M, { align: 'right' });
    center(p.title.toUpperCase(), size, 'normal', H / 2 - 10);
    if (p.author) center(`by ${p.author}`, size, 'normal', H / 2 + size * 2);
  } else if (o.titlePage !== 'none') {
    center(p.title, size * 2.6, 'normal', H * 0.38);
    if (p.subtitle && o.titlePage === 'book') center(p.subtitle, size * 1.2, 'italic', H * 0.38 + size * 3);
    if (p.author) center(o.titlePage === 'book' ? p.author.toUpperCase() : `by ${p.author}`, size * 0.9, 'normal', H * 0.38 + size * 6, o.titlePage === 'book' ? 1.5 : 0);
  }
  let firstPage = o.titlePage === 'none';
  chapters.forEach((c, ci) => {
    if (!firstPage) newPage(); firstPage = false;
    y = M + H * 0.18;
    const [a, b] = chapterLines(ci, c.title, o.chapterStyle, o.term);
    if (a) { center(a, o.titlePage === 'manuscript' ? size : size * 0.85, 'normal', y, o.titlePage === 'manuscript' ? 0 : 2); y += size * 2.4; }
    if (b) { center(b, o.titlePage === 'manuscript' ? size : size * 1.8, 'normal', y); y += size * 4; }
    c.scenes.forEach((s, si) => {
      let first = true;
      if (o.sceneTitles) {
        if (o.mode === 'poetry' && o.poemPerPage && si > 0) { newPage(); y = M + 40; }
        else if (si > 0) y += lead * 0.6;
        if (y > H - M - lead * 3) newPage();
        doc.setFont(fam, 'bold'); doc.setFontSize(size * 1.05); doc.text(clean(s.title), o.mode === 'poetry' ? M : M, y); y += lead * 1.4;
      } else if (si > 0) { y += lead * 0.4; if (sepText(o.sep)) center(sepText(o.sep), size, 'normal', y); y += lead * 1.2; }
      s.blocks.forEach(bk => {
        if (bk.type === 'hr') { y += lead * 0.4; if (sepText(o.sep)) center(sepText(o.sep), size, 'normal', y); y += lead * 1.2; first = true; return; }
        if (isBlank(bk)) { y += lead + gapAfter; first = true; return; }
        if (bk.type === 'img') { pdfImage(bk); first = true; return; }
        if (bk.type === 'h2' || bk.type === 'h3') { y += lead * 0.4; para(bk.runs.map(r => ({ ...r, b: true })), { first: true, justify: false }); first = true; return; }
        if (bk.type === 'quote') { para(bk.runs, { first: true, left: M + 30, right: W - M - 30, italic: true, justify: false }); return; }
        if (bk.type === 'ul' || bk.type === 'ol') { para(bk.runs, { first: true, left: M + 18, prefix: '•', justify: false }); return; }
        if (o.mode === 'poetry') { para(bk.runs, { poem: true, justify: false }); y += lead * 0.6; return; }
        para(bk.runs, { first }); first = false;
      });
    });
  });
  if (!o.header) { const pages = doc.getNumberOfPages(); const start = o.titlePage === 'none' ? 1 : 2; for (let i = start; i <= pages; i++) { doc.setPage(i); doc.setFont(fam, 'normal'); doc.setFontSize(9); doc.text(String(i - start + 1), W / 2, H - 40, { align: 'center' }); } }
  doc.setProperties({ title: p.title, author: p.author || '' });
  return doc.output('blob');
}

// ---------- EPUB 3 ----------
async function toEpub(p, chapters, o) {
  const JSZip = await loadLib(LIBS.jszip);
  const zip = new JSZip();
  const uid = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
  const lang = (document.documentElement.lang || 'en').slice(0, 2);
  const xh = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"><head><meta charset="UTF-8"/><title>${x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
  const runs = rs => rs.map(r => { let t = x(r.text).replace(/\n/g, '<br/>'); if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t; }).join('');
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('OEBPS/style.css', `body{font-family:${o.font.includes('Courier') ? 'monospace' : o.font.includes('Helvetica') ? 'sans-serif' : 'serif'};line-height:${Math.min(1.7, 1.2 + (o.spacing - 1) * 0.5)};margin:0 5%}
p{margin:0;text-indent:${o.indent ? '1.5em' : '0'};${o.indent ? '' : 'margin-bottom:.8em;'}text-align:${o.justify ? 'justify' : 'left'}}
p.first,h1+p,h2+p,.sep+p{text-indent:0}
.title-page{text-align:center;margin-top:30%}.title-page h1{font-size:2.2em;font-weight:normal;margin:0 0 .4em}.title-page .sub{font-style:italic;margin-bottom:2em}.title-page .by{letter-spacing:.12em;text-transform:uppercase;font-size:.85em}
.ch-num{text-align:center;text-transform:uppercase;letter-spacing:.2em;font-size:.8em;margin-top:3em;text-indent:0}
h1{text-align:center;font-weight:normal;font-size:1.6em;margin:.4em 0 2em}h2{font-size:1.1em;margin:1.6em 0 .8em}h3{font-size:1em;margin:1.2em 0 .6em}
.sep{text-align:center;margin:1.2em 0;text-indent:0}blockquote{margin:1em 2em;font-style:italic}
.stanza{text-indent:0;margin-bottom:1em}
p.blank{text-indent:0;margin:0}p.blank+p{text-indent:0}
figure.pic{margin:1.2em 0;text-align:center;text-indent:0}figure.pic img{max-width:100%;height:auto}figure.pic figcaption{font-style:italic;font-size:.85em;margin-top:.4em}figure.pic+p{text-indent:0}
.cover{text-align:center;margin:0;padding:0}.cover img{max-width:100%;max-height:100%}`);
  const manifest = [], spine = [], nav = [];
  let cover = '';
  const added = new Map();
  function epubImage(bk) {
    const im = o.images && o.images.get(bk.img); if (!im) return '';
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/.exec(im.src); if (!m) return '';
    let f = added.get(bk.img);
    if (!f) {
      const ext = m[1] === 'png' ? 'png' : 'jpg';
      f = `images/pic${added.size + 1}.${ext}`; added.set(bk.img, f);
      zip.file('OEBPS/' + f, m[2], { base64: true });
      manifest.push(`<item id="pic${added.size}" href="${f}" media-type="image/${ext === 'png' ? 'png' : 'jpeg'}"/>`);
    }
    return `<figure class="pic"><img src="${f}" alt="${x(bk.cap || '')}" style="width:${bk.w || 100}%"/>${bk.cap ? `<figcaption>${x(bk.cap)}</figcaption>` : ''}</figure>`;
  }
  if (p.coverImage) {
    const b64 = p.coverImage.split(',')[1];
    zip.file('OEBPS/cover.jpg', b64, { base64: true });
    manifest.push('<item id="cover-img" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>', '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover"/>');
    zip.file('OEBPS/cover.xhtml', xh('Cover', '<div class="cover"><img src="cover.jpg" alt="Cover"/></div>'));
    cover = '<meta name="cover" content="cover-img"/>';
  }
  zip.file('OEBPS/title.xhtml', xh(p.title, `<section class="title-page" epub:type="titlepage"><h1>${x(p.title)}</h1>${p.subtitle ? `<p class="sub">${x(p.subtitle)}</p>` : ''}${p.author ? `<p class="by">${x(p.author)}</p>` : ''}</section>`));
  manifest.push('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>'); spine.push('<itemref idref="title"/>');
  chapters.forEach((c, ci) => {
    const [a, b] = chapterLines(ci, c.title, o.chapterStyle, o.term);
    let html = `<section epub:type="chapter">${a ? `<p class="ch-num">${x(a)}</p>` : ''}<h1>${x(b || a || c.title)}</h1>`;
    c.scenes.forEach((s, si) => {
      if (o.sceneTitles) html += `<h2>${x(s.title)}</h2>`; else if (si > 0) html += `<p class="sep">${x(sepText(o.sep)) || '&#160;'}</p>`;
      let first = true;
      s.blocks.forEach(bk => {
        if (bk.type === 'hr') { html += `<p class="sep">${x(sepText(o.sep)) || '&#160;'}</p>`; first = true; return; }
        if (isBlank(bk)) { html += '<p class="blank">&#160;</p>'; first = true; return; }
        if (bk.type === 'img') { html += epubImage(bk); first = true; return; }
        if (bk.type === 'h2' || bk.type === 'h3') { html += `<h3>${runs(bk.runs)}</h3>`; first = true; return; }
        if (bk.type === 'quote') { html += `<blockquote><p>${runs(bk.runs)}</p></blockquote>`; return; }
        if (bk.type === 'ul' || bk.type === 'ol') { html += `<p class="first">• ${runs(bk.runs)}</p>`; return; }
        html += `<p class="${o.mode === 'poetry' ? 'stanza' : first ? 'first' : ''}">${runs(bk.runs)}</p>`; first = false;
      });
    });
    html += '</section>';
    const f = `chap-${ci + 1}.xhtml`;
    zip.file('OEBPS/' + f, xh(b || a || c.title, html));
    manifest.push(`<item id="c${ci + 1}" href="${f}" media-type="application/xhtml+xml"/>`); spine.push(`<itemref idref="c${ci + 1}"/>`);
    nav.push({ f, t: [a, b].filter(Boolean).join(': ') || c.title });
  });
  zip.file('OEBPS/nav.xhtml', xh('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${nav.map(n => `<li><a href="${n.f}">${x(n.t)}</a></li>`).join('')}</ol></nav>`));
  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${x(p.title)}</text></docTitle><navMap>${nav.map((n, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${x(n.t)}</text></navLabel><content src="${n.f}"/></navPoint>`).join('')}</navMap></ncx>`);
  manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', '<item id="css" href="style.css" media-type="text/css"/>');
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uid}</dc:identifier><dc:title>${x(p.title)}</dc:title><dc:creator>${x(p.author || 'Unknown')}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>${cover}</metadata><manifest>${manifest.join('')}</manifest><spine toc="ncx">${spine.join('')}</spine></package>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}

export const _test = { toDocx, toEpub, toMarkdown, chapterLines };
