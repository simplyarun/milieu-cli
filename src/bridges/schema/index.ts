import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { checkOperationIds } from "./operation-ids.js";
import { checkSchemaTypes } from "./schema-types.js";
import { checkErrorSchemas } from "./error-schemas.js";
import { checkRequiredFields } from "./required-fields.js";
import { checkDescriptions } from "./descriptions.js";

const NO_SPEC_MESSAGES: Record<string, string> = {
  schema_operation_ids: "No OpenAPI spec detected — without operation IDs, agents cannot map API capabilities to callable functions",
  schema_types_defined: "No OpenAPI spec detected — without typed schemas, agents cannot construct valid request payloads",
  schema_error_responses: "No OpenAPI spec detected — without error schemas, agents cannot programmatically handle API failures",
  schema_required_fields: "No OpenAPI spec detected — without required field markers, agents must guess which parameters are mandatory",
  schema_descriptions: "No OpenAPI spec detected — without field descriptions, agents lack the context to use parameters correctly",
};

const NO_SPEC_CHECKS: Array<{ id: string; label: string }> = [
  { id: "schema_operation_ids", label: "Operation IDs" },
  { id: "schema_types_defined", label: "Schema Types" },
  { id: "schema_error_responses", label: "Error Response Schemas" },
  { id: "schema_required_fields", label: "Required Fields" },
  { id: "schema_descriptions", label: "Field Descriptions" },
];

function calculateScore(checks: Check[]): { score: number; scoreLabel: "pass" | "partial" | "fail" } {
  let points = 0;
  let maxPoints = 0;
  for (const check of checks) {
    maxPoints += 1;
    if (check.status === "pass") points += 1;
    else if (check.status === "partial") points += 0.5;
  }
  const score = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  const scoreLabel = score >= 80 ? "pass" : score >= 40 ? "partial" : "fail";
  return { score, scoreLabel };
}

export async function runSchemaBridge(ctx: ScanContext): Promise<BridgeResult> {
  const start = performance.now();
  const hasSpec = ctx.shared.openApiDetected === true && ctx.shared.openApiSpec != null;
  const spec = hasSpec ? (ctx.shared.openApiSpec as ParsedOpenApiSpec) : undefined;

  // No spec → score: null (excluded from overall average, like Bridge 3)
  if (!hasSpec) {
    const checks: Check[] = NO_SPEC_CHECKS.map(({ id, label }) => ({
      id, label, status: "fail" as const, detail: NO_SPEC_MESSAGES[id],
    }));
    return {
      id: 4, name: "Schema", status: "evaluated", score: null, scoreLabel: "fail", checks,
      durationMs: Math.round(performance.now() - start),
    };
  }

  const checks: Check[] = [
    checkOperationIds(spec),
    checkSchemaTypes(spec),
    checkErrorSchemas(spec),
    checkRequiredFields(spec),
    checkDescriptions(spec),
  ];

  const { score, scoreLabel } = calculateScore(checks);

  return {
    id: 4, name: "Schema", status: "evaluated", score, scoreLabel, checks,
    durationMs: Math.round(performance.now() - start),
  };
}
