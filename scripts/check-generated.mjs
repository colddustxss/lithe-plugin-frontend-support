import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root, packageRoot } from './project.mjs';

// Keep failure details visible through the Checks API, including when downloading
// workflow logs requires an authenticated browser session.
let diff;
try {
  diff = execFileSync('git', ['diff', '--exit-code', '--', 'lithe-plugin-index.json', 'io.github.colddustxss.frontend-support/grammars'], { cwd: root, encoding: 'utf8' });
} catch (error) {
  diff = error.stdout;
  const hashTree = async (directory) => {
    const hashes = [];
    const walk = async (current) => {
      for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
        const file = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(file);
        else hashes.push([path.relative(directory, file), createHash('sha256').update(await readFile(file)).digest('hex')]);
      }
    };
    await walk(directory);
    return { files: hashes.length, sha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex') };
  };
  const fingerprints = {};
  for (const entry of await readdir(path.join(packageRoot, 'language-server/node_modules'))) {
    fingerprints[entry] = await hashTree(path.join(packageRoot, 'language-server/node_modules', entry));
  }
  for (const file of ['BUILD_INFO.json', 'THIRD_PARTY_NOTICES.txt']) fingerprints[file] = createHash('sha256').update(await readFile(path.join(packageRoot, file))).digest('hex');
  const escape = value => value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log('::error title=Generated package differs::' + escape(diff));
  console.log('::error title=Runtime fingerprints::' + escape(JSON.stringify(fingerprints)));
  process.exitCode = 1;
}
if (diff === '') console.log('Generated index and grammar match committed files.');
