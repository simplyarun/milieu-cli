import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import type { ParsedOpenApiSpec } from "../schema/oas-types.js";
import { checkRateLimitHeaders } from "./rate-limits.js";
import { checkAgentsJson } from "./agents-json.js";
import { checkTosUrl, checkContactInfo } from "./tos-contact.js";
import { checkVersioningSignal } from "./versioning.js";
import { checkAuthClarity } from "./auth-clarity.js";
import { checkAiPolicy } from "./ai-policy.js";

/** Weighted scoring configuration. Max: 14 points. */
const CHECK_WEIGHTS: Record<string, number> = {
  context_rate_limit_headers: 3,
  context_auth_clarity: 3,
  context_tos_url: 2,
  context_versioning_signal: 2,
  context_ai_policy: 2,
  context_contact_info: 1,
  context_agents_json: 1,
};
const MAX_POINTS = 14;

/**
 * Calculate Bridge 5 weighted score.
 * pass = full weight, partial = half weight, fail/error = 0.
 * Thresholds: ≥60=pass, ≥30=partial, <30=fail (lower than other bridges).
 */
function calculateWeightedScore(checks: Check[]): {
  score: number;
  scoreLabel: "pass" | "partial" | "fail";
} {
  let earned = 0;

  for (const check of checks) {
    const weight = CHECK_WEIGHTS[check.id] ?? 1;
    if (check.status === "pass") earned += weight;
    else if (check.status === "partial") earned += weight * 0.5;
  }

  const score = Math.round((earned / MAX_POINTS) * 100);
  const scoreLabel =
    score >= 60 ? "pass" : score >= 30 ? "partial" : "fail";
  return { score, scoreLabel };
}

/**
 * Run Bridge 5: Context.
 *
 * Assesses trust and governance signals.
 *
 * Rate-limit probe runs first (populates ctx.shared.contextProbeHeaders).
 * agents.json probe runs in parallel with synchronous checks.
 *
 * Max HTTP calls: 2 (rate-limit probe, agents.json probe). Both GET-only, no auth.
 */
export async function runContextBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  const spec = ctx.shared.openApiSpec as ParsedOpenApiSpec | undefined;
  const llmsTxtBody = (ctx.shared.llmsTxtBody as string | null) ?? null;

  // Rate-limit probe first — populates ctx.shared.contextProbeHeaders
  const rateLimitCheck = await checkRateLimitHeaders(ctx);

  const contextProbeHeaders =
    (ctx.shared.contextProbeHeaders as Record<string, string>) ?? {};

  // Synchronous checks + agents.json probe in parallel
  const tosCheck = checkTosUrl(spec, llmsTxtBody);
  const contactCheck = checkContactInfo(spec);
  const versioningCheck = checkVersioningSignal(spec, contextProbeHeaders);
  const authCheck = checkAuthClarity(spec);
  const hasTosUrl = tosCheck.status !== "fail";
  const aiPolicyCheck = checkAiPolicy(llmsTxtBody, hasTosUrl);

  const agentsJsonCheck = await checkAgentsJson(
    ctx.baseUrl,
    ctx.options.timeout,
  );

  const checks: Check[] = [
    rateLimitCheck,
    authCheck,
    tosCheck,
    versioningCheck,
    aiPolicyCheck,
    contactCheck,
    agentsJsonCheck,
  ];

  const { score, scoreLabel } = calculateWeightedScore(checks);

  return {
    id: 5,
    name: "Context",
    status: "evaluated",
    score,
    scoreLabel,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
