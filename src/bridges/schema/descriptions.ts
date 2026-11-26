import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";
import { operationParameters, requestSchemas, schemaForFields } from "./schema-sources.js";

export function checkDescriptions(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "schema_descriptions";
  const label = "Field Descriptions";
  const ops = collectOperations(spec);
  const items: Array<{ hasDescription: boolean }> = [];
  let queryCount = 0;
  let bodySchemaCount = 0;
  for (const [path, , op] of ops) {
    for (const param of operationParameters(spec, path, op)) {
      if (param?.$ref !== undefined) return { id, label, status: "error", detail: "A referenced parameter could not be inspected" };
      if (param?.in === "path") {
        items.push({ hasDescription: typeof param.description === "string" && param.description.trim() !== "" });
      } else if (param?.in === "query" && queryCount < 20) {
        queryCount++;
        items.push({ hasDescription: typeof param.description === "string" && param.description.trim() !== "" });
      }
      if (items.length >= 30) break;
    }
    if (items.length >= 30) break;
    if (bodySchemaCount < 3) {
      for (const raw of requestSchemas(spec, path, op)) {
        if (bodySchemaCount >= 3) break;
        const schema = schemaForFields(spec, raw);
        if (!schema) return { id, label, status: "error", detail: "Could not inspect all sampled request fields due to a reference or schema composition" };
        if (!schema?.properties) continue;
        bodySchemaCount++;
        for (const field of Object.values(schema.properties)) {
          const prop = schemaForFields(spec, field);
          if (!prop && field && typeof field === "object") return { id, label, status: "error", detail: "Could not inspect a referenced or composed request property" };
          items.push({ hasDescription: typeof prop?.description === "string" && prop.description.trim() !== "" });
          if (items.length >= 30) break;
        }
        if (items.length >= 30) break;
      }
    }
    if (items.length >= 30) break;
  }
  const sampled = items.length;
  if (sampled === 0) return { id, label, status: "pass", detail: "No parameters or properties to evaluate", data: { sampled: 0, withDescription: 0 } };
  const withDescription = items.filter((i) => i.hasDescription).length;
  const ratio = withDescription / sampled;
  if (ratio >= 0.8) return { id, label, status: "pass", detail: `${withDescription} of ${sampled} sampled fields have descriptions`, data: { sampled, withDescription } };
  if (ratio >= 0.4) return { id, label, status: "partial", detail: `${withDescription} of ${sampled} sampled fields have descriptions`, data: { sampled, withDescription } };
  return { id, label, status: "fail", detail: `Only ${withDescription} of ${sampled} sampled fields have descriptions`, data: { sampled, withDescription } };
}
