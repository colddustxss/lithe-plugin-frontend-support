// Run the official Store validator without shell-interpolating JavaScript paths.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, packageID, assetPrefix, readProject } from './project.mjs';

const validator = process.argv[2];
if (!validator) throw new Error('Usage: node scripts/check-store.mjs <official validate-index.mjs>');
const { validateIndex, readPackageManifests, checkManifest } = await import(pathToFileURL(path.resolve(validator)).href);
const { manifest } = await readProject();
const index = JSON.parse(await readFile(path.join(root, 'lithe-plugin-index.json'), 'utf8'));
const problems = validateIndex(index);
const entry = index.plugins.find(plugin => plugin.id === packageID);
const version = entry?.versions.find(version => version.version === manifest.version);
if (!version) throw new Error('Current version is missing from the index');
const archive = path.join(root, 'dist', `${assetPrefix}-${manifest.version}-darwin.zip`);
const { manifests, unsafe } = readPackageManifests(archive, packageID);
problems.push(...unsafe, ...checkManifest(manifests, entry, version));
if (problems.length) throw new Error(problems.join('\n'));
console.log('Official Lithe Store index and archive checks passed.');
