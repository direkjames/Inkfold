// Inkfold — text model. Every format (rich text, Markdown, DOCX, PDF) goes through "blocks":
// [{ type: 'p'|'h2'|'h3'|'quote'|'hr'|'ul'|'ol', runs: [{ text, b, i, c, r }] }]
// c = comment id (margin note anchor), r = revision round (colour-coded edits)

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'UL', 'OL', 'HR', 'SECTION', 'ARTICLE', 'PRE']);

export function htmlToBlocks(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const blocks = [];
  let cur = null;

  const startBlock = (type) => { cur = { type, runs: [] }; blocks.push(cur); return cur; };
  const ensure = (ctx) => { if (!cur) startBlock(ctx.quote ? 'quote' : 'p'); return cur; };
  const end = () => { cur = null; };

  function addText(text, ctx) {
    if (!text) return;
    const blk = ensure(ctx);
    const last = blk.runs[blk.runs.length - 1];
    const c = ctx.c || null, r = ctx.r || null;
    if (last && last.b === !!ctx.b && last.i === !!ctx.i && last.c === c && last.r === r) last.text += text;
    else blk.runs.push({ text, b: !!ctx.b, i: !!ctx.i, c, r });
  }

  function walk(node, ctx) {
    if (node.nodeType === 3) {
      const t = node.nodeValue.replace(/[\t\r\n]+/g, ' ').replace(/\u200b/g, '');
      if (t.trim() || (cur && t)) addText(t, ctx);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META') return;
    const style = node.getAttribute('style') || '';
    const next = { ...ctx };
    if (tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(style)) next.b = true;
    if (tag === 'I' || tag === 'EM' || /font-style:\s*italic/.test(style)) next.i = true;
    if (tag === 'MARK' && node.dataset && node.dataset.c) next.c = node.dataset.c;
    if (tag === 'INS' && node.dataset && node.dataset.r) next.r = +node.dataset.r || null;
    if (tag === 'BR') { addText('\n', ctx); return; }
    if (tag === 'HR') { end(); startBlock('hr'); end(); return; }
    if (!BLOCK_TAGS.has(tag)) { node.childNodes.forEach(c => walk(c, next)); return; }

    if (tag === 'UL' || tag === 'OL') { end(); next.list = tag === 'UL' ? 'ul' : 'ol'; node.childNodes.forEach(c => walk(c, next)); end(); return; }
    if (tag === 'BLOCKQUOTE') { end(); next.quote = true; node.childNodes.forEach(c => walk(c, next)); end(); return; }

    end();
    let type = 'p';
    if (tag === 'H1' || tag === 'H2') type = 'h2';
    else if (/^H[3-6]$/.test(tag)) type = 'h3';
    else if (tag === 'LI') type = ctx.list || 'ul';
    else if (ctx.quote) type = 'quote';
    startBlock(type);
    node.childNodes.forEach(c => walk(c, next));
    end();
  }

  tpl.content.childNodes.forEach(n => walk(n, {}));
  // tidy: trim runs, drop empty paragraphs
  return blocks.map(b => {
    if (b.type === 'hr') return b;
    const runs = b.runs.filter(r => r.text.length);
    if (runs.length) { runs[0].text = runs[0].text.replace(/^ +/, ''); const l = runs[runs.length - 1]; l.text = l.text.replace(/[ \n]+$/, ''); }
    return { type: b.type, runs: runs.filter(r => r.text.length) };
  }).filter(b => b.type === 'hr' || b.runs.length);
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runsToHtml(runs) {
  return runs.map(r => {
    let t = esc(r.text).replace(/\n/g, '<br>');
    if (r.i) t = `<em>${t}</em>`;
    if (r.b) t = `<strong>${t}</strong>`;
    if (r.r) t = `<ins data-r="${r.r}">${t}</ins>`;
    if (r.c) t = `<mark class="cmt" data-c="${String(r.c).replace(/[^\w-]/g, '')}">${t}</mark>`;
    return t;
  }).join('');
}

export function blocksToHtml(blocks) {
  let out = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'hr') { out += '<hr>'; continue; }
    if (b.type === 'ul' || b.type === 'ol') {
      let items = '';
      while (i < blocks.length && blocks[i].type === b.type) { items += `<li>${runsToHtml(blocks[i].runs)}</li>`; i++; }
      i--;
      out += `<${b.type}>${items}</${b.type}>`;
      continue;
    }
    if (b.type === 'quote') { out += `<blockquote><p>${runsToHtml(b.runs)}</p></blockquote>`; continue; }
    out += `<${b.type}>${runsToHtml(b.runs)}</${b.type}>`;
  }
  return out;
}

export const sanitizeHtml = html => blocksToHtml(htmlToBlocks(html));

// ---------- Markdown ----------
function runsToMd(runs) {
  return runs.map(r => {
    let t = r.text.replace(/([*_\\])/g, '\\$1').replace(/\n/g, '  \n');
    if (!t.trim()) return t;
    const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0];
    let core = t.trim();
    if (r.i) core = `*${core}*`;
    if (r.b) core = `**${core}**`;
    return lead + core + trail;
  }).join('');
}

export function blocksToMd(blocks) {
  const lines = [];
  let n = 0;
  blocks.forEach((b, idx) => {
    const prev = blocks[idx - 1];
    const listCont = prev && prev.type === b.type && (b.type === 'ul' || b.type === 'ol');
    if (!listCont && lines.length) lines.push('');
    if (b.type !== 'ol') n = 0;
    const t = b.type === 'hr' ? '' : runsToMd(b.runs);
    switch (b.type) {
      case 'h2': lines.push('## ' + t); break;
      case 'h3': lines.push('### ' + t); break;
      case 'quote': lines.push('> ' + t.replace(/\n/g, '\n> ')); break;
      case 'hr': lines.push('* * *'); break;
      case 'ul': lines.push('- ' + t); break;
      case 'ol': lines.push(`${++n}. ` + t); break;
      default: lines.push(t);
    }
  });
  return lines.join('\n');
}

function parseInline(text) {
  const runs = [];
  const re = /(\\[*_\\])|(\*\*|__)(.+?)\2|(\*|_)(.+?)\4/g;
  const push = (t, b, i) => { if (!t) return; const l = runs[runs.length - 1]; if (l && l.b === b && l.i === i) l.text += t; else runs.push({ text: t, b, i }); };
  function rec(str, b, i) {
    let last = 0; let m;
    const r = new RegExp(re.source, 'g');
    while ((m = r.exec(str))) {
      push(str.slice(last, m.index), b, i);
      if (m[1]) push(m[1][1], b, i);
      else if (m[2]) rec(m[3], true, i);
      else rec(m[5], b, true);
      last = r.lastIndex;
    }
    push(str.slice(last), b, i);
  }
  rec(text, false, false);
  return runs;
}

export function mdToBlocks(md) {
  const blocks = [];
  const paras = [];
  const lines = (md || '').replace(/\r/g, '').split('\n');
  let buf = [];
  let bufType = 'p';
  const flush = () => {
    if (buf.length) blocks.push({ type: bufType, runs: parseInline(buf.join('\n').replace(/ {2,}\n/g, '\n').replace(/([^\n])\n(?!\n)/g, (m, a) => a + ' ')) });
    buf = []; bufType = 'p';
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flush(); continue; }
    if (/^\s*([*\-_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'hr', runs: [] }); continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); blocks.push({ type: m[1].length <= 2 ? 'h2' : 'h3', runs: parseInline(m[2]) }); continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { flush(); blocks.push({ type: 'ul', runs: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flush(); blocks.push({ type: 'ol', runs: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { if (bufType !== 'quote') flush(); bufType = 'quote'; buf.push(m[1]); continue; }
    if (bufType === 'quote') flush();
    buf.push(line);
  }
  flush();
  void paras;
  return blocks.filter(b => b.type === 'hr' || b.runs.length);
}

export const mdToHtml = md => blocksToHtml(mdToBlocks(md));
export const htmlToMd = html => blocksToMd(htmlToBlocks(html));

// ---------- Counting ----------
export function countWords(text) {
  const m = (text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}
export function htmlToText(html) {
  return htmlToBlocks(html).map(b => b.runs ? b.runs.map(r => r.text).join('') : '').join('\n\n');
}
export const htmlWords = html => countWords(htmlToText(html));

export function plainToBlocks(txt) {
  return (txt || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => /^(\*\s*){3}$|^#$/.test(p) ? { type: 'hr', runs: [] } : { type: 'p', runs: [{ text: p.replace(/\n/g, ' '), b: false, i: false }] });
}
