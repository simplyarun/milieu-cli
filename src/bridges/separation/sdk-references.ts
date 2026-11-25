import type { Check, ContentSource, HttpSuccess } from "../../core/types.js";
import { htmlLinks, type PublishedSources } from "./published-routes.js";

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

/** A target path on the actual registry host. Ordinary mentions keep their weaker, historical meaning. */
export function linkedRegistry(url: URL): string | undefined {
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) return;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const candidate = host + url.pathname;
  for (const { name, urlPattern } of REGISTRY_PATTERNS) {
    const match = urlPattern.exec(candidate);
    if (!match || match.index !== 0 || match[0].split("/")[0].toLowerCase() !== host) continue;
    if (name === "Maven" && !/^\/artifact\/[^/]+\/[^/]+/.test(url.pathname)) continue;
    if (name === "Packagist" && !/^\/packages\/[^/]+\/[^/]+/i.test(url.pathname)) continue;
    if (name === "npm" && /^\/package\/@[^/]+\/?$/i.test(url.pathname)) continue;
    if (name === "Go" && /^\/(search|about|license-policy)(\/|$)/i.test(url.pathname)) continue;
    if (!candidate.slice(match[0].length).replace(/^\/+/, "")) continue;
    return name;
  }
}

interface PageInputs {
  homepage?: HttpSuccess;
  docs?: PublishedSources;
}

function collectPackageLinks(sources: ContentSource[], inputs?: PageInputs) {
  const links = new Set<string>();
  const pages = new Set<string>();
  const linkedRegistries = new Set<string>();
  let complete = Boolean(inputs?.homepage && inputs.docs);
  function collect(urls: URL[]) {
    for (const url of urls) {
      const registry = linkedRegistry(url);
      if (!registry) continue;
      linkedRegistries.add(registry);
      links.add(url.origin + url.pathname);
    }
  }
  function inspect(response: HttpSuccess, knownLinks?: URL[]) {
    const url = new URL(response.url);
    if (url.username || url.password || url.search) { complete = false; return; }
    const contentType = response.headers["content-type"]?.split(";")[0].trim().toLowerCase();
    if (contentType !== "text/html") { complete = false; return; }
    if (response.bodyIncomplete || response.status === 206 || response.headers["content-range"]) complete = false;
    const source = url.origin + url.pathname;
    if (!pages.has(source)) collect(knownLinks ?? htmlLinks(response.body, url.href));
    pages.add(source);
  }
  if (inputs) {
    if (inputs.homepage) inspect(inputs.homepage, inputs.docs?.homeLinks);
    for (const { response } of inputs.docs?.docs ?? []) {
      if (response.ok) inspect(response);
      else {
        const code = response.response?.status ?? response.error.statusCode;
        if (code !== 404 && code !== 410) complete = false;
      }
    }
  } else {
    // Standalone callers may have only the page body. Absolute hrefs still have a destination.
    for (const source of sources) {
      if (source.source !== "llms.txt") collect(htmlLinks(source.content));
    }
  }
  const evidence = { packageLinks: [...links].sort(), packageLinkPages: [...pages].sort(), packageLinksComplete: complete };
  return { evidence, linkedRegistries };
}

/**
 * Detect SDK/package references across multiple content sources.
 *
 * Scans for package registry URLs (npmjs.com, pypi.org, etc.) and
 * install commands (npm install, pip install, etc.). Returns deduplicated
 * list of detected registries with source attribution.
 *
 * Pure function -- no HTTP calls.
 */
export function checkSdkReferences(sources: ContentSource[], inputs?: PageInputs): Check {
  const id = "sdk_references";
  const label = "SDK/Package References";

  const detected: string[] = [];
  const detectedSources: string[] = [];
  const { evidence, linkedRegistries } = collectPackageLinks(sources, inputs);

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

  for (const registry of linkedRegistries) {
    if (!detected.includes(registry)) detected.push(registry);
  }
  if (detected.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No SDK/package references found", data: evidence,
    };
  }

  const sourceAttr =
    detectedSources.length > 0 ? ` in ${detectedSources.join(", ")}` : "";

  return {
    id,
    label,
    status: "pass",
    detail: `SDK references detected${sourceAttr}: ${detected.join(", ")}`,
    data: { registries: detected, sources: detectedSources, ...evidence },
  };
}
