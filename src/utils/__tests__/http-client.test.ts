import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HttpResponse } from "../../core/types.js";

// Mock validateDns and resolveRedirectUrl
vi.mock("../ssrf.js", () => ({
  validateDns: vi.fn(),
}));

vi.mock("../url.js", () => ({
  resolveRedirectUrl: vi.fn(),
}));

import { httpGet, RequestCoordinator, runWithScanRequestContext, getScanRequestStats, pinnedLookup } from "../http-client.js";
import { getVersion } from "../../core/version.js";
import { validateDns } from "../ssrf.js";
import { resolveRedirectUrl } from "../url.js";

const mockValidateDns = vi.mocked(validateDns);
const mockResolveRedirectUrl = vi.mocked(resolveRedirectUrl);

// Helper to create a mock Response with a real ReadableStream body
function mockResponse(options: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}): Response {
  const { status = 200, statusText = "OK", headers = {}, body = "" } = options;
  const h = new Headers(headers);
  const encoded = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (encoded.length > 0) {
        controller.enqueue(encoded);
      }
      controller.close();
    },
  });
  return {
    status,
    statusText,
    headers: h,
    text: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    redirected: false,
    type: "basic",
    url: "",
    clone: () => mockResponse(options),
    body: stream,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

describe("SSRF connection pinning", () => {
  it("pinnedLookup resolves ANY hostname to the validated IP (defeats DNS rebinding)", () => {
    const lookup = pinnedLookup("93.184.216.34");
    const cb = vi.fn();
    // A rebinding attacker would return a private IP here on the second lookup.
    lookup("rebind.evil.example", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("pinnedLookup reports family 6 for an IPv6 address", () => {
    const lookup = pinnedLookup("2606:2800:220:1:248:1893:25c8:1946");
    const cb = vi.fn();
    lookup("example.com", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "2606:2800:220:1:248:1893:25c8:1946", 6);
  });
});

describe("RequestCoordinator", () => {
  it("defaults to 8 concurrent and 150 total requests", () => {
    const c = new RequestCoordinator();
    expect(c.maxConcurrency).toBe(8);
    // A full scan against a 404-everything site makes ~50 physical requests
    // (before redirects/retries), so the default budget must sit well above
    // that floor or every ordinary scan exhausts it mid-flight.
    expect(c.maxRequests).toBe(150);
  });

  it("counts started and denied requests", async () => {
    const c = new RequestCoordinator(2, 3);
    expect(await c.acquire()).toBe(true);
    expect(await c.acquire()).toBe(true);
    c.release();
    expect(await c.acquire()).toBe(true);
    c.release();
    expect(await c.acquire()).toBe(false);
    expect(c.startedCount).toBe(3);
    expect(c.deniedCount).toBe(1);
  });

  it("holds acquire() at max concurrency until a slot frees", async () => {
    const c = new RequestCoordinator(2, 10);
    await c.acquire();
    await c.acquire();
    let granted = false;
    const third = c.acquire().then((g) => { granted = true; return g; });
    await new Promise((r) => setImmediate(r));
    expect(granted).toBe(false);
    c.release();
    await expect(third).resolves.toBe(true);
  });
});

describe("scan request context", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mockValidateDns.mockResolvedValue({ safe: true, ip: "93.184.216.34" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns request_budget_exhausted through httpGet once the budget is spent", async () => {
    fetchSpy.mockResolvedValue(mockResponse({ status: 404, statusText: "Not Found" }));
    await runWithScanRequestContext({ maxRequests: 1 }, async () => {
      const first = await httpGet("https://example.com/a");
      expect(first.ok).toBe(false);
      const second = await httpGet("https://example.com/b");
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.error.kind).toBe("request_budget_exhausted");
      }
      expect(getScanRequestStats()).toEqual({ started: 1, denied: 1 });
    });
  });

  it("counts retry attempts against the budget", async () => {
    // A timeout is retriable; with budget for both attempts, the retry
    // consumes a second slot — proving retries are charged.
    fetchSpy.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    await runWithScanRequestContext({ maxRequests: 2 }, async () => {
      const result = await httpGet("https://example.com/a", { timeout: 50 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("timeout");
      }
      expect(getScanRequestStats()).toEqual({ started: 2, denied: 0 });
    });
  });

  it("skips the retry entirely when the budget cannot grant it", async () => {
    // Budget of 1: the first attempt spends it; the retry is not started
    // and the genuine timeout (not request_budget_exhausted) is returned.
    fetchSpy.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    await runWithScanRequestContext({ maxRequests: 1 }, async () => {
      const result = await httpGet("https://example.com/a", { timeout: 50 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("timeout");
      }
      expect(getScanRequestStats()).toEqual({ started: 1, denied: 0 });
    });
  });

  it("returns the genuine first-attempt failure when the retry would be denied by the budget", async () => {
    // connection_refused is retriable AND drives scan-abort decisions; a
    // budget-denied retry must not mask it with request_budget_exhausted.
    const refused = new TypeError("fetch failed");
    Object.assign(refused, { cause: { code: "ECONNREFUSED" } });
    fetchSpy.mockRejectedValue(refused);

    const result = await runWithScanRequestContext({ maxRequests: 1 }, () =>
      httpGet("https://example.com/a", { timeout: 50 }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("connection_refused");
    }
  });

  it("falls back to safe defaults when configured limits are invalid", async () => {
    fetchSpy.mockResolvedValue(mockResponse({ status: 404, statusText: "Not Found" }));

    const result = await runWithScanRequestContext(
      { maxConcurrency: Number.NaN, maxRequests: -5 },
      () => httpGet("https://example.com/a"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http_error");
    }
  });

  it("shares one DNS cache across all requests in a scan context", async () => {
    fetchSpy.mockResolvedValue(mockResponse({ status: 404, statusText: "Not Found" }));
    await runWithScanRequestContext({}, async () => {
      await httpGet("https://example.com/a");
      await httpGet("https://example.com/b");
    });
    const caches = mockValidateDns.mock.calls.map((call) => call[1]);
    expect(caches.length).toBeGreaterThanOrEqual(2);
    expect(caches[0]).toBe(caches[1]);
  });

  it("getScanRequestStats returns null outside a scan context", () => {
    expect(getScanRequestStats()).toBeNull();
  });
});

describe("httpGet", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // Default: DNS is safe
    mockValidateDns.mockResolvedValue({ safe: true, ip: "93.184.216.34" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Error classification tests
  // -----------------------------------------------------------------------
  describe("error classification", () => {
    it("returns kind 'timeout' on DOMException TimeoutError", async () => {
      const err = new DOMException("The operation was aborted", "TimeoutError");
      // Both initial and retry attempt time out
      fetchSpy.mockRejectedValueOnce(err).mockRejectedValueOnce(err);

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("timeout");
      }
    }, 10_000);

    it("returns kind 'dns' on TypeError with cause.code ENOTFOUND", async () => {
      const err = new TypeError("fetch failed");
      (err as any).cause = { code: "ENOTFOUND" };
      fetchSpy.mockRejectedValueOnce(err);

      const result = await httpGet("https://nonexistent.invalid");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("dns");
      }
    });

    it("returns kind 'connection_refused' on ECONNREFUSED", async () => {
      const err = new TypeError("fetch failed");
      (err as any).cause = { code: "ECONNREFUSED" };
      // Both initial and retry attempt fail
      fetchSpy.mockRejectedValueOnce(err).mockRejectedValueOnce(err);

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("connection_refused");
      }
    }, 10_000);

    it("returns kind 'ssl_error' on CERT_HAS_EXPIRED", async () => {
      const err = new TypeError("fetch failed");
      (err as any).cause = { code: "CERT_HAS_EXPIRED" };
      fetchSpy.mockRejectedValueOnce(err);

      const result = await httpGet("https://expired.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("ssl_error");
      }
    });

    it("returns kind 'ssrf_blocked' when validateDns returns safe:false", async () => {
      mockValidateDns.mockResolvedValueOnce({
        safe: false,
        error: "Hostname resolves to private address 127.0.0.1",
        ip: "127.0.0.1",
      });

      const result = await httpGet("https://evil.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("ssrf_blocked");
      }
    });

    it("returns kind 'dns' when validateDns returns DNS resolution failure", async () => {
      mockValidateDns.mockResolvedValueOnce({
        safe: false,
        error: "DNS resolution failed: ENOTFOUND",
      });

      const result = await httpGet("https://nonexistent.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("dns");
      }
    });

    it("returns kind 'unknown' for unrecognized errors", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Something weird"));

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("unknown");
      }
    });

    it("returns kind 'unknown' for invalid URL", async () => {
      const result = await httpGet("not a url at all");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("unknown");
        expect(result.error.message).toBe("Invalid URL");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Response handling tests
  // -----------------------------------------------------------------------
  describe("response handling", () => {
    it("returns HttpSuccess with body and status 200", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "<html>Hello</html>" }),
      );

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.status).toBe(200);
        expect(result.body).toBe("<html>Hello</html>");
        expect(result.url).toBe("https://example.com");
        expect(result.redirects).toEqual([]);
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("returns HttpFailure kind 'http_error' with statusCode 404", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 404, statusText: "Not Found" }),
      );

      const result = await httpGet("https://example.com/missing");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http_error");
        expect(result.error.statusCode).toBe(404);
      }
    });

    it("returns HttpFailure kind 'http_error' with statusCode 500 after retry", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ status: 500, statusText: "Server Error" }))
        .mockResolvedValueOnce(mockResponse({ status: 500, statusText: "Server Error" }));

      const result = await httpGet("https://example.com", { timeout: 1000 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http_error");
        expect(result.error.statusCode).toBe(500);
      }
      // Should have been called twice (initial + 1 retry)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Bot protection tests
  // -----------------------------------------------------------------------
  describe("bot protection detection", () => {
    it("returns kind 'bot_protected' for 403 with cloudflare server header", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 403,
          statusText: "Forbidden",
          headers: { server: "cloudflare" },
        }),
      );

      const result = await httpGet("https://protected.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("bot_protected");
        expect(result.error.statusCode).toBe(403);
      }
    });

    it("returns kind 'bot_protected' for 403 with cf-ray header", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 403,
          statusText: "Forbidden",
          headers: { "cf-ray": "abc123" },
        }),
      );

      const result = await httpGet("https://protected.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("bot_protected");
      }
    });

    it("returns kind 'bot_protected' for 429", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 429, statusText: "Too Many Requests" }),
      );

      const result = await httpGet("https://ratelimited.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("bot_protected");
        expect(result.error.statusCode).toBe(429);
      }
    });

    it("returns kind 'bot_protected' for 503 with cloudflare server", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 503,
          statusText: "Service Unavailable",
          headers: { server: "cloudflare" },
        }),
      );

      const result = await httpGet("https://challenged.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("bot_protected");
      }
    });

    it("returns kind 'http_error' for 403 WITHOUT cloudflare indicators", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 403,
          statusText: "Forbidden",
          headers: { server: "nginx" },
        }),
      );

      const result = await httpGet("https://forbidden.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http_error");
        expect(result.error.statusCode).toBe(403);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Redirect tests
  // -----------------------------------------------------------------------
  describe("redirect handling", () => {
    it("follows redirect and returns success with redirects array", async () => {
      mockResolveRedirectUrl.mockReturnValueOnce({
        ok: true,
        url: "https://example.com/final",
      });

      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            status: 301,
            statusText: "Moved",
            headers: { location: "/final" },
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({ status: 200, body: "Final page" }),
        );

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.redirects).toEqual(["https://example.com"]);
        expect(result.url).toBe("https://example.com/final");
        expect(result.body).toBe("Final page");
      }
    });

    it("returns error on too many redirects", async () => {
      // Each redirect resolves successfully
      mockResolveRedirectUrl.mockReturnValue({
        ok: true,
        url: "https://example.com/loop",
      });

      // Return 301 for all hops
      fetchSpy.mockResolvedValue(
        mockResponse({
          status: 301,
          statusText: "Moved",
          headers: { location: "/loop" },
        }),
      );

      const result = await httpGet("https://example.com", { maxRedirects: 3 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("http_error");
        expect(result.error.message).toContain("Too many redirects");
      }
    });

    it("returns ssrf_blocked when redirect target resolves to private IP", async () => {
      mockResolveRedirectUrl.mockReturnValueOnce({
        ok: true,
        url: "https://internal.example.com/secret",
      });

      // First hop is safe, second (redirect target) is blocked
      mockValidateDns
        .mockResolvedValueOnce({ safe: true, ip: "93.184.216.34" })
        .mockResolvedValueOnce({
          safe: false,
          error: "Hostname resolves to private address 10.0.0.1",
          ip: "10.0.0.1",
        });

      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 302,
          statusText: "Found",
          headers: { location: "https://internal.example.com/secret" },
        }),
      );

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("ssrf_blocked");
      }
    });
  });

  // -----------------------------------------------------------------------
  // Retry tests
  // -----------------------------------------------------------------------
  describe("retry logic", () => {
    it("retries once on 500 and returns success on second attempt", async () => {
      fetchSpy
        .mockResolvedValueOnce(mockResponse({ status: 500, statusText: "Server Error" }))
        .mockResolvedValueOnce(mockResponse({ status: 200, body: "Recovered" }));

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe("Recovered");
      }
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }, 10_000);

    it("retries once on timeout and returns success on second attempt", async () => {
      const timeoutErr = new DOMException("The operation was aborted", "TimeoutError");
      fetchSpy
        .mockRejectedValueOnce(timeoutErr)
        .mockResolvedValueOnce(mockResponse({ status: 200, body: "Recovered" }));

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe("Recovered");
      }
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }, 10_000);

    it("does NOT retry on 404", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 404, statusText: "Not Found" }),
      );

      const result = await httpGet("https://example.com/missing");
      expect(result.ok).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on dns failure", async () => {
      mockValidateDns.mockResolvedValueOnce({
        safe: false,
        error: "DNS resolution failed: ENOTFOUND",
      });

      const result = await httpGet("https://nonexistent.invalid");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("dns");
      }
      // fetch should not even be called -- DNS failed in pre-flight
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it("does NOT retry on ssrf_blocked", async () => {
      mockValidateDns.mockResolvedValueOnce({
        safe: false,
        error: "Hostname resolves to private address 127.0.0.1",
        ip: "127.0.0.1",
      });

      const result = await httpGet("https://evil.example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("ssrf_blocked");
      }
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });
  });

  // -----------------------------------------------------------------------
  // HEAD method test
  // -----------------------------------------------------------------------
  describe("HEAD method", () => {
    it("returns empty body for HEAD requests", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "Should not appear" }),
      );

      const result = await httpGet("https://example.com", { method: "HEAD" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe("");
      }
    });
  });

  // -----------------------------------------------------------------------
  // User-Agent test
  // -----------------------------------------------------------------------
  describe("User-Agent header", () => {
    it("sends a User-Agent derived from the package version", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 200, body: "OK" }),
      );

      await httpGet("https://example.com");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0];
      const requestOptions = callArgs[1];
      expect(requestOptions.headers["User-Agent"]).toBe(`milieu-cli/${getVersion()}`);
      // Never ship the stale hardcoded 0.1.0 again.
      expect(requestOptions.headers["User-Agent"]).not.toBe("milieu-cli/0.1.0");
    });

    it("passes a connection-pinning dispatcher to fetch (SSRF hardening)", async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ status: 200, body: "OK" }));

      await httpGet("https://example.com");

      const init = fetchSpy.mock.calls[0][1] as { dispatcher?: unknown };
      expect(init.dispatcher).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Body size limit test
  // -----------------------------------------------------------------------
  describe("body size limits", () => {
    it("returns body_too_large when Content-Length exceeds maxBodyBytes", async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          headers: { "content-length": "10000000" }, // 10MB
        }),
      );

      const result = await httpGet("https://example.com", { maxBodyBytes: 5 * 1024 * 1024 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("body_too_large");
      }
    });

    it("stops reading body stream at maxBodyBytes without downloading the rest", async () => {
      const largeBody = "x".repeat(200);
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ status: 200, body: largeBody }),
      );

      const result = await httpGet("https://example.com", { maxBodyBytes: 100 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body.length).toBe(100);
      }
    });

    it("reads body correctly when delivered in multiple chunks", async () => {
      const h = new Headers();
      const chunkA = new TextEncoder().encode("Hello ");
      const chunkB = new TextEncoder().encode("World!");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunkA);
          controller.enqueue(chunkB);
          controller.close();
        },
      });
      const response = {
        status: 200,
        statusText: "OK",
        headers: h,
        text: () => Promise.resolve("Hello World!"),
        body: stream,
        bodyUsed: false,
        ok: true,
        redirected: false,
        type: "basic",
        url: "",
        clone: () => response,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        json: () => Promise.resolve({}),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response;

      fetchSpy.mockResolvedValueOnce(response);

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe("Hello World!");
      }
    });

    it("stops mid-chunk when maxBodyBytes falls within a chunk boundary", async () => {
      const h = new Headers();
      const chunk1 = new TextEncoder().encode("aaaa"); // 4 bytes
      const chunk2 = new TextEncoder().encode("bbbbbbbb"); // 8 bytes
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
          controller.close();
        },
      });
      const response = {
        status: 200,
        statusText: "OK",
        headers: h,
        text: () => Promise.resolve("aaaabbbbbbbb"),
        body: stream,
        bodyUsed: false,
        ok: true,
        redirected: false,
        type: "basic",
        url: "",
        clone: () => response,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        json: () => Promise.resolve({}),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response;

      fetchSpy.mockResolvedValueOnce(response);

      const result = await httpGet("https://example.com", { maxBodyBytes: 7 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toBe("aaaabbb"); // 4 from chunk1 + 3 from chunk2
        expect(result.body.length).toBe(7);
      }
    });

    it("returns partial data when body read times out", async () => {
      const h = new Headers();
      // Simulate a slow stream: first chunk arrives immediately, second never comes
      let resolveSecondRead: (() => void) | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("fast-data"));
          // Don't close — simulate a stalled stream
        },
        cancel() {
          // Stream was cancelled (by our timeout) — resolve any pending read
          if (resolveSecondRead) resolveSecondRead();
        },
      });
      const response = {
        status: 200,
        statusText: "OK",
        headers: h,
        text: () => Promise.resolve(""),
        body: stream,
        bodyUsed: false,
        ok: true,
        redirected: false,
        type: "basic",
        url: "",
        clone: () => response,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        json: () => Promise.resolve({}),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response;

      fetchSpy.mockResolvedValueOnce(response);

      const result = await httpGet("https://example.com", { timeout: 200 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should get the first chunk that arrived before timeout
        expect(result.body).toBe("fast-data");
      }
    }, 5000);
  });

  // -----------------------------------------------------------------------
  // Never throws test
  // -----------------------------------------------------------------------
  describe("never throws", () => {
    it("catches all errors and returns HttpFailure", async () => {
      fetchSpy.mockRejectedValueOnce(null);

      const result = await httpGet("https://example.com");
      expect(result.ok).toBe(false);
      // Should not throw -- should return a result
    });
  });
});
