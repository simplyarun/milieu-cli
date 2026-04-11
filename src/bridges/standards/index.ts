import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import { checkOpenApi } from "./openapi.js";
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

/**
 * Check weights by adoption maturity.
 * Core standards (widely adopted, high agent value) = 2
 * Emerging standards (bleeding-edge, <5% adoption) = 1
 */
const CHECK_WEIGHTS: Record<string, number> = {
  // Core standards (weight 2)
  openapi_spec: 2,
  sitemap: 2,
  llms_txt: 2,
  security_txt: 2,
  json_ld: 2,
  schema_org: 2,
  // Emerging standards (weight 1)
  graphql_endpoint: 1,
  markdown_negotiation: 1,
  llms_full_txt: 1,
  mcp_endpoint: 1,
  standards_webmcp: 1,
  standards_a2a_agent_card: 1,
};

function calculateScore(checks: Check[]): { score: number; scoreLabel: "pass" | "partial" | "fail" } {
  let points = 0;
  let maxPoints = 0;
  for (const check of checks) {
    const weight = CHECK_WEIGHTS[check.id] ?? 1;
    maxPoints += weight;
    if (check.status === "pass") points += weight;
    else if (check.status === "partial") points += weight * 0.5;
  }
  const score = maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100);
  const scoreLabel = score >= 60 ? "pass" : score >= 30 ? "partial" : "fail";
  return { score, scoreLabel };
}

export async function runStandardsBridge(ctx: ScanContext): Promise<BridgeResult> {
  const start = performance.now();
  const pageBody = (ctx.shared.pageBody as string) ?? "";
  const robotsSitemaps = (ctx.shared.robotsSitemaps as string[]) ?? [];

  // Phase 1: parallel independent probes
  const [sitemapResult, markdownResult, llmsTxtResult, llmsFullTxtCheck, securityTxtResult, webMcpCheck, a2aAgentCardCheck] = await Promise.all([
    checkSitemap(ctx.baseUrl, robotsSitemaps, ctx.options.timeout),
    checkMarkdownNegotiation(ctx.baseUrl, ctx.options.timeout),
    checkLlmsTxt(ctx.baseUrl, ctx.options.timeout),
    checkLlmsFullTxt(ctx.baseUrl, ctx.options.timeout),
    checkSecurityTxt(ctx.baseUrl, ctx.options.timeout),
    checkWebMcp(ctx.baseUrl, ctx.options.timeout),
    checkA2aAgentCard(ctx.baseUrl, ctx.options.timeout),
  ]);

  // Phase 2: OpenAPI + GraphQL + MCP (depend on Phase 1 results)
  const [openApiResult, graphqlResult, mcpResult] = await Promise.all([
    checkOpenApi(ctx.baseUrl, ctx.options.timeout, sitemapResult.apiRelevantUrls),
    checkGraphql(ctx.baseUrl, ctx.options.timeout),
    checkMcpEndpoint(ctx.baseUrl, ctx.options.timeout, pageBody, llmsTxtResult.body ?? undefined),
  ]);

  // Synchronous HTML-based checks
  const jsonLdCheck = checkJsonLd(pageBody);
  const schemaOrgCheck = checkSchemaOrg(pageBody, jsonLdCheck);

  // Store results for downstream bridges
  ctx.shared.openApiDetected = openApiResult.detected;
  ctx.shared.openApiSpec = openApiResult.parsedSpec ?? null;
  ctx.shared.openApiHasWebhooks = openApiResult.hasWebhooks;
  ctx.shared.openApiHasCallbacks = openApiResult.hasCallbacks;
  ctx.shared.graphqlDetected = graphqlResult.detected;
  ctx.shared.mcpDetected = mcpResult.detected;
  ctx.shared.sitemapUrls = sitemapResult.urls;
  ctx.shared.llmsTxtBody = llmsTxtResult.body;
  ctx.shared.securityTxtBody = securityTxtResult.body;

  const checks: Check[] = [
    openApiResult.check, graphqlResult.check, sitemapResult.check,
    markdownResult.check, llmsTxtResult.check, llmsFullTxtCheck,
    mcpResult.check, jsonLdCheck, schemaOrgCheck, securityTxtResult.check,
    webMcpCheck, a2aAgentCardCheck,
  ];

  const { score, scoreLabel } = calculateScore(checks);

  return { id: 2, name: "Standards", status: "evaluated", score, scoreLabel, checks, durationMs: Math.round(performance.now() - start) };
}
