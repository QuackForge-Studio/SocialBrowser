import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const steps = [
  ['@social-browser/shared', `node "${path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')}" -p "${path.join(ROOT, 'packages', 'shared')}"`],
  ['@social-browser/dashboard', `node "${path.join(ROOT, 'packages', 'dashboard', 'scripts', 'build.js')}"`],
  ['@social-browser/main', `node "${path.join(ROOT, 'scripts', 'build-main.mjs')}"`],
];

console.log('[build-all] Building workspace packages in topological order...');

for (let i = 0; i < steps.length; i++) {
  const [name, cmd] = steps[i];
  console.log(`[build-all] ${i + 1}/${steps.length} Building ${name}...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: process.env });
  } catch (err) {
    console.error(`[build-all] Failed while building ${name}`);
    console.error(`[build-all] Command: ${cmd}`);
    console.error(`[build-all] Exit status: ${err?.status ?? 'unknown'}`);
    if (err?.signal) console.error(`[build-all] Signal: ${err.signal}`);
    process.exit(err?.status || 1);
  }
}

console.log('[build-all] All packages built successfully!');
