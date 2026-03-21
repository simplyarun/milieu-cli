import { describe, it, expect } from "vitest";
import type { ContentSource } from "../../../core/types.js";
import { checkApiPresence } from "../api-presence.js";

/** Helper to wrap a single content string into a ContentSource array */
function sources(content: string, source = "homepage"): ContentSource[] {
  return [{ content, source }];
}

describe("checkApiPresence", () => {
  it("returns id 'api_presence' and label 'API Presence'", () => {
    const result = checkApiPresence(false, [], {});
    expect(result.id).toBe("api_presence");
    expect(result.label).toBe("API Presence");
  });

  it("returns pass when OpenAPI detected by Bridge 2", () => {
    const result = checkApiPresence(true, [], {});
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("OpenAPI spec");
  });

  it("returns pass when x-ratelimit-limit header present", () => {
    const result = checkApiPresence(false, [], {
      "x-ratelimit-limit": "100",
    });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("API headers");
  });

  it("returns pass when x-request-id header present", () => {
    const result = checkApiPresence(false, [], { "x-request-id": "abc" });
    expect(result.status).toBe("pass");
  });

  it("returns pass when HTML contains /api/ links", () => {
    const html = '<a href="/api/v1/users">API</a>';
    const result = checkApiPresence(false, sources(html), {});
    expect(result.status).toBe("pass");
    expect(result.data?.apiLinks).toBeTruthy();
  });

  it("returns fail when link does not contain /api/ pattern", () => {
    const html = '<a href="/about">About</a>';
    const result = checkApiPresence(false, sources(html), {});
    expect(result.status).toBe("fail");
  });

  it("returns fail with detail when no signals found", () => {
    const result = checkApiPresence(false, [], {});
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No API presence signals detected");
  });

  it("does NOT match /developer/ links", () => {
    const html = '<a href="/developer/getting-started">Docs</a>';
    const result = checkApiPresence(false, sources(html), {});
    expect(result.status).toBe("fail");
  });

  // --- Markdown API link tests ---

  it("returns pass when Markdown contains /api/ link", () => {
    const md = "Check out [API Reference](/api/v2/docs) for details.";
    const result = checkApiPresence(false, sources(md), {});
    expect(result.status).toBe("pass");
    expect(result.data?.apiLinks).toContain("/api/v2/docs");
  });

  // --- Empty sources with OpenAPI ---

  it("returns pass with empty sources when OpenAPI detected", () => {
    const result = checkApiPresence(true, [], {});
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("OpenAPI spec");
  });

  // --- Empty sources with no signals ---

  it("returns fail with empty sources and no other signals", () => {
    const result = checkApiPresence(false, [], {});
    expect(result.status).toBe("fail");
  });
});
