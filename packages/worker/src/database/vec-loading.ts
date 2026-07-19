/**
 * Helper module to resolve the sqlite-vec extension binary path.
 *
 * Uses the sqlite-vec npm package's getLoadablePath() to find the
 * platform-specific extension binary (vec0.dll on Windows).
 * Falls back gracefully if the package is not installed.
 */
export function getVecExtensionPath(): string | undefined {
  try {
    // Use the sqlite-vec package to resolve the platform-specific binary path
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteVec = require('sqlite-vec');
    if (typeof sqliteVec.getLoadablePath === 'function') {
      return sqliteVec.getLoadablePath();
    }
    return undefined;
  } catch {
    // sqlite-vec not installed or not accessible; return undefined
    return undefined;
  }
}
