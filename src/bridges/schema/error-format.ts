import type { Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";

/** Standard error response keys that indicate structured errors */
const ERROR_KEYS = new Set([
  "error",
  "message",
  "code",
  "errors",
  "detail",
]);

/**
 * Find the first GET operation with no required parameters.
 * Returns the path string, or null if none found.
 */
function findSimpleGetPath(spec: ParsedOpenApiSpec | undefined): string | null {
  if (!spec) return null;
  const ops = collectOperations(spec);

  for (const [path, method, op] of ops) {
    if (method !== "get") continue;
    const hasRequiredParams = op.parameters?.some((p) => p.required) ?? false;
    if (!hasRequiredParams) return path;
  }
  return null;
}

/**
 * Check: schema_consistent_error_format (1 live HTTP call)
 *
 * Verifies that the live API returns structured JSON on errors.
 * Even if the spec defines error schemas, the live API must actually return JSON errors.
 */
export async function checkErrorFormat(ctx: ScanContext): Promise<Check> {
  const id = "schema_consistent_error_format";
  const label = "Consistent Error Format";

  const spec = ctx.shared.openApiSpec as ParsedOpenApiSpec | undefined;
  const simplePath = findSimpleGetPath(spec);
  const probeUrl = simplePath
    ? `${ctx.baseUrl}${simplePath}`
    : `${ctx.baseUrl}/api`;

  const probeTimeout = Math.min(ctx.options.timeout ?? 10000, 5000);

  const result = await httpGet(probeUrl, {
    timeout: probeTimeout,
    headers: {
      Accept: "application/x-invalid-milieu-probe",
    },
  });

  if (!result.ok) {
    // HTTP failure (DNS, timeout, connection, etc.)
    return {
      id,
      label,
      status: "error",
      detail: `Could not probe ${probeUrl}: ${result.error.message}`,
      data: { probeUrl, probeStatus: null, contentType: null },
    };
  }

  const contentType = (result.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const probeStatus = result.status;

  // 2xx — probe unexpectedly succeeded
  if (probeStatus >= 200 && probeStatus < 300) {
    return {
      id,
      label,
      status: "partial",
      detail: "Probe request unexpectedly returned 2xx",
      data: { probeUrl, probeStatus, contentType },
    };
  }

  // 4xx response
  if (probeStatus >= 400 && probeStatus < 500) {
    if (contentType === "application/json") {
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        const hasStandardKeys = Object.keys(parsed).some((k) =>
          ERROR_KEYS.has(k.toLowerCase()),
        );

        if (hasStandardKeys) {
          return {
            id,
            label,
            status: "pass",
            detail: "API returns structured JSON errors with standard keys",
            data: { probeUrl, probeStatus, contentType },
          };
        }

        return {
          id,
          label,
          status: "partial",
          detail:
            "API returns JSON errors but without standard error/message/code keys",
          data: { probeUrl, probeStatus, contentType },
        };
      } catch {
        return {
          id,
          label,
          status: "fail",
          detail:
            "API returns application/json content-type but body is not valid JSON",
          data: { probeUrl, probeStatus, contentType },
        };
      }
    }

    // Non-JSON content type
    return {
      id,
      label,
      status: "fail",
      detail: `API returns non-JSON error response (${contentType || "no content-type"})`,
      data: { probeUrl, probeStatus, contentType },
    };
  }

  // Other status codes
  return {
    id,
    label,
    status: "fail",
    detail: `Unexpected status ${probeStatus} from error probe`,
    data: { probeUrl, probeStatus, contentType },
  };
}
