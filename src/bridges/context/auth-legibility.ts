import type { Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { collectOperations } from "../schema/oas-types.js";

const DOCS_URL_KEYS = ["docs_url", "documentation_url", "help_url", "docs", "documentation", "help", "more_info"];

function findProtectedGetPath(spec: ParsedOpenApiSpec | undefined): string | null {
  if (!spec) return null;
  const ops = collectOperations(spec);
  for (const [path, method, op] of ops) {
    if (method !== "get") continue;
    if (Array.isArray(op.security) && op.security.length > 0) return path;
  }
  if (Array.isArray(spec.security) && spec.security.length > 0) {
    for (const [path, method] of ops) {
      if (method === "get") return path;
    }
  }
  return null;
}

export async function checkAuthLegibility(ctx: ScanContext): Promise<Check> {
  const id = "context_auth_legibility";
  const label = "Auth Legibility";
  const spec = ctx.shared.openApiSpec as ParsedOpenApiSpec | undefined;
  const protectedPath = findProtectedGetPath(spec);
  const probeUrl = protectedPath ? `${ctx.baseUrl}${protectedPath}` : `${ctx.baseUrl}/api`;
  const probeTimeout = Math.min(ctx.options.timeout ?? 10000, 5000);
  const result = await httpGet(probeUrl, { timeout: probeTimeout });
  if (!result.ok) {
    return { id, label, status: "fail", detail: `Could not reach ${probeUrl} to test auth response quality`, data: { probeUrl, signals: [] } };
  }
  const status = result.status;
  if (status >= 200 && status < 300) {
    return { id, label, status: "partial", detail: "Endpoint does not require authentication — auth legibility could not be tested", data: { probeUrl, signals: ["no_auth_required"] } };
  }
  if (status === 401 || status === 403) {
    const signals: string[] = [];
    const contentType = (result.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (result.headers["www-authenticate"]) signals.push("www-authenticate");
    let isJson = false;
    if (contentType === "application/json" || contentType === "application/problem+json") {
      try { JSON.parse(result.body); isJson = true; signals.push("json_error_body"); } catch { /* invalid JSON */ }
    }
    if (isJson) {
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        const hasDocsUrl = Object.entries(parsed).some(([key, val]) => DOCS_URL_KEYS.includes(key.toLowerCase()) && typeof val === "string" && val.startsWith("http"));
        if (hasDocsUrl) signals.push("docs_url");
      } catch { /* already handled */ }
    }
    if (signals.length >= 3) return { id, label, status: "pass", detail: `API guides unauthenticated agents toward auth: ${signals.join(", ")}`, data: { probeUrl, signals } };
    if (signals.length >= 1) return { id, label, status: "partial", detail: `API rejects with some guidance (${signals.join(", ")}) but missing: ${["www-authenticate", "json_error_body", "docs_url"].filter((s) => !signals.includes(s)).join(", ")}`, data: { probeUrl, signals } };
    return { id, label, status: "fail", detail: "API returns opaque rejection with no guidance for agents", data: { probeUrl, signals: [] } };
  }
  return { id, label, status: "fail", detail: `Unexpected status ${status} — could not assess auth legibility`, data: { probeUrl, signals: [] } };
}
