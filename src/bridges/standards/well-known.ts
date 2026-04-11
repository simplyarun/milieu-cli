import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

export interface SecurityTxtResult {
  check: Check;
  body: string | null;
}

/**
 * Check for security.txt at /.well-known/security.txt.
 *
 * Per RFC 9116: must contain at least a Contact field.
 * Returns pass if Contact present, partial if file exists but no Contact, fail if missing.
 */
export async function checkSecurityTxt(
  baseUrl: string,
  timeout?: number,
): Promise<SecurityTxtResult> {
  const id = "security_txt";
  const label = "security.txt";

  const result = await httpGet(`${baseUrl}/.well-known/security.txt`, {
    timeout,
  });

  if (!result.ok || result.body.trim().length === 0) {
    return { check: { id, label, status: "fail", detail: "No security.txt found" }, body: null };
  }

  // Reject soft 404s: servers returning HTML instead of the actual file
  const contentType = (result.headers["content-type"] ?? "").toLowerCase();
  if (contentType.includes("text/html")) {
    return { check: { id, label, status: "fail", detail: "No security.txt found (HTML response)" }, body: null };
  }

  if (/^Contact:/mi.test(result.body)) {
    return {
      check: { id, label, status: "pass", detail: "security.txt found with Contact field" },
      body: result.body,
    };
  }

  return {
    check: { id, label, status: "partial", detail: "security.txt found but missing Contact field" },
    body: result.body,
  };
}
