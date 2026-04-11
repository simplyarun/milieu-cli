import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { checkRateLimitHeaders } from "./rate-limits.js";
import { checkAuthClarity } from "./auth-clarity.js";
import { checkAuthLegibility } from "./auth-legibility.js";
import { checkTosUrl, checkContactInfo } from "./tos-contact.js";
import { checkVersioningSignal } from "./versioning.js";
import { checkAgentsJson } from "./agents-json.js";

const CHECK_WEIGHTS: Record<string, number> = {
  context_rate_limit_headers: 3,
  context_auth_clarity: 3,
  context_auth_legibility: 3,
  context_tos_url: 2,
  context_versioning_signal: 2,
  context_contact_info: 1,
  context_agents_json: 2,
};

/** Checks that require an OpenAPI spec to produce meaningful results */
const SPEC_GATED_CHECKS = new Set([
  "context_auth_clarity",
  "context_versioning_signal",
]);

function calculateWeightedScore(checks: Check[], hasSpec: boolean): { score: number | null; scoreLabel: "pass" | "partial" | "fail" } {
  let earned = 0;
  let maxPoints = 0;
  for (const check of checks) {
    const weight = CHECK_WEIGHTS[check.id] ?? 1;
    // Skip spec-gated checks from denominator when no spec exists
    if (!hasSpec && SPEC_GATED_CHECKS.has(check.id)) continue;
    maxPoints += weight;
    if (check.status === "pass") earned += weight;
    else if (check.status === "partial") earned += weight * 0.5;
  }
  if (maxPoints === 0) return { score: null, scoreLabel: "fail" };
  const score = Math.round((earned / maxPoints) * 100);
  const scoreLabel = score >= 60 ? "pass" : score >= 30 ? "partial" : "fail";
  return { score, scoreLabel };
}

export async function runContextBridge(ctx: ScanContext): Promise<BridgeResult> {
  const start = performance.now();
  const hasSpec = ctx.shared.openApiDetected === true && ctx.shared.openApiSpec != null;
  const spec = hasSpec ? (ctx.shared.openApiSpec as ParsedOpenApiSpec) : undefined;
  const llmsTxtBody = (ctx.shared.llmsTxtBody as string | null) ?? null;
  const pageBody = (ctx.shared.pageBody as string | null) ?? null;
  const securityTxtBody = (ctx.shared.securityTxtBody as string | null) ?? null;

  // Rate-limit probe first — populates ctx.shared.contextProbeHeaders
  const rateLimitCheck = await checkRateLimitHeaders(ctx);
  const contextProbeHeaders = (ctx.shared.contextProbeHeaders as Record<string, string>) ?? {};

  // Auth legibility + agents.json probes in parallel
  const [authLegibilityCheck, agentsJsonCheck] = await Promise.all([
    checkAuthLegibility(ctx),
    checkAgentsJson(ctx.baseUrl, ctx.options.timeout),
  ]);

  // Synchronous checks
  const authClarityCheck = checkAuthClarity(spec);
  const tosCheck = checkTosUrl(spec, llmsTxtBody, pageBody);
  const versioningCheck = checkVersioningSignal(spec, contextProbeHeaders);
  const contactCheck = checkContactInfo(spec, securityTxtBody);

  const checks: Check[] = [
    rateLimitCheck, authClarityCheck, authLegibilityCheck,
    tosCheck, versioningCheck, contactCheck, agentsJsonCheck,
  ];

  const { score, scoreLabel } = calculateWeightedScore(checks, hasSpec);

  return {
    id: 5, name: "Context", status: "evaluated", score, scoreLabel, checks,
    durationMs: Math.round(performance.now() - start),
  };
}
