import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { validateArchive } from '../scripts/validate.mjs';
import { readProject, packageID } from '../scripts/project.mjs';
import { spawnSync } from 'node:child_process';

test('package validation rejects a wrong hash, missing launcher and manifest/index capability mismatch', async () => {
  const { manifest, config } = await readProject();
  const resources = [manifest.languageServers[0].launch.entry, manifest.languages[0].grammar.path,
    'language-server/server.cjs', 'language-server/node_modules/typescript/lib/typescript.js',
    'language-server/node_modules/typescript/lib/lib.es2022.d.ts', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.txt'];
  const files = Object.fromEntries(resources.map(name => [`${packageID}/${name}`, strToU8('test fixture')]));
  files[`${packageID}/plugin.json`] = strToU8(JSON.stringify(manifest));
  const pack = () => zipSync(files);
  let bytes = pack();
  const indexFor = bytes => ({ schemaVersion: 1, plugins: [{ id: packageID, name: manifest.displayName, author: 'colddustxss', repository: config.repository, description: config.description, license: 'Apache-2.0', versions: [{ version: manifest.version, pluginAPIVersion: 3, requires: manifest.requires, releaseDate: config.releaseDate, downloads: [{ platforms: ['darwin-arm64'], downloadURL: `${config.repository}/releases/download/v${manifest.version}/frontend-support-${manifest.version}-darwin.zip`, sha256: createHash('sha256').update(bytes).digest('hex') }] }] }] });
  const index = indexFor(bytes);
  await validateArchive(bytes, index);
  const bad = structuredClone(index);
  bad.plugins[0].versions[0].downloads[0].sha256 = '0'.repeat(64);
  await assert.rejects(validateArchive(bytes, bad), /checksum mismatch/);
  const incompatible = structuredClone(index);
  incompatible.plugins[0].versions[0].requires.languages = 1;
  await assert.rejects(validateArchive(bytes, incompatible), /Index does not match/);
  delete files[`${packageID}/${manifest.languageServers[0].launch.entry}`];
  bytes = pack();
  await assert.rejects(validateArchive(bytes, indexFor(bytes)), /Missing packaged resource/);
});

test('a mismatched release tag or repository fails before building a package', async () => {
  const { manifest } = await readProject();
  const result = spawnSync(process.execPath, ['scripts/package.mjs', '--expect-tag', 'v999.0.0'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('Expected --expect-tag v' + manifest.version));
  const wrongRepository = spawnSync(process.execPath, ['scripts/package.mjs', '--expect-repository', 'someone/another-repo'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(wrongRepository.status, 1);
  assert.match(wrongRepository.stderr, /Release repository does not match/);
});
