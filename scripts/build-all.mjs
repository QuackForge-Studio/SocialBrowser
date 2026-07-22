import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

console.log('[build-all] Building workspace packages in topological order...');

try {
  console.log('[build-all] 1/3 Building @social-browser/shared...');
  execSync(`node "${path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')}" -p "${path.join(ROOT, 'packages', 'shared')}"`, { stdio: 'inherit', cwd: ROOT });

  console.log('[build-all] 2/3 Building @social-browser/dashboard...');
  execSync(`node "${path.join(ROOT, 'packages', 'dashboard', 'scripts', 'build.js')}"`, { stdio: 'inherit', cwd: ROOT });

  console.log('[build-all] 3/3 Building @social-browser/main...');
  execSync(`node "${path.join(ROOT, 'scripts', 'build-main.mjs')}"`, { stdio: 'inherit', cwd: ROOT });

  console.log('[build-all] All packages built successfully!');
} catch (err) {
  console.error('[build-all] Build failed:', err);
  process.exit(1);
}
