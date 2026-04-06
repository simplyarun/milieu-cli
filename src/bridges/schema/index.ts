import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { checkOperationIds } from "./operation-ids.js";
import { checkSchemaTypes } from "./schema-types.js";
import { checkErrorSchemas } from "./error-schemas.js";
import { checkRequiredFields } from "./required-fields.js";
import { checkDescriptions } from "./descriptions.js";
import { checkErrorFormat } from "./error-format.js";

const NO_SPEC_MESSAGE =
  "No OpenAPI spec was detected in Bridge 2 — schema structure cannot be evaluated.";

/**
 * Calculate Bridge 4 score from check results.
 * Same formula as Bridges 1-2: pass=1, partial=0.5, fail/error=0.
 * Thresholds: ≥80=pass, ≥40=partial, <40=fail
 */
function calculateScore(checks: Check[]): {
  score: number;
  scoreLabel: "pass" | "partial" | "fail";
} {
  let points = 0;
  let maxPoints = 0;

  for (const check of checks) {
    maxPoints += 1;
    if (check.status === "pass") points += 1;
    else if (check.status === "partial") points += 0.5;
  }

  const score = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  const scoreLabel =
    score >= 80 ? "pass" : score >= 40 ? "partial" : "fail";
  return { score, scoreLabel };
}

/**
 * Create a fail check for when no OpenAPI spec is available.
 */
function noSpecCheck(id: string, label: string): Check {
  return {
    id,
    label,
    status: "fail",
    detail: NO_SPEC_MESSAGE,
  };
}

/**
 * Run Bridge 4: Schema.
 *
 * Analyzes OpenAPI spec quality from an agent's perspective.
 * 5 static checks operate on ctx.shared.openApiSpec.
 * 1 live HTTP check (error format) runs regardless of spec presence.
 */
export async function runSchemaBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  const hasSpec =
    ctx.shared.openApiDetected === true && ctx.shared.openApiSpec != null;
  const spec = hasSpec
    ? (ctx.shared.openApiSpec as ParsedOpenApiSpec)
    : undefined;

  // Static checks — use spec or produce "no spec" fail
  const oasChecks: Check[] = hasSpec
    ? [
        checkOperationIds(spec),
        checkSchemaTypes(spec),
        checkErrorSchemas(spec),
        checkRequiredFields(spec),
        checkDescriptions(spec),
      ]
    : [
        noSpecCheck("schema_operation_ids", "Operation IDs"),
        noSpecCheck("schema_types_defined", "Schema Types"),
        noSpecCheck("schema_error_responses", "Error Response Schemas"),
        noSpecCheck("schema_required_fields", "Required Fields"),
        noSpecCheck("schema_descriptions", "Field Descriptions"),
      ];

  // Live check — runs regardless of spec presence
  const errorFormatCheck = await checkErrorFormat(ctx);

  const checks = [...oasChecks, errorFormatCheck];
  const { score, scoreLabel } = calculateScore(checks);

  return {
    id: 4,
    name: "Schema",
    status: "evaluated",
    score,
    scoreLabel,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
