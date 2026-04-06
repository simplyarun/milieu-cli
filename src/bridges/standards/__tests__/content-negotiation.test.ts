import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkContentNegotiation } from "../content-negotiation.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(
  contentType: string,
  body = "",
): HttpResponse {
  return {
    ok: true,
    url: "https://example.com",
    status: 200,
    headers: { "content-type": contentType },
    body,
    redirects: [],
    durationMs: 50,
  };
}

describe("checkContentNegotiation", () => {
  beforeEach(() => mockHttpGet.mockReset());

  it("returns pass when text/markdown is returned", async () => {
    mockHttpGet
      .mockResolvedValueOnce(makeSuccess("text/markdown", "# Hello"))
      .mockResolvedValueOnce(makeSuccess("text/html", "<html></html>"));

    const result = await checkContentNegotiation("https://example.com");
    expect(result.id).toBe("standards_content_negotiation");
    expect(result.status).toBe("pass");
    expect(result.data?.markdownSupported).toBe(true);
  });

  it("returns pass when text/plain with markdown content", async () => {
    mockHttpGet
      .mockResolvedValueOnce(makeSuccess("text/plain", "# Heading\n\n[Link](http://example.com)"))
      .mockResolvedValueOnce(makeSuccess("text/html", "<html></html>"));

    const result = await checkContentNegotiation("https://example.com");
    expect(result.status).toBe("pass");
  });

  it("returns partial when different content-type than HTML default", async () => {
    mockHttpGet
      .mockResolvedValueOnce(makeSuccess("application/json", "{}"))
      .mockResolvedValueOnce(makeSuccess("text/html", "<html></html>"));

    const result = await checkContentNegotiation("https://example.com");
    expect(result.status).toBe("partial");
  });

  it("returns fail when same HTML regardless of Accept header", async () => {
    mockHttpGet
      .mockResolvedValueOnce(makeSuccess("text/html", "<html></html>"))
      .mockResolvedValueOnce(makeSuccess("text/html", "<html></html>"));

    const result = await checkContentNegotiation("https://example.com");
    expect(result.status).toBe("fail");
  });

  it("returns fail when site unreachable", async () => {
    mockHttpGet.mockResolvedValue({
      ok: false,
      error: { kind: "dns", message: "DNS failed", url: "https://example.com" },
    });

    const result = await checkContentNegotiation("https://example.com");
    expect(result.status).toBe("fail");
  });
});
