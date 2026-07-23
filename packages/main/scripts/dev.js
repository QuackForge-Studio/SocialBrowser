const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MAIN_DIR = path.join(ROOT, 'packages', 'main');

console.log('[main:dev] Building main process...');
execSync(`node "${path.join(ROOT, 'scripts', 'build-main.mjs')}"`, { stdio: 'inherit', cwd: ROOT });

console.log('[main:dev] Launching Electron...');
// Use .exe directly (not .cmd wrapper) to avoid path-with-spaces quoting issues
const electronExe = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

const logFile = path.join(MAIN_DIR, 'electron-debug.log');
const logStream = require('fs').openSync(logFile, 'w');

const child = spawn(electronExe, ['.'], {
  cwd: MAIN_DIR,
  detached: true,
  shell: false,
  stdio: ['ignore', logStream, logStream]
});
child.unref();

console.log(`[main:dev] Electron launched detached (PID: ${child.pid})`);
console.log(`[main:dev] Debug log → ${logFile}`);

// Check if Electron stays alive after 2s
setTimeout(() => {
  try {
    const alive = process.kill(child.pid, 0);
    if (!alive) console.error('[main:dev] ⚠ Electron exited early — check electron-debug.log');
  } catch { console.error('[main:dev] ⚠ Electron exited early — check electron-debug.log'); }
}, 2000);
