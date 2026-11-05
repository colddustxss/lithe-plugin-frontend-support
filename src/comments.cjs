// Copyright 2026 colddustxss; SPDX-License-Identifier: Apache-2.0
const { parse } = require('@vue/language-core/lib/utils/parseSfc');
const ts = require('typescript');
const { Scanner, TokenType } = require('vscode-css-languageservice/lib/umd/parser/cssScanner');
const { SCSSScanner } = require('vscode-css-languageservice/lib/umd/parser/scssScanner');
const { LESSScanner } = require('vscode-css-languageservice/lib/umd/parser/lessScanner');

const toggleKind = 'refactor.rewrite.vue.comment';
const repairKind = 'quickfix.vue.comment';
exports.commentActionKinds = [toggleKind, repairKind];

// Work on the source document, never Volar's generated TypeScript/HTML buffers.
// Each action carries the buffer version so a delayed click cannot edit new text.
exports.getCommentActions = (document, range, context = {}) => {
  if (!document || document.languageId !== 'vue' || !document.uri.endsWith('.vue')) return [];
  const source = document.getText();
  if (source.length > 128 * 1024) return [];
  const start = document.offsetAt(range.start), end = document.offsetAt(range.end);
  if (start > end) return [];
  const { descriptor } = parse(source);
  const blocks = [descriptor.template, descriptor.script, descriptor.scriptSetup, ...descriptor.styles].filter(Boolean);
  const block = blocks.find(block => !block.attrs.src && start >= block.loc.start.offset
    && start < block.loc.end.offset && end <= block.loc.end.offset);
  if (!block) return [];
  const lang = block.lang || ({ template: 'html', script: 'js', style: 'css' }[block.type]);
  const supported = { template: ['html'], script: ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'], style: ['css', 'scss', 'less'] };
  if (!supported[block.type].includes(lang)) return [];
  const accepts = kind => !context.only || context.only.some(only => kind === only || kind.startsWith(only + '.'));
  const edit = (from, to, newText) => ({ range: { start: document.positionAt(from), end: document.positionAt(to) }, newText });
  const action = (title, kind, edits, preferred = false) => ({
    title, kind, ...(preferred ? { isPreferred: true } : {}),
    edit: { documentChanges: [{ textDocument: { uri: document.uri, version: document.version }, edits }] },
  });
  const lastLine = end > start ? document.positionAt(end - 1).line : range.start.line;
  const repairs = block.type === 'template' ? [] : findHTMLComments(block, lang).filter(item =>
    document.positionAt(item.start).line <= lastLine && document.positionAt(item.end).line >= range.start.line);
  if (repairs.length) {
    if (!accepts(repairKind)) return [];
    return [action('Vue：将误用的 HTML 注释转换为脚本/样式注释', repairKind,
      repairs.map(item => edit(item.start, item.end, item.newText)), true)];
  }
  if (!accepts(toggleKind)) return [];
  const lines = [];
  for (let line = range.start.line; line <= lastLine; line++) {
    const from = Math.max(document.offsetAt({ line, character: 0 }), block.loc.start.offset);
    const next = line + 1 < document.lineCount ? document.offsetAt({ line: line + 1, character: 0 }) : source.length;
    let to = Math.min(next, block.loc.end.offset);
    while (to > from && /[\r\n]/.test(source[to - 1])) to--;
    lines.push({ from, to, text: source.slice(from, to) });
  }
  const nonblank = lines.filter(line => line.text.trim());
  if (!nonblank.length) return [];
  const first = nonblank[0], last = nonblank.at(-1);
  // Inline <script>code</script> must use a block comment: // would hide </script>.
  const inline = source.slice(source.lastIndexOf('\n', first.from - 1) + 1, first.from).trim()
    || source.slice(last.to, source.indexOf('\n', last.to) < 0 ? source.length : source.indexOf('\n', last.to)).trim();
  let edits;
  if (block.type === 'script' && !inline) {
    const remove = nonblank.every(line => /^[\t ]*\/\//.test(line.text));
    let indent = nonblank[0].text.match(/^[\t ]*/)[0];
    for (const line of nonblank) while (!line.text.startsWith(indent)) indent = indent.slice(0, -1);
    edits = nonblank.map(line => {
      const column = remove ? line.text.match(/^[\t ]*/)[0].length : indent.length;
      const width = remove ? (line.text[column + 2] === ' ' ? 3 : 2) : 0;
      return edit(line.from + column, line.from + column + width, remove ? '' : '// ');
    });
  } else {
    const open = block.type === 'template' ? '<!--' : '/*', close = block.type === 'template' ? '-->' : '*/';
    const from = first.from + first.text.search(/\S/), to = last.to - (last.text.match(/[\t ]*$/)[0].length);
    const text = source.slice(from, to);
    let newText;
    if (text.startsWith(open) && text.endsWith(close)) {
      const body = text.slice(open.length, -close.length);
      if (body.includes(open) || body.includes(close)) return [];
      newText = body.replace(/^ /, '').replace(/ $/, '');
    } else {
      // Nested HTML/CSS block delimiters cannot be safely wrapped.
      if (text.includes(open) || text.includes(close)) return [];
      newText = `${open} ${text} ${close}`;
    }
    edits = [edit(from, to, newText)];
  }
  const label = { template: '模板', script: '脚本', style: '样式' }[block.type];
  return [action(`Vue：切换${label}注释`, toggleKind, edits)];
};

function findHTMLComments(block, lang) {
  const content = block.content;
  if (!content.includes('<!--')) return [];
  const protectedRanges = block.type === 'script' ? scriptLiteralsAndComments(content, lang) : styleLiteralsAndComments(content, lang);
  const result = [];
  for (const match of content.matchAll(/<!--([\s\S]*?)-->/g)) {
    const start = match.index, end = start + match[0].length;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newline = content.indexOf('\n', end), lineEnd = newline < 0 ? content.length : newline;
    // Only repair standalone wrappers; strings and real JS/CSS comments are data.
    if (content.slice(lineStart, start).trim() || content.slice(end, lineEnd).trim()
      || match[1].includes('<!--') || protectedRanges.some(([from, to]) => start >= from && start < to)) continue;
    const body = match[1].replace(/^ /, '').replace(/ $/, '');
    const closingTagOnSameLine = !/[\r\n]/.test(content.slice(end));
    const useBlockComment = block.type === 'style' || closingTagOnSameLine;
    if (useBlockComment && (body.includes('/*') || body.includes('*/'))) continue;
    const newText = useBlockComment ? `/* ${body} */`
      : body.split(/(\r\n|\n|\r)/).map((line, i) => i % 2 || !line.trim() ? line : line.replace(/^(\s*)/, '$1// ')).join('');
    result.push({ start: block.loc.start.offset + start, end: block.loc.start.offset + end, newText });
  }
  return result;
}

function scriptLiteralsAndComments(text, lang) {
  const kind = { js: ts.ScriptKind.JS, javascript: ts.ScriptKind.JS, jsx: ts.ScriptKind.JSX, tsx: ts.ScriptKind.TSX }[lang] ?? ts.ScriptKind.TS;
  const ast = ts.createSourceFile(`comment.${lang}`, text, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node) || ts.isJsxText(node)) {
      ranges.push([node.getStart(ast), node.end]);
    }
    for (const comment of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])]) {
      ranges.push([comment.pos, comment.end]);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return ranges;
}

function styleLiteralsAndComments(text, lang) {
  const scanner = new (lang === 'scss' ? SCSSScanner : lang === 'less' ? LESSScanner : Scanner)();
  scanner.ignoreComment = false;
  scanner.setSource(text);
  const ranges = [];
  for (let token = scanner.scan(); token.type !== TokenType.EOF; token = scanner.scan()) {
    if ([TokenType.String, TokenType.BadString, TokenType.Comment, TokenType.SingleLineComment, TokenType.EscapedJavaScript].includes(token.type)) {
      ranges.push([token.offset, token.offset + token.len]);
    }
  }
  return ranges;
}
