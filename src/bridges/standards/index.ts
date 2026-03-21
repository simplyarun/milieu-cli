import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import { checkOpenApi } from "./openapi.js";
import { checkLlmsTxt, checkLlmsFullTxt } from "./llms-txt.js";
import { checkMcpEndpoint } from "./mcp.js";
import { checkJsonLd } from "./json-ld.js";
import { checkSchemaOrg } from "./schema-org.js";
import { checkSecurityTxt, checkAiPlugin } from "./well-known.js";

/**
 * Calculate bridge score from check results.
 * - Pass = 1 point, Partial = 0.5 points, Fail/Error = 0 points
 * - All 8 checks always count (no skip concept in Bridge 2)
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
 * Runs 8 checks:
 *   - 6 independent HTTP probes in parallel (OpenAPI, llms.txt, llms-full.txt, MCP, security.txt, ai-plugin.json)
 *   - 2 synchronous HTML-based checks (JSON-LD, Schema.org) using ctx.shared.pageBody from Bridge 1
 *
 * Stores ctx.shared.openApiDetected for Bridge 3 consumption.
 * Stores ctx.shared.llmsTxtBody for downstream consumption.
 */
export async function runStandardsBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  // Get page body from shared context (set by Bridge 1)
  const pageBody = (ctx.shared.pageBody as string) ?? "";

  // Run all independent HTTP probes in parallel
  const [
    openApiResult,
    llmsTxtResult,
    llmsFullTxtCheck,
    mcpCheck,
    securityTxtCheck,
    aiPluginCheck,
  ] = await Promise.all([
    checkOpenApi(ctx.baseUrl, ctx.options.timeout),
    checkLlmsTxt(ctx.baseUrl, ctx.options.timeout),
    checkLlmsFullTxt(ctx.baseUrl, ctx.options.timeout),
    checkMcpEndpoint(ctx.baseUrl, ctx.options.timeout),
    checkSecurityTxt(ctx.baseUrl, ctx.options.timeout),
    checkAiPlugin(ctx.baseUrl, ctx.options.timeout),
  ]);

  // Run HTML-based checks (synchronous, no HTTP)
  const jsonLdCheck = checkJsonLd(pageBody);
  const schemaOrgCheck = checkSchemaOrg(pageBody, jsonLdCheck);

  // Store OpenAPI detection result for Bridge 3
  ctx.shared.openApiDetected = openApiResult.detected;
  ctx.shared.llmsTxtBody = llmsTxtResult.body;

  // Collect all 8 checks in order
  const checks: Check[] = [
    openApiResult.check,
    llmsTxtResult.check,
    llmsFullTxtCheck,
    mcpCheck,
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
