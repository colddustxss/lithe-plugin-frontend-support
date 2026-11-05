import { readFile, readdir, mkdir, copyFile, rm, lstat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Keep official package layouts and TS standard-library resources intact.
// This avoids hidden require()/resource failures in a single-file bundle.
export async function buildVueRuntime(root, packageRoot) {
  const target = path.join(packageRoot, 'language-server');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  const packages = new Map();
  const visit = async (name, parent) => {
    const resolve = createRequire(parent);
    let entry;
    try { entry = resolve.resolve(name + '/package.json'); }
    catch { entry = resolve.resolve(name); }
    let directory = path.dirname(entry);
    while (true) {
      try {
        const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (manifest.name === name) {
          if (packages.has(directory)) return;
          packages.set(directory, manifest);
          for (const dependency of Object.keys(manifest.dependencies ?? {})) await visit(dependency, path.join(directory, 'package.json'));
          return;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parentDirectory = path.dirname(directory);
      if (parentDirectory === directory) throw new Error(`Cannot locate package metadata: ${name}`);
      directory = parentDirectory;
    }
  };
  for (const name of ['@vue/language-server', 'typescript']) await visit(name, path.join(root, 'package.json'));
  const copy = async (source, destination) => {
    await mkdir(destination, { recursive: true });
    for (const name of (await readdir(source)).sort()) {
      if (['node_modules', '.bin', '.DS_Store'].includes(name)) continue;
      const input = path.join(source, name), output = path.join(destination, name);
      const stat = await lstat(input);
      if (stat.isSymbolicLink()) throw new Error(`Runtime symlink is not allowed: ${input}`);
      if (stat.isDirectory()) await copy(input, output);
      else if (stat.isFile()) await copyFile(input, output);
    }
  };
  const origins = JSON.parse(await readFile(path.join(root, 'vendor/licenses/ORIGIN.json'), 'utf8'));
  const notices = [];
  for (const [directory, manifest] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const relative = path.relative(root, directory);
    if (!relative.startsWith('node_modules' + path.sep)) throw new Error('Vue dependency escaped the project dependency tree');
    const destination = path.join(target, relative);
    await copy(directory, destination);
    let license;
    for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'License.txt', 'LICENSE-MIT.txt', 'LICENSE-MIT', 'license', 'LICENCE']) {
      try { license = await readFile(path.join(directory, name), 'utf8'); break; } catch {}
    }
    if (!license) {
      const origin = origins[`${manifest.name}@${manifest.version}`];
      if (!origin) throw new Error(`Missing upstream license: ${manifest.name}@${manifest.version}`);
      const bytes = await readFile(path.join(root, 'vendor/licenses', origin.file));
      if (createHash('sha256').update(bytes).digest('hex') !== origin.sha256) throw new Error(`Upstream license checksum mismatch: ${manifest.name}`);
      license = bytes.toString('utf8');
      await writeFile(path.join(destination, 'LICENSE'), license);
    }
    notices.push(`${manifest.name}@${manifest.version}\n${'='.repeat(72)}\n${license.trim()}\n`);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const entry = await readFile(path.join(root, 'src/server.cjs'), 'utf8');
  await writeFile(path.join(target, 'server.cjs'), entry.replace('__FRONTEND_VERSION__', manifest.version));
  await copyFile(path.join(root, 'src/snippets.cjs'), path.join(target, 'snippets.cjs'));
  return { target, notices, dependencies: [...packages.values()].map(({ name, version }) => ({ name, version })) };
}
