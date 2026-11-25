import { resolvePathItem } from "./schema-sources.js";

export interface OasParameter {
  $ref?: string;
  name?: string;
  description?: string;
  required?: boolean;
  in?: string;
  type?: string;
  schema?: OasSchema;
}

export interface OasResponse {
  $ref?: string;
  description?: string;
  schema?: OasSchema;
  content?: Record<string, { schema?: OasSchema }>;
}

export interface OasRequestBody {
  $ref?: string;
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: OasSchema }>;
}

export interface OasOperation {
  operationId?: string;
  description?: string;
  summary?: string;
  parameters?: OasParameter[];
  requestBody?: OasRequestBody;
  responses?: Record<string, OasResponse>;
  security?: Array<Record<string, string[]>>;
  servers?: unknown;
}

export type OasPathItem = Partial<Record<typeof HTTP_METHODS[number], OasOperation>> & {
  $ref?: string;
  summary?: string;
  description?: string;
  parameters?: OasParameter[];
  servers?: unknown;
};

export type OasSchema = boolean | OasSchemaObject;

export interface OasSchemaObject {
  type?: string | string[];
  $ref?: string;
  properties?: Record<string, OasSchema>;
  required?: string[];
  description?: string;
  items?: OasSchema;
  allOf?: OasSchema[];
  oneOf?: OasSchema[];
  anyOf?: OasSchema[];
}

export interface ParsedOpenApiSpec {
  swagger?: string;
  openapi?: string;
  basePath?: string;
  host?: string;
  schemes?: string[];
  parameters?: Record<string, OasParameter>;
  responses?: Record<string, OasResponse>;
  definitions?: Record<string, OasSchema>;
  info?: {
    title?: string;
    version?: string;
    description?: string;
    termsOfService?: string;
    contact?: { name?: string; email?: string; url?: string };
    license?: { name?: string; url?: string };
  };
  paths?: Record<string, OasPathItem>;
  components?: {
    securitySchemes?: Record<
      string,
      {
        type?: string;
        description?: string;
        name?: string;
        in?: string;
        scheme?: string;
        flows?: unknown;
      }
    >;
    schemas?: Record<string, OasSchema>;
    requestBodies?: Record<string, OasRequestBody>;
    responses?: Record<string, OasResponse>;
    parameters?: Record<string, OasParameter>;
    pathItems?: Record<string, OasPathItem>;
  };
  security?: Array<Record<string, string[]>>;
  securityDefinitions?: Record<
    string,
    {
      type?: string;
      description?: string;
      name?: string;
      in?: string;
    }
  >;
}

const HTTP_METHODS = [
  "get", "post", "put", "patch", "delete", "options", "head", "trace",
] as const;

// Context probes append only root-relative paths on the scanned origin.
function apiPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export function hasUnreadPathItems(spec: ParsedOpenApiSpec | undefined): boolean {
  return Object.entries(spec?.paths ?? {}).some(([path, item]) =>
    apiPath(path) && item?.$ref !== undefined && !resolvePathItem(spec, path));
}

/**
 * Collect all operations from a parsed spec.
 * Returns [path, method, operation] tuples.
 */
export function collectOperations(
  spec: ParsedOpenApiSpec | undefined,
): Array<[string, string, OasOperation]> {
  if (!spec?.paths) return [];
  const ops: Array<[string, string, OasOperation]> = [];
  for (const path of Object.keys(spec.paths)) {
    if (!apiPath(path)) continue;
    const pathItem = resolvePathItem(spec, path);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (op && typeof op === "object" && !Array.isArray(op)) {
        ops.push([path, method, op as OasOperation]);
      }
    }
  }
  return ops;
}

/** The base path of a Swagger server when it can be sampled on the scan origin. */
export function swaggerBasePath(spec: ParsedOpenApiSpec, origin: string): string | null {
  const url = new URL(origin);
  if (spec.host !== undefined && spec.host !== url.host) return null;
  if (spec.schemes !== undefined && (!Array.isArray(spec.schemes) || !spec.schemes.includes(url.protocol.slice(0, -1)))) return null;
  const base = spec.basePath ?? "/";
  return typeof base === "string" && /^\/(?!\/)/.test(base) && !/[{}?#\\]/.test(base) ? base.replace(/\/$/, "") : null;
}
