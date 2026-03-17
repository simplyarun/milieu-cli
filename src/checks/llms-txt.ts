import { fetchPath } from "./fetch-utils.js";
import { getSubdomains } from "./subdomains.js";
import type { LlmsTxtCheckResult } from "../types.js";

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const AI_RELEVANT_PATTERNS = [
  /\.md(\?|$)/,
  /\.md\.txt(\?|$)/,
  /\/docs\b/,
  /\/api\b/,
  /\/mcp\b/,
  /openapi\b/i,
  /swagger\b/i,
  /\/graphql\b/,
  /\.well-known\//,
  /\/jsonrpc\b/,
  /\.json(\?|$)/,
  /\.yaml(\?|$)/,
];
const MAX_DISCOVERED_URLS = 20;

const LLMS_PATHS = ["/llms.txt", "/llms-full.txt", "/.well-known/llms.txt"] as const;

function isValidResult(
  result: Awaited<ReturnType<typeof fetchPath>>
): result is NonNullable<typeof result> & { body: string } {
  if (!result || result.status !== 200 || !result.body || result.blockedByBotProtection) return false;
  // Reject HTML responses — catch-all apps (e.g. Zoom Docs) serve 200 HTML for any path
  const ct = result.contentType.toLowerCase();
  if (ct.includes("text/html")) return false;
  return true;
}

function parseDiscoveredResources(content: string): string[] {
  const urls: string[] = [];
  const matches = content.matchAll(MARKDOWN_LINK_RE);
  for (const match of matches) {
    const url = match[2];
    if (AI_RELEVANT_PATTERNS.some((p) => p.test(url))) {
      urls.push(url);
    }
  }
  return [...new Set(urls)].slice(0, MAX_DISCOVERED_URLS);
}

function analyzeStructure(content: string) {
  const hasH1 = /^#\s+/m.test(content);
  const hasBlockquoteSummary = /^>\s+/m.test(content);
  const h2Count = (content.match(/^##\s+/gm) || []).length;
  const linkCount = (content.match(/\[[^\]]*\]\([^)]+\)/g) || []).length;
  const isWellStructured = hasH1 && h2Count >= 1;
  return { hasH1, hasBlockquoteSummary, h2Count, linkCount, isWellStructured };
}

export async function checkLlmsTxt(
  domain: string,
): Promise<LlmsTxtCheckResult> {
  try {
    const domains = getSubdomains(domain);

    // Probe all 3 paths across all subdomains in parallel
    const allResults = await Promise.all(
      domains.flatMap((d) =>
        LLMS_PATHS.map(async (path) => {
          const res = await fetchPath(d, path);
          return { domain: d, path, result: res };
        })
      )
    );

    // Find the best valid result for each path type across all domains
    let hasLlmsTxt = false;
    let hasLlmsFullTxt = false;
    let hasWellKnownLlmsTxt = false;
    let llmsTxtSize: number | undefined;
    let llmsFullTxtSize: number | undefined;
    let wellKnownLlmsTxtSize: number | undefined;
    let bestFullBody: string | undefined;
    let bestBasicBody: string | undefined;
    let bestWellKnownBody: string | undefined;
    let anyBlocked = false;

    for (const { path, result } of allResults) {
      if (result?.blockedByBotProtection) anyBlocked = true;
      if (!isValidResult(result)) continue;

      if (path === "/llms.txt" && !hasLlmsTxt) {
        hasLlmsTxt = true;
        llmsTxtSize = result.body.length;
        bestBasicBody = result.body;
      } else if (path === "/llms-full.txt" && !hasLlmsFullTxt) {
        hasLlmsFullTxt = true;
        llmsFullTxtSize = result.body.length;
        bestFullBody = result.body;
      } else if (path === "/.well-known/llms.txt" && !hasWellKnownLlmsTxt) {
        hasWellKnownLlmsTxt = true;
        wellKnownLlmsTxtSize = result.body.length;
        bestWellKnownBody = result.body;
      }
    }

    // Parse links from the best available content
    const bestContent = bestFullBody ?? bestBasicBody ?? bestWellKnownBody ?? "";
    const discoveredResourceUrls = bestContent ? parseDiscoveredResources(bestContent) : [];

    // Analyze structural quality of the best available llms.txt content
    const structureContent = bestBasicBody ?? bestFullBody ?? bestWellKnownBody;
    const structure = structureContent ? analyzeStructure(structureContent) : undefined;

    return {
      pass: hasLlmsTxt || hasLlmsFullTxt || hasWellKnownLlmsTxt,
      hasLlmsTxt,
      hasLlmsFullTxt,
      hasWellKnownLlmsTxt,
      llmsTxtSize,
      llmsFullTxtSize,
      wellKnownLlmsTxtSize,
      discoveredResources: discoveredResourceUrls.length,
      discoveredResourceUrls,
      ...(structure ?? {}),
      blockedByBotProtection: anyBlocked || undefined,
    };
  } catch (err) {
    return {
      pass: false,
      hasLlmsTxt: false,
      hasLlmsFullTxt: false,
      hasWellKnownLlmsTxt: false,
      discoveredResources: 0,
      discoveredResourceUrls: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default checkLlmsTxt;
