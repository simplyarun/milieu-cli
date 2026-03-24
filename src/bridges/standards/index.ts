import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import { checkOpenApi } from "./openapi.js";
import { checkLlmsTxt, checkLlmsFullTxt } from "./llms-txt.js";
import { checkMcpEndpoint } from "./mcp.js";
import { checkJsonLd } from "./json-ld.js";
import { checkSchemaOrg } from "./schema-org.js";
import { checkSecurityTxt, checkAiPlugin } from "./well-known.js";
import { checkGraphql } from "./graphql.js";
import { checkSitemap } from "./sitemap.js";
import { checkMarkdownNegotiation } from "./markdown-negotiation.js";

/**
 * Calculate bridge score from check results.
 * - Pass = 1 point, Partial = 0.5 points, Fail/Error = 0 points
 * - All checks always count (no skip concept in Bridge 2)
 */
function calculateScore(checks: Check[]): {
  score: number;
  scoreLabel: "pass" | "partial" | "fail";
} {
  let points = 0;
  let maxPoints = 0;

  for (const check of checks) {
    maxPoints += 1;
    if (check.status === "pass") points += 1;
    else if (check.status === "partial") points += 0.5;
    // fail and error = 0 points
  }

  const score = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  const scoreLabel =
    score >= 80 ? "pass" : score >= 40 ? "partial" : "fail";
  return { score, scoreLabel };
}

/**
 * Run Bridge 2: Standards.
 *
 * Runs 11 checks in two phases:
 *
 * Phase 1 (parallel): Sitemap + Markdown negotiation + llms.txt + llms-full.txt + security.txt + ai-plugin.json
 * Phase 2 (parallel): OpenAPI (fed sitemap API URLs) + GraphQL + MCP (fed pageBody + llmsTxtBody)
 * Synchronous: JSON-LD + Schema.org (from ctx.shared.pageBody)
 *
 * Two-phase execution is required because sitemap results feed into
 * OpenAPI detection, and llms.txt body feeds into MCP content scanning.
 *
 * Stores ctx.shared.openApiDetected, ctx.shared.graphqlDetected,
 * ctx.shared.mcpDetected, ctx.shared.sitemapUrls, and ctx.shared.llmsTxtBody
 * for Bridge 3 consumption.
 */
export async function runStandardsBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  // Get shared context from Bridge 1
  const pageBody = (ctx.shared.pageBody as string) ?? "";
  const robotsSitemaps = (ctx.shared.robotsSitemaps as string[]) ?? [];

  // Phase 1: Sitemap + Markdown negotiation + independent HTTP probes (parallel)
  const [
    sitemapResult,
    markdownResult,
    llmsTxtResult,
    llmsFullTxtCheck,
    securityTxtCheck,
    aiPluginCheck,
  ] = await Promise.all([
    checkSitemap(ctx.baseUrl, robotsSitemaps, ctx.options.timeout),
    checkMarkdownNegotiation(ctx.baseUrl, ctx.options.timeout),
    checkLlmsTxt(ctx.baseUrl, ctx.options.timeout),
    checkLlmsFullTxt(ctx.baseUrl, ctx.options.timeout),
    checkSecurityTxt(ctx.baseUrl, ctx.options.timeout),
    checkAiPlugin(ctx.baseUrl, ctx.options.timeout),
  ]);

  // Phase 2: OpenAPI (with sitemap API URLs) + GraphQL + MCP (with page content) (parallel)
  const [openApiResult, graphqlResult, mcpResult] = await Promise.all([
    checkOpenApi(ctx.baseUrl, ctx.options.timeout, sitemapResult.apiRelevantUrls),
    checkGraphql(ctx.baseUrl, ctx.options.timeout),
    checkMcpEndpoint(ctx.baseUrl, ctx.options.timeout, pageBody, llmsTxtResult.body ?? undefined),
  ]);

  // Synchronous HTML-based checks (no HTTP)
  const jsonLdCheck = checkJsonLd(pageBody);
  const schemaOrgCheck = checkSchemaOrg(pageBody, jsonLdCheck);

  // Store detection results for Bridge 3
  ctx.shared.openApiDetected = openApiResult.detected;
  ctx.shared.openApiHasWebhooks = openApiResult.hasWebhooks;
  ctx.shared.openApiHasCallbacks = openApiResult.hasCallbacks;
  ctx.shared.graphqlDetected = graphqlResult.detected;
  ctx.shared.mcpDetected = mcpResult.detected;
  ctx.shared.sitemapUrls = sitemapResult.urls;
  ctx.shared.llmsTxtBody = llmsTxtResult.body;

  // Collect all 11 checks in order
  const checks: Check[] = [
    openApiResult.check,
    graphqlResult.check,
    sitemapResult.check,
    markdownResult.check,
    llmsTxtResult.check,
    llmsFullTxtCheck,
    mcpResult.check,
    jsonLdCheck,
    schemaOrgCheck,
    securityTxtCheck,
    aiPluginCheck,
  ];

  // Calculate score
  const { score, scoreLabel } = calculateScore(checks);

  return {
    id: 2,
    name: "Standards",
    status: "evaluated",
    score,
    scoreLabel,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
