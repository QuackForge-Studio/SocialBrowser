/**
 * BrowserProfile Model
 *
 * Represents an isolated multi-login browser profile entity.
 * Each BrowserProfile owns its own persistent storage partition, cookies,
 * cache, proxy configuration, user-agent settings, and open tabs.
 */

export interface BrowserProfile {
  /** Unique profile UUID */
  id: string;
  /** Display name (e.g., "QuackForge Main", "Personal", "Client A") */
  name: string;
  /** Accent color hex or Tailwind class for UI distinction */
  color: string;
  /** Icon identifier or emoji */
  icon: string;
  /** Group / Workspace assignment */
  groupId: string;
  /** Electron session partition (persist:social-browser:profile:<id>) */
  partition: string;
  /** Optional proxy server URL (http://user:pass@host:port) */
  proxyUrl?: string;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Preferred browser language / locale */
  locale?: string;
  /** Preferred timezone offset or name */
  timezone?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last opened timestamp */
  lastOpenedAt: number;
}

/**
 * Utility to generate canonical session partition string for a BrowserProfile.
 */
export function buildProfilePartition(profileId: string): string {
  return `persist:social-browser:profile:${profileId}`;
}
