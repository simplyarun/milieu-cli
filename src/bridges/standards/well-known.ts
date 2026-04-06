import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check for security.txt at /.well-known/security.txt.
 *
 * Per RFC 9116: must contain at least a Contact field.
 * Returns pass if Contact present, partial if file exists but no Contact, fail if missing.
 */
export async function checkSecurityTxt(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "security_txt";
  const label = "security.txt";

  const result = await httpGet(`${baseUrl}/.well-known/security.txt`, {
    timeout,
  });

  if (!result.ok || result.body.trim().length === 0) {
    return { id, label, status: "fail", detail: "No security.txt found" };
  }

  if (/^Contact:/mi.test(result.body)) {
    return {
      id,
      label,
      status: "pass",
      detail: "security.txt found with Contact field",
    };
  }

  return {
    id,
    label,
    status: "partial",
    detail: "security.txt found but missing Contact field",
  };
}

