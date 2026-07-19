import { describe, it, expect } from "vitest";
import type { HttpResponse } from "../../../core/types.js";
import { checkHttpStatus } from "../http-status.js";

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: "https://example.com" },
  };
}

describe("checkHttpStatus", () => {
  it("fails on an HTTP error with the status code in the detail", () => {
    const check = checkHttpStatus(make404());
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("404");
  });

  it("reports error (not fail) when the page GET was denied by the scan budget", () => {
    const check = checkHttpStatus({
      ok: false,
      error: { kind: "request_budget_exhausted", message: "Scan request budget exhausted", url: "https://example.com" },
    });
    expect(check.status).toBe("error");
    expect(check.detail).toContain("budget");
  });
});
