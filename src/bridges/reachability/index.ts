import type { BridgeResult, Check, ScanContext } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import { checkHttps } from "./https-check.js";
import { checkHttpStatus } from "./http-status.js";
import { checkRobotsTxt } from "./robots-txt.js";
import { evaluateCrawlerPolicies } from "./crawler-policy.js";
import { checkMetaRobots, checkXRobotsTag } from "./meta-robots.js";

/**
 * Calculate bridge score from check results.
 * - Pass = 1 point, Partial = 0.5 points, Fail/Error = 0 points
 * - Checks with data.policy === "skip" excluded from both numerator and denominator
 */
function calculateScore(checks: Check[]): {
  score: number;
  scoreLabel: "pass" | "partial" | "fail";
} {
  let points = 0;
  let maxPoints = 0;

  for (const check of checks) {
    // Skip checks excluded from scoring (e.g., crawler policy with no robots.txt)
    if (
      check.data &&
      (check.data as Record<string, unknown>).policy === "skip"
    ) {
      continue;
    }

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
 * Run Bridge 1: Reachability.
 *
 * Makes 3 HTTP calls:
 *   1. HEAD https://<domain> (HTTPS availability)
 *   2. GET  <baseUrl> (page content for meta robots)
 *   3. GET  https://<domain>/robots.txt (robots.txt fetch)
 *
 * Aborts on dns/connection_refused/ssl_error from HTTPS check.
 */
export async function runReachabilityBridge(
  ctx: ScanContext,
): Promise<BridgeResult> {
  const start = performance.now();

  // 1. HTTPS check (HEAD request)
  const httpsResult = await checkHttps(ctx.domain, ctx.options.timeout);

  // Abort on fatal HTTPS errors
  if (httpsResult.abort) {
    return {
      id: 1,
      name: "Reachability",
      status: "evaluated",
      score: 0,
      scoreLabel: "fail",
      checks: [httpsResult.check],
      durationMs: Math.round(performance.now() - start),
      abort: true,
      abortReason: httpsResult.abortReason,
    };
  }

  // 2. Page GET (uses normalized baseUrl)
  const pageResponse = await httpGet(ctx.baseUrl, {
    timeout: ctx.options.timeout,
  });

  // 3. HTTP status check (no HTTP call -- uses pageResponse)
  const httpStatusCheck = checkHttpStatus(pageResponse);

  // 4. robots.txt fetch + parse
  const robotsResult = await checkRobotsTxt(
    ctx.domain,
    ctx.options.timeout,
  );

  // 5. Crawler policies (uses parsed robots.txt data)
  let targetPath: string;
  try {
    targetPath = new URL(ctx.baseUrl).pathname;
  } catch {
    targetPath = "/";
  }
  const crawlerChecks = evaluateCrawlerPolicies(
    robotsResult.parsed,
    targetPath,
  );

  // 6. Meta robots (uses page response)
  let metaRobotsCheck: Check;
  let xRobotsCheck: Check;

  if (pageResponse.ok) {
    metaRobotsCheck = checkMetaRobots(pageResponse.body);
    xRobotsCheck = checkXRobotsTag(pageResponse.headers);
  } else {
    // Page unavailable -- pass empty content (absence of restrictive tags = pass)
    metaRobotsCheck = checkMetaRobots("");
    xRobotsCheck = checkXRobotsTag({});
  }

  // 7. Collect all checks
  const checks: Check[] = [
    httpsResult.check,
    httpStatusCheck,
    robotsResult.check,
    ...crawlerChecks,
    metaRobotsCheck,
    xRobotsCheck,
  ];

  // 8. Calculate score
  const { score, scoreLabel } = calculateScore(checks);

  return {
    id: 1,
    name: "Reachability",
    status: "evaluated",
    score,
    scoreLabel,
    checks,
    durationMs: Math.round(performance.now() - start),
  };
}
