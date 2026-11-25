// RFC 9309 robots.txt parser and path matcher
// Pure logic, no I/O

export interface RobotsTxtResult {
  parseable: boolean;
  ruleCount: number;
  groups: RobotsGroup[];
  sitemaps: string[];
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

export interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}

/**
 * Parse raw robots.txt content into structured data.
 * Handles RFC 9309 edge cases: BOM, CRLF/CR/LF, comments,
 * case-insensitive directives, case-sensitive paths, group boundaries.
 */
export function parseRobotsTxt(content: string): RobotsTxtResult {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  // 1. Strip UTF-8 BOM
  let text = content;
  if (text.charCodeAt(0) === 0xfeff || text.startsWith("\xEF\xBB\xBF")) {
    text = text.replace(/^\xEF\xBB\xBF/, "").replace(/^\uFEFF/, "");
  }

  // 2. Split on CRLF, CR, or LF
  const lines = text.split(/\r\n|\r|\n/);

  let currentGroup: { userAgents: string[]; rules: RobotsRule[] } | null =
    null;

  for (const rawLine of lines) {
    // 3. Strip comments and trim
    const commentIdx = rawLine.indexOf("#");
    const line = (
      commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine
    ).trim();

    if (line === "") continue;

    // 4. Parse directive: split on first ':'
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;

    const directive = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    switch (directive) {
      case "user-agent": {
        // 6. If currentGroup has rules, start a new group
        if (currentGroup && currentGroup.rules.length > 0) {
          groups.push(currentGroup);
          currentGroup = { userAgents: [value.toLowerCase()], rules: [] };
        } else if (currentGroup) {
          // Consecutive User-agent lines = same group
          currentGroup.userAgents.push(value.toLowerCase());
        } else {
          currentGroup = { userAgents: [value.toLowerCase()], rules: [] };
        }
        break;
      }

      case "allow":
      case "disallow": {
        // 7. If no currentGroup, create one with empty userAgents
        if (!currentGroup) {
          currentGroup = { userAgents: [], rules: [] };
        }
        currentGroup.rules.push({ type: directive, path: value });
        break;
      }

      case "sitemap": {
        // 8. Sitemaps are not tied to any group
        sitemaps.push(value);
        break;
      }

      default:
        // 9. Unknown directives: ignore
        break;
    }
  }

  // 10. Push final group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  // 11. Calculate ruleCount
  const ruleCount = groups.reduce((sum, g) => sum + g.rules.length, 0);

  return {
    parseable: true,
    ruleCount,
    groups,
    sitemaps,
  };
}

/**
 * Check whether a robots.txt path pattern matches a given URL path.
 * Supports * wildcards and $ end anchor per RFC 9309.
 */
export function matchesPath(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const glob = anchored ? pattern.slice(0, -1) : pattern;
  const [prefix, ...parts] = glob.split("*");
  if (!parts.length) return anchored ? path === prefix : path.startsWith(prefix);
  if (!path.startsWith(prefix)) return false;

  // Consume literal segments in order. Only a trailing $ anchors the suffix.
  const suffix = anchored ? parts.pop()! : "";
  const limit = path.length - suffix.length;
  if (!path.endsWith(suffix) || prefix.length > limit) return false;
  let offset = prefix.length;
  for (const part of parts) {
    if (!part) continue;
    const index = path.indexOf(part, offset);
    if (index < 0 || index + part.length > limit) return false;
    offset = index + part.length;
  }
  return true;
}
