import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpSuccess, HttpFailure } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { checkMarkdownNegotiation } from "../markdown-negotiation.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

// --- Helpers ---

function makeSuccess(overrides: Partial<HttpSuccess> = {}): HttpSuccess {
  return {
    ok: true,
    url: "https://example.com",
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: "<html><body>Hello</body></html>",
    redirects: [],
    durationMs: 50,
    ...overrides,
  };
}

function makeMarkdownSuccess(overrides: Partial<HttpSuccess> = {}): HttpSuccess {
  return makeSuccess({
    headers: { "content-type": "text/markdown; charset=utf-8" },
    body: "# Hello\n\nThis is markdown.",
    ...overrides,
  });
}

function makeFail(): HttpFailure {
  return {
    ok: false,
    error: { kind: "timeout", message: "Request timed out", url: "https://example.com" },
  };
}

// --- Tests ---

describe("checkMarkdownNegotiation", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'markdown_negotiation' and correct label", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.id).toBe("markdown_negotiation");
    expect(result.check.label).toBe("Markdown Content Negotiation");
  });

  it("sends Accept: text/markdown header", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    await checkMarkdownNegotiation("https://example.com");
    expect(mockHttpGet).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining("text/markdown"),
        }),
      }),
    );
  });

  it("returns pass when server responds with text/markdown", async () => {
    mockHttpGet.mockResolvedValue(makeMarkdownSuccess());
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.supported).toBe(true);
    expect(result.check.data?.markdownResponse).toBe(true);
    expect(result.check.data?.signals).toContain("text/markdown response");
  });

  it("returns pass with all signals when markdown + tokens + content-signal", async () => {
    mockHttpGet.mockResolvedValue(
      makeMarkdownSuccess({
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "x-markdown-tokens": "3200",
          "content-signal": "ai-train=yes, search=yes, ai-input=yes",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("pass");
    const signals = result.check.data?.signals as string[];
    expect(signals).toContain("text/markdown response");
    expect(signals).toContain("x-markdown-tokens header");
    expect(signals).toContain("Content-Signal (ai-train, ai-input, search)");
  });

  it("returns partial when x-markdown-tokens present but no markdown response", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess({
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-markdown-tokens": "1500",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.supported).toBe(false);
    expect(result.check.data?.signals).toContain("x-markdown-tokens header");
  });

  it("returns partial when Content-Signal present but no markdown response", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess({
        headers: {
          "content-type": "text/html",
          "content-signal": "ai-train=yes, search=yes",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.supported).toBe(false);
    expect(result.check.data?.signals).toContain("Content-Signal (ai-train, search)");
  });

  it("returns fail when no markdown signals detected", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.supported).toBe(false);
  });

  it("returns fail when request fails", async () => {
    mockHttpGet.mockResolvedValue(makeFail());
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.supported).toBe(false);
  });

  it("ignores Content-Signal with no AI directives", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess({
        headers: {
          "content-type": "text/html",
          "content-signal": "cache=yes",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("fail");
  });

  it("handles Content-Signal with mixed yes/no values", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess({
        headers: {
          "content-type": "text/html",
          "content-signal": "ai-train=no, search=yes",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.status).toBe("partial");
    // Both directives are present (even if ai-train=no, it's still a signal)
    expect(result.check.data?.signals).toContain("Content-Signal (ai-train, search)");
  });

  it("passes timeout option to httpGet", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    await checkMarkdownNegotiation("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 5000 }),
    );
  });

  it("stores contentSignal value in data", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess({
        headers: {
          "content-type": "text/html",
          "content-signal": "ai-train=yes",
        },
      }),
    );
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.data?.contentSignal).toBe("ai-train=yes");
  });

  it("stores null contentSignal when header absent", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    const result = await checkMarkdownNegotiation("https://example.com");
    expect(result.check.data).toBeUndefined(); // fail case has no data
  });
});
