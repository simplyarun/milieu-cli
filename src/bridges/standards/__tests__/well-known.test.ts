import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkSecurityTxt } from "../well-known.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string, url?: string, headers: Record<string, string> = {}): HttpResponse {
  return {
    ok: true,
    url: url ?? "https://example.com/.well-known/security.txt",
    status: 200,
    headers,
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(url?: string): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: url ?? "https://example.com/.well-known/security.txt" },
  };
}

describe("checkSecurityTxt", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns pass when Contact field is present", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("Contact: mailto:security@example.com\nExpires: 2027-01-01T00:00:00.000Z"));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.id).toBe("security_txt");
    expect(result.label).toBe("security.txt");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("security.txt found with Contact field");
  });

  it("returns partial when present but no Contact field", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("Expires: 2027-01-01T00:00:00.000Z\nPolicy: https://example.com/policy"));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("partial");
    expect(result.detail).toBe("security.txt found but missing Contact field");
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No security.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No security.txt found");
  });

  it("detects Contact field case-insensitively", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("contact: mailto:test@example.com"));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("pass");
  });

  it("detects Contact field on non-first line", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# Comment\nExpires: 2027-01-01\nContact: mailto:test@example.com"));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("pass");
  });

  it("returns fail when response is HTML (soft 404)", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess("<html><body>Not Found</body></html>", undefined, { "content-type": "text/html; charset=utf-8" }),
    );
    const result = await checkSecurityTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No security.txt found (HTML response)");
  });
});
