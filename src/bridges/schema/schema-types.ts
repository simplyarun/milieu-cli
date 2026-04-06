import type { Check } from "../../core/types.js";
import type { OasSchema, ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";

/**
 * Check: schema_types_defined
 *
 * Request body and 2xx response schemas should have type or $ref.
 * Without types, agents can't construct or validate payloads.
 */
export function checkSchemaTypes(
  spec: ParsedOpenApiSpec | undefined,
): Check {
  const id = "schema_types_defined";
  const label = "Schema Types";

  const ops = collectOperations(spec);
  const schemas: OasSchema[] = [];

  for (const [, , op] of ops) {
    // Request body schemas
    if (op.requestBody?.content) {
      for (const mediaType of Object.values(op.requestBody.content)) {
        if (mediaType?.schema) schemas.push(mediaType.schema);
      }
    }

    // 2xx response schemas
    if (op.responses) {
      for (const [code, resp] of Object.entries(op.responses)) {
        if (!code.startsWith("2")) continue;
        if (resp?.content) {
          for (const mediaType of Object.values(resp.content)) {
            if (mediaType?.schema) schemas.push(mediaType.schema);
          }
        }
      }
    }
  }

  const total = schemas.length;
  if (total === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No request/response schemas found in spec",
      data: { total: 0, untyped: 0 },
    };
  }

  const typed = schemas.filter(
    (s) =>
      (typeof s.type === "string" && s.type.trim() !== "") ||
      (typeof s.$ref === "string" && s.$ref.trim() !== ""),
  ).length;
  const untyped = total - typed;

  if (typed === total) {
    return {
      id,
      label,
      status: "pass",
      detail: `All ${total} schemas have type or $ref defined`,
      data: { total, untyped: 0 },
    };
  }

  if (typed >= Math.ceil(total * 0.8)) {
    return {
      id,
      label,
      status: "partial",
      detail: `${typed} of ${total} schemas have type or $ref (${untyped} untyped)`,
      data: { total, untyped },
    };
  }

  return {
    id,
    label,
    status: "fail",
    detail: `Only ${typed} of ${total} schemas have type or $ref (${untyped} untyped)`,
    data: { total, untyped },
  };
}
