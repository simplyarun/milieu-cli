import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";

/**
 * Check: schema_error_responses
 *
 * At least one 4xx response should have a structured body schema.
 * Agents need structured errors, not HTML error pages.
 */
export function checkErrorSchemas(
  spec: ParsedOpenApiSpec | undefined,
): Check {
  const id = "schema_error_responses";
  const label = "Error Response Schemas";

  const ops = collectOperations(spec);
  let total4xx = 0;
  let withSchema = 0;

  for (const [, , op] of ops) {
    if (!op.responses) continue;
    for (const [code, resp] of Object.entries(op.responses)) {
      // Match 4xx codes: "400", "404", "4XX", "4xx", etc.
      if (!code.startsWith("4")) continue;
      total4xx++;

      if (resp?.content) {
        const hasSchema = Object.values(resp.content).some(
          (mt) => mt?.schema != null,
        );
        if (hasSchema) withSchema++;
      }
    }
  }

  if (total4xx === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No 4xx error responses defined in spec",
      data: { total4xx: 0, withSchema: 0 },
    };
  }

  if (withSchema === total4xx) {
    return {
      id,
      label,
      status: "pass",
      detail: `All ${total4xx} error responses have body schemas`,
      data: { total4xx, withSchema },
    };
  }

  if (withSchema >= 1) {
    return {
      id,
      label,
      status: "partial",
      detail: `${withSchema} of ${total4xx} error responses have body schemas`,
      data: { total4xx, withSchema },
    };
  }

  return {
    id,
    label,
    status: "fail",
    detail: `None of ${total4xx} error responses have body schemas`,
    data: { total4xx, withSchema: 0 },
  };
}
