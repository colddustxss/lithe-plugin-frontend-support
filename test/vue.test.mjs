import test from 'node:test';
import assert from 'node:assert/strict';
import { createVueClient, applyTextEdits } from './client.mjs';
import { readProject } from '../scripts/project.mjs';
const { manifest } = await readProject();

const requestFor = s => ({ textDocument: { uri: s.uri } });
const editsFor = (edit, uri) => [...(edit?.changes?.[uri] ?? []), ...(edit?.documentChanges ?? []).filter(change => change.textDocument?.uri === uri).flatMap(change => change.edits)];
async function complete(s, source, needle) {
  await s.open(source);
  const result = await s.request('textDocument/completion', { ...requestFor(s), position: s.position(needle), context: { triggerKind: 1 } });
  return result?.items ?? result ?? [];
}

test('packaged standalone Vue server provides editing features in a real multi-file project', { timeout: 120000 }, async t => {
  const s = await createVueClient(t, { isolated: true });
  await t.test('advertises completion resolve, hover, fixes, definitions and rename', () => {
    const c = s.initialized.capabilities;
    for (const key of ['completionProvider', 'hoverProvider', 'codeActionProvider', 'definitionProvider', 'renameProvider']) assert.ok(c[key], key);
    assert.equal(c.completionProvider.resolveProvider, true);
    assert.equal(s.initialized.serverInfo.version, manifest.version);
  });
  for (const [name, source, needle, label] of [
    ['HTML tag', '<template><inpu</template>', 'inpu', 'input'],
    ['native attribute', '<template><input pla /></template>', 'input pla', 'placeholder'],
    ['Vue directive', '<template><div v- /></template>', 'v-', 'v-if'],
    ['CSS property', '<template><div /></template>\n<style scoped>.a { dis }</style>', 'dis', 'display'],
    ['CSS value', '<template><div /></template>\n<style scoped>.a { display: fl }</style>', 'display: fl', 'flex'],
    ['typed component prop', '<script setup lang="ts">\nimport ChildCard from "./components/ChildCard.vue"\n</script>\n<template><ChildCard lab /></template>', 'lab', 'label'],
  ]) {
    await t.test(`${name} completion`, async () => {
      const items = await complete(s, source, needle);
      assert.ok(items.some(item => item.label === label), `Missing ${label}: ${items.map(item => item.label).join(', ')}`);
    });
  }
  await t.test('SFC snippets return tab stops and an editable replacement range', async () => {
    const items = await complete(s, 'vue3-setup', 'vue3-setup');
    const item = items.find(item => item.label === 'vue3-setup-ts');
    assert.ok(item);
    assert.equal(item.insertTextFormat, 2);
    assert.match(item.textEdit.newText, /<script setup lang="ts">/);
    assert.match(item.textEdit.newText, /\$0/);
    assert.equal(item.textEdit.range.start.character, 0);
    assert.equal(item.textEdit.range.end.character, 'vue3-setup'.length);
  });
  await t.test('template and script snippets work inside their Vue blocks', async () => {
    const templateItems = await complete(s, '<template><vfo</template>', 'vfo');
    const template = templateItems.find(item => item.label === 'vfor');
    assert.ok(template);
    assert.equal(s.text.slice(template.textEdit.range.start.character, template.textEdit.range.end.character), '<vfo');
    assert.match(template.textEdit.newText, /v-for=/);
    const scriptItems = await complete(s, '<script setup lang="ts">\nvref\n</script>\n<template><div /></template>', 'vref');
    assert.ok(scriptItems.some(item => item.label === 'vref' && item.textEdit.newText.includes('= ref(')));
  });
  const component = '<script setup lang="ts">\nimport { ref } from "vue"\nimport ChildCard from "./components/ChildCard.vue"\nconst count = ref(0)\nfunction increment() { count.value++ }\n</script>\n<template><button @click="increment">{{ count }}</button><ChildCard :label="String(count)" /></template>';
  await t.test('template hover exposes the actual inferred Ref type', async () => {
    await s.open(component);
    const hover = await s.request('textDocument/hover', { ...requestFor(s), position: s.position('{{ count', 7) });
    assert.match(JSON.stringify(hover), /Ref<number/);
  });
  await t.test('CSS hover documents the selected property', async () => {
    await s.open('<template><div /></template>\n<style scoped>.a { display: flex; }</style>');
    const hover = await s.request('textDocument/hover', { ...requestFor(s), position: s.position('display', 3) });
    assert.match(JSON.stringify(hover), /display|formatting box|layout/i);
  });
  await t.test('definition maps template events and child components to source files', async () => {
    await s.open(component);
    const local = await s.request('textDocument/definition', { ...requestFor(s), position: s.position('@click="increment', 15) });
    assert.ok(local.some(item => item.uri === s.uri && item.range.start.line === 4));
    const child = await s.request('textDocument/definition', { ...requestFor(s), position: s.position('<ChildCard', 7) });
    assert.ok(child.some(item => item.uri.endsWith('/src/components/ChildCard.vue')));
  });
  await t.test('rename updates declaration, script references and template bindings', async () => {
    await s.open(component);
    const edit = await s.request('textDocument/rename', { ...requestFor(s), position: s.position('{{ count', 7), newName: 'quantity' });
    const edits = editsFor(edit, s.uri);
    assert.equal(edits.length, 4);
    const renamed = applyTextEdits(s.text, edits);
    assert.match(renamed, /const quantity = ref\(0\)/);
    assert.match(renamed, /quantity\.value\+\+/);
    assert.match(renamed, /\{\{ quantity \}\}/);
    assert.match(renamed, /String\(quantity\)/);
  });
  await t.test('renaming a component prop follows its declaration into another Vue file', async () => {
    await s.open(component);
    const edit = await s.request('textDocument/rename', { ...requestFor(s), position: s.position(':label=', 4), newName: 'caption' });
    const uris = [...Object.keys(edit.changes ?? {}), ...(edit.documentChanges ?? []).map(change => change.textDocument?.uri)];
    assert.ok(uris.includes(s.uri));
    assert.ok(uris.some(uri => uri?.endsWith('/src/components/ChildCard.vue')));
    assert.ok(!uris.some(uri => uri?.startsWith('volar-embedded')));
  });
  await t.test('resolving a completion generates a working Vue API auto import', async () => {
    const items = await complete(s, '<script setup lang="ts">\nconst value = compu(() => 1)\n</script>\n<template><div>{{ value }}</div></template>', 'compu');
    const candidate = items.find(item => item.label === 'computed' && item.labelDetails?.description === 'vue');
    assert.ok(candidate, 'Vue computed export must be offered');
    const resolved = await s.request('completionItem/resolve', candidate);
    assert.ok(resolved.additionalTextEdits?.length);
    const text = applyTextEdits(s.text, [resolved.textEdit, ...resolved.additionalTextEdits]);
    assert.match(text, /import \{ computed \} from ['"]vue['"]/);
    assert.match(text, /computed\(\(\) => 1\)/);
    await s.open(text);
    const report = await s.request('textDocument/diagnostic', requestFor(s));
    assert.deepEqual(report.items.filter(item => item.severity === 1), []);
  });
  await t.test('typing a component tag offers an auto import with a valid component path', async () => {
    let items;
    // Vue's official service enables component auto-import codegen after edits.
    for (const name of ['ChildC', 'ChildCa', 'ChildCar']) {
      items = await complete(s, `<script setup lang="ts">\n</script>\n<template><${name} label="test" /></template>`, name);
    }
    const item = items.find(item => item.label === 'ChildCard');
    assert.ok(item);
    const resolved = await s.request('completionItem/resolve', item);
    assert.ok(resolved.additionalTextEdits?.length);
    const text = applyTextEdits(s.text, [resolved.textEdit, ...resolved.additionalTextEdits]);
    assert.match(text, /import ChildCard from ['"]\.\/components\/ChildCard\.vue['"]/);
    assert.match(text, /<ChildCard label="test"/);
    await s.open(text);
    const report = await s.request('textDocument/diagnostic', requestFor(s));
    assert.deepEqual(report.items.filter(item => item.severity === 1), []);
  });
  await t.test('quick fix comes from a real diagnostic and removes that error after application', async () => {
    await s.open('<script setup lang="ts">\nconst count = ref(0)\n</script>\n<template><div>{{ count }}</div></template>');
    const report = await s.request('textDocument/diagnostic', requestFor(s));
    const missing = report.items.find(item => item.code === 2304 && item.message.includes('ref'));
    assert.ok(missing);
    const { data, ...litheDiagnostic } = missing;
    const actions = await s.request('textDocument/codeAction', { ...requestFor(s), range: missing.range, context: { diagnostics: [litheDiagnostic] } });
    const action = actions.find(action => action.title === 'Add import from "vue"');
    assert.ok(action);
    const resolved = await s.request('codeAction/resolve', action);
    const edits = editsFor(resolved.edit, s.uri);
    assert.ok(edits.length);
    await s.open(applyTextEdits(s.text, edits));
    const fixed = await s.request('textDocument/diagnostic', requestFor(s));
    assert.ok(!fixed.items.some(item => item.code === 2304 && item.message.includes('ref')));
  });
  await t.test('source comment actions survive the packaged LSP and native-style resolve round trip', async () => {
    const source = '<script setup lang="ts">\nconst count = 1\n</script>\n<template>\n  <div>example</div>\n</template>\n<style scoped>\n.card { color: red; }\n</style>';
    for (const [needle, expected] of [
      ['count', '// const count = 1'],
      ['example', '<!-- <div>example</div> -->'],
      ['.card', '/* .card { color: red; } */'],
    ]) {
      await s.open(source);
      const position = s.position(needle);
      const actions = await s.request('textDocument/codeAction', { ...requestFor(s), range: { start: position, end: position }, context: { diagnostics: [] } });
      const action = actions.find(action => action.kind === 'refactor.rewrite.vue.comment');
      assert.ok(action, needle);
      const resolved = await s.request('codeAction/resolve', action);
      const edits = editsFor(resolved.edit, s.uri);
      assert.ok(edits.length);
      assert.ok(applyTextEdits(s.text, edits).includes(expected));
      assert.equal(resolved.edit.documentChanges[0].textDocument.uri, s.uri);
      assert.equal(typeof resolved.edit.documentChanges[0].textDocument.version, 'number');
    }
  });
  await t.test('HTML comment repair remains commented and valid after applying the LSP quick fix', async () => {
    await s.open('<script setup lang="ts">\n<!-- const unused: number = 1 -->\n</script>\n<template><div /></template>');
    const position = s.position('unused');
    const actions = await s.request('textDocument/codeAction', { ...requestFor(s), range: { start: position, end: position }, context: { diagnostics: [], only: ['quickfix'] } });
    const action = actions.find(action => action.kind === 'quickfix.vue.comment');
    assert.ok(action);
    const resolved = await s.request('codeAction/resolve', action);
    const fixed = applyTextEdits(s.text, editsFor(resolved.edit, s.uri));
    assert.match(fixed, /\/\/ const unused: number = 1/);
    assert.ok(!fixed.includes('<!--'));
    await s.open(fixed);
    const report = await s.request('textDocument/diagnostic', requestFor(s));
    assert.deepEqual(report.items.filter(item => item.severity === 1), []);
  });
  await t.test('document structure, folding and formatting remain available through the official server', async () => {
    await s.open('<script setup lang="ts">\nconst count=1\n</script>\n<template><div>{{count}}</div></template>');
    const symbols = await s.request('textDocument/documentSymbol', requestFor(s));
    assert.match(JSON.stringify(symbols), /count/);
    const folds = await s.request('textDocument/foldingRange', requestFor(s));
    assert.ok(folds.length);
    const edits = await s.request('textDocument/formatting', { ...requestFor(s), options: { tabSize: 2, insertSpaces: true } });
    assert.ok(edits.length);
    await s.open(applyTextEdits(s.text, edits));
    const report = await s.request('textDocument/diagnostic', requestFor(s));
    assert.deepEqual(report.items.filter(item => item.severity === 1), []);
  });
});
