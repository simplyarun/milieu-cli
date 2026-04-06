import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import { checkOpenAPI } from "../../lib/openapi/index.js";
import type { OpenAPIResult } from "../../lib/openapi/index.js";
import { checkLlmsTxt, checkLlmsFullTxt } from "./llms-txt.js";
import { checkMcpEndpoint } from "./mcp.js";
import { checkJsonLd } from "./json-ld.js";
import { checkSchemaOrg } from "./schema-org.js";
import { checkSecurityTxt } from "./well-known.js";
import { checkGraphql } from "./graphql.js";
import { checkSitemap } from "./sitemap.js";
import { checkMarkdownNegotiation } from "./markdown-negotiation.js";
import { checkWebMcp } from "./webmcp.js";
import { checkA2aAgentCard } from "./a2a-agent-card.js";
import { checkContentNegotiation } from "./content-negotiation.js";

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
 * Map an OpenAPIResult from the discovery module to a Bridge 2 Check.
 */
function openApiResultToCheck(result: OpenAPIResult): Check {
  const id = "openapi_spec";
  const label = "OpenAPI Spec";

  if (!result.exists) {
    return { id, label, status: "fail", detail: "No OpenAPI spec found" };
  }

  const version = result.version ?? "unknown";
  const detail = `OpenAPI ${version} found with ${result.endpointCount} endpoints`;

  return {
    id,
    label,
    status: "pass",
    detail,
    data: {
      version,
      endpointCount: result.endpointCount,
      operationCount: result.operationCount,
      url: result.url,
    },
  };
}

/**
 * Run Bridge 2: Standards.
 *
 * Runs 13 checks in two phases:
 *
 * Phase 1 (parallel): Sitemap + Markdown negotiation + llms.txt + llms-full.txt + security.txt
 *                      + WebMCP + A2A Agent Card + Content Negotiation
 * Phase 2 (parallel): OpenAPI (domain-level discovery) + GraphQL + MCP (fed pageBody + llmsTxtBody)
 * Synchronous: JSON-LD + Schema.org (from ctx.shared.pageBody)
 *
 * Two-phase execution is required because sitemap results feed into
 * OpenAPI detection, and llms.txt body feeds into MCP content scanning.
 *
 * Stores ctx.shared.openApiDetected, ctx.shared.openApiResult, ctx.shared.openApiSpec,
 * ctx.shared.graphqlDetected, ctx.shared.mcpDetected, ctx.shared.sitemapUrls,
 * and ctx.shared.llmsTxtBody for downstream bridges.
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
    webMcpCheck,
    a2aCheck,
    contentNegCheck,
  ] = await Promise.all([
    checkSitemap(ctx.baseUrl, robotsSitemaps, ctx.options.timeout),
    checkMarkdownNegotiation(ctx.baseUrl, ctx.options.timeout),
    checkLlmsTxt(ctx.baseUrl, ctx.options.timeout),
    checkLlmsFullTxt(ctx.baseUrl, ctx.options.timeout),
    checkSecurityTxt(ctx.baseUrl, ctx.options.timeout),
    checkWebMcp(ctx.baseUrl, ctx.options.timeout),
    checkA2aAgentCard(ctx.baseUrl, ctx.options.timeout),
    checkContentNegotiation(ctx.baseUrl, ctx.options.timeout),
  ]);

  // Phase 2: OpenAPI (domain-level discovery) + GraphQL + MCP (with page content) (parallel)
  const [openApiResult, graphqlResult, mcpResult] = await Promise.all([
    checkOpenAPI(ctx.domain, {
      timeoutMs: Math.min(ctx.options.timeout ?? 10000, 5000),
    }),
    checkGraphql(ctx.baseUrl, ctx.options.timeout),
    checkMcpEndpoint(ctx.baseUrl, ctx.options.timeout, pageBody, llmsTxtResult.body ?? undefined),
  ]);

  // Map OpenAPI result to a Bridge 2 check
  const openApiCheck = openApiResultToCheck(openApiResult);

  // Detect webhooks/callbacks from spec if available
  let hasWebhooks = false;
  let hasCallbacks = false;
  if (openApiResult.spec && typeof openApiResult.spec === "object") {
    const spec = openApiResult.spec as Record<string, unknown>;
    hasWebhooks =
      spec.webhooks != null &&
      typeof spec.webhooks === "object" &&
      Object.keys(spec.webhooks as object).length > 0;

    if (spec.paths && typeof spec.paths === "object") {
      for (const pathItem of Object.values(
        spec.paths as Record<string, unknown>,
      )) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const op of Object.values(pathItem as Record<string, unknown>)) {
          if (op && typeof op === "object" && "callbacks" in op) {
            hasCallbacks = true;
            break;
          }
        }
        if (hasCallbacks) break;
      }
    }
  }

  // Synchronous HTML-based checks (no HTTP)
  const jsonLdCheck = checkJsonLd(pageBody);
  const schemaOrgCheck = checkSchemaOrg(pageBody, jsonLdCheck);

  // Store detection results for downstream bridges
  ctx.shared.openApiDetected = openApiResult.exists;
  ctx.shared.openApiResult = openApiResult;
  ctx.shared.openApiSpec = openApiResult.spec;
  ctx.shared.openApiHasWebhooks = hasWebhooks;
  ctx.shared.openApiHasCallbacks = hasCallbacks;
  ctx.shared.graphqlDetected = graphqlResult.detected;
  ctx.shared.mcpDetected = mcpResult.detected;
  ctx.shared.sitemapUrls = sitemapResult.urls;
  ctx.shared.llmsTxtBody = llmsTxtResult.body;

  // Collect all 13 checks in order
  const checks: Check[] = [
    openApiCheck,
    graphqlResult.check,
    sitemapResult.check,
    markdownResult.check,
    llmsTxtResult.check,
    llmsFullTxtCheck,
    mcpResult.check,
    jsonLdCheck,
    schemaOrgCheck,
    securityTxtCheck,
    webMcpCheck,
    a2aCheck,
    contentNegCheck,
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
