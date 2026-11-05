import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVueRuntime } from './runtime.mjs';
import { grammar } from '../src/grammar.mjs';
import { root, packageRoot, readProject } from './project.mjs';

export async function buildPlugin() {
  const { manifest } = await readProject();
  await mkdir(path.join(packageRoot, 'grammars'), { recursive: true });
  await writeFile(path.join(packageRoot, 'grammars/vue.monarch.json'), JSON.stringify(grammar, null, 2) + '\n');
  const runtime = await buildVueRuntime(root, packageRoot);
  for (const file of ['LICENSE', 'NOTICE', 'README.md', 'VALIDATION.md', 'CHANGELOG.md']) await copyFile(path.join(root, file), path.join(packageRoot, file));
  await writeFile(path.join(packageRoot, 'THIRD_PARTY_NOTICES.txt'), runtime.notices.join('\n'));
  await writeFile(path.join(packageRoot, 'BUILD_INFO.json'), JSON.stringify({
    version: manifest.version, nodeMinimum: '20',
    lockSHA256: createHash('sha256').update(await readFile(path.join(root, 'package-lock.json'))).digest('hex'),
    dependencies: runtime.dependencies.sort((a,b) => a.name.localeCompare(b.name)),
  }, null, 2) + '\n');
  console.log(`Built ${manifest.displayName} ${manifest.version} with ${runtime.dependencies.length} offline runtime packages.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPlugin();
