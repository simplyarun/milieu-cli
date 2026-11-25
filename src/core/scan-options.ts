import type { ScanOptions } from "./types.js";

/** Node timers above this limit fire after 1 ms instead of the requested delay. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export function validateScanOptions(options: ScanOptions): string | undefined {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return "Scan options must be an object";
  }
  const { timeout, maxConcurrency, maxRequests } = options;
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MS)) {
    return `--timeout requires an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds`;
  }
  for (const [flag, value] of [["--max-concurrency", maxConcurrency], ["--max-requests", maxRequests]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      return `${flag} requires a positive safe integer`;
    }
  }
}
