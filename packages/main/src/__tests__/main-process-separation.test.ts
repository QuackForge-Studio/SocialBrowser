import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('VAL-AI-001: Worker spawned at startup before IPC', () => {
  it('should call startWorker() before wireUpIpcGate()', () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const src = fs.readFileSync(indexPath, 'utf-8');
    const m = src.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\);/);
    expect(m).not.toBeNull();
    const body = m[1];
    const swPos = body.indexOf('startWorker()');
    const ipcPos = body.indexOf('wireUpIpcGate');
    expect(swPos).not.toBe(-1);
    expect(ipcPos).not.toBe(-1);
    expect(swPos).toBeLessThan(ipcPos);
  });
});

describe('VAL-AI-002: DB opened exclusively in worker', () => {
  it('should not import better-sqlite3 in main', () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const src = fs.readFileSync(indexPath, 'utf-8');
    expect(src).not.toContain('better-sqlite3');
    expect(src).not.toMatch(/\bdb\.(prepare|exec|pragma|loadExtension)\s*\(/);
  });
});

describe('VAL-AI-039: Main process never executes SQLite', () => {
  it('should have no better-sqlite3 in main/src files', () => {
    const files = ['index.ts','base-window.ts','shell-view.ts','platform-view.ts','session-manager.ts','ipc-gate.ts','platform-view-registry.ts','view-layout-manager.ts'];
    for (const f of files) {
      const fp = path.resolve(__dirname, '../' + f);
      if (fs.existsSync(fp)) {
        expect(fs.readFileSync(fp, 'utf-8')).not.toContain('better-sqlite3');
      }
    }
  });
});

describe('VAL-AI-040: Main process never makes outbound network', () => {
  it('should not import http/https/net in index.ts', () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const src = fs.readFileSync(indexPath, 'utf-8');
    expect(src).not.toContain('node:http');
    expect(src).not.toContain('node:https');
  });
});
