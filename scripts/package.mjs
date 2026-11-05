// Lua template flow: validate tag, stage one plugin ID directory, build a
// platform-named archive and publish immutable assets through tag CI.
import { readdir, readFile, writeFile, lstat, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildPlugin } from './build.mjs';
import { readProject, root, packageRoot, packageID, assetPrefix } from './project.mjs';
import { validateArchive } from './validate.mjs';

const { project, manifest, config } = await readProject();
const args = process.argv.slice(2);
const flags = new Map();
for (let index = 0; index < args.length; index += 2) {
  const name = args[index], value = args[index + 1];
  if (!['--expect-tag', '--expect-repository'].includes(name) || !value || value.startsWith('--') || flags.has(name)) throw new Error('Usage: --expect-tag v<version> --expect-repository owner/repo');
  flags.set(name, value);
}
if (flags.has('--expect-tag') && flags.get('--expect-tag') !== `v${manifest.version}`) throw new Error('Expected --expect-tag v' + manifest.version);
if (flags.has('--expect-repository') && config.repository !== `https://github.com/${flags.get('--expect-repository')}`) throw new Error('Release repository does not match release.config.json');
await buildPlugin();
const entries = {};
async function collect(directory) {
  for (const name of (await readdir(directory)).sort()) {
    if (name === '.DS_Store') continue;
    const file = path.join(directory, name), stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error('Package contains a symlink: ' + file);
    if (stat.isDirectory()) await collect(file);
    else if (stat.isFile()) entries[path.relative(root, file).split(path.sep).join('/')] = [new Uint8Array(await readFile(file)), { mtime: new Date(1980, 0, 1, 0, 0, 0), os: 3, attrs: 0o100644 << 16 }];
  }
}
await collect(packageRoot);
const bytes = zipSync(entries, { level: 6 });
const sha256 = createHash('sha256').update(bytes).digest('hex');
const name = `${assetPrefix}-${manifest.version}-darwin.zip`;
const index = { schemaVersion: 1, plugins: [{
  id: packageID, name: manifest.displayName, author: manifest.vendor.displayName,
  repository: config.repository, homepage: `${config.repository}#readme`,
  description: config.description, localizedDescriptions: config.localizedDescriptions,
  license: project.license, tags: ['language', 'vue', 'completion', 'frontend'],
  versions: [{ version: manifest.version, pluginAPIVersion: manifest.pluginAPIVersion, requires: manifest.requires,
    releaseDate: config.releaseDate,
    downloads: [{ platforms: ['darwin-arm64', 'darwin-x64'], downloadURL: `${config.repository}/releases/download/v${manifest.version}/${name}`, sha256 }],
  }],
}] };
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', name), bytes);
await writeFile(path.join(root, 'dist', name + '.sha256'), `${sha256}  ${name}\n`);
await writeFile(path.join(root, 'lithe-plugin-index.json'), JSON.stringify(index, null, 2) + '\n');
const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const changes = changelog.split(`## ${manifest.version}\n`)[1]?.split('\n## ')[0].trim();
if (!changes) throw new Error('Missing release notes in CHANGELOG.md for ' + manifest.version);
await writeFile(path.join(root, 'dist/release-notes.md'), `${manifest.displayName} ${manifest.version}\n\n${changes}\n\n${config.localizedDescriptions['zh-Hans']}\n\n安装前准备 Node.js 20+ 与项目依赖。当前支持 macOS。\n\nSHA-256: ${sha256}\n\n测试范围及原生验收状态见 VALIDATION.md。\n`);
await validateArchive(bytes, index);
console.log(`dist/${name} ${sha256}`);
