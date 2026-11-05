import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from 'monaco-editor/esm/vs/editor/standalone/common/monarch/monarchCompile.js';
import { MonarchTokenizer } from 'monaco-editor/esm/vs/editor/standalone/common/monarch/monarchLexer.js';
import { grammar } from '../src/grammar.mjs';

function tokenize(t, lines) {
  const tokenizer = new MonarchTokenizer({}, {}, 'vue', compile('vue', structuredClone(grammar)), {
    getValue: () => 20000,
    onDidChangeConfiguration: () => ({ dispose() {} }),
  });
  t.after(() => tokenizer.dispose());
  const initial = tokenizer.getInitialState();
  let state = initial;
  const result = lines.map(line => {
    const result = tokenizer.tokenize(line, true, state);
    state = result.endState;
    return result.tokens.map((token, index) => ({ text: line.slice(token.offset, result.tokens[index + 1]?.offset), type: token.type }));
  });
  return { result, returnedToRoot: state.equals(initial) };
}

test('new Vue grammar actually tokenizes markup, directives, TypeScript and CSS in Monaco 0.55.1', t => {
  const { result, returnedToRoot } = tokenize(t, [
    '<template>', '<button v-if="ready">{{ count }}</button>', '</template>',
    '<script setup lang="ts">', 'const count = ref(1)', '</script>',
    '<style scoped>', '.card { color: #fff; }', '</style>',
  ]);
  assert.ok(result[1].some(token => token.text === 'v-if' && token.type === 'keyword.vue'));
  assert.ok(result[1].some(token => token.text === '"ready"' && token.type === 'string.vue'));
  assert.ok(result[4].some(token => token.text === 'const' && token.type === 'keyword.vue'));
  assert.ok(result[4].some(token => token.text === 'ref' && token.type === 'predefined.vue'));
  assert.ok(result[7].some(token => token.text === 'color' && token.type === 'attribute.name.vue'));
  assert.ok(result[7].some(token => token.text === '#fff' && token.type === 'number.hex.vue'));
  assert.ok(returnedToRoot);
});

test('nested interpolation objects and markup comments restore the outer grammar state', t => {
  const { result, returnedToRoot } = tokenize(t, ['<!-- comment -->', '<template>{{ { a: { b: 1 } } }}</template>']);
  assert.ok(result[0].every(token => token.type === 'comment.vue'));
  assert.ok(result[1].some(token => token.text === '1' && token.type === 'number.vue'));
  assert.ok(returnedToRoot);
});

test('closing-tag text inside a script comment does not end the script', t => {
  const { result, returnedToRoot } = tokenize(t, ['<script>', '/* </script> */', 'const enabled = true', '</script>']);
  assert.ok(result[2].some(token => token.text === 'const' && token.type === 'keyword.vue'));
  assert.ok(returnedToRoot);
});
