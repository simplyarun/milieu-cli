import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

/** Version headers to check (lowercase) */
const VERSION_HEADERS = ["x-api-version", "api-version", "x-version"];

/**
 * Check: context_versioning_signal
 *
 * Sources (no HTTP):
 * 1. Path-based: any key in spec.paths matching /^\/v\d+\//
 * 2. Header-based: contextProbeHeaders for version headers
 * 3. Spec info: spec.info.version non-empty
 */
export function checkVersioningSignal(
  spec: ParsedOpenApiSpec | undefined,
  contextProbeHeaders: Record<string, string>,
): Check {
  const id = "context_versioning_signal";
  const label = "Versioning Signal";

  // 1. Path-based versioning
  if (spec?.paths) {
    for (const path of Object.keys(spec.paths)) {
      if (/^\/v\d+\//.test(path)) {
        return {
          id,
          label,
          status: "pass",
          detail: `Path-based versioning detected: ${path}`,
          data: { signal: "path", value: path },
        };
      }
    }
  }

  // 2. Header-based versioning
  for (const header of VERSION_HEADERS) {
    const value = contextProbeHeaders[header];
    if (value !== undefined) {
      return {
        id,
        label,
        status: "pass",
        detail: `Version header found: ${header}: ${value}`,
        data: { signal: "header", value: `${header}: ${value}` },
      };
    }
  }

  // 3. Spec info version
  const specVersion = spec?.info?.version;
  if (typeof specVersion === "string" && specVersion.trim() !== "") {
    return {
      id,
      label,
      status: "partial",
      detail: `Spec info.version found: ${specVersion}`,
      data: { signal: "spec_info", value: specVersion },
    };
  }

  return {
    id,
    label,
    status: "fail",
    detail: "No versioning signal found",
    data: { signal: null, value: null },
  };
}
