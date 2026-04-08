import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { collectOperations } from "../schema/oas-types.js";

export function checkAuthClarity(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "context_auth_clarity";
  const label = "Auth Clarity";
  if (!spec) {
    return { id, label, status: "fail", detail: "No spec available — agents cannot discover how to authenticate without documented security schemes", data: { schemesCount: 0, withDescription: 0, securityApplied: false } };
  }
  const schemes: Record<string, { description?: string }> = spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};
  const entries = Object.entries(schemes);
  const schemesCount = entries.length;
  if (schemesCount === 0) {
    return { id, label, status: "fail", detail: "No security schemes defined in spec", data: { schemesCount: 0, withDescription: 0, securityApplied: false } };
  }
  const withDescription = entries.filter(([, s]) => typeof s.description === "string" && s.description.trim() !== "").length;
  const hasGlobalSecurity = Array.isArray(spec.security) && spec.security.length > 0;
  let hasPerOpSecurity = false;
  if (!hasGlobalSecurity) {
    const ops = collectOperations(spec);
    hasPerOpSecurity = ops.some(([, , op]) => Array.isArray(op.security) && op.security.length > 0);
  }
  const securityApplied = hasGlobalSecurity || hasPerOpSecurity;
  if (securityApplied && withDescription === schemesCount) {
    return { id, label, status: "pass", detail: `${schemesCount} auth schemes defined, all with descriptions, security applied`, data: { schemesCount, withDescription, securityApplied } };
  }
  if (securityApplied && withDescription < schemesCount) {
    return { id, label, status: "partial", detail: `${schemesCount} auth schemes defined but ${schemesCount - withDescription} lack descriptions`, data: { schemesCount, withDescription, securityApplied } };
  }
  return { id, label, status: "partial", detail: `${schemesCount} auth schemes defined but security not applied to operations`, data: { schemesCount, withDescription, securityApplied: false } };
}
