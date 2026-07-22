import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAIN_SRC = path.join(ROOT, 'packages', 'main', 'src');
const MAIN_DIST = path.join(ROOT, 'packages', 'main', 'dist');

async function runBuild() {
  console.log('[build-main] Bundling main process & preload scripts with esbuild...');

  // 1. Main process bundle
  await build({
    entryPoints: [path.join(MAIN_SRC, 'index.ts')],
    outfile: path.join(MAIN_DIST, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: [
      'electron',
      'better-sqlite3',
      'sqlite-vec',
      'sqlite-vec-windows-x64',
    ],
    sourcemap: true,
    logLevel: 'info',
  });

  // 2. Preload scripts bundle
  await build({
    entryPoints: [
      path.join(MAIN_SRC, 'preload-shell.ts'),
      path.join(MAIN_SRC, 'preload-capture.ts'),
    ],
    outdir: MAIN_DIST,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  });

  console.log('[build-main] Build completed successfully.');
}

runBuild().catch((err) => {
  console.error('[build-main] Build failed:', err);
  process.exit(1);
});
