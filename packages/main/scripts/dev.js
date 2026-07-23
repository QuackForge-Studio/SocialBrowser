const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MAIN_DIR = path.join(ROOT, 'packages', 'main');

console.log('[main:dev] Building main process...');
execSync(`node "${path.join(ROOT, 'scripts', 'build-main.mjs')}"`, { stdio: 'inherit', cwd: ROOT });

console.log('[main:dev] Launching Electron...');
// Resolve the platform Electron binary
// Windows: electron.exe; macOS: Electron.app/Contents/MacOS/Electron; Linux: electron
const electronDir = path.join(ROOT, 'node_modules', 'electron', 'dist');
const electronExe = process.platform === 'win32'
  ? path.join(electronDir, 'electron.exe')
  : process.platform === 'darwin'
    ? path.join(electronDir, 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : path.join(electronDir, 'electron');

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
