import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "./oas-types.js";
import { collectOperations } from "./oas-types.js";

export function checkDescriptions(spec: ParsedOpenApiSpec | undefined): Check {
  const id = "schema_descriptions";
  const label = "Field Descriptions";
  const ops = collectOperations(spec);
  const items: Array<{ hasDescription: boolean }> = [];
  let queryCount = 0;
  let bodySchemaCount = 0;
  for (const [, , op] of ops) {
    if (op.parameters) {
      for (const param of op.parameters) {
        if (param.in === "path") {
          items.push({ hasDescription: typeof param.description === "string" && param.description.trim() !== "" });
        } else if (param.in === "query" && queryCount < 20) {
          queryCount++;
          items.push({ hasDescription: typeof param.description === "string" && param.description.trim() !== "" });
        }
        if (items.length >= 30) break;
      }
    }
    if (items.length >= 30) break;
    if (op.requestBody?.content && bodySchemaCount < 3) {
      for (const mediaType of Object.values(op.requestBody.content)) {
        if (bodySchemaCount >= 3) break;
        const schema = mediaType?.schema;
        if (!schema?.properties) continue;
        bodySchemaCount++;
        for (const prop of Object.values(schema.properties)) {
          items.push({ hasDescription: typeof prop.description === "string" && prop.description.trim() !== "" });
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
