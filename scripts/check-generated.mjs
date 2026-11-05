import { execFileSync } from 'node:child_process';
import { root } from './project.mjs';

// Expose the diff through the Checks API when logs require browser sign-in.
try {
  execFileSync('git', ['diff', '--exit-code', '--', 'lithe-plugin-index.json', 'io.github.colddustxss.frontend-support/grammars'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  console.log('Generated index and grammar match committed files.');
} catch (error) {
  const message = String(error.stdout || error.message).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log('::error title=Generated package differs::' + message);
  process.exitCode = 1;
}
