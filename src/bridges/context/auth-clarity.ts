import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { collectOperations } from "../schema/oas-types.js";

/**
 * Check: context_auth_clarity
 *
 * Source: spec.components.securitySchemes (3.x) or spec.securityDefinitions (2.0)
 *
 * - No schemes defined → fail
 * - Schemes defined + applied (global or per-op) + all have descriptions → pass
 * - Schemes defined + applied but some lack descriptions → partial
 * - Schemes defined but never applied → partial
 */
export function checkAuthClarity(
  spec: ParsedOpenApiSpec | undefined,
): Check {
  const id = "context_auth_clarity";
  const label = "Auth Clarity";

  if (!spec) {
    return {
      id,
      label,
      status: "fail",
      detail: "No spec available to evaluate auth clarity",
      data: { schemesCount: 0, withDescription: 0, securityApplied: false },
    };
  }

  // Get security schemes (3.x or 2.0)
  const schemes: Record<string, { description?: string }> =
    spec.components?.securitySchemes ?? spec.securityDefinitions ?? {};

  const entries = Object.entries(schemes);
  const schemesCount = entries.length;

  if (schemesCount === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No security schemes defined in spec",
      data: { schemesCount: 0, withDescription: 0, securityApplied: false },
    };
  }

  const withDescription = entries.filter(
    ([, s]) =>
      typeof s.description === "string" && s.description.trim() !== "",
  ).length;

  // Check if security is applied (global or per-operation)
  const hasGlobalSecurity =
    Array.isArray(spec.security) && spec.security.length > 0;

  let hasPerOpSecurity = false;
  if (!hasGlobalSecurity) {
    const ops = collectOperations(spec);
    hasPerOpSecurity = ops.some(
      ([, , op]) => Array.isArray(op.security) && op.security.length > 0,
    );
  }

  const securityApplied = hasGlobalSecurity || hasPerOpSecurity;

  if (securityApplied && withDescription === schemesCount) {
    return {
      id,
      label,
      status: "pass",
      detail: `${schemesCount} auth schemes defined, all with descriptions, security applied`,
      data: { schemesCount, withDescription, securityApplied },
    };
  }

  if (securityApplied && withDescription < schemesCount) {
    return {
      id,
      label,
      status: "partial",
      detail: `${schemesCount} auth schemes defined but ${schemesCount - withDescription} lack descriptions`,
      data: { schemesCount, withDescription, securityApplied },
    };
  }

  // Schemes defined but not applied
  return {
    id,
    label,
    status: "partial",
    detail: `${schemesCount} auth schemes defined but security not applied to operations`,
    data: { schemesCount, withDescription, securityApplied: false },
  };
}
