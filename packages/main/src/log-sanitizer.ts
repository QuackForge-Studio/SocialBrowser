/**
 * Makes console.error, console.warn, and console.log safe against EPIPE errors.
 * This prevents crashes when the main process tries to write to stdout/stderr
 * after the parent process (terminal/shell) has closed the pipe.
 */
export function installConsoleGuard(): void {
  const EPIPE_IGNORE = ["EPIPE", "ERR_STREAM_DESTROYED"];

  const handlers: Array<"stdout" | "stderr"> = ["stdout", "stderr"];
  for (const streamName of handlers) {
    const stream = process[streamName];
    if (!stream || !("on" in stream)) continue;
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err?.code && EPIPE_IGNORE.includes(err.code)) return;
      // For non-EPIPE errors, silently ignore since console may also be broken
    });
  }
}

/**
 * Log sanitizer — prevents sensitive data from appearing in log output.
 *
 * API keys, tokens, and credentials must never appear in logs.
 * This utility provides a function to sanitize strings before logging.
 */

// Matches common API key patterns:
// - "sk-..." (OpenAI)
// - Any string containing "api_key", "apikey", "api-key" followed by a value
// - Authorization header values
// - Bearer tokens
// - Long alphanumeric strings that resemble keys (>40 chars)
const SENSITIVE_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/g,                                          // OpenAI keys (sk-...)
  /(api[_-]?key|apikey)[=:"]\s*[A-Za-z0-9_-]{8,}/gi,             // api_key=<value>
  /(Authorization|Bearer)\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{20,}/gi,  // Bearer tokens
  /(Bearer\s+|token\s*[:=]\s*)[A-Za-z0-9._~+/-]{20,}/gi,         // Bearer <token>
  /[A-Za-z0-9_@-]{40,}/g,                                         // Any 40+ char alphanumeric string
];

const REDACTED = "[REDACTED]";

/**
 * Sanitize a string by replacing all sensitive patterns with [REDACTED].
 *
 * @param input - The string to sanitize
 * @returns The sanitized string with sensitive data replaced
 */
export function sanitizeLog(input: string): string {
  if (!input) return input;
  let sanitized = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }
  return sanitized;
}

/**
 * Create a sanitized wrapper around console.log/console.warn/console.error.
 * Returns an object with sanitized log methods.
 */
export function createSanitizedLogger(prefix?: string) {
  const pfx = prefix ? `[${prefix}] ` : "";
  return {
    log: (...args: unknown[]) => {
      const sanitized = args.map((a) => sanitizeLog(String(a)));
      console.log(pfx + sanitized.join(" "));
    },
    warn: (...args: unknown[]) => {
      const sanitized = args.map((a) => sanitizeLog(String(a)));
      console.warn(pfx + sanitized.join(" "));
    },
    error: (...args: unknown[]) => {
      const sanitized = args.map((a) => sanitizeLog(String(a)));
      console.error(pfx + sanitized.join(" "));
    },
  };
}