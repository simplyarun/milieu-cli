import type { Check, ContentSource, HttpSuccess } from "../../core/types.js";
import { completeRepresentation, DOC_PATHS, docPathMatches, isDeveloperDocsLink, htmlLinks, type PublishedSources } from "./published-routes.js";
import { httpGet } from "../../utils/http-client.js";

/** Maximum body size for developer docs page fetches (1 MB) */
const DEV_DOCS_MAX_BODY = 1_048_576;

/** Result of developer docs check, including page bodies for downstream use */
export interface DeveloperDocsResult {
  check: Check;
  pages: ContentSource[];
  routeSources?: PublishedSources;
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
  homepage: string | HttpSuccess | null = baseUrl,
): Promise<DeveloperDocsResult> {
  const id = "developer_docs";
  const label = "Developer Documentation";
  const pageUrl = typeof homepage === "string" ? homepage : homepage?.url ?? null;
  const linksMeasured = typeof homepage === "string" || (homepage !== null && completeRepresentation(homepage));

  // Probe all 5 paths in parallel with GET requests (1 MB cap)
  const results = await Promise.all(
    DOC_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, { timeout, maxBodyBytes: DEV_DOCS_MAX_BODY }),
    ),
  );

  // Filter to reachable paths (2xx responses) and collect page bodies
  const reachablePaths: string[] = [];
  const fetchedUrls = new Set<string>();
  const pages: ContentSource[] = [];
  let fetchesComplete = true;
  for (let i = 0; i < DOC_PATHS.length; i++) {
    const response = results[i];
    if (response.ok) {
      if (!completeRepresentation(response)) fetchesComplete = false;
      reachablePaths.push(DOC_PATHS[i]);
      const url = new URL(response.url);
      fetchedUrls.add(url.origin + url.pathname);
      pages.push({ content: response.body, source: DOC_PATHS[i] });
    } else {
      const status = response.response?.status ?? response.error.statusCode;
      if (status !== 404 && status !== 410) fetchesComplete = false;
    }
  }

  // Also scan homepage HTML for documentation links
  const homeLinks = htmlLinks(html, pageUrl ?? baseUrl);
  const linkedDocs = homeLinks.filter(isDeveloperDocsLink);
  const linkedPaths = DOC_PATHS.filter(path => linkedDocs.some(url => docPathMatches(url, path)));
  const linkedUrls = [...new Set(linkedDocs.map(url => url.origin + url.pathname))];
  const routeSources = {
    homeLinks,
    docs: results.map((response, i) => ({ requestedUrl: new URL(DOC_PATHS[i], baseUrl).href, response })),
  };

  // Combine both signals (dedup)
  const allFound = [...new Set([...reachablePaths, ...linkedPaths])];
  const data = {
    paths: allFound, linkedUrls, fetchedUrls: [...fetchedUrls],
    linksMeasured, fetchesComplete,
  };

  if (!allFound.length && !linkedUrls.length) {
    if (!fetchesComplete || !linksMeasured) {
      const budgetDenied = results.some((r) => !r.ok && r.error.kind === "request_budget_exhausted");
      return {
        check: {
          id,
          label,
          status: "error",
          detail: budgetDenied
            ? "Developer documentation probes skipped: scan request budget exhausted"
            : "Developer documentation could not be fully measured",
          data,
        },
        pages: [], routeSources,
      };
    }
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: "No developer documentation found",
        data,
      },
      pages: [], routeSources,
    };
  }

  return {
    check: {
      id,
      label,
      status: "pass",
      detail: allFound.length ? `Developer documentation detected: ${allFound.join(", ")}` :
        `Published documentation link: ${linkedUrls[0]}`,
      data,
    },
    pages, routeSources,
  };
}
