import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRobotsTxt } from "../robots-txt.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(
  body: string,
  headers: Record<string, string> = { "content-type": "text/plain" },
): HttpResponse {
  return {
    ok: true,
    url: "https://sub.example.com/robots.txt",
    status: 200,
    headers,
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: {
      kind: "http_error",
      message: "HTTP 404 Not Found",
      statusCode: 404,
      url: "https://sub.example.com/robots.txt",
    },
  };
}

describe("checkRobotsTxt", () => {
  beforeEach(() => mockHttpGet.mockReset());

  it("includes domain in detail on 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { check } = await checkRobotsTxt("sub.example.com");
    expect(check.status).toBe("partial");
    expect(check.detail).toBe("No robots.txt found at sub.example.com");
  });

  it("includes domain in detail when not a text file", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess("<html>not robots</html>", { "content-type": "text/html" }),
    );
    const { check } = await checkRobotsTxt("sub.example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("sub.example.com");
    expect(check.detail).toContain("per-origin");
  });

  it("includes domain in detail when no rules", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# just a comment"));
    const { check } = await checkRobotsTxt("sub.example.com");
    expect(check.status).toBe("partial");
    expect(check.detail).toBe(
      "robots.txt at sub.example.com exists but has no rules",
    );
  });

  it("includes domain in detail on pass", async () => {
    mockHttpGet.mockResolvedValue(
      makeSuccess("User-agent: *\nDisallow: /private"),
    );
    const { check } = await checkRobotsTxt("sub.example.com");
    expect(check.status).toBe("pass");
    expect(check.detail).toContain("sub.example.com");
  });
});
