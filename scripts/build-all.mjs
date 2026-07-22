import { execSync } from 'child_process';

console.log('[build-all] Building workspace packages in topological order...');

try {
  console.log('[build-all] 1/3 Building @social-browser/shared...');
  execSync('pnpm --filter @social-browser/shared build', { stdio: 'inherit' });

  console.log('[build-all] 2/3 Building @social-browser/dashboard...');
  execSync('pnpm --filter @social-browser/dashboard build', { stdio: 'inherit' });

  console.log('[build-all] 3/3 Building @social-browser/main...');
  execSync('pnpm --filter @social-browser/main build', { stdio: 'inherit' });

  console.log('[build-all] All packages built successfully!');
} catch (err) {
  console.error('[build-all] Build failed:', err);
  process.exit(1);
}
