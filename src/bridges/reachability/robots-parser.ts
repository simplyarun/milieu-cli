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
  // 1. Empty pattern matches everything
  if (pattern === "") return true;

  // 2. Check for $ end anchor
  let anchorEnd = false;
  let pat = pattern;
  if (pat.endsWith("$")) {
    anchorEnd = true;
    pat = pat.slice(0, -1);
  }

  // 3. Escape regex special chars except * (already removed $ if present)
  // Escape: \ . + ? [ ] ( ) { } | ^ /
  const escaped = pat.replace(/([\\.\+\?\[\]\(\)\{\}\|\^\/])/g, "\\$1");

  // 4. Replace * with .*
  const regexStr = escaped.replace(/\*/g, ".*");

  // 5. Build regex: prefix match unless $ anchor
  const fullRegex = anchorEnd
    ? new RegExp("^" + regexStr + "$")
    : new RegExp("^" + regexStr);

  return fullRegex.test(path);
}
