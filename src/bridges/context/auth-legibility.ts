import type { Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import { observeProbe, selectProbe, type Probe } from "./probe.js";

const DOCS_URL_KEYS = ["docs_url", "documentation_url", "help_url", "docs", "documentation", "help", "more_info"];

const id = "context_auth_legibility";
const label = "Auth Legibility";

/** Grade how well a 401/403 rejection guides an unauthenticated agent. */
function gradeRejection(
  response: { status: number; headers: Record<string, string>; body: string },
  probe: Probe,
): Check {
  const signals: string[] = [];
  const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (response.headers["www-authenticate"]) signals.push("www-authenticate");
  if (contentType === "application/json" || contentType === "application/problem+json") {
    try {
      const parsed: unknown = JSON.parse(response.body);
      if (parsed !== null && typeof parsed === "object") {
        signals.push("json_error_body");
        const hasDocsUrl = Object.entries(parsed).some(([key, value]) => {
          if (!DOCS_URL_KEYS.includes(key.toLowerCase()) || typeof value !== "string") return false;
          const url = URL.parse(value);
          return url?.protocol === "http:" || url?.protocol === "https:";
        });
        if (hasDocsUrl) signals.push("docs_url");
      }
    } catch { /* Invalid JSON supplies no structured error evidence. */ }
  }
  const data = { ...probe, measurement: "challenged", httpStatus: response.status, signals };
  if (signals.length >= 3) return { id, label, status: "pass", detail: `API guides unauthenticated agents toward auth: ${signals.join(", ")}`, data };
  if (signals.length >= 1) return { id, label, status: "partial", detail: `API rejects with some guidance (${signals.join(", ")}) but missing: ${["www-authenticate", "json_error_body", "docs_url"].filter((s) => !signals.includes(s)).join(", ")}`, data };
  return { id, label, status: "fail", detail: "API returns opaque rejection with no guidance for agents", data };
}

export async function checkAuthLegibility(ctx: ScanContext): Promise<Check> {
  const selected = selectProbe(ctx, "auth");
  const probeTimeout = Math.min(ctx.options.timeout ?? 10000, 5000);
  const result = await httpGet(selected.probeUrl, { timeout: probeTimeout });
  const { data: probe, attributable, html } = observeProbe(selected, result);
  const { httpStatus } = probe;

  if (!result.ok && attributable && result.error.kind === "http_error" &&
      result.response && (httpStatus === 401 || httpStatus === 403)) {
    return gradeRejection(result.response, probe);
  }
  if (result.ok && attributable && !html) {
    return {
      id, label, status: "partial", detail: `Auth probe returned HTTP ${httpStatus} without an authentication challenge`,
      data: { ...probe, measurement: "no_challenge", signals: ["no_auth_required"] },
    };
  }
  return {
    id, label, status: "error",
    detail: `Could not measure authentication guidance for the selected GET (${httpStatus === null ? "no HTTP response" : `HTTP ${httpStatus}`})`,
    data: { ...probe, ...(!result.ok && { errorKind: result.error.kind }), measurement: "unmeasured", signals: [] },
  };
}
