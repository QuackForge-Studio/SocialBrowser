const fs = require('fs');
const path = require('path');
const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) { fs.mkdirSync(distDir, { recursive: true }); }
const srcFile = path.join(srcDir, 'index.html');
const destFile = path.join(distDir, 'index.html');
if (fs.existsSync(srcFile)) { fs.copyFileSync(srcFile, destFile); console.log('[dashboard] Copied index.html to dist/'); }
else { console.warn('[dashboard] No index.html found in src/'); }
