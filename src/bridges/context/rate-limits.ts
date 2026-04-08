import type { Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { collectOperations } from "../schema/oas-types.js";

const RATE_LIMIT_HEADERS = ["ratelimit-limit", "x-ratelimit-limit", "x-rate-limit-limit"];
const RETRY_AFTER = "retry-after";

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

export async function checkRateLimitHeaders(ctx: ScanContext): Promise<Check> {
  const id = "context_rate_limit_headers";
  const label = "Rate Limit Headers";
  const spec = ctx.shared.openApiSpec as ParsedOpenApiSpec | undefined;
  const simplePath = findSimpleGetPath(spec);
  const probeUrl = simplePath ? `${ctx.baseUrl}${simplePath}` : `${ctx.baseUrl}/api`;
  const probeTimeout = Math.min(ctx.options.timeout ?? 10000, 5000);
  const result = await httpGet(probeUrl, { timeout: probeTimeout });
  if (!result.ok) {
    ctx.shared.contextProbeHeaders = {};
    return { id, label, status: "fail", detail: `Could not reach ${probeUrl} to check rate-limit headers`, data: { probeUrl, headerFound: null } };
  }
  ctx.shared.contextProbeHeaders = result.headers;
  for (const header of RATE_LIMIT_HEADERS) {
    const value = result.headers[header];
    if (value !== undefined) {
      return { id, label, status: "pass", detail: `Rate-limit header found: ${header}: ${value}`, data: { probeUrl, headerFound: header } };
    }
  }
  const retryAfter = result.headers[RETRY_AFTER];
  if (retryAfter !== undefined) {
    return { id, label, status: "partial", detail: `Only retry-after header found (no rate ceiling): ${retryAfter}`, data: { probeUrl, headerFound: RETRY_AFTER } };
  }
  return { id, label, status: "fail", detail: "No rate-limit headers found in response", data: { probeUrl, headerFound: null } };
}
