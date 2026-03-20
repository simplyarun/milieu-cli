import { describe, it, expect } from "vitest";
import {
  parseRobotsTxt,
  matchesPath,
  type RobotsTxtResult,
} from "../robots-parser.js";

describe("parseRobotsTxt", () => {
  it("returns empty result for empty string", () => {
    const result = parseRobotsTxt("");
    expect(result).toEqual({
      parseable: true,
      ruleCount: 0,
      groups: [],
      sitemaps: [],
    });
  });

  it("parses single group with Disallow: /", () => {
    const result = parseRobotsTxt("User-agent: *\nDisallow: /");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual(["*"]);
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "/" },
    ]);
    expect(result.ruleCount).toBe(1);
  });

  it("strips UTF-8 BOM", () => {
    const result = parseRobotsTxt("\xEF\xBB\xBFUser-agent: *\nDisallow: /");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual(["*"]);
  });

  it("handles CRLF line endings", () => {
    const result = parseRobotsTxt("User-agent: *\r\nDisallow: /\r\n");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules).toHaveLength(1);
  });

  it("handles CR-only line endings", () => {
    const result = parseRobotsTxt("User-agent: *\rDisallow: /");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules).toHaveLength(1);
  });

  it("strips comments", () => {
    const result = parseRobotsTxt(
      "User-agent: * # all bots\nDisallow: /secret # hidden",
    );
    expect(result.groups[0].userAgents).toEqual(["*"]);
    expect(result.groups[0].rules[0].path).toBe("/secret");
  });

  it("handles case-insensitive directives", () => {
    const result = parseRobotsTxt("user-agent: *\ndisallow: /foo");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules[0].path).toBe("/foo");
  });

  it("preserves case-sensitive paths", () => {
    const result = parseRobotsTxt("User-agent: *\nDisallow: /Foo");
    expect(result.groups[0].rules[0].path).toBe("/Foo");
  });

  it("handles empty Disallow", () => {
    const result = parseRobotsTxt("User-agent: *\nDisallow:");
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "" },
    ]);
  });

  it("groups consecutive User-agent lines into one group", () => {
    const result = parseRobotsTxt(
      "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /",
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual(["gptbot", "claudebot"]);
    expect(result.groups[0].rules).toHaveLength(1);
  });

  it("creates new group at group boundary", () => {
    const result = parseRobotsTxt(
      "User-agent: a\nDisallow: /x\nUser-agent: b\nDisallow: /y",
    );
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].userAgents).toEqual(["a"]);
    expect(result.groups[0].rules).toEqual([{ type: "disallow", path: "/x" }]);
    expect(result.groups[1].userAgents).toEqual(["b"]);
    expect(result.groups[1].rules).toEqual([{ type: "disallow", path: "/y" }]);
  });

  it("extracts Sitemap lines", () => {
    const result = parseRobotsTxt(
      "Sitemap: https://example.com/sitemap.xml",
    );
    expect(result.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("ignores unknown directives", () => {
    const result = parseRobotsTxt(
      "User-agent: *\nCrawl-delay: 10\nDisallow: /",
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules).toHaveLength(1);
  });

  it("counts rules across all groups", () => {
    const result = parseRobotsTxt(
      "User-agent: a\nDisallow: /x\nAllow: /y\nUser-agent: b\nDisallow: /z",
    );
    expect(result.ruleCount).toBe(3);
  });

  it("parses Allow rules", () => {
    const result = parseRobotsTxt(
      "User-agent: *\nDisallow: /\nAllow: /public",
    );
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "/" },
      { type: "allow", path: "/public" },
    ]);
  });

  it("sets parseable to true", () => {
    const result = parseRobotsTxt("User-agent: *\nDisallow: /");
    expect(result.parseable).toBe(true);
  });

  it("handles multiple sitemaps", () => {
    const result = parseRobotsTxt(
      "Sitemap: https://a.com/s1.xml\nSitemap: https://a.com/s2.xml",
    );
    expect(result.sitemaps).toHaveLength(2);
  });

  it("handles whitespace around colon in directive", () => {
    const result = parseRobotsTxt("User-agent : *\nDisallow : /secret");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual(["*"]);
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "/secret" },
    ]);
  });

  it("handles blank lines between groups", () => {
    const result = parseRobotsTxt(
      "User-agent: a\nDisallow: /x\n\n\nUser-agent: b\nDisallow: /y",
    );
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].userAgents).toEqual(["a"]);
    expect(result.groups[1].userAgents).toEqual(["b"]);
  });

  it("handles comment-only lines between directives", () => {
    const result = parseRobotsTxt(
      "User-agent: *\n# Block the secret\nDisallow: /secret",
    );
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules).toHaveLength(1);
    expect(result.groups[0].rules[0].path).toBe("/secret");
  });

  it("handles very long robots.txt with 50+ rules", () => {
    const lines = ["User-agent: *"];
    for (let i = 0; i < 50; i++) {
      lines.push(`Disallow: /path-${i}`);
    }
    const result = parseRobotsTxt(lines.join("\n"));
    expect(result.ruleCount).toBe(50);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].rules).toHaveLength(50);
  });

  it("handles rules without preceding User-agent", () => {
    const result = parseRobotsTxt("Disallow: /orphan");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual([]);
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "/orphan" },
    ]);
  });

  it("handles consecutive Sitemap lines mixed with groups", () => {
    const result = parseRobotsTxt(
      "Sitemap: https://a.com/s.xml\nUser-agent: *\nDisallow: /\nSitemap: https://b.com/s.xml",
    );
    expect(result.sitemaps).toEqual([
      "https://a.com/s.xml",
      "https://b.com/s.xml",
    ]);
    expect(result.groups).toHaveLength(1);
  });

  it("handles mixed case Sitemap directive", () => {
    const result = parseRobotsTxt(
      "SITEMAP: https://example.com/sitemap.xml",
    );
    expect(result.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("handles tab characters as whitespace in values", () => {
    const result = parseRobotsTxt("User-agent:\t*\nDisallow:\t/path");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].userAgents).toEqual(["*"]);
    expect(result.groups[0].rules).toEqual([
      { type: "disallow", path: "/path" },
    ]);
  });
});

describe("matchesPath", () => {
  it("matches root path against root", () => {
    expect(matchesPath("/", "/")).toBe(true);
  });

  it("matches root as prefix", () => {
    expect(matchesPath("/", "/foo")).toBe(true);
  });

  it("matches exact path", () => {
    expect(matchesPath("/foo", "/foo")).toBe(true);
  });

  it("does not match different path", () => {
    expect(matchesPath("/foo", "/bar")).toBe(false);
  });

  it("matches wildcard pattern", () => {
    expect(matchesPath("/foo*bar", "/fooxbar")).toBe(true);
  });

  it("matches $ anchor at end", () => {
    expect(matchesPath("/foo$", "/foo")).toBe(true);
  });

  it("does not match with $ anchor when path continues", () => {
    expect(matchesPath("/foo$", "/foobar")).toBe(false);
  });

  it("empty pattern matches anything", () => {
    expect(matchesPath("", "/anything")).toBe(true);
  });

  it("matches prefix paths", () => {
    expect(matchesPath("/a/b", "/a/b/c")).toBe(true);
  });

  it("matches wildcard in middle of path", () => {
    expect(matchesPath("/foo/*/bar", "/foo/anything/bar")).toBe(true);
  });

  it("matches multiple wildcards", () => {
    expect(matchesPath("/a/*/b/*", "/a/x/b/y")).toBe(true);
  });

  it("matches file extension wildcard", () => {
    expect(matchesPath("/*.json", "/data.json")).toBe(true);
  });

  it("matches file extension wildcard with $ anchor", () => {
    expect(matchesPath("/*.json$", "/data.json")).toBe(true);
    expect(matchesPath("/*.json$", "/data.json/extra")).toBe(false);
  });

  it("matches path with query string", () => {
    expect(matchesPath("/search", "/search?q=test")).toBe(true);
  });

  it("does not match when pattern has more segments", () => {
    expect(matchesPath("/a/b/c", "/a/b")).toBe(false);
  });
});
