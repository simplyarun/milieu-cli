import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkLlmsTxt, checkLlmsFullTxt } from "../llms-txt.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/llms.txt",
    status: 200,
    headers: {},
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: "https://example.com/llms.txt" },
  };
}

describe("checkLlmsTxt", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'llms_txt' and label 'llms.txt'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsTxt("https://example.com");
    expect(result.id).toBe("llms_txt");
    expect(result.label).toBe("llms.txt");
  });

  it("returns pass with size and firstLine when body starts with H1", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# My Site\n\nSome content here"));
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("llms.txt found (30 bytes)");
    expect(result.data).toEqual({
      sizeBytes: 30,
      firstLine: "# My Site",
    });
  });

  it("returns partial when body does NOT start with H1", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("No heading here\nJust text"));
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("partial");
    expect(result.detail).toBe("llms.txt found but missing H1 header");
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms.txt found");
  });

  it("returns fail on whitespace-only body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("   \n  \n  "));
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms.txt found");
  });

  it("calculates byte size correctly for multi-byte chars", async () => {
    // "# Cafe" is 7 ASCII bytes
    mockHttpGet.mockResolvedValue(makeSuccess("# Cafe"));
    const result = await checkLlmsTxt("https://example.com");
    expect(result.status).toBe("pass");
    expect((result.data as { sizeBytes: number }).sizeBytes).toBe(6);
  });

  it("passes timeout to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkLlmsTxt("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith("https://example.com/llms.txt", { timeout: 5000 });
  });
});

describe("checkLlmsFullTxt", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'llms_full_txt' and label 'llms-full.txt'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.id).toBe("llms_full_txt");
    expect(result.label).toBe("llms-full.txt");
  });

  it("returns pass with size for non-empty HTTP 200", async () => {
    const body = "A".repeat(1024);
    mockHttpGet.mockResolvedValue(makeSuccess(body));
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("llms-full.txt found (1024 bytes)");
    expect(result.data).toEqual({ sizeBytes: 1024 });
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms-full.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms-full.txt found");
  });
});
