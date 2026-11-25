import type { Check } from "../../core/types.js";

/**
 * Check for restrictive meta robots tags in the HTML <head> section.
 * Uses regex only -- no HTML parser dependency.
 *
 * Scans for: robots, googlebot, bingbot name attributes.
 * Handles both attribute orders, single/double quotes, self-closing tags, case insensitivity.
 */
export function checkMetaRobots(html: string): Check {
  const id = "meta_robots";
  const label = "Meta Robots Tags";

  // Extract head content (case-insensitive)
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) {
    return {
      id,
      label,
      status: "pass",
      detail: "No restrictive meta robots tags found",
      data: { directives: [] },
    };
  }

  const headContent = headMatch[1];
  const filtered: string[] = [];
  for (const [tag] of headContent.matchAll(/<meta(?=\s)[^<>]*>/gi)) {
    if (!/\sname\s*=\s*["'](?:robots|googlebot|bingbot)["']/i.test(tag)) continue;
    const content = /\scontent\s*=\s*(["'])(.*?)\1/is.exec(tag)?.[2];
    if (!content) continue;
    for (const value of content.split(",")) {
      const directive = value.trim().toLowerCase();
      if (directive) filtered.push(directive);
    }
  }

  if (filtered.some((d) => d === "noindex")) {
    return {
      id,
      label,
      status: "fail",
      detail: `Restrictive meta robots directives found: ${filtered.join(", ")}`,
      data: { directives: filtered },
    };
  }

  if (filtered.some((d) => d === "nofollow")) {
    return {
      id,
      label,
      status: "partial",
      detail: `Restrictive meta robots directives found: ${filtered.join(", ")}`,
      data: { directives: filtered },
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: "No restrictive meta robots tags found",
    data: { directives: filtered },
  };
}

/**
 * Check for X-Robots-Tag HTTP header directives.
 *
 * Headers object is expected to have lowercase keys (from Phase 2 httpGet).
 */
export function checkXRobotsTag(headers: Record<string, string>): Check {
  const id = "x_robots_tag";
  const label = "X-Robots-Tag Header";

  const headerValue = headers["x-robots-tag"];
  if (!headerValue) {
    return {
      id,
      label,
      status: "pass",
      detail: "No X-Robots-Tag header",
      data: { directives: [], raw: "" },
    };
  }

  const directives = headerValue
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);

  if (directives.some((d) => d.includes("noindex"))) {
    return {
      id,
      label,
      status: "fail",
      detail: `X-Robots-Tag contains restrictive directives: ${directives.join(", ")}`,
      data: { directives, raw: headerValue },
    };
  }

  if (
    directives.some(
      (d) =>
        d.includes("nofollow") || d.includes("noarchive") || d === "none",
    )
  ) {
    return {
      id,
      label,
      status: "partial",
      detail: `X-Robots-Tag contains directives: ${directives.join(", ")}`,
      data: { directives, raw: headerValue },
    };
  }

  return {
    id,
    label,
    status: "pass",
    detail: `X-Robots-Tag header present with no restrictive directives`,
    data: { directives, raw: headerValue },
  };
}
