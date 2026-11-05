// Copyright 2026 colddustxss
// SPDX-License-Identifier: Apache-2.0
// Use the official standalone Vue server, not the editor-specific hybrid bridge.
const { createConnection, createServer } = require('@volar/language-server/node');
const { initialize } = require('@vue/language-server/lib/initialize');
const ts = require('typescript');
const { URI } = require('vscode-uri');
const { createSnippetsPlugin } = require('./snippets.cjs');
const { getCommentActions, commentActionKinds } = require('./comments.cjs');

const connection = createConnection();
const server = createServer(connection);
// Lithe 0.6.7 forwards diagnostic locations/codes but drops Diagnostic.data.
// Volar uses that opaque data to route quick fixes to the embedded TS plugin.
// Rehydrate it from current diagnostics instead of trusting stale client data.
const onCodeAction = connection.onCodeAction.bind(connection);
connection.onCodeAction = handler => onCodeAction(async (params, token, ...reporters) => {
  const document = server.documents.get(URI.parse(params.textDocument.uri));
  const version = document?.version;
  const comments = getCommentActions(document, params.range, params.context);
  if (token.isCancellationRequested) return [];
  // Our fully computed actions need no TypeScript analysis or resolve step.
  if (params.context.only?.length && params.context.only.every(kind => commentActionKinds.includes(kind))) return comments;
  if (!params.context.diagnostics.length || params.context.diagnostics.some(item => !item.data)) {
    const uri = URI.parse(params.textDocument.uri);
    const service = await server.project.getLanguageService(uri);
    const fresh = await service.getDiagnostics(uri, undefined, token);
    const compare = (a, b) => a.line - b.line || a.character - b.character;
    const intersects = item => compare(item.range.start, params.range.end) <= 0 && compare(item.range.end, params.range.start) >= 0;
    params = { ...params, context: { ...params.context, diagnostics: fresh.filter(intersects) } };
  }
  const actions = await handler(params, token, ...reporters) ?? [];
  if (token.isCancellationRequested || document?.version !== version) return [];
  return [...comments, ...actions];
});
const initializeBase = server.initialize.bind(server);
server.initialize = (params, project, plugins) => initializeBase(params, project, [...plugins, createSnippetsPlugin()]);

connection.onInitialize(params => {
  // Lithe does not implement VS Code's TS-plugin request bridge. Always own
  // Vue's TS session internally; never register a second native Node provider.
  params.initializationOptions = { typescript: { disableAutoImportCache: false }, vue: { hybridMode: false } };
  const result = initialize(server, params, ts);
  if (result.capabilities.codeActionProvider && typeof result.capabilities.codeActionProvider === 'object'
    && result.capabilities.codeActionProvider.codeActionKinds) {
    result.capabilities.codeActionProvider.codeActionKinds.push(...commentActionKinds);
  }
  result.serverInfo = { name: 'Frontend Support / Vue', version: '__FRONTEND_VERSION__' };
  return result;
});
connection.onInitialized(server.initialized);
connection.onShutdown(server.shutdown);
connection.listen();
