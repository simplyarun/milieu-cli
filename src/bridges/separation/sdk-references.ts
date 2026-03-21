import type { Check, ContentSource } from "../../core/types.js";

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
    name: "npm (CDN)",
    urlPattern: /cdn\.jsdelivr\.net\/npm\/|unpkg\.com\//i,
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
  {
    name: "Packagist",
    urlPattern: /packagist\.org\/packages\//i,
    installPattern: /composer\s+require\s+\S/i,
  },
  {
    name: "Crates.io",
    urlPattern: /crates\.io\/crates\//i,
    installPattern: /cargo\s+add\s+\S/i,
  },
];

/**
 * Detect SDK/package references across multiple content sources.
 *
 * Scans for package registry URLs (npmjs.com, pypi.org, etc.) and
 * install commands (npm install, pip install, etc.). Returns deduplicated
 * list of detected registries with source attribution.
 *
 * Pure function -- no HTTP calls.
 */
export function checkSdkReferences(sources: ContentSource[]): Check {
  const id = "sdk_references";
  const label = "SDK/Package References";

  const detected: string[] = [];
  const detectedSources: string[] = [];

  for (const { content, source } of sources) {
    for (const registry of REGISTRY_PATTERNS) {
      if (detected.includes(registry.name)) continue;
      const matched =
        registry.urlPattern.test(content) ||
        (registry.installPattern !== undefined &&
          registry.installPattern.test(content));
      if (matched) {
        detected.push(registry.name);
        if (!detectedSources.includes(source)) detectedSources.push(source);
      }
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

  const sourceAttr =
    detectedSources.length > 0 ? ` in ${detectedSources.join(", ")}` : "";

  return {
    id,
    label,
    status: "pass",
    detail: `SDK references detected${sourceAttr}: ${detected.join(", ")}`,
    data: { registries: detected, sources: detectedSources },
  };
}
