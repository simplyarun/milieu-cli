import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/** Well-known paths for developer documentation */
const DOC_PATHS = [
  "/docs",
  "/developers",
  "/developer",
  "/api/docs",
  "/documentation",
] as const;

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
 * Probes 5 well-known documentation paths with HEAD requests in parallel.
 * Also scans homepage HTML for links pointing to documentation paths.
 * Returns pass if any path is reachable or linked, fail otherwise.
 *
 * This is the only async check module in Bridge 3 -- it requires HTTP.
 */
export async function checkDeveloperDocs(
  baseUrl: string,
  html: string,
  timeout?: number,
): Promise<Check> {
  const id = "developer_docs";
  const label = "Developer Documentation";

  // Probe all 5 paths in parallel with HEAD requests
  const results = await Promise.all(
    DOC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, { method: "HEAD", timeout }),
    ),
  );

  // Filter to reachable paths (2xx responses)
  const reachablePaths: string[] = [];
  for (let i = 0; i < DOC_PATHS.length; i++) {
    if (results[i].ok) {
      reachablePaths.push(DOC_PATHS[i]);
    }
  }

  // Also scan homepage HTML for documentation links
  const linkedPaths = scanDocLinks(html);

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];

  if (allFound.length === 0) {
    return {
      id,
      label,
      status: "fail",
      detail: "No developer documentation found",
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `Developer documentation detected: ${allFound.join(", ")}`,
    data: { paths: allFound },
  };
}
