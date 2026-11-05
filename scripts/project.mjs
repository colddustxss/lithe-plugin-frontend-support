import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const packageID = 'io.github.colddustxss.frontend-support';
export const packageRoot = path.join(root, packageID);
export const assetPrefix = 'frontend-support';
export async function readProject() {
  const json = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
  const project = await json('package.json');
  const manifest = await json(`${packageID}/plugin.json`);
  const config = await json('release.config.json');
  const languageServer = await json('language-server.json');
  if (manifest.id !== packageID || manifest.version !== project.version) throw new Error('Plugin ID or version differs from the project');
  if (manifest.vendor.signatureRequirement !== 'none' || manifest.id.startsWith('dev.lithe')) throw new Error('Invalid community identity');
  if (project.license !== 'Apache-2.0') throw new Error('Project license must be Apache-2.0');
  if (languageServer.version !== project.dependencies['@vue/language-server'] || languageServer.typescript !== project.dependencies.typescript) throw new Error('Language-server metadata differs from the pinned dependencies');
  return { project, manifest, config };
}
