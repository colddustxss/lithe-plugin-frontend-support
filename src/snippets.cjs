// Copyright 2026 colddustxss
// SPDX-License-Identifier: Apache-2.0
const snippets = [
  { label: 'vue3-setup-ts', languages: ['vue', 'vue-root-tags'], detail: 'Vue 3 · TypeScript 单文件组件', body: '<script setup lang="ts">\n${1}\n</script>\n\n<template>\n  <div>${2}</div>\n</template>\n\n<style scoped>\n${3}\n</style>\n$0' },
  { label: 'vue3-setup', languages: ['vue', 'vue-root-tags'], detail: 'Vue 3 · JavaScript 单文件组件', body: '<script setup>\n${1}\n</script>\n\n<template>\n  <div>${2}</div>\n</template>\n\n<style scoped>\n${3}\n</style>\n$0' },
  { label: 'vfor', languages: ['html'], detail: 'Vue · v-for 带 key', body: '<${1:div} v-for="${2:item} in ${3:items}" :key="${2:item}.${4:id}">\n  $0\n</${1:div}>' },
  { label: 'vif', languages: ['html'], detail: 'Vue · 条件渲染', body: '<${1:div} v-if="${2:condition}">\n  $0\n</${1:div}>' },
  { label: 'vmodel', languages: ['html'], detail: 'Vue · 双向绑定输入框', body: '<input v-model="${1:value}" />$0' },
  { label: 'vref', languages: ['typescript', 'javascript'], detail: 'Vue · ref（请先导入 ref）', body: 'const ${1:value} = ref(${2:null})$0' },
  { label: 'vcomputed', languages: ['typescript', 'javascript'], detail: 'Vue · computed（请先导入 computed）', body: 'const ${1:value} = computed(() => ${2:expression})$0' },
  { label: 'vwatch', languages: ['typescript', 'javascript'], detail: 'Vue · watch（请先导入 watch）', body: 'watch(${1:source}, (${2:value}, ${3:oldValue}) => {\n  $0\n})' },
];

exports.createSnippetsPlugin = () => ({
  name: 'frontend-vue-snippets',
  capabilities: { completionProvider: {} },
  create(context) {
    return {
      isAdditionalCompletion: true,
      provideCompletionItems(document, position) {
        const embedded = context.decodeEmbeddedDocumentUri(require('vscode-uri').URI.parse(document.uri));
        const sourceUri = embedded?.[0].path ?? document.uri;
        if (!sourceUri.endsWith('.vue')) return;
        if (!context.env.clientCapabilities?.textDocument?.completion?.completionItem?.snippetSupport) return;
        const before = document.getText().slice(0, document.offsetAt(position));
        const prefix = before.match(/[\w-]*$/)?.[0] ?? '';
        const items = snippets.filter(item => item.languages.includes(document.languageId) && (!prefix || item.label.startsWith(prefix))).map(item => ({
          label: item.label, kind: 15, detail: item.detail, insertTextFormat: 2,
          textEdit: { range: {
            start: { line: position.line, character: Math.max(0, position.character - prefix.length - (item.body.startsWith('<') && before.endsWith('<' + prefix) ? 1 : 0)) },
            end: position,
          }, newText: item.body }, sortText: `!${item.label}`,
        }));
        return { isIncomplete: false, items };
      },
    };
  },
});
