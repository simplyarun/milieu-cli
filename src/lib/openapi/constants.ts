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

/** Primary domain probe paths (tried sequentially) */
export const PRIMARY_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/swagger.yaml",
  "/api/openapi.json",
  "/api/swagger.json",
  "/api/docs/openapi.json",
  "/api/v1/openapi.json",
  "/docs/api/openapi.json",
  "/.well-known/openapi.json",
  "/.well-known/openapi.yaml",
] as const;

/** Subdomain prefixes to probe (in parallel across subdomains) */
export const SUBDOMAIN_PREFIXES = [
  "api",
  "developer",
  "developers",
  "docs",
] as const;

/** Default options for OpenAPI discovery */
export const DEFAULTS = {
  timeoutMs: 3000,
  totalTimeoutMs: 15000,
  maxSpecBytes: 2 * 1024 * 1024, // 2MB
  userAgent: "milieu-cli/scanner",
  maxRedirects: 2,
} as const;

/** JSON content types indicating spec response */
export const JSON_CONTENT_TYPES = new Set([
  "application/json",
  "application/vnd.oai.openapi+json",
]);

/** YAML content types indicating spec response */
export const YAML_CONTENT_TYPES = new Set([
  "application/yaml",
  "text/yaml",
  "application/x-yaml",
  "application/vnd.oai.openapi",
]);
