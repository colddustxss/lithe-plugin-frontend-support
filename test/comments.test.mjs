import test from 'node:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';
import { getCommentActions } from '../src/comments.cjs';
import { applyTextEdits } from './client.mjs';

const uri = 'file:///workspace/src/App.vue';
const toggleKind = 'refactor.rewrite.vue.comment', repairKind = 'quickfix.vue.comment';
function actions(text, needle, { select = false, only, version = 7 } = {}) {
  const document = TextDocument.create(uri, 'vue', version, text);
  const offset = text.indexOf(needle);
  assert.ok(offset >= 0, 'fixture position exists');
  return getCommentActions(document, { start: document.positionAt(offset), end: document.positionAt(offset + (select ? needle.length : 0)) }, { diagnostics: [], ...(only ? { only } : {}) });
}
function apply(text, action) {
  assert.ok(action, 'comment action exists');
  const changes = action.edit.documentChanges;
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].textDocument, { uri, version: 7 });
  return applyTextEdits(text, changes[0].edits);
}

test('script comments use // and round-trip with Unicode, indentation and CRLF intact', () => {
  const text = '<script setup lang="ts">\r\n\tconst 名称 = "冷库😀"\r\n\t  const count = 1\r\n\r\n</script>\r\n<template><div /></template>';
  const selection = '\tconst 名称 = "冷库😀"\r\n\t  const count = 1\r\n';
  const action = actions(text, selection, { select: true })[0];
  assert.equal(action.kind, toggleKind);
  const commented = apply(text, action);
  assert.ok(commented.includes('\t// const 名称 = "冷库😀"\r\n\t//   const count = 1\r\n'));
  assert.equal(apply(commented, actions(commented, '\t// const 名称 = "冷库😀"\r\n\t//   const count = 1\r\n', { select: true })[0]), text);
});

for (const lang of ['js', 'ts', 'jsx', 'tsx']) {
  test(`script lang=${lang} supports line comment toggles`, () => {
    const text = `<script setup lang="${lang}">\n  const count = 1\n</script>`;
    const commented = apply(text, actions(text, 'count')[0]);
    assert.match(commented, /  \/\/ const count = 1/);
    assert.equal(apply(commented, actions(commented, 'count')[0]), text);
  });
}

test('same-line script keeps closing tag outside the comment', () => {
  const text = '<script setup>const count = 1</script>\n<template><div /></template>';
  const commented = apply(text, actions(text, 'count')[0]);
  assert.match(commented, /<script setup>\/\* const count = 1 \*\/<\/script>/);
  assert.equal(apply(commented, actions(commented, 'count')[0]), text);
});

for (const [label, text, needle, expected] of [
  ['template', '<template>\n  <div>冷库😀</div>\n</template>', '<div>', '<!-- <div>冷库😀</div> -->'],
  ['CSS', '<style scoped>\n.card { color: red; }\n</style>', '.card', '/* .card { color: red; } */'],
  ['SCSS', '<style lang="scss">\n.card {\n  color: red;\n}\n</style>', '.card {\n  color: red;\n}', '/* .card {\n  color: red;\n} */'],
  ['Less', '<style lang="less">\n@color: red;\n</style>', '@color', '/* @color: red; */'],
]) {
  test(`${label} uses its own block comment and round-trips`, () => {
    const commented = apply(text, actions(text, needle, { select: true })[0]);
    assert.ok(commented.includes(expected));
    assert.equal(apply(commented, actions(commented, expected, { select: true })[0]), text);
  });
}

test('HTML wrappers mistakenly inserted in script become valid JS comments', () => {
  const text = '<script setup lang="ts">\n  <!-- const count: number = 1 -->\n</script>\n<template><div /></template>';
  const action = actions(text, 'count')[0];
  assert.equal(action.kind, repairKind);
  assert.equal(action.isPreferred, true);
  const repaired = apply(text, action);
  assert.match(repaired, /  \/\/ const count: number = 1/);
  assert.ok(!repaired.includes('<!--'));
  const script = repaired.split('<script setup lang="ts">')[1].split('</script>')[0];
  assert.equal(ts.createSourceFile('x.ts', script, ts.ScriptTarget.Latest, true).statements.length, 0);
  assert.equal(actions(repaired, 'count', { only: ['quickfix'] }).length, 0);
});

test('multi-line mistaken wrappers repair all enclosed lines and preserve CRLF', () => {
  const text = '<script setup>\r\n<!--\r\nconst a = 1\r\nconst b = 2\r\n-->\r\n</script>';
  const repaired = apply(text, actions(text, 'const a')[0]);
  assert.ok(repaired.includes('// const a = 1\r\n// const b = 2'));
  assert.ok(!repaired.includes('<!--'));
  assert.equal(repaired.split('\r\n').length, text.split('\r\n').length);
});

test('mistaken style wrappers become CSS comments', () => {
  const text = '<style scoped>\n<!-- .card { color: red; } -->\n</style>';
  assert.match(apply(text, actions(text, '.card')[0]), /\/\* .card \{ color: red; \} \*\//);
});

test('repair on the same line as </script> keeps the closing tag visible', () => {
  const text = '<script setup><!-- const count = 1 --></script>';
  const repaired = apply(text, actions(text, 'count')[0]);
  assert.equal(repaired, '<script setup>/* const count = 1 */</script>');
});

for (const [name, body] of [
  ['template literal', 'const example = `\n<!-- keep this example -->\n`'],
  ['interpolated template literal', 'const example = `hello ${1}\n<!-- keep this example -->\n`'],
  ['JS block comment', '/*\n<!-- keep this example -->\n*/'],
]) {
  test(`repair leaves HTML text in a ${name} alone`, () => {
    const text = `<script setup>\n${body}\n</script>`;
    assert.deepEqual(actions(text, '<!--', { only: ['quickfix'] }), []);
  });
}

for (const body of ['.a::before { content: "<!-- example -->"; }', '/*\n<!-- keep this example -->\n*/']) {
  test('repair leaves CSS strings and existing comments alone', () => {
    const text = `<style>\n${body}\n</style>`;
    assert.deepEqual(actions(text, '<!--', { only: ['quickfix'] }), []);
  });
}

test('HTML template comments remain HTML and are not offered as a repair', () => {
  const text = '<template>\n<!-- <div /> -->\n</template>';
  assert.deepEqual(actions(text, '<div', { only: ['quickfix'] }), []);
  assert.match(apply(text, actions(text, '<div')[0]), /\n<div \/>\n/);
});

test('refuses cross-block ranges, unknown preprocessors, tags and unsafe nested blocks', () => {
  const cases = [
    ['<script>\nconst a = 1\n</script>\n<style>\n.a {}\n</style>', 'const a = 1\n</script>\n<style>\n.a {}'],
    ['<template lang="pug">\ndiv Hello\n</template>', 'div'],
    ['<style lang="stylus">\n.a\n  color red\n</style>', '.a'],
    ['<script lang="coffee">\nx = 1\n</script>', 'x = 1'],
    ['<script src="./external.ts">\nconst a = 1\n</script>', 'const a'],
    ['<script setup>\nconst a = 1\n</script>', '<script'],
    ['<template>\n<div><!-- nested --></div>\n</template>', '<div>'],
    ['<style>\n.a { /* existing */ color: red; }\n</style>', '.a'],
  ];
  for (const [text, needle] of cases) assert.deepEqual(actions(text, needle, { select: true }), [], needle);
});

test('actions respect hierarchical kind filters and only edit the requested region', () => {
  const text = '<script>\nconst a = 1\n</script>\n<style>\n.a {}\n</style>';
  assert.equal(actions(text, 'const a', { only: ['refactor'] })[0].kind, toggleKind);
  assert.deepEqual(actions(text, 'const a', { only: ['source.fixAll'] }), []);
  assert.deepEqual(actions(text, 'const a', { only: ['quickfix'] }), []);
  const changed = apply(text, actions(text, '.a')[0]);
  assert.ok(changed.startsWith('<script>\nconst a = 1\n</script>'));
});
