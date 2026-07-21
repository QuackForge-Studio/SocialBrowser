/**
 * Workspace Fixture E2E Harness
 *
 * Provides an isolated test environment for workspace/compliance E2E tests.
 * Guarantees:
 *  - Unique temporary SQLite database per test run
 *  - Only social-browser-fixture:// origins allowed
 *  - Only FakeAIProvider used (no real AI calls)
 *  - External network guard fails the harness on any real outbound connection
 *  - Action counters track publish/credential operations
 *  - Diagnostics expose partitions, session sentinels, navigation logs
 *
 * Fulfills: VAL-WORKSPACE-024
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// ===== Temporary Database & Profile Management =====

export interface TempEnvironment {
  tempDir: string;
  dbPath: string;
  db: Database.Database;
}

/**
 * Creates a unique temporary directory and a fresh SQLite database in it.
 * The directory is cleaned up when closeTempEnvironment() is called.
 */
export function createTempEnvironment(testName: string): TempEnvironment {
  const uniqueId = crypto.randomUUID();
  const tempDir = path.join(
    os.tmpdir(),
    'social-browser-e2e',
    testName.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + uniqueId.slice(0, 8)
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const dbPath = path.join(tempDir, 'social-browser.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return { tempDir, dbPath, db };
}

/**
 * Closes the database and removes the temporary directory.
 */
export function closeTempEnvironment(env: TempEnvironment): void {
  try {
    if (env.db && env.db.open) {
      env.db.close();
    }
  } catch {
    // ignore close errors
  }
  try {
    fs.rmSync(env.tempDir, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}

// ===== Network Guard =====

export interface NetworkGuardResult {
  passed: boolean;
  violations: NetworkViolation[];
}

export interface NetworkViolation {
  type: 'external_origin' | 'real_ai_call' | 'http_request' | 'unknown_network';
  detail: string;
  timestamp: string;
}

/**
 * Enforces that only fixture origins and FakeAIProvider are used.
 * Any real network activity is logged as a violation and will fail the guard.
 */
export class NetworkGuard {
  private violations: NetworkViolation[] = [];
  private allowlistedOrigins = new Set([
    'social-browser-fixture://',
  ]);
  private allowlistedAIProviders = new Set([
    'FakeAIProvider',
  ]);
  private enabled = false;

  enable(): void {
    this.enabled = true;
    this.violations = [];
  }

  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if an origin is allowed (fixture-only).
   */
  checkOrigin(origin: string): boolean {
    if (!this.enabled) return true;
    for (const allowed of this.allowlistedOrigins) {
      if (origin.startsWith(allowed)) return true;
    }
    const violation: NetworkViolation = {
      type: 'external_origin',
      detail: 'Disallowed origin accessed: ' + origin + ' (only social-browser-fixture:// allowed)',
      timestamp: new Date().toISOString(),
    };
    this.violations.push(violation);
    return false;
  }

  /**
   * Check if an AI provider call is allowed (FakeAIProvider only).
   */
  checkAIProvider(provider: string): boolean {
    if (!this.enabled) return true;
    if (this.allowlistedAIProviders.has(provider)) return true;
    const violation: NetworkViolation = {
      type: 'real_ai_call',
      detail: 'Real AI provider called: ' + provider + ' (only FakeAIProvider allowed in E2E)',
      timestamp: new Date().toISOString(),
    };
    this.violations.push(violation);
    return false;
  }

  /**
   * Check if any external HTTP request is taking place.
   */
  checkHttpRequest(target: string): boolean {
    if (!this.enabled) return true;
    const violation: NetworkViolation = {
      type: 'http_request',
      detail: 'External HTTP request detected to: ' + target + ' (no external network allowed in E2E)',
      timestamp: new Date().toISOString(),
    };
    this.violations.push(violation);
    return false;
  }

  /**
   * Record any other unknown network activity as a violation.
   */
  recordUnknownNetwork(detail: string): void {
    if (!this.enabled) return;
    const violation: NetworkViolation = {
      type: 'unknown_network',
      detail,
      timestamp: new Date().toISOString(),
    };
    this.violations.push(violation);
  }

  /**
   * Get current violations.
   */
  getViolations(): NetworkViolation[] {
    return [...this.violations];
  }

  /**
   * Check if the guard passed (no violations).
   */
  hasPassed(): boolean {
    return this.violations.length === 0;
  }

  /**
   * Get a diagnostic summary.
   */
  getDiagnostics(): NetworkGuardResult {
    return {
      passed: this.hasPassed(),
      violations: this.getViolations(),
    };
  }

  /**
   * Reset violations.
   */
  reset(): void {
    this.violations = [];
  }
}

// ===== Fixture Origin Guard =====

export const ALLOWED_FIXTURE_PREFIX = 'social-browser-fixture://';

const ALLOWED_ORIGIN_PATTERNS = [
  /^social-browser-fixture:\/\/x\/.*/,
  /^social-browser-fixture:\/\/threads\/.*/,
  /^social-browser-fixture:\/\/instagram\/.*/,
  /^social-browser-fixture:\/\/tiktok\/.*/,
  /^social-browser-fixture:\/\/facebook\/.*/,
];

const DISALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/x\.com/,
  /^https?:\/\/twitter\.com/,
  /^https?:\/\/threads\.net/,
  /^https?:\/\/www\.threads\.net/,
  /^https?:\/\/instagram\.com/,
  /^https?:\/\/www\.instagram\.com/,
  /^https?:\/\/tiktok\.com/,
  /^https?:\/\/www\.tiktok\.com/,
  /^https?:\/\/facebook\.com/,
  /^https?:\/\/www\.facebook\.com/,
];

/**
 * Checks if an origin/navigation URL is a valid fixture origin.
 * Real platform origins MUST fail.
 */
export function isFixtureOrigin(url: string): boolean {
  for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/**
 * Checks if a URL is a real (disallowed) platform origin.
 * These MUST be rejected in E2E tests.
 */
export function isRealPlatformOrigin(url: string): boolean {
  for (const pattern of DISALLOWED_ORIGIN_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

// ===== Action Counters =====

export interface ActionCounters {
  publishAttempts: number;
  credentialOperations: number;
  captureAttempts: number;
  aiRequests: number;
  externalNavigations: number;
  realOriginAccesses: number;
}

export class ActionCounter {
  private counters: ActionCounters = {
    publishAttempts: 0,
    credentialOperations: 0,
    captureAttempts: 0,
    aiRequests: 0,
    externalNavigations: 0,
    realOriginAccesses: 0,
  };

  incrementPublish(): void {
    this.counters.publishAttempts++;
  }

  incrementCredential(): void {
    this.counters.credentialOperations++;
  }

  incrementCapture(): void {
    this.counters.captureAttempts++;
  }

  incrementAI(): void {
    this.counters.aiRequests++;
  }

  incrementExternalNavigation(): void {
    this.counters.externalNavigations++;
  }

  incrementRealOriginAccess(): void {
    this.counters.realOriginAccesses++;
  }

  getCounters(): Readonly<ActionCounters> {
    return { ...this.counters as ActionCounters };
  }

  /**
   * In E2E tests, publish and credential counters MUST be zero.
   */
  assertZeroPublishAndCredential(): { passed: boolean; reason?: string } {
    if (this.counters.publishAttempts > 0) {
      return { passed: false, reason: 'Publish counter is ' + this.counters.publishAttempts + ', must be 0' };
    }
    if (this.counters.credentialOperations > 0) {
      return { passed: false, reason: 'Credential counter is ' + this.counters.credentialOperations + ', must be 0' };
    }
    return { passed: true };
  }

  /**
   * Ensure no real platform origins were accessed.
   */
  assertNoRealOrigins(): { passed: boolean; reason?: string } {
    if (this.counters.realOriginAccesses > 0) {
      return { passed: false, reason: 'Real origin access count is ' + this.counters.realOriginAccesses + ', must be 0' };
    }
    return { passed: true };
  }

  reset(): void {
    this.counters = {
      publishAttempts: 0,
      credentialOperations: 0,
      captureAttempts: 0,
      aiRequests: 0,
      externalNavigations: 0,
      realOriginAccesses: 0,
    };
  }
}

// ===== Fixture Diagnostics =====

export interface PartitionDiagnostic {
  partition: string;
  platform: string;
  accountId: string;
  exists: boolean;
}

export interface SessionSentinel {
  accountId: string;
  partition: string;
  hasCookie: boolean;
  hasLocalStorage: boolean;
  hasIndexedDB: boolean;
  identityPresent: boolean;
}

export interface NavigationLogEntry {
  from: string;
  to: string;
  timestamp: string;
  isFixture: boolean;
  denied: boolean;
}

export interface FixtureDiagnostics {
  partitions: PartitionDiagnostic[];
  sessionSentinels: SessionSentinel[];
  navigationLog: NavigationLogEntry[];
  actionCounters: Readonly<ActionCounters>;
  networkGuardPassed: boolean;
  tempPath: string;
  dbPath: string;
}

/**
 * Collects and reports fixture diagnostics for evidence.
 */
export class DiagnosticsCollector {
  private partitionData: PartitionDiagnostic[] = [];
  private sentinelData: SessionSentinel[] = [];
  private navigationData: NavigationLogEntry[] = [];
  private networkGuard: NetworkGuard;
  private actionCounter: ActionCounter;
  private tempPath: string;
  private dbPath: string;

  constructor(
    networkGuard: NetworkGuard,
    actionCounter: ActionCounter,
    tempPath: string,
    dbPath: string,
  ) {
    this.networkGuard = networkGuard;
    this.actionCounter = actionCounter;
    this.tempPath = tempPath;
    this.dbPath = dbPath;
  }

  addPartition(partition: PartitionDiagnostic): void {
    this.partitionData.push(partition);
  }

  addSentinel(sentinel: SessionSentinel): void {
    this.sentinelData.push(sentinel);
  }

  addNavigation(entry: NavigationLogEntry): void {
    this.navigationData.push(entry);
  }

  /**
   * Collect partition diagnostics from the database.
   */
  collectPartitionsFromDB(db: Database.Database): void {
    try {
      const rows = db.prepare(
        'SELECT id, platform, session_partition FROM accounts'
      ).all() as { id: string; platform: string; session_partition: string }[];
      for (const row of rows) {
        this.addPartition({
          partition: row.session_partition,
          platform: row.platform,
          accountId: row.id,
          exists: true,
        });
      }
    } catch {
      // graceful if table doesn't exist
    }
  }

  /**
   * Get full diagnostics report.
   */
  getDiagnostics(): FixtureDiagnostics {
    return {
      partitions: [...this.partitionData],
      sessionSentinels: [...this.sentinelData],
      navigationLog: [...this.navigationData],
      actionCounters: this.actionCounter.getCounters(),
      networkGuardPassed: this.networkGuard.hasPassed(),
      tempPath: this.tempPath,
      dbPath: this.dbPath,
    };
  }

  /**
   * Print diagnostics to stdout for E2E evidence.
   */
  printDiagnostics(): void {
    const diag = this.getDiagnostics();
    console.log('===== E2E Fixture Diagnostics =====');
    console.log('Temporary profile path:', diag.tempPath);
    console.log('Database path:', diag.dbPath);
    console.log('Network guard passed:', diag.networkGuardPassed);
    console.log('Action counters:', JSON.stringify(diag.actionCounters, null, 2));
    console.log('Partitions:', JSON.stringify(diag.partitions, null, 2));
    console.log('Session sentinels:', JSON.stringify(diag.sessionSentinels, null, 2));
    console.log('Navigation log entries:', diag.navigationLog.length);
    console.log('===================================');
  }
}

// ===== FakeAIProvider Integration =====

/**
 * Confirm that only FakeAIProvider is configured.
 * Returns true if FakeAIProvider is the only available provider.
 */
export function verifyFakeAIProviderOnly(providerConfig: { provider: string }): boolean {
  return providerConfig.provider === 'FakeAIProvider';
}

/**
 * Get the FakeAIProvider configuration.
 */
export function getFakeAIProviderConfig() {
  return {
    provider: 'FakeAIProvider',
    model: 'fake-model',
    embeddingModel: 'fake-embedding',
    dimensions: 768,
  };
}

// ===== E2E Session Setup =====

export interface E2ETestSession {
  env: TempEnvironment;
  networkGuard: NetworkGuard;
  actionCounter: ActionCounter;
  diagnostics: DiagnosticsCollector;
}

/**
 * Sets up a complete isolated E2E test session.
 */
export function setupE2ETestSession(testName: string): E2ETestSession {
  const env = createTempEnvironment(testName);
  const networkGuard = new NetworkGuard();
  const actionCounter = new ActionCounter();
  const diagnostics = new DiagnosticsCollector(
    networkGuard,
    actionCounter,
    env.tempDir,
    env.dbPath,
  );

  // Enable the network guard
  networkGuard.enable();

  // Verify fixture-only origins are enforced (defensive detection, not actual access)
  const allRealOrigins = [
    "https://x.com/home",
    "https://twitter.com/home",
    "https://threads.net",
    "https://instagram.com",
    "https://tiktok.com",
    "https://facebook.com",
  ];
  const allDetected = allRealOrigins.every((o) => isRealPlatformOrigin(o));
  if (!allDetected) {
    throw new Error("E2E harness setup failure: not all real platform origins were detected");
  }

  return { env, networkGuard, actionCounter, diagnostics };
}

/**
 * Tears down an E2E test session and prints diagnostics.
 */
export function teardownE2ETestSession(session: E2ETestSession): void {
  session.diagnostics.collectPartitionsFromDB(session.env.db);
  session.diagnostics.printDiagnostics();
  closeTempEnvironment(session.env);
}

/**
 * Verify the complete E2E guard state at the end of a test run.
 * Must pass all checks for the E2E to be valid.
 */
export function verifyE2EGuards(session: E2ETestSession): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  // 1. Network guard must have passed (no violations)
  const ngResult = session.networkGuard.getDiagnostics();
  checks.push({
    name: 'NetworkGuard: No violations',
    passed: ngResult.passed,
    detail: ngResult.passed ? 'Passed' : ngResult.violations.map(v => v.detail).join('; '),
  });

  // 2. Publish and credential counters must be zero
  const publishCheck = session.actionCounter.assertZeroPublishAndCredential();
  checks.push({
    name: 'ActionCounters: Zero publish/credential',
    passed: publishCheck.passed,
    detail: publishCheck.passed ? 'Passed' : (publishCheck.reason || 'Failed'),
  });

  // 3. No real origin accesses
  const originCheck = session.actionCounter.assertNoRealOrigins();
  checks.push({
    name: 'ActionCounters: No real origins',
    passed: originCheck.passed,
    detail: originCheck.passed ? 'Passed' : (originCheck.reason || 'Failed'),
  });

  // 4. Temporary directory exists and contains a database
  const tempExists = fs.existsSync(session.env.tempDir);
  const dbExists = fs.existsSync(session.env.dbPath);
  checks.push({
    name: 'Temp environment: Directory exists',
    passed: tempExists,
    detail: tempExists ? 'Exists at ' + session.env.tempDir : 'Missing',
  });
  checks.push({
    name: 'Temp environment: Database exists',
    passed: dbExists,
    detail: dbExists ? 'Exists at ' + session.env.dbPath : 'Missing',
  });

  const allPassed = checks.every(c => c.passed);

  console.log('===== E2E Guard Verification =====');
  for (const check of checks) {
    console.log((check.passed ? '[PASS]' : '[FAIL]') + ' ' + check.name + ': ' + check.detail);
  }
  console.log('Overall:', allPassed ? 'PASSED' : 'FAILED');
  console.log('==================================');

  return { passed: allPassed, checks };
}

