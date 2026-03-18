import { describe, it, expect } from "vitest";
import { normalizeUrl, extractDomain, resolveRedirectUrl } from "../url.js";

describe("normalizeUrl", () => {
  it("prepends https:// to bare domain", () => {
    const result = normalizeUrl("stripe.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toMatch(/^https:\/\/stripe\.com/);
    }
  });

  it("preserves existing https:// protocol", () => {
    const result = normalizeUrl("https://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toBe("https://example.com/");
    }
  });

  it("preserves existing http:// protocol", () => {
    const result = normalizeUrl("http://example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toMatch(/^http:\/\/example\.com/);
    }
  });

  it("preserves query strings", () => {
    const result = normalizeUrl("example.com/path?q=1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toContain("?q=1");
    }
  });

  it("preserves ports and extracts domain without port", () => {
    const result = normalizeUrl("example.com:8080");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.domain).toBe("example.com");
      expect(result.href).toContain(":8080");
    }
  });

  it("handles protocol-relative input (//example.com)", () => {
    const result = normalizeUrl("//example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.href).toMatch(/^https:\/\/example\.com/);
    }
  });

  it("lowercases domain", () => {
    const result = normalizeUrl("EXAMPLE.COM");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.domain).toBe("example.com");
    }
  });

  it("returns error for empty string", () => {
    const result = normalizeUrl("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Empty URL");
    }
  });

  it("returns error for whitespace only", () => {
    const result = normalizeUrl("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Empty URL");
    }
  });

  it("returns error for invalid URL", () => {
    const result = normalizeUrl("not a url at all !@#$");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid URL/);
    }
  });
});

describe("extractDomain", () => {
  it("extracts hostname from URL with port and path", () => {
    expect(extractDomain("https://api.example.com:8080/path")).toBe(
      "api.example.com",
    );
  });

  it("extracts hostname from simple URL", () => {
    expect(extractDomain("https://example.com")).toBe("example.com");
  });
});

describe("resolveRedirectUrl", () => {
  it("resolves relative path against current URL", () => {
    const result = resolveRedirectUrl("/login", "https://example.com/page");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://example.com/login");
    }
  });

  it("resolves absolute URL (ignores current URL)", () => {
    const result = resolveRedirectUrl(
      "https://other.com/page",
      "https://example.com",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://other.com/page");
    }
  });

  it("resolves protocol-relative URL", () => {
    const result = resolveRedirectUrl(
      "//cdn.example.com/file",
      "https://example.com",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://cdn.example.com/file");
    }
  });

  it("resolves relative path with ..", () => {
    const result = resolveRedirectUrl("../other", "https://example.com/a/b");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("https://example.com/other");
    }
  });

  it("returns error for empty Location header", () => {
    const result = resolveRedirectUrl("", "https://example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Empty Location header");
    }
  });

  it("returns error for whitespace-only Location header", () => {
    const result = resolveRedirectUrl("   ", "https://example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Empty Location header");
    }
  });
});
