export interface OasOperation {
  operationId?: string;
  description?: string;
  summary?: string;
  parameters?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    in?: string;
    schema?: { type?: string };
  }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OasSchema }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: OasSchema }>;
    }
  >;
  security?: Array<Record<string, string[]>>;
}

export interface OasSchema {
  type?: string;
  $ref?: string;
  properties?: Record<string, OasSchema>;
  required?: string[];
  description?: string;
  items?: OasSchema;
}

export interface ParsedOpenApiSpec {
  info?: {
    title?: string;
    version?: string;
    description?: string;
    termsOfService?: string;
    contact?: { name?: string; email?: string; url?: string };
    license?: { name?: string; url?: string };
  };
  paths?: Record<string, Record<string, OasOperation>>;
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
  };
  security?: Array<Record<string, string[]>>;
  // Swagger 2.0 equivalents
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

/** HTTP methods recognized in OpenAPI path items */
export const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const;

/**
 * Collect all operations from a parsed spec.
 * Returns array of [path, method, operation] tuples.
 */
export function collectOperations(
  spec: ParsedOpenApiSpec | undefined,
): Array<[string, string, OasOperation]> {
  if (!spec?.paths) return [];
  const ops: Array<[string, string, OasOperation]> = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (op && typeof op === "object") {
        ops.push([path, method, op as OasOperation]);
      }
    }
  }
  return ops;
}
