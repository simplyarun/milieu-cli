import type { Check } from "../../core/types.js";

/** Registry detection pattern with URL and optional install command regex */
interface RegistryPattern {
  name: string;
  urlPattern: RegExp;
  installPattern?: RegExp;
}

/** Package registry patterns for SDK/package reference detection */
const REGISTRY_PATTERNS: RegistryPattern[] = [
  {
    name: "npm",
    urlPattern: /npmjs\.com\/package\//i,
    installPattern: /npm\s+install\s+\S/i,
  },
  {
    name: "PyPI",
    urlPattern: /pypi\.org\/project\//i,
    installPattern: /pip\s+install\s+\S/i,
  },
  {
    name: "Maven",
    urlPattern: /search\.maven\.org|mvnrepository\.com/i,
    installPattern: /<groupId>/i,
  },
  {
    name: "NuGet",
    urlPattern: /nuget\.org\/packages\//i,
    installPattern: /dotnet\s+add\s+package\s+\S/i,
  },
  {
    name: "Go",
    urlPattern: /pkg\.go\.dev\//i,
    installPattern: /go\s+get\s+\S/i,
  },
  {
    name: "RubyGems",
    urlPattern: /rubygems\.org\/gems\//i,
    installPattern: /gem\s+install\s+\S/i,
  },
];

/**
 * Detect SDK/package references in HTML content.
 *
 * Scans for package registry URLs (npmjs.com, pypi.org, etc.) and
 * install commands (npm install, pip install, etc.). Returns deduplicated
 * list of detected registries.
 *
 * Pure function -- no HTTP calls.
 */
export function checkSdkReferences(html: string): Check {
  const id = "sdk_references";
  const label = "SDK/Package References";

  const detected: string[] = [];

  for (const registry of REGISTRY_PATTERNS) {
    if (registry.urlPattern.test(html)) {
      if (!detected.includes(registry.name)) detected.push(registry.name);
    }
    if (registry.installPattern && registry.installPattern.test(html)) {
      if (!detected.includes(registry.name)) detected.push(registry.name);
    }
  }

  if (detected.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No SDK/package references found",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `SDK references detected: ${detected.join(", ")}`,
    data: { registries: detected },
  };
}
