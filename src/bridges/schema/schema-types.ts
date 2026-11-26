import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec, OasSchema } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";
import { declaresType, requestSchemas, responseSchemas } from "./schema-sources.js";

export function checkSchemaTypes(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "schema_types_defined";
  const label = "Schema Types";
  const ops = collectOperations(spec);
  const schemas: (OasSchema | undefined)[] = [];
  for (const [path, , op] of ops) {
    for (const schema of requestSchemas(spec, path, op)) schemas.push(schema);
    if (op.responses) {
      for (const [code, resp] of Object.entries(op.responses)) {
        if (!code.startsWith("2")) continue;
        for (const schema of responseSchemas(spec, resp)) schemas.push(schema);
      }
    }
  }
  const total = schemas.length;
  if (schemas.includes(undefined)) return { id, label, status: "error", detail: "A request or successful response schema could not be inspected" };
  if (total === 0) return { id, label, status: "fail", detail: "No request/response schemas found in spec", data: { total: 0, untyped: 0 } };
  const typed = schemas.filter(schema => declaresType(spec, schema)).length;
  const untyped = total - typed;
  if (typed === total) return { id, label, status: "pass", detail: `All ${total} schemas declare a type`, data: { total, untyped: 0 } };
  if (typed >= Math.ceil(total * 0.8)) return { id, label, status: "partial", detail: `${typed} of ${total} schemas declare a type (${untyped} untyped)`, data: { total, untyped } };
  return { id, label, status: "fail", detail: `Only ${typed} of ${total} schemas declare a type (${untyped} untyped)`, data: { total, untyped } };
}
