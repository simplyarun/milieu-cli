import type { Check } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";

const VERSION_HEADERS = ["x-api-version", "api-version", "x-version"];

export function checkVersioningSignal(spec: ParsedOpenApiSpec | undefined, contextProbeHeaders: Record<string, string>): Check {
  const id = "context_versioning_signal";
  const label = "Versioning Signal";
  if (spec?.paths) {
    for (const path of Object.keys(spec.paths)) {
      if (/^\/v\d+\//.test(path)) return { id, label, status: "pass", detail: `Path-based versioning detected: ${path}`, data: { signal: "path", value: path } };
    }
  }
  for (const header of VERSION_HEADERS) {
    const value = contextProbeHeaders[header];
    if (value !== undefined) return { id, label, status: "pass", detail: `Version header found: ${header}: ${value}`, data: { signal: "header", value: `${header}: ${value}` } };
  }
  const specVersion = spec?.info?.version;
  if (typeof specVersion === "string" && specVersion.trim() !== "") {
    return { id, label, status: "partial", detail: `Spec info.version found: ${specVersion}`, data: { signal: "spec_info", value: specVersion } };
  }
  return { id, label, status: "fail", detail: "No versioning signal found", data: { signal: null, value: null } };
}
