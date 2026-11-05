import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node.js';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function createVueClient(t, { isolated = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'lithe-vue-intelligence-'));
  const workspace = path.join(directory, '工程 空间');
  await mkdir(path.join(workspace, 'src/components'), { recursive: true });
  // Project Vue types are separate from the packaged server's own runtime.
  await symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
  await writeFile(path.join(workspace, 'package.json'), JSON.stringify({ dependencies: { vue: '3.5.44' } }));
  await writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] }, lib: ['ES2022', 'DOM'], allowJs: true }, include: ['src/**/*.ts', 'src/**/*.vue'], vueCompilerOptions: { strictTemplates: true } }));
  await writeFile(path.join(workspace, 'src/components/ChildCard.vue'), '<script setup lang="ts">\ndefineProps<{ label: string }>()\n</script>\n<template><button>{{ label }}</button></template>');
  await writeFile(path.join(workspace, 'src/utils.ts'), '/** Formats a delivery label. */\nexport function formatLabel(value: string) { return value.toUpperCase() }\nexport const depotName = "冷库"\n');
  const runtime = path.join(root, 'io.github.colddustxss.frontend-support/language-server');
  let entry = path.join(runtime, 'server.cjs');
  if (isolated) {
    const copy = path.join(directory, 'standalone-runtime');
    await cp(runtime, copy, { recursive: true });
    entry = path.join(copy, 'server.cjs');
  }
  const child = spawn(process.execPath, [entry, '--stdio'], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_PATH: '' } });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data; });
  const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
  const logs = [], diagnostics = [];
  connection.onRequest('workspace/configuration', params => params.items.map(() => null));
  connection.onRequest('workspace/workspaceFolders', () => [{ uri: pathToFileURL(workspace).href, name: 'fixture' }]);
  connection.onRequest('client/registerCapability', () => null);
  connection.onRequest('client/unregisterCapability', () => null);
  connection.onRequest('window/workDoneProgress/create', () => null);
  connection.onRequest('workspace/semanticTokens/refresh', () => null);
  connection.onRequest('workspace/inlayHint/refresh', () => null);
  connection.onNotification('window/logMessage', item => logs.push(item));
  connection.onNotification('textDocument/publishDiagnostics', item => diagnostics.push(item));
  connection.listen();
  const request = async (method, params) => {
    let timer;
    try { return await Promise.race([connection.sendRequest(method, params), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${method} timed out; ${stderr}; ${JSON.stringify(logs)}`)), 15000); })]); }
    finally { clearTimeout(timer); }
  };
  t.after(async () => {
    try {
      if (child.exitCode === null) {
        await request('shutdown');
        const exited = once(child, 'exit');
        connection.sendNotification('exit');
        let timer;
        await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]).finally(() => clearTimeout(timer));
      }
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      connection.dispose();
      await rm(directory, { recursive: true, force: true });
    }
    if (stderr) throw new Error(stderr);
    if (child.exitCode !== 0) throw new Error(`Server did not shut down cleanly: ${child.exitCode} / ${child.signalCode}`);
  });
  const initialized = await request('initialize', {
    processId: process.pid, rootUri: pathToFileURL(workspace).href,
    workspaceFolders: [{ uri: pathToFileURL(workspace).href, name: 'fixture' }],
    capabilities: {
      textDocument: {
        completion: { contextSupport: true, completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], resolveSupport: { properties: ['detail', 'documentation', 'textEdit', 'additionalTextEdits'] } } },
        hover: { contentFormat: ['markdown', 'plaintext'] }, definition: {}, references: {}, rename: {},
        codeAction: { resolveSupport: { properties: ['edit'] }, codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } } },
        publishDiagnostics: { versionSupport: true },
      },
      workspace: { configuration: true, workspaceFolders: true, workspaceEdit: { documentChanges: true } },
    },
  });
  connection.sendNotification('initialized', {});
  const uri = pathToFileURL(path.join(workspace, 'src/App.vue')).href;
  let version = 0, text = '';
  const open = async source => {
    text = source;
    await writeFile(path.join(workspace, 'src/App.vue'), source);
    const method = version ? 'textDocument/didChange' : 'textDocument/didOpen';
    version++;
    connection.sendNotification(method, version === 1 ? { textDocument: { uri, languageId: 'vue', version, text } } : { textDocument: { uri, version }, contentChanges: [{ text }] });
  };
  const position = (needle, offset = needle.length) => {
    const index = text.indexOf(needle);
    if (index < 0) throw new Error(`Missing test position ${needle}`);
    const lines = text.slice(0, index + offset).split('\n');
    return { line: lines.length - 1, character: lines.at(-1).length };
  };
  return { request, connection, initialized, uri, workspace, diagnostics, logs, open, position, get text() { return text; } };
}

export function applyTextEdits(text, edits) {
  const offset = position => text.split('\n').slice(0, position.line).reduce((n, line) => n + line.length + 1, 0) + position.character;
  for (const edit of [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start))) text = text.slice(0, offset(edit.range.start)) + edit.newText + text.slice(offset(edit.range.end));
  return text;
}
