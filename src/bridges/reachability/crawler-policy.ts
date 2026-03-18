// AI crawler policy evaluation from parsed robots.txt data

import type { Check } from "../../core/types.js";
import type { RobotsTxtResult, RobotsGroup } from "./robots-parser.js";
import { matchesPath } from "./robots-parser.js";

export const AI_CRAWLERS = [
  { id: "gptbot", name: "GPTBot", userAgent: "gptbot" },
  { id: "claudebot", name: "ClaudeBot", userAgent: "claudebot" },
  { id: "ccbot", name: "CCBot", userAgent: "ccbot" },
  { id: "googlebot", name: "Googlebot", userAgent: "googlebot" },
  { id: "bingbot", name: "Bingbot", userAgent: "bingbot" },
  { id: "perplexitybot", name: "PerplexityBot", userAgent: "perplexitybot" },
] as const;

/**
 * Evaluate per-AI-crawler policy from parsed robots.txt data.
 *
 * @param parsed - Parsed robots.txt result, or null if robots.txt was not found (404)
 * @param targetPath - The URL path to evaluate against (e.g., "/")
 * @returns Array of 6 Check objects, one per AI crawler
 */
export function evaluateCrawlerPolicies(
  parsed: RobotsTxtResult | null,
  targetPath: string,
): Check[] {
  return AI_CRAWLERS.map((crawler) => {
    const id = `crawler_policy_${crawler.id}`;
    const label = `${crawler.name} Policy`;

    // No robots.txt (404 case): skip
    if (parsed === null) {
      return {
        id,
        label,
        status: "pass" as const,
        detail: "No robots.txt found",
        data: { policy: "skip" },
      };
    }

    // Find group matching this crawler
    const group = findMatchingGroup(parsed, crawler.userAgent);

    if (!group) {
      // No matching group at all -> allowed
      return {
        id,
        label,
        status: "pass" as const,
        detail: "Allowed",
        data: { policy: "pass" },
      };
    }

    // Evaluate policy from the group's rules
    return evaluateGroupPolicy(group, id, label);
  });
}

/**
 * Find the most specific matching group for a crawler.
 * Prefer crawler-specific group over * group (RFC 9309).
 */
function findMatchingGroup(
  parsed: RobotsTxtResult,
  userAgent: string,
): RobotsGroup | null {
  const ua = userAgent.toLowerCase();

  // Look for specific match first
  const specific = parsed.groups.find((g) =>
    g.userAgents.some((a) => a === ua),
  );
  if (specific) return specific;

  // Fall back to * group
  const wildcard = parsed.groups.find((g) =>
    g.userAgents.some((a) => a === "*"),
  );
  return wildcard ?? null;
}

/**
 * Evaluate a crawler's policy from its matching group's rules.
 */
function evaluateGroupPolicy(
  group: RobotsGroup,
  id: string,
  label: string,
): Check {
  const disallowRules = group.rules.filter((r) => r.type === "disallow");
  const allowRules = group.rules.filter((r) => r.type === "allow");

  // No rules or only empty-path Disallow -> pass
  const hasSubstantiveDisallow = disallowRules.some((r) => r.path !== "");
  if (!hasSubstantiveDisallow) {
    return {
      id,
      label,
      status: "pass",
      detail: "Allowed",
      data: { policy: "pass" },
    };
  }

  // Has Disallow: / (root block)?
  const hasRootBlock = disallowRules.some((r) => matchesPath(r.path, "/"));

  if (hasRootBlock && allowRules.length > 0) {
    // Disallow: / with Allow rules -> partial
    return {
      id,
      label,
      status: "partial",
      detail: "Partially restricted",
      data: { policy: "partial" },
    };
  }

  if (hasRootBlock) {
    // Disallow: / with no Allow -> blocked
    return {
      id,
      label,
      status: "fail",
      detail: "Blocked",
      data: { policy: "fail" },
    };
  }

  // Non-root Disallow rules -> partial
  return {
    id,
    label,
    status: "partial",
    detail: "Partially restricted",
    data: { policy: "partial" },
  };
}
