// AI crawler policy evaluation from parsed robots.txt data

import type { Check } from "../../core/types.js";
import type { RobotsTxtResult, RobotsRule } from "./robots-parser.js";
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
 * @param unavailable - robots.txt could not be evaluated
 * @returns Array of 6 Check objects, one per AI crawler
 */
export function evaluateCrawlerPolicies(
  parsed: RobotsTxtResult | null,
  unavailable = false,
): Check[] {
  return AI_CRAWLERS.map((crawler) => {
    const id = `crawler_policy_${crawler.id}`;
    const label = `${crawler.name} Policy`;

    if (unavailable) return { id, label, status: "error", detail: "Could not evaluate crawler policy without robots.txt" };

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
    const rules = findMatchingRules(parsed, crawler.userAgent);

    if (!rules.length) {
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
    return evaluateGroupPolicy(rules, id, label);
  });
}

/**
 * Find the most specific matching group for a crawler.
 * Prefer crawler-specific group over * group (RFC 9309).
 */
function findMatchingRules(parsed: RobotsTxtResult, userAgent: string): RobotsRule[] {
  const specific = parsed.groups.filter((group) => group.userAgents.includes(userAgent));
  const matching = specific.length ? specific : parsed.groups.filter((group) => group.userAgents.includes("*"));
  return matching.flatMap((group) => group.rules).filter((rule) => rule.path !== "");
}

/**
 * Evaluate a crawler's policy from its matching group's rules.
 */
function evaluateGroupPolicy(
  rules: RobotsRule[],
  id: string,
  label: string,
): Check {
  const disallowRules = rules.filter((r) => r.type === "disallow");
  const allowRules = rules.filter((r) => r.type === "allow");

  // No rules or only empty-path Disallow -> pass
  if (disallowRules.length === 0) {
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
