const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MAIN_DIR = path.join(ROOT, 'packages', 'main');

console.log('[main:dev] Building main process...');
execSync(`node "${path.join(ROOT, 'scripts', 'build-main.mjs')}"`, { stdio: 'inherit', cwd: ROOT });

console.log('[main:dev] Launching Electron...');
const electronBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');

const child = spawn(electronBin, ['.'], {
  cwd: MAIN_DIR,
  detached: true,
  shell: true,
  stdio: 'ignore'
});
child.unref();

console.log(`[main:dev] Electron launched detached (PID: ${child.pid})`);
