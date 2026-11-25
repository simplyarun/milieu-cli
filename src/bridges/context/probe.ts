import type { Check, HttpResponse, ScanContext } from "../../core/types.js";
import { collectOperations, swaggerBasePath, type OasOperation, type ParsedOpenApiSpec } from "../schema/oas-types.js";
import { operationParameters, resolvePathItem, resolveRequestBody } from "../schema/schema-sources.js";

export interface Probe {
  probeUrl: string;
  method: "GET";
  probeSource: "operation" | "protected_operation" | "fallback";
}

type Spec = ParsedOpenApiSpec & { servers?: unknown };

/** OpenAPI resolves server URLs against the document which defined them. */
function serverBase(spec: Spec, servers: unknown, origin: string, documentUrl?: string): string | null {
  const document = documentUrl ? URL.parse(documentUrl) : null;
  if (spec.swagger === "2.0") {
    if (spec.host === undefined && document && document.origin !== origin) return null;
    return swaggerBasePath(spec, origin);
  }
  if (servers !== undefined && !Array.isArray(servers)) return null;
  for (const server of servers?.length ? servers : [{ url: "/" }]) {
    if (typeof server?.url !== "string" || server.url.length > 8192) continue;
    const raw: string = server.url.replace(/\{([^{}]+)\}/g, (token: string, name: string) => {
      const value = server.variables && Object.hasOwn(server.variables, name) ? server.variables[name]?.default : undefined;
      return typeof value === "string" && value.length <= 255 ? value : token;
    });
    if (!raw || raw.length > 8192 || /[{}?#\\\s]/.test(raw) || (!document && !/^(?:\/|https?:\/\/)/i.test(raw))) continue;
    const url = URL.parse(raw, document?.href ?? origin);
    if (url?.origin === origin && !url.username && !url.password) return url.pathname.replace(/\/$/, "");
  }
  return null;
}

/** Prefer explicit operation security to inherited security for an auth sample. */
export function selectProbe(ctx: ScanContext, purpose: "rate" | "auth"): Probe {
  const spec = ctx.shared.openApiSpec as Spec | undefined;
  const documentUrl = (ctx.shared.openApiCheck as Check | undefined)?.data?.documentUrl;
  const fallback: Probe = { method: "GET", probeSource: "fallback", probeUrl: ctx.baseUrl + "/api" };
  if (!spec) return fallback;
  let inherited: Probe | undefined;
  for (const [path, method, op] of collectOperations(spec)) {
    if (method !== "get" || /[{}?#\s]/.test(path)) continue;
    const item = resolvePathItem(spec, path);
    if (!item) continue;
    if ([item.parameters, op.parameters].some(value => value !== undefined &&
        (!Array.isArray(value) || value.some(p => !p || typeof p !== "object" || Array.isArray(p))))) continue;
    if (operationParameters(spec, path, op).some(p => !p.name || !p.in || p.required || p.$ref || p.in === "path")) continue;
    if (op.requestBody && spec.swagger !== "2.0") {
      const body = resolveRequestBody(spec, op);
      if (!body || body.required) continue;
    }
    const operation = op as OasOperation & { servers?: unknown };
    const servers = operation.servers !== undefined ? operation.servers
      : item.servers !== undefined ? item.servers : spec.servers;
    const base = serverBase(spec, servers, ctx.baseUrl, typeof documentUrl === "string" ? documentUrl : undefined);
    if (base === null) continue;
    const url = new URL(ctx.baseUrl + base + path);
    if (url.origin !== ctx.baseUrl || url.pathname !== base + path) continue;
    if (purpose === "rate") return { method: "GET", probeSource: "operation", probeUrl: url.href };
    const security = op.security === undefined ? spec.security : op.security;
    if (!Array.isArray(security) || !security.length ||
        !security.every(s => s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length > 0)) continue;
    const candidate: Probe = { method: "GET", probeSource: "protected_operation", probeUrl: url.href };
    if (op.security !== undefined) return candidate;
    inherited ??= candidate;
  }
  return inherited ?? fallback;
}

export function observeProbe(probe: Probe, result: HttpResponse) {
  const httpStatus = result.ok ? result.status : result.response?.status ?? result.error.statusCode ?? null;
  const final = httpStatus !== null ? URL.parse(result.ok ? result.url : result.error.url) : null;
  const responseUrl = final && ["http:", "https:"].includes(final.protocol) ? final.origin + final.pathname : undefined;
  const hasQuery = final?.href.split("#", 1)[0].includes("?") === true;
  const data = { ...probe, httpStatus, ...(responseUrl && { responseUrl }), ...(hasQuery && { responseHasQuery: true }) };
  const response = result.ok ? result : result.response;
  const incomplete = response && (httpStatus === 206 || response.headers["content-range"] !== undefined ||
    ("bodyIncomplete" in response && response.bodyIncomplete === true));
  const contentType = response?.headers["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
  const sample = response?.body.trimStart().slice(0, 512) ?? "";
  const html = contentType === "text/html" || contentType === "application/xhtml+xml" || /^<(?:!doctype\s+html|html|head|body)\b/i.test(sample);
  let json = false;
  if (probe.probeSource === "fallback" && response && !html && /^[{\[]/.test(sample) &&
      (!contentType || contentType === "application/json" || contentType.endsWith("+json"))) {
    try { JSON.parse(response.body); json = true; } catch { /* A truncated or invalid body cannot establish an API fallback. */ }
  }
  const authChallenge = (httpStatus === 401 || httpStatus === 403) && Boolean(response?.headers["www-authenticate"]);
  const sameResource = responseUrl === probe.probeUrl && !hasQuery && !final?.username && !final?.password;
  const attributable = sameResource && !incomplete && httpStatus !== null && (httpStatus < 300 || httpStatus >= 400) &&
    (probe.probeSource !== "fallback" || (!html && (json || authChallenge)));
  return { data, response, html, attributable };
}
