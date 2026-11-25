import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";
import { requestSchemas, schemaForFields } from "./schema-sources.js";

export function checkRequiredFields(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "schema_required_fields";
  const label = "Required Fields";
  const ops = collectOperations(spec);
  let schemasWithProperties = 0;
  let withRequired = 0;
  for (const [path, , op] of ops) {
    for (const raw of requestSchemas(spec, path, op)) {
      const schema = schemaForFields(spec, raw);
      if (!schema) return { id, label, status: "error", detail: "Could not inspect all request fields due to a reference or schema composition" };
      if (!schema?.properties || Object.keys(schema.properties).length === 0) continue;
      schemasWithProperties++;
      if (Array.isArray(schema.required) && schema.required.length > 0) withRequired++;
    }
  }
  if (schemasWithProperties === 0) return { id, label, status: "pass", detail: "No request body schemas with properties to evaluate", data: { schemasWithProperties: 0, withRequired: 0 } };
  if (withRequired === schemasWithProperties) return { id, label, status: "pass", detail: `All ${schemasWithProperties} request schemas declare required fields`, data: { schemasWithProperties, withRequired } };
  if (withRequired >= Math.ceil(schemasWithProperties * 0.5)) return { id, label, status: "partial", detail: `${withRequired} of ${schemasWithProperties} request schemas declare required fields`, data: { schemasWithProperties, withRequired } };
  return { id, label, status: "fail", detail: `Only ${withRequired} of ${schemasWithProperties} request schemas declare required fields`, data: { schemasWithProperties, withRequired } };
}
