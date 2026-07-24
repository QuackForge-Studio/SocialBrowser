/**
 * Copy dashboard and worker dist files into the main package's dist directory
 * so they can be bundled by electron-builder.
 * This ensures a self-contained package for both dev and production modes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAIN_DIST = path.join(ROOT, 'packages', 'main', 'dist');
const DASHBOARD_DIST = path.join(ROOT, 'packages', 'dashboard', 'dist');
const WORKER_DIST = path.join(ROOT, 'packages', 'worker', 'dist');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('[copy-assets] Source does not exist:', src);
    return;
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log('[copy-assets] Copied:', path.relative(ROOT, srcPath), '->', path.relative(ROOT, destPath));
    }
  }
}

// Copy dashboard dist to main/dist/dashboard/
const dashboardDest = path.join(MAIN_DIST, 'dashboard');
console.log('[copy-assets] Copying dashboard dist...');
copyDir(DASHBOARD_DIST, dashboardDest);

// Copy worker dist to main/dist/worker/
const workerDest = path.join(MAIN_DIST, 'worker');
console.log('[copy-assets] Copying worker dist...');
copyDir(WORKER_DIST, workerDest);

// Copy icon
const iconSrc = path.join(ROOT, 'socialbrowser-logo-white-orange-preview.png');
const iconDest = path.join(MAIN_DIST, 'icon.png');
if (fs.existsSync(iconSrc)) { fs.copyFileSync(iconSrc, iconDest); console.log('[copy-assets] Copied app icon'); }

console.log('[copy-assets] Asset copy complete');
