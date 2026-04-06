import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check whether the site returns different content based on Accept headers.
 *
 * Sends GET with Accept: text/markdown and compares the Content-Type
 * of the response vs a normal Accept: text/html request.
 *
 * - pass: Returns text/markdown or text/plain with markdown content
 * - partial: Returns different content-type than HTML default
 * - fail: Same HTML regardless
 */
export async function checkContentNegotiation(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "standards_content_negotiation";
  const label = "Content Negotiation";

  // Send two requests in parallel: one for markdown, one for HTML
  const [mdResult, htmlResult] = await Promise.all([
    httpGet(baseUrl, {
      timeout,
      headers: { Accept: "text/markdown" },
    }),
    httpGet(baseUrl, {
      timeout,
      headers: { Accept: "text/html" },
    }),
  ]);

  if (!mdResult.ok) {
    return {
      id,
      label,
      status: "fail",
      detail: "Could not reach product surface to test content negotiation",
      data: { markdownSupported: false, responseContentType: null },
    };
  }

  const mdContentType = (mdResult.headers["content-type"] ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const htmlContentType = htmlResult.ok
    ? (htmlResult.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase()
    : "text/html";

  // Check if markdown is returned
  if (mdContentType === "text/markdown") {
    return {
      id,
      label,
      status: "pass",
      detail: "Server returns text/markdown when requested via Accept header",
      data: { markdownSupported: true, responseContentType: mdContentType },
    };
  }

  if (mdContentType === "text/plain") {
    // Check if body looks like markdown (has # headers or links)
    const hasMarkdownSignals =
      /^#{1,3}\s/m.test(mdResult.body) || /\[.+\]\(.+\)/.test(mdResult.body);
    if (hasMarkdownSignals) {
      return {
        id,
        label,
        status: "pass",
        detail:
          "Server returns text/plain with markdown content when requested",
        data: { markdownSupported: true, responseContentType: mdContentType },
      };
    }
  }

  // Check if content-type differs from the HTML response
  if (mdContentType !== htmlContentType) {
    return {
      id,
      label,
      status: "partial",
      detail: `Server returns different content-type (${mdContentType}) for markdown Accept header`,
      data: { markdownSupported: false, responseContentType: mdContentType },
    };
  }

  return {
    id,
    label,
    status: "fail",
    detail: "Server returns same HTML regardless of Accept header",
    data: { markdownSupported: false, responseContentType: mdContentType },
  };
}
