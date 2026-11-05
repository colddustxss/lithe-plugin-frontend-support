import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import Ajv from 'ajv/dist/2020.js';
import { root, packageID, assetPrefix, readProject } from './project.mjs';

export async function validateArchive(bytes, index) {
  const origin = JSON.parse(await readFile(path.join(root, 'contracts/ORIGIN.json'), 'utf8'));
  const schemas = {};
  for (const [name, digest] of Object.entries(origin.sha256)) {
    const data = await readFile(path.join(root, 'contracts', name));
    if (createHash('sha256').update(data).digest('hex') !== digest) throw new Error('Contract checksum mismatch: ' + name);
    schemas[name] = JSON.parse(data);
  }
  const ajv = new Ajv({ strict: false, allErrors: true }).addSchema(schemas['native-ui.schema.json']);
  const files = unzipSync(bytes);
  const names = Object.keys(files);
  if (names.some(name => !name.startsWith(packageID + '/') || name.includes('\\') || name.split('/').some(p => p === '..' || p === ''))) throw new Error('Unsafe archive path');
  if (names.filter(name => name.endsWith('/plugin.json')).length !== 1) throw new Error('Expected one plugin manifest');
  const manifest = JSON.parse(new TextDecoder().decode(files[`${packageID}/plugin.json`]));
  if (!ajv.validate(schemas['plugin-manifest.schema.json'], manifest)) throw new Error(JSON.stringify(ajv.errors));
  if (!ajv.validate(schemas['plugin-index.schema.json'], index)) throw new Error(JSON.stringify(ajv.errors));
  const plugin = index.plugins.find(p => p.id === manifest.id), version = plugin?.versions.find(v => v.version === manifest.version);
  if (!version || version.pluginAPIVersion !== manifest.pluginAPIVersion || JSON.stringify(version.requires) !== JSON.stringify(manifest.requires)) throw new Error('Index does not match manifest');
  if (manifest.languages.length !== 1 || manifest.languages[0].id !== 'vue' || manifest.languageServers.length !== 1 || manifest.languageServers[0].languageID !== 'vue') throw new Error('Only Vue may own a server; native Node modules must not be declared');
  if (createHash('sha256').update(bytes).digest('hex') !== version.downloads[0].sha256) throw new Error('Archive checksum mismatch');
  for (const resource of [manifest.languageServers[0].launch.entry, manifest.languages[0].grammar.path, 'language-server/server.cjs', 'language-server/node_modules/typescript/lib/typescript.js', 'language-server/node_modules/typescript/lib/lib.es2022.d.ts', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt']) {
    if (!files[`${packageID}/${resource}`]) throw new Error('Missing packaged resource: ' + resource);
  }
  return { manifest, files };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest } = await readProject();
  const bytes = await readFile(path.join(root, `dist/${assetPrefix}-${manifest.version}-darwin.zip`));
  await validateArchive(bytes, JSON.parse(await readFile(path.join(root, 'lithe-plugin-index.json'), 'utf8')));
  console.log('Package, Lithe contract, offline runtime and index checks passed.');
}
