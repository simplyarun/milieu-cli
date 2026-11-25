import type { Check, ContentSource } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/** Maximum body size for developer docs page fetches (1 MB) */
const DEV_DOCS_MAX_BODY = 1_048_576;

/** Well-known paths for developer documentation */
const DOC_PATHS = [
  "/docs",
  "/developers",
  "/developer",
  "/api/docs",
  "/documentation",
] as const;

/** Result of developer docs check, including page bodies for downstream use */
export interface DeveloperDocsResult {
  check: Check;
  pages: ContentSource[];
}

/**
 * Scan homepage HTML for links pointing to documentation paths.
 * Returns matched paths (deduplicated).
 */
function scanDocLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const anchors = /<a(?=\s)(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
  const attributes = /([^\s=/<>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s<>"'=`]+)))?/g;

  for (const [tag] of html.matchAll(anchors)) {
    for (const [, name, doubleQuoted, singleQuoted, unquoted] of tag.matchAll(attributes)) {
      if (name.toLowerCase() !== "href") continue;
      const href = doubleQuoted ?? singleQuoted ?? unquoted;
      const url = href ? URL.parse(href, baseUrl) : null;
      if (url?.protocol === "http:" || url?.protocol === "https:") {
        // Match whole path segments, including nested and off-site docs.
        const pathname = url.pathname.toLowerCase() + "/";
        for (const path of DOC_PATHS) {
          if (pathname.includes(path + "/")) found.add(path);
        }
      }
      break;
    }
  }
  return DOC_PATHS.filter((path) => found.has(path));
}

/**
 * Detect developer documentation via path probing and link scanning.
 *
 * Probes 5 well-known documentation paths with GET requests in parallel
 * (capped at 1 MB body). Also scans homepage HTML for links pointing to
 * documentation paths. Returns pass if any path is reachable or linked,
 * fail otherwise.
 *
 * Returns both the check result and page bodies (ContentSource[]) for
 * downstream content scanning by other Bridge 3 checks.
 *
 * This is the only async check module in Bridge 3 -- it requires HTTP.
 */
export async function checkDeveloperDocs(
  baseUrl: string,
  html: string,
  timeout?: number,
): Promise<DeveloperDocsResult> {
  const id = "developer_docs";
  const label = "Developer Documentation";

  // Probe all 5 paths in parallel with GET requests (1 MB cap)
  const results = await Promise.all(
    DOC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, { timeout, maxBodyBytes: DEV_DOCS_MAX_BODY }),
    ),
  );

  // Filter to reachable paths (2xx responses) and collect page bodies
  const reachablePaths: string[] = [];
  const pages: ContentSource[] = [];
  for (let i = 0; i < DOC_PATHS.length; i++) {
    const response = results[i];
    if (response.ok) {
      reachablePaths.push(DOC_PATHS[i]);
      pages.push({ content: response.body, source: DOC_PATHS[i] });
    }
  }

  // Also scan homepage HTML for documentation links
  const linkedPaths = scanDocLinks(html, baseUrl);

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];

  if (allFound.length === 0) {
    // Denied probes never ran — without link evidence either way, the
    // check is unmeasured rather than failing.
    if (results.some((r) => !r.ok && r.error.kind === "request_budget_exhausted")) {
      return {
        check: {
          id,
          label,
          status: "error",
          detail: "Developer documentation probes skipped: scan request budget exhausted",
        },
        pages: [],
      };
    }
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: "No developer documentation found",
      },
      pages: [],
    };
  }

  return {
    check: {
      id,
      label,
      status: "pass",
      detail: `Developer documentation detected: ${allFound.join(", ")}`,
      data: { paths: allFound },
    },
    pages,
  };
}
