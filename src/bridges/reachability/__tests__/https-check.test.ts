import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { checkHttps } from "../https-check.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(): HttpResponse {
  return {
    ok: true,
    url: "https://example.com",
    status: 200,
    headers: {},
    body: "",
    redirects: [],
    durationMs: 20,
  };
}

describe("checkHttps", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("passes when the HEAD request succeeds", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess());
    const result = await checkHttps("example.com");
    expect(result.check.status).toBe("pass");
    expect(result.abort).toBe(false);
  });

  it("aborts on DNS failure", async () => {
    mockHttpGet.mockResolvedValue({
      ok: false,
      error: { kind: "dns", message: "DNS resolution failed", url: "https://example.com" },
    });
    const result = await checkHttps("example.com");
    expect(result.check.status).toBe("fail");
    expect(result.abort).toBe(true);
    expect(result.abortReason).toBe("dns");
  });

  it("reports error without aborting when the probe was denied by the scan budget", async () => {
    mockHttpGet.mockResolvedValue({
      ok: false,
      error: { kind: "request_budget_exhausted", message: "Scan request budget exhausted", url: "https://example.com" },
    });
    const result = await checkHttps("example.com");
    expect(result.check.status).toBe("error");
    expect(result.abort).toBe(false);
  });
});
