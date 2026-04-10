import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";
import { parseRobotsTxt, type RobotsTxtResult } from "./robots-parser.js";

export interface RobotsTxtCheckResult {
  check: Check;
  parsed: RobotsTxtResult | null;
}

const DIRECTIVE_PATTERN = /\b(user-agent|disallow|allow)\s*:/i;

/**
 * Fetch and parse robots.txt for the given domain.
 *
 * Returns both the Check result and the parsed data for downstream
 * use by crawler policy evaluation.
 */
export async function checkRobotsTxt(
  domain: string,
  timeout?: number,
): Promise<RobotsTxtCheckResult> {
  const id = "robots_txt";
  const label = "robots.txt";

  const result = await httpGet("https://" + domain + "/robots.txt", {
    timeout,
  });

  if (!result.ok) {
    // 404 = no robots.txt
    if (
      result.error.kind === "http_error" &&
      result.error.statusCode === 404
    ) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: `No robots.txt found at ${domain}`,
        },
        parsed: null,
      };
    }

    // Other errors
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: result.error.message,
      },
      parsed: null,
    };
  }

  // Success -- validate content type
  const contentType = result.headers["content-type"] ?? "";
  const isTextPlain = contentType.toLowerCase().includes("text/plain");
  const hasDirectives = DIRECTIVE_PATTERN.test(result.body);

  if (!isTextPlain && !hasDirectives) {
    return {
      check: {
        id,
        label,
        status: "fail",
        detail: `robots.txt at ${domain} is not a text file (robots.txt is per-origin)`,
      },
      parsed: null,
    };
  }

  // Parse
  const parsed = parseRobotsTxt(result.body);

  if (parsed.ruleCount === 0 && parsed.groups.length === 0) {
    return {
      check: {
        id,
        label,
        status: "partial",
        detail: `robots.txt at ${domain} exists but has no rules`,
      },
      parsed,
    };
  }

  return {
    check: {
      id,
      label,
      status: "pass",
      detail: `robots.txt at ${domain} found with ${parsed.ruleCount} rules`,
      data: { ruleCount: parsed.ruleCount, sitemaps: parsed.sitemaps },
    },
    parsed,
  };
}
