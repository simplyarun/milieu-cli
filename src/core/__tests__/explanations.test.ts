import { describe, it, expect } from "vitest";
import {
  resolveExplanation,
  CHECK_EXPLANATIONS,
} from "../explanations.js";

describe("resolveExplanation", () => {
  it("returns the plain string for a plain-string entry", () => {
    const result = resolveExplanation("https_available", "pass");
    expect(result).toBe(
      "HTTPS is required for secure communication. AI agents refuse to interact with insecure endpoints.",
    );
  });

  it("returns the same string for all statuses on a plain-string entry", () => {
    const pass = resolveExplanation("https_available", "pass");
    const fail = resolveExplanation("https_available", "fail");
    const partial = resolveExplanation("https_available", "partial");
    const error = resolveExplanation("https_available", "error");
    expect(pass).toBe(fail);
    expect(fail).toBe(partial);
    expect(partial).toBe(error);
  });

  it("returns the status-specific string when available", () => {
    const result = resolveExplanation("http_status", "pass");
    expect(result).toBe(
      "Your product surface returns a clean 200 response — agents can reach your content without issues.",
    );
  });

  it("falls back to default when status key is missing", () => {
    // http_status has pass, fail, partial, default — but not error
    const result = resolveExplanation("http_status", "error");
    expect(result).toBe(
      "A non-200 status means agents can't reliably reach your content.",
    );
  });

  it("returns undefined for unknown check ID", () => {
    const result = resolveExplanation("nonexistent_check", "pass");
    expect(result).toBeUndefined();
  });
});

describe("CHECK_EXPLANATIONS structural sync", () => {
  // All 26 known check IDs across bridges 1-3
  const ALL_CHECK_IDS = [
    // Bridge 1: Reachability
    "https_available",
    "http_status",
    "robots_txt",
    "crawler_policy_gptbot",
    "crawler_policy_claudebot",
    "crawler_policy_ccbot",
    "crawler_policy_googlebot",
    "crawler_policy_bingbot",
    "crawler_policy_perplexitybot",
    "meta_robots",
    "x_robots_tag",
    // Bridge 2: Standards
    "openapi_spec",
    "graphql_endpoint",
    "sitemap",
    "markdown_negotiation",
    "llms_txt",
    "llms_full_txt",
    "mcp_endpoint",
    "json_ld",
    "schema_org",
    "security_txt",
    "ai_plugin",
    // Bridge 3: Separation
    "api_presence",
    "developer_docs",
    "sdk_references",
    "webhook_support",
  ];

  it("every check ID has an explanation", () => {
    const missing = ALL_CHECK_IDS.filter(
      (id) => CHECK_EXPLANATIONS[id] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("no orphaned keys exist in CHECK_EXPLANATIONS", () => {
    const orphaned = Object.keys(CHECK_EXPLANATIONS).filter(
      (key) => !ALL_CHECK_IDS.includes(key),
    );
    expect(orphaned).toEqual([]);
  });
});
