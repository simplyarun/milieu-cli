import yaml from "js-yaml";
import { HTTP_METHODS } from "./constants.js";

// ---------------------------------------------------------------------------
// Types (internal)
// ---------------------------------------------------------------------------

interface ParsedSpec {
  version: "3.0" | "3.1" | "2.0" | null;
  endpointCount: number;
  operationCount: number;
  hasDescriptions: boolean;
  descriptionCoverage: number;
  hasAuthSchemes: boolean;
  authSchemeTypes: string[];
  authSchemeNames: string[];
  hasGlobalSecurity: boolean;
  governanceReady: boolean;
  /** The raw parsed spec object */
  spec: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw body string as an OpenAPI / Swagger spec.
 * Tries JSON.parse first, falls back to js-yaml.
 * Returns null if the document is not a valid spec.
 */
export function parseSpec(body: string): ParsedSpec | null {
  let parsed: unknown;

  // Try JSON first
  try {
    parsed = JSON.parse(body);
  } catch {
    // Fall back to YAML
    try {
      parsed = yaml.load(body);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;

  // Version detection
  const version = detectVersion(parsed);
  if (!version) return null;

  // Endpoint and operation counting
  const paths = isRecord(parsed.paths) ? parsed.paths : {};
  const endpointCount = Object.keys(paths).length;
  let operationCount = 0;

  for (const pathObj of Object.values(paths)) {
    if (!isRecord(pathObj)) continue;
    for (const method of HTTP_METHODS) {
      if (pathObj[method]) operationCount++;
    }
  }

  // Description coverage
  let described = 0;
  let totalOps = 0;

  for (const pathObj of Object.values(paths)) {
    if (!isRecord(pathObj)) continue;
    for (const method of HTTP_METHODS) {
      const op = pathObj[method];
      if (!isRecord(op)) continue;
      totalOps++;
      const desc =
        typeof op.description === "string" ? op.description.trim() : "";
      const summary = typeof op.summary === "string" ? op.summary.trim() : "";
      if (desc || summary) described++;
    }
  }

  const descriptionCoverage = totalOps > 0 ? described / totalOps : 0;
  const hasDescriptions = descriptionCoverage > 0.5;

  // Auth scheme detection
  const { hasAuthSchemes, authSchemeTypes, authSchemeNames } =
    detectAuthSchemes(parsed, version);

  // Global security
  const hasGlobalSecurity =
    Array.isArray(parsed.security) && parsed.security.length > 0;

  // Governance readiness
  const governanceReady = hasDescriptions && hasAuthSchemes;

  return {
    version,
    endpointCount,
    operationCount,
    hasDescriptions,
    descriptionCoverage,
    hasAuthSchemes,
    authSchemeTypes,
    authSchemeNames,
    hasGlobalSecurity,
    governanceReady,
    spec: parsed,
  };
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

function detectVersion(
  spec: Record<string, unknown>,
): "3.0" | "3.1" | "2.0" | null {
  if (typeof spec.openapi === "string") {
    if (spec.openapi.startsWith("3.1")) return "3.1";
    if (spec.openapi.startsWith("3.0")) return "3.0";
    // Unknown 3.x — treat as 3.0
    if (spec.openapi.startsWith("3")) return "3.0";
    return null;
  }
  if (spec.swagger === "2.0") return "2.0";
  return null;
}

// ---------------------------------------------------------------------------
// Auth scheme detection
// ---------------------------------------------------------------------------

function detectAuthSchemes(
  spec: Record<string, unknown>,
  version: "3.0" | "3.1" | "2.0",
): {
  hasAuthSchemes: boolean;
  authSchemeTypes: string[];
  authSchemeNames: string[];
} {
  let schemesObj: Record<string, unknown> = {};

  if (version === "2.0") {
    // Swagger 2.0: securityDefinitions
    if (isRecord(spec.securityDefinitions)) {
      schemesObj = spec.securityDefinitions;
    }
  } else {
    // OpenAPI 3.x: components.securitySchemes
    const components = isRecord(spec.components) ? spec.components : {};
    if (isRecord(components.securitySchemes)) {
      schemesObj = components.securitySchemes;
    }
  }

  const entries = Object.entries(schemesObj);
  const hasAuthSchemes = entries.length > 0;
  const authSchemeNames = entries.map(([name]) => name);
  const authSchemeTypes = [
    ...new Set(
      entries
        .map(([, s]) => (isRecord(s) ? (s.type as string) : null))
        .filter((t): t is string => typeof t === "string"),
    ),
  ];

  return { hasAuthSchemes, authSchemeTypes, authSchemeNames };
}
