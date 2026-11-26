import type { OasOperation, OasParameter, OasPathItem, OasRequestBody, OasResponse, OasSchema, OasSchemaObject, ParsedOpenApiSpec } from "./oas-types.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function supportsJsonSchema(spec: ParsedOpenApiSpec | undefined): boolean {
  return /^3\.(?:[1-9]\d*)\./.test(spec?.openapi ?? "");
}

/** Follow JSON Pointers in this document. Named anchors and other resources require a different resolver. */
function localValue(spec: ParsedOpenApiSpec | undefined, raw: unknown, kind: "object" | "schema" | "path" = "object"): unknown {
  let value = raw;
  let description: string | undefined;
  const visited = new Set<string>();
  const modern = supportsJsonSchema(spec);
  while (record(value) && "$ref" in value) {
    const ref = value.$ref;
    if (typeof ref !== "string" || !ref.startsWith("#/") || ref.length > 8192 || visited.has(ref) || visited.size >= 64) return;
    visited.add(ref);
    // Sibling operations, parameters or servers could collide with the
    // referenced item. Do not silently drop or override either definition.
    if (kind === "path" && Object.keys(value).some(key => !["$ref", "summary", "description"].includes(key))) return;
    if (modern) {
      // Schema $ref siblings apply alongside the target. Unsupported structural
      // siblings cannot safely be dropped or combined by shallow object spread.
      if (kind === "schema" && Object.keys(value).some(key => !["$ref", "description", "title", "$comment"].includes(key))) return;
      if (typeof value.description === "string") description ??= value.description;
    }
    let pointer: string;
    try { pointer = decodeURIComponent(ref.slice(2)); } catch { return; }
    const tokens = pointer.split("/");
    if (tokens.length > 128) return;
    value = spec;
    for (const token of tokens) {
      if (/~(?![01])/.test(token)) return;
      const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return;
      // An embedded JSON Schema resource changes the base for references within it.
      if (kind === "schema" && modern && Object.hasOwn(value, "$id")) return;
      value = (value as Record<string, unknown>)[key];
    }
  }
  if (description !== undefined) {
    if (record(value)) return { ...value, description };
    // Boolean schemas declare no types or fields, but a 3.1 use site can
    // still supply a field description alongside its $ref to a boolean.
    if (kind === "schema" && typeof value === "boolean") return { description };
  }
  return value;
}

export function resolvePathItem(spec: ParsedOpenApiSpec | undefined, path: string): OasPathItem | undefined {
  const value = localValue(spec, spec?.paths?.[path], "path");
  return record(value) ? value as OasPathItem : undefined;
}

/** Operations inherit path parameters, overriding by (in, name) in both dialects. */
export function operationParameters(spec: ParsedOpenApiSpec | undefined, path: string, op: OasOperation): OasParameter[] {
  const effective = new Map<string, OasParameter>();
  const unmerged: OasParameter[] = [];
  for (const group of [resolvePathItem(spec, path)?.parameters, op.parameters]) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      const parameter = localValue(spec, raw);
      if (record(parameter) && typeof parameter.name === "string" && typeof parameter.in === "string") {
        effective.set(JSON.stringify([parameter.in, parameter.name]), parameter as OasParameter);
      } else if (record(raw)) {
        // Keep unresolved refs and incomplete inline parameters visible to the
        // checks that can still inspect them (or must decline to probe).
        unmerged.push(raw);
      }
    }
  }
  return [...effective.values(), ...unmerged];
}

export function resolveRequestBody(spec: ParsedOpenApiSpec | undefined, op: OasOperation): OasRequestBody | undefined {
  const body = localValue(spec, op.requestBody);
  return record(body) && record(body.content) ? body as OasRequestBody : undefined;
}

function resolveSchema(spec: ParsedOpenApiSpec | undefined, schema: OasSchema | undefined): OasSchema | undefined {
  const value = localValue(spec, schema, "schema");
  if (typeof value === "boolean" && supportsJsonSchema(spec)) return value;
  if (!record(value) || "$dynamicRef" in value || "$recursiveRef" in value) return;
  return value as OasSchemaObject;
}

export function declaresType(spec: ParsedOpenApiSpec | undefined, schema: OasSchema | undefined): boolean {
  if (typeof schema !== "object") return false;
  const type = schema.type;
  if (typeof type === "string") return type.trim() !== "";
  return supportsJsonSchema(spec) && Array.isArray(type) && type.length > 0 &&
    type.every(item => typeof item === "string" && item.trim() !== "");
}

function mediaSchemas(spec: ParsedOpenApiSpec | undefined, content?: OasRequestBody["content"]): (OasSchema | undefined)[] {
  return Object.values(content ?? {}).filter(media => media?.schema != null).map(media => resolveSchema(spec, media.schema));
}

/** An undefined entry means a declared source could not be inspected. */
export function requestSchemas(spec: ParsedOpenApiSpec | undefined, path: string, op: OasOperation): (OasSchema | undefined)[] {
  if (spec?.swagger !== "2.0") {
    if (!op.requestBody) return [];
    const body = resolveRequestBody(spec, op);
    return body ? mediaSchemas(spec, body.content) : [undefined];
  }
  const parameters = operationParameters(spec, path, op);
  const schemas = parameters.flatMap(p => p.$ref ? [undefined] : p.in === "body" && p.schema ? [resolveSchema(spec, p.schema)] : []);
  const form = parameters.filter(p => p.in === "formData");
  if (form.length) {
    schemas.push({
      type: form.every(p => typeof p.type === "string" && p.type.trim()) ? "object" : undefined,
      properties: Object.fromEntries(form.map(p => [p.name!, { type: p.type, description: p.description }])),
      required: form.filter(p => p.required === true).map(p => p.name!),
    });
  }
  return schemas;
}

export function responseSchemas(spec: ParsedOpenApiSpec | undefined, response: OasResponse | undefined): (OasSchema | undefined)[] {
  const value = localValue(spec, response);
  if (!record(value)) return response?.$ref ? [undefined] : [];
  const resolved = value as OasResponse;
  if (spec?.swagger !== "2.0") return mediaSchemas(spec, resolved.content);
  return resolved.schema ? [resolveSchema(spec, resolved.schema)] : [];
}

export function schemaForFields(spec: ParsedOpenApiSpec | undefined, schema: OasSchema | undefined): OasSchemaObject | undefined {
  const resolved = resolveSchema(spec, schema);
  // Boolean schemas have no named fields. Applicators and embedded resources
  // need deeper evaluation before we can attribute fields or descriptions.
  if (typeof resolved === "boolean") return {};
  if (resolved && ["allOf", "anyOf", "oneOf", "if", "then", "else", "not", "dependentSchemas", "$id"].some(key => Object.hasOwn(resolved, key))) return;
  return resolved;
}
