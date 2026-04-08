import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";

export function checkOperationIds(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "schema_operation_ids";
  const label = "Operation IDs";
  const ops = collectOperations(spec);
  const total = ops.length;
  if (total === 0) {
    return { id, label, status: "fail", detail: "No operations found in spec", data: { total: 0, missing: 0 } };
  }
  const withId = ops.filter(([, , op]) => typeof op.operationId === "string" && op.operationId.trim() !== "").length;
  const missing = total - withId;
  if (withId === total) return { id, label, status: "pass", detail: `All ${total} operations have operationId`, data: { total, missing: 0 } };
  if (withId >= Math.ceil(total * 0.8)) return { id, label, status: "partial", detail: `${withId} of ${total} operations have operationId (${missing} missing)`, data: { total, missing } };
  return { id, label, status: "fail", detail: `Only ${withId} of ${total} operations have operationId (${missing} missing)`, data: { total, missing } };
}
