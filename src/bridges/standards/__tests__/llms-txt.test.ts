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
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.id).toBe("llms_txt");
    expect(check.label).toBe("llms.txt");
  });

  it("returns pass with size and firstLine when body starts with H1", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# My Site\n\nSome content here"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("pass");
    expect(check.detail).toBe("llms.txt found (28 bytes)");
    expect(check.data).toEqual({
      sizeBytes: 28,
      firstLine: "# My Site",
    });
  });

  it("returns partial when body does NOT start with H1", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("No heading here\nJust text"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("partial");
    expect(check.detail).toBe("llms.txt found but missing H1 header");
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("returns fail on whitespace-only body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("   \n  \n  "));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("calculates byte size correctly for multi-byte chars", async () => {
    // "# Cafe" is 7 ASCII bytes
    mockHttpGet.mockResolvedValue(makeSuccess("# Cafe"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("pass");
    expect((check.data as { sizeBytes: number }).sizeBytes).toBe(6);
  });

  it("passes timeout to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkLlmsTxt("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith("https://example.com/llms.txt", { timeout: 5000 });
  });

  it("returns body content on success", async () => {
    const content = "# My Site\n\nSome content here";
    mockHttpGet.mockResolvedValue(makeSuccess(content));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBe(content);
  });

  it("returns null body on 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
  });

  it("returns null body on empty response", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
  });

  it("returns null body on whitespace-only response", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("   \n  \n  "));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
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
