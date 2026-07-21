const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs/promises');
const postcss = require('postcss');
const tailwindPostcss = require('@tailwindcss/postcss');

const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

async function buildCss() {
  const cssPath = path.join(srcDir, 'styles.css');
  const css = await fs.readFile(cssPath, 'utf8');
  const result = await postcss([tailwindPostcss()]).process(css, {
    from: cssPath,
    to: path.join(distDir, 'styles.css'),
  });
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(distDir, 'styles.css'), result.css, 'utf8');
  console.log('[dashboard] CSS built: dist/styles.css');
}

async function buildJs() {
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
  console.log('[dashboard] JS built: dist/bundle.js');
}

async function main() {
  await fs.mkdir(distDir, { recursive: true });
  await Promise.all([buildCss(), buildJs()]);
  console.log('[dashboard] Build complete');
}

main().catch((err) => {
  console.error('[dashboard] Build failed:', err);
  process.exit(1);
});
