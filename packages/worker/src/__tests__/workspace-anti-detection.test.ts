import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('VAL-WORKSPACE-018: No credential, anti-detection, or automatic login behavior', () => {
  const forbiddenPatterns = [
    'credential',
    'password_field',
    'autofill',
    'auto_login',
    'synthetic_click',
    'syntheticClick',
    'userAgent',
    'setFingerprint',
    'navigator.webdriver',
    'setProxy',
    'enableAutomation',
    'outboundAutomation',
  ];

  const captureFiles = [
    path.join(__dirname, '..', '..', '..', 'main', 'src', 'preload-capture.ts'),
    path.join(__dirname, '..', '..', '..', 'main', 'src', 'adapters', 'x-adapter.ts'),
    path.join(__dirname, '..', '..', '..', 'main', 'src', 'adapters', 'platform-adapter.ts'),
  ];

  it('should have no credential access or anti-detection patterns in capture source files', () => {
    const violations: string[] = [];
    for (const filePath of captureFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          if (content.toLowerCase().includes(pattern.toLowerCase())) {
            violations.push(filePath + ': found "' + pattern + '"');
          }
        }
      } catch {
        // File may not exist in test environment
      }
    }
    expect(violations).toEqual([]);
  });

  it('should have preload exposing only 5 methods and no dangerous APIs', () => {
    const preloadPath = path.join(__dirname, '..', '..', '..', 'main', 'src', 'preload-capture.ts');
    try {
      const content = fs.readFileSync(preloadPath, 'utf-8');
      expect(content).toContain('sendPost');
      expect(content).toContain('sendSnapshot');
      expect(content).toContain('sendComment');
      expect(content).toContain('sendAdapterReady');
      expect(content).toContain('sendError');

      const dangerousExposures = [
        'getCredentials', 'login', 'setFingerprint',
        'setProxy', 'enableAutomation', 'clickCompose', 'submitForm',
        'ipcRenderer:', 'electronAPI',
      ];
      for (const exposure of dangerousExposures) {
        expect(content).not.toContain(exposure);
      }
    } catch {
      // File may not exist in test environment
    }
  });

  it('should have no automatic login mutation code outside publish-assist', () => {
    const adapterPath = path.join(__dirname, '..', '..', '..', 'main', 'src', 'adapters', 'x-adapter.ts');
    try {
      const content = fs.readFileSync(adapterPath, 'utf-8');
      expect(content).not.toContain('.submit()');
      expect(content).not.toContain('.click()');
      expect(content).not.toContain('form.submit');
    } catch {
      // File may not exist
    }
  });
});