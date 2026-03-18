import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

export interface HttpsCheckResult {
  check: Check;
  abort: boolean;
  abortReason?: string;
}

const ABORT_ERRORS = new Set(["dns", "connection_refused", "ssl_error"]);

/**
 * Check HTTPS availability via HEAD request to https://<domain>.
 *
 * Any response (even 4xx/5xx) means HTTPS works.
 * Abort-worthy errors: dns, connection_refused, ssl_error.
 */
export async function checkHttps(
  domain: string,
  timeout?: number,
): Promise<HttpsCheckResult> {
  const result = await httpGet("https://" + domain, {
    method: "HEAD",
    timeout,
  });

  if (result.ok) {
    return {
      check: {
        id: "https_available",
        label: "HTTPS Available",
        status: "pass",
        detail: "HTTPS connection successful",
      },
      abort: false,
    };
  }

  const { kind, message } = result.error;
  const abort = ABORT_ERRORS.has(kind);

  return {
    check: {
      id: "https_available",
      label: "HTTPS Available",
      status: "fail",
      detail: message,
    },
    abort,
    abortReason: abort ? kind : undefined,
  };
}
