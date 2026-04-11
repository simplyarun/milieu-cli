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

  it("returns pass with body when Contact field is present", async () => {
    const body = "Contact: mailto:security@example.com\nExpires: 2027-01-01T00:00:00.000Z";
    mockHttpGet.mockResolvedValue(makeSuccess(body));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.check.id).toBe("security_txt");
    expect(result.check.label).toBe("security.txt");
    expect(result.check.status).toBe("pass");
    expect(result.check.detail).toBe("security.txt found with Contact field");
    expect(result.body).toBe(body);
  });

  it("returns partial with body when present but no Contact field", async () => {
    const body = "Expires: 2027-01-01T00:00:00.000Z\nPolicy: https://example.com/policy";
    mockHttpGet.mockResolvedValue(makeSuccess(body));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toBe("security.txt found but missing Contact field");
    expect(result.body).toBe(body);
  });

  it("returns fail with null body on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkSecurityTxt("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.check.detail).toBe("No security.txt found");
    expect(result.body).toBeNull();
  });

  it("returns fail with null body on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const result = await checkSecurityTxt("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.body).toBeNull();
  });

  it("detects Contact field case-insensitively", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("contact: mailto:test@example.com"));
    const { check } = await checkSecurityTxt("https://example.com");
    expect(check.status).toBe("pass");
  });

  it("detects Contact field on non-first line", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# Comment\nExpires: 2027-01-01\nContact: mailto:test@example.com"));
    const { check } = await checkSecurityTxt("https://example.com");
    expect(check.status).toBe("pass");
  });

  it("returns fail with null body when response is HTML (soft 404)", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess("<html><body>Not Found</body></html>", undefined, { "content-type": "text/html; charset=utf-8" }),
    );
    const result = await checkSecurityTxt("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.check.detail).toBe("No security.txt found (HTML response)");
    expect(result.body).toBeNull();
  });
});
