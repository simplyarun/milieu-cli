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

/**
 * Check for ai-plugin.json at /.well-known/ai-plugin.json.
 *
 * Validates required fields: schema_version (string), name_for_human (string), api (object).
 * Returns pass if all present, partial if JSON but missing fields, fail if missing.
 */
export async function checkAiPlugin(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "ai_plugin";
  const label = "ai-plugin.json";

  const result = await httpGet(`${baseUrl}/.well-known/ai-plugin.json`, {
    timeout,
    headers: { Accept: "application/json" },
  });

  if (!result.ok) {
    return { id, label, status: "fail", detail: "No ai-plugin.json found" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.body) as Record<string, unknown>;
  } catch {
    return { id, label, status: "fail", detail: "No ai-plugin.json found" };
  }

  if (
    typeof parsed.schema_version === "string" &&
    typeof parsed.name_for_human === "string" &&
    typeof parsed.api === "object" &&
    parsed.api !== null
  ) {
    return {
      id,
      label,
      status: "pass",
      detail: `ai-plugin.json found: ${parsed.name_for_human}`,
      data: {
        nameForHuman: parsed.name_for_human,
        schemaVersion: parsed.schema_version,
      },
    };
  }

  return {
    id,
    label,
    status: "partial",
    detail: "ai-plugin.json found but missing required fields",
  };
}
