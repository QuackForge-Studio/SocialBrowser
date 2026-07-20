const esbuild = require('esbuild');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(srcDir, 'index.tsx')],
    bundle: true,
    outfile: path.join(distDir, 'bundle.js'),
    platform: 'browser',
    target: 'es2021',
    format: 'iife',
    sourcemap: true,
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    external: [],
  });

  console.log('[dashboard] Build complete: dist/bundle.js');
}

main().catch((err) => {
  console.error('[dashboard] Build failed:', err);
  process.exit(1);
});
