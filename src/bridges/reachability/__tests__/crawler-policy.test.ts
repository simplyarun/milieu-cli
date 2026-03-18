import { describe, it, expect } from "vitest";
import {
  evaluateCrawlerPolicies,
  AI_CRAWLERS,
} from "../crawler-policy.js";
import { parseRobotsTxt } from "../robots-parser.js";
import type { Check } from "../../../core/types.js";

describe("evaluateCrawlerPolicies", () => {
  it("returns 6 checks with pass when no groups exist", () => {
    const parsed = parseRobotsTxt("");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    expect(checks).toHaveLength(6);
    checks.forEach((c) => {
      expect(c.status).toBe("pass");
    });
  });

  it("returns 6 checks with fail when * blocks /", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow: /");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    expect(checks).toHaveLength(6);
    checks.forEach((c) => {
      expect(c.status).toBe("fail");
    });
  });

  it("returns fail for GPTBot when specifically blocked, pass for others", () => {
    const parsed = parseRobotsTxt("User-agent: GPTBot\nDisallow: /");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    const gptbot = checks.find((c) => c.id === "crawler_policy_gptbot");
    expect(gptbot?.status).toBe("fail");
    const others = checks.filter((c) => c.id !== "crawler_policy_gptbot");
    others.forEach((c) => {
      expect(c.status).toBe("pass");
    });
  });

  it("returns partial when * has non-root Disallow", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow: /api");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    expect(checks).toHaveLength(6);
    checks.forEach((c) => {
      expect(c.status).toBe("partial");
    });
  });

  it("returns partial when Disallow: / with Allow: /public", () => {
    const parsed = parseRobotsTxt(
      "User-agent: *\nDisallow: /\nAllow: /public",
    );
    const checks = evaluateCrawlerPolicies(parsed, "/");
    checks.forEach((c) => {
      expect(c.status).toBe("partial");
    });
  });

  it("crawler not mentioned, no * group -> pass", () => {
    const parsed = parseRobotsTxt("User-agent: SomeOtherBot\nDisallow: /");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    checks.forEach((c) => {
      expect(c.status).toBe("pass");
    });
  });

  it("crawler not mentioned, * blocks -> fail", () => {
    const parsed = parseRobotsTxt(
      "User-agent: *\nDisallow: /\nUser-agent: SomeBot\nDisallow: /x",
    );
    const checks = evaluateCrawlerPolicies(parsed, "/");
    // All AI crawlers inherit * block (Disallow: /)
    checks.forEach((c) => {
      expect(c.status).toBe("fail");
    });
  });

  it("returns skip checks when parsed is null (404 case)", () => {
    const checks = evaluateCrawlerPolicies(null, "/");
    expect(checks).toHaveLength(6);
    checks.forEach((c) => {
      expect(c.status).toBe("pass");
      expect(c.detail).toBe("No robots.txt found");
      expect(c.data?.policy).toBe("skip");
    });
  });

  it("empty Disallow means allow all -> pass", () => {
    const parsed = parseRobotsTxt("User-agent: *\nDisallow:");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    checks.forEach((c) => {
      expect(c.status).toBe("pass");
    });
  });

  it("check ids follow pattern crawler_policy_{id}", () => {
    const parsed = parseRobotsTxt("");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    expect(checks.map((c) => c.id)).toEqual([
      "crawler_policy_gptbot",
      "crawler_policy_claudebot",
      "crawler_policy_ccbot",
      "crawler_policy_googlebot",
      "crawler_policy_bingbot",
      "crawler_policy_perplexitybot",
    ]);
  });

  it("check labels follow pattern Name Policy", () => {
    const parsed = parseRobotsTxt("");
    const checks = evaluateCrawlerPolicies(parsed, "/");
    expect(checks.map((c) => c.label)).toEqual([
      "GPTBot Policy",
      "ClaudeBot Policy",
      "CCBot Policy",
      "Googlebot Policy",
      "Bingbot Policy",
      "PerplexityBot Policy",
    ]);
  });

  it("exports AI_CRAWLERS with 6 entries", () => {
    expect(AI_CRAWLERS).toHaveLength(6);
  });
});
