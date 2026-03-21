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
function scanDocLinks(html: string): string[] {
  const found: string[] = [];
  for (const path of DOC_PATHS) {
    const escaped = path.replace(/\//g, "\\/");
    const regex = new RegExp(
      `<a\\s[^>]*href=["'][^"']*${escaped}[^"']*["']`,
      "gi",
    );
    if (regex.test(html)) {
      found.push(path);
    }
  }
  return found;
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
    if (results[i].ok) {
      reachablePaths.push(DOC_PATHS[i]);
      pages.push({ content: results[i].body, source: DOC_PATHS[i] });
    }
  }

  // Also scan homepage HTML for documentation links
  const linkedPaths = scanDocLinks(html);

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];

  if (allFound.length === 0) {
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
