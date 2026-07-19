import type {
  HttpResponse,
  HttpSuccess,
  HttpFailure,
} from "../core/types.js";
import { validateDns, type DnsCache } from "./ssrf.js";
import { resolveRedirectUrl } from "./url.js";
import { getVersion } from "../core/version.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { Agent } from "undici";
import type { LookupFunction } from "node:net";

/**
 * A DNS lookup that always resolves to `ip`, ignoring the hostname. Pins a
 * connection to the exact address that `validateDns` approved.
 */
export function pinnedLookup(ip: string): LookupFunction {
  const family = ip.includes(":") ? 6 : 4;
  return (_hostname, _options, callback) => {
    callback(null, ip, family);
  };
}

/**
 * Build an undici dispatcher that connects ONLY to the pre-validated IP.
 *
 * This closes the DNS-rebinding TOCTOU: without it, `fetch` performs its own
 * DNS resolution at connect time, so a low-TTL hostname could return a public
 * IP to `validateDns` and a private one (127.0.0.1, 169.254.169.254, …) to the
 * actual socket. Overriding `connect.lookup` pins the socket to the validated
 * address while undici keeps the original hostname for the Host header and TLS
 * SNI/certificate validation.
 */
function pinnedDispatcher(ip: string): Agent {
  return new Agent({ connect: { lookup: pinnedLookup(ip) } });
}

export interface HttpBytesSuccess extends Omit<HttpSuccess, "body"> {
  body: Uint8Array;
}
export type HttpBytesResponse = HttpBytesSuccess | HttpFailure;

/** Scan-wide FIFO limiter. A slot represents one physical fetch attempt. */
export class RequestCoordinator {
  private active = 0;
  private started = 0;
  private denied = 0;
  private readonly waiting: Array<(granted: boolean) => void> = [];

  /** Physical fetch attempts started so far (includes redirect hops and retries) */
  get startedCount(): number {
    return this.started;
  }

  /** Fetch attempts denied because the budget was exhausted */
  get deniedCount(): number {
    return this.denied;
  }

  constructor(
    readonly maxConcurrency = 8,
    // A full scan of a 404-everything site already makes ~50 physical
    // requests; the default budget must clear that floor with room for
    // redirects and retries, or ordinary scans exhaust it mid-flight.
    readonly maxRequests = 150,
  ) {}

  acquire(): Promise<boolean> {
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.drain();
    });
  }

  release(): void {
    this.active--;
    this.drain();
  }

  private drain(): void {
    while (this.active < this.maxConcurrency && this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      if (this.started >= this.maxRequests) {
        this.denied++;
        next(false);
        continue;
      }
      this.active++;
      this.started++;
      next(true);
    }
  }
}

interface ScanRequestContext { dnsCache: DnsCache; coordinator: RequestCoordinator }
const scanRequestContext = new AsyncLocalStorage<ScanRequestContext>();

/** Clamp a configured limit to a positive integer, or fall back to the default. */
function sanitizeLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

export function runWithScanRequestContext<T>(
  options: { maxConcurrency?: number; maxRequests?: number },
  callback: () => Promise<T>,
): Promise<T> {
  return scanRequestContext.run({
    dnsCache: new Map(),
    coordinator: new RequestCoordinator(
      sanitizeLimit(options.maxConcurrency, 8),
      sanitizeLimit(options.maxRequests, 150),
    ),
  }, callback);
}

/** Request stats for the current scan context, or null outside one. */
export function getScanRequestStats(): { started: number; denied: number } | null {
  const context = scanRequestContext.getStore();
  if (!context) return null;
  return { started: context.coordinator.startedCount, denied: context.coordinator.deniedCount };
}

/** Options for httpGet (also supports POST despite the name) */
export interface HttpGetOptions {
  /** HTTP method (default: "GET") */
  method?: "GET" | "HEAD" | "POST";
  /** Per-request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Maximum number of redirects to follow (default: 5) */
  maxRedirects?: number;
  /** Maximum response body size in bytes (default: 5MB) */
  maxBodyBytes?: number;
  /** Scan-scoped DNS cache -- caller creates and reuses across requests */
  dnsCache?: DnsCache;
  /** Custom headers to merge with defaults */
  headers?: Record<string, string>;
  /** Request body for POST requests */
  body?: string;
  /** Internal scan-wide limiter; normally supplied through AsyncLocalStorage. */
  coordinator?: RequestCoordinator;
}

const DEFAULT_OPTIONS = {
  method: "GET" as const,
  timeout: 10_000,
  maxRedirects: 5,
  maxBodyBytes: 5 * 1024 * 1024,
};

const USER_AGENT = `milieu-cli/${getVersion()}`;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function classifyFetchError(error: unknown, url: string): HttpFailure {
  // AbortSignal.timeout produces DOMException with name "TimeoutError"
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { ok: false, error: { kind: "timeout", message: "Request timed out", url } };
  }

  if (error instanceof TypeError && error.cause) {
    const cause = error.cause as { code?: string };

    switch (cause.code) {
      case "ENOTFOUND":
        return { ok: false, error: { kind: "dns", message: `DNS resolution failed for ${url}`, url } };
      case "ECONNREFUSED":
        return { ok: false, error: { kind: "connection_refused", message: "Connection refused", url } };
      case "CERT_HAS_EXPIRED":
      case "DEPTH_ZERO_SELF_SIGNED_CERT":
      case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      case "ERR_TLS_CERT_ALTNAME_INVALID":
        return { ok: false, error: { kind: "ssl_error", message: `SSL error: ${cause.code}`, url } };
      default:
        break;
    }
  }

  return { ok: false, error: { kind: "unknown", message: String(error), url } };
}

// ---------------------------------------------------------------------------
// Streaming body reader
// ---------------------------------------------------------------------------

/**
 * Read response body as a string, stopping early when maxBytes is reached
 * or timeoutMs elapses.
 *
 * Uses the response body ReadableStream for chunk-by-chunk reading,
 * cancelling the stream once the byte limit is exceeded. This prevents
 * downloading multi-megabyte responses when only the first portion is needed.
 *
 * The timeoutMs parameter provides a hard deadline for body reading,
 * independent of the fetch AbortSignal (which may not propagate to
 * body stream reads in all Node.js versions). When the timeout fires,
 * the reader is cancelled and whatever data was collected is returned.
 *
 * Falls back to response.text() if no body stream is available.
 */
async function readBodyStream(
  response: Response,
  maxBytes: number,
  timeoutMs?: number,
): Promise<string> {
  const stream = response.body;
  if (!stream) {
    // Fallback for environments where body stream isn't available
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  // Hard timeout: cancel the reader directly if body reading stalls
  const timeoutId = timeoutMs
    ? setTimeout(() => { reader.cancel().catch(() => {}); }, timeoutMs)
    : undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        // Keep only what fits within the limit
        const excess = totalBytes - maxBytes;
        chunks.push(value.subarray(0, value.length - excess));
        break;
      }
      chunks.push(value);
    }
  } catch {
    // reader.read() throws when stream is cancelled (timeout or network error).
    // Return whatever data was collected so far.
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    try { await reader.cancel(); } catch { /* stream may already be closed */ }
  }

  const decoder = new TextDecoder();
  let body = "";
  for (const chunk of chunks) {
    body += decoder.decode(chunk, { stream: true });
  }
  body += decoder.decode(); // flush remaining multi-byte chars
  return body;
}

async function readBodyBytes(
  response: Response,
  maxBytes: number,
  timeoutMs?: number,
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const stream = response.body;
  if (!stream) return { body: new Uint8Array(await response.arrayBuffer()), truncated: false };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  const timeoutId = timeoutMs ? setTimeout(() => { reader.cancel().catch(() => {}); }, timeoutMs) : undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > maxBytes) { truncated = true; break; }
      chunks.push(value);
    }
  } catch { /* cancelled streams are treated as incomplete */ }
  finally {
    if (timeoutId) clearTimeout(timeoutId);
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const body = new Uint8Array(Math.min(totalBytes, maxBytes));
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return { body, truncated };
}

// ---------------------------------------------------------------------------
// Bot protection detection
// ---------------------------------------------------------------------------

function isBotProtected(status: number, headers: Record<string, string>): boolean {
  const server = (headers["server"] ?? "").toLowerCase();

  // Cloudflare 403 with server header or cf-ray
  if (status === 403 && (server.includes("cloudflare") || headers["cf-ray"] !== undefined)) {
    return true;
  }

  // 429 rate limit from any server
  if (status === 429) return true;

  // Cloudflare 503 challenge
  if (status === 503 && server.includes("cloudflare")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Convert Response headers to plain object
// ---------------------------------------------------------------------------

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Single fetch attempt (no retry)
// ---------------------------------------------------------------------------

interface FetchInternalOptions {
  method: "GET" | "HEAD" | "POST";
  timeout: number;
  maxRedirects: number;
  maxBodyBytes: number;
  dnsCache: DnsCache;
  headers: Record<string, string>;
  body?: string;
  coordinator: RequestCoordinator;
}

async function fetchOnce(url: string, options: FetchInternalOptions, binary?: false): Promise<HttpResponse>;
async function fetchOnce(url: string, options: FetchInternalOptions, binary: true): Promise<HttpBytesResponse>;
async function fetchOnce(url: string, options: FetchInternalOptions, binary: boolean): Promise<HttpResponse | HttpBytesResponse>;
async function fetchOnce(
  url: string,
  options: FetchInternalOptions,
  binary = false,
): Promise<HttpResponse | HttpBytesResponse> {
  let currentUrl = url;
  const redirects: string[] = [];

  // Validate initial URL
  try {
    new URL(currentUrl);
  } catch {
    return { ok: false, error: { kind: "unknown", message: "Invalid URL", url } };
  }

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    // SSRF pre-flight at every hop
    const hostname = new URL(currentUrl).hostname;
    const ssrfResult = await validateDns(hostname, options.dnsCache);
    if (!ssrfResult.safe) {
      // Distinguish DNS failure from SSRF block
      const kind = ssrfResult.error.startsWith("DNS resolution failed")
        ? "dns" as const
        : "ssrf_blocked" as const;
      return { ok: false, error: { kind, message: ssrfResult.error, url: currentUrl } };
    }

    const granted = await options.coordinator.acquire();
    if (!granted) {
      return { ok: false, error: { kind: "request_budget_exhausted", message: "Scan request budget exhausted", url: currentUrl } };
    }
    // Pin the connection to the IP validateDns just approved (SSRF hardening).
    const dispatcher = pinnedDispatcher(ssrfResult.ip);
    let response: Response;
    try {
      // `dispatcher` is a valid Node fetch option (undici) but isn't in the
      // global RequestInit type, so the init is cast.
      const init = {
        method: options.method,
        // Manual redirects: required for SSRF re-validation at each hop and redirect chain tracking
        redirect: "manual" as const,
        signal: AbortSignal.timeout(options.timeout),
        headers: options.headers,
        dispatcher,
        // POST body (only sent on first request, not on redirects)
        ...(options.method === "POST" && options.body && hop === 0
          ? { body: options.body }
          : {}),
      };
      response = await fetch(currentUrl, init as RequestInit);
    } catch (err) {
      options.coordinator.release();
      void dispatcher.close();
      return classifyFetchError(err, currentUrl);
    }

    try {

    // Handle redirects (3xx) — POST does not follow redirects
    if (response.status >= 300 && response.status < 400) {
      if (options.method === "POST") {
        // POST redirects are not followed — treat as final response
        return {
          ok: false,
          error: { kind: "http_error", message: `HTTP ${response.status} ${response.statusText}`, statusCode: response.status, url: currentUrl },
        };
      }
      const location = response.headers.get("location");
      if (!location) {
        // No Location header -- treat as final response
        break;
      }

      const resolved = resolveRedirectUrl(location, currentUrl);
      if (!resolved.ok) {
        return {
          ok: false,
          error: { kind: "http_error", message: `Invalid redirect: ${resolved.error}`, statusCode: response.status, url: currentUrl },
        };
      }

      redirects.push(currentUrl);

      // Check redirect limit BEFORE following
      if (redirects.length >= options.maxRedirects) {
        return {
          ok: false,
          error: { kind: "http_error", message: `Too many redirects (max ${options.maxRedirects})`, url: currentUrl },
        };
      }

      currentUrl = resolved.url;
      continue;
    }

    // Convert headers
    const headerRecord = headersToRecord(response.headers);

    // For a non-2xx response we're about to reject, keep the actual response
    // (status/headers/body) so checks that grade a *rejection* — auth
    // legibility (401/403 quality) and rate limits (headers on any status) —
    // can inspect it instead of seeing a headerless failure.
    const captureResponse = async () => ({
      status: response.status,
      headers: headerRecord,
      body: options.method === "HEAD" ? "" : await readBodyStream(response, options.maxBodyBytes, options.timeout),
    });

    // Bot protection detection
    if (isBotProtected(response.status, headerRecord)) {
      return {
        ok: false,
        error: { kind: "bot_protected", message: "Bot protection detected", statusCode: response.status, url: currentUrl },
        response: await captureResponse(),
      };
    }

    // 4xx/5xx errors (non-bot)
    if (response.status >= 400) {
      return {
        ok: false,
        error: { kind: "http_error", message: `HTTP ${response.status} ${response.statusText}`, statusCode: response.status, url: currentUrl },
        response: await captureResponse(),
      };
    }

    // Success (2xx) -- read body
    const base = {
      ok: true as const,
      url: currentUrl,
      status: response.status,
      headers: headerRecord,
      redirects,
      durationMs: 0, // Set by outer wrapper
    };

    if (options.method === "HEAD") {
      return binary ? { ...base, body: new Uint8Array() } : { ...base, body: "" };
    }

    // Check Content-Length before reading
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > options.maxBodyBytes) {
      return {
        ok: false,
        error: { kind: "body_too_large", message: `Response body exceeds ${options.maxBodyBytes} bytes`, url: currentUrl },
      };
    }

    // Stream body with early cancellation at maxBodyBytes and hard timeout
    if (binary) {
      const bytes = await readBodyBytes(response, options.maxBodyBytes, options.timeout);
      if (bytes.truncated) {
        return { ok: false, error: { kind: "body_too_large", message: `Response body exceeds ${options.maxBodyBytes} bytes`, url: currentUrl } };
      }
      return { ...base, body: bytes.body };
    }
    return { ...base, body: await readBodyStream(response, options.maxBodyBytes, options.timeout) };
    } finally {
      options.coordinator.release();
      // Body has been read (or the hop is returning/continuing) — safe to
      // release the pinned dispatcher's sockets.
      void dispatcher.close();
    }
  }

  // Fell through without returning -- shouldn't happen, but handle gracefully
  return {
    ok: false,
    error: { kind: "http_error", message: `Too many redirects (max ${options.maxRedirects})`, url: currentUrl },
  };
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

function isRetriable(result: HttpResponse | HttpBytesResponse): boolean {
  if (result.ok) return false;

  const { kind } = result.error;
  // Retry on timeout or connection_refused
  if (kind === "timeout" || kind === "connection_refused") return true;

  // Retry on 5xx server errors
  if (kind === "http_error" && result.error.statusCode !== undefined && result.error.statusCode >= 500) {
    return true;
  }

  return false;
}

async function fetchWithRetry(url: string, options: FetchInternalOptions, binary?: false): Promise<HttpResponse>;
async function fetchWithRetry(url: string, options: FetchInternalOptions, binary: true): Promise<HttpBytesResponse>;
async function fetchWithRetry(
  url: string,
  options: FetchInternalOptions,
  binary = false,
): Promise<HttpResponse | HttpBytesResponse> {
  const result = await fetchOnce(url, options, binary);

  if (isRetriable(result)) {
    // Skip the retry when the budget cannot grant it — and never let a
    // denied retry mask the genuine first-attempt failure, which may drive
    // scan-abort decisions (e.g. connection_refused).
    if (options.coordinator.startedCount >= options.coordinator.maxRequests) {
      return result;
    }
    // Wait 2 seconds before retry
    await new Promise((r) => setTimeout(r, 2000));
    const retry = await fetchOnce(url, options, binary);
    if (!retry.ok && retry.error.kind === "request_budget_exhausted") {
      return result;
    }
    return retry;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform an HTTP request with SSRF protection, redirect tracking,
 * retry logic, and discriminated union error handling.
 *
 * Supports GET, HEAD, and POST methods. POST requests do not follow
 * redirects and require a `body` option.
 *
 * NEVER throws -- all errors are returned as HttpFailure values.
 */
export async function httpGet(
  url: string,
  options?: Partial<HttpGetOptions>,
): Promise<HttpResponse> {
  const method = options?.method ?? DEFAULT_OPTIONS.method;
  const timeout = options?.timeout ?? DEFAULT_OPTIONS.timeout;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_OPTIONS.maxRedirects;
  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_OPTIONS.maxBodyBytes;
  const context = scanRequestContext.getStore();
  const dnsCache = options?.dnsCache ?? context?.dnsCache ?? new Map();
  const coordinator = options?.coordinator ?? context?.coordinator ?? new RequestCoordinator(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    ...(options?.headers ?? {}),
  };

  // POST requests need Content-Type if not explicitly set
  if (method === "POST" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const start = performance.now();

  const result = await fetchWithRetry(url, {
    method,
    timeout,
    maxRedirects,
    maxBodyBytes,
    dnsCache,
    headers,
    body: options?.body,
    coordinator,
  });

  const durationMs = Math.round(performance.now() - start);

  // Attach durationMs to success results
  if (result.ok) {
    return { ...result, durationMs };
  }

  return result;
}

/** Binary counterpart for internal consumers such as compressed sitemaps. */
export async function httpGetBytes(
  url: string,
  options?: Partial<HttpGetOptions>,
): Promise<HttpBytesResponse> {
  const context = scanRequestContext.getStore();
  const timeout = options?.timeout ?? DEFAULT_OPTIONS.timeout;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_OPTIONS.maxRedirects;
  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_OPTIONS.maxBodyBytes;
  const dnsCache = options?.dnsCache ?? context?.dnsCache ?? new Map();
  const coordinator = options?.coordinator ?? context?.coordinator ?? new RequestCoordinator(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const headers = { "User-Agent": USER_AGENT, ...(options?.headers ?? {}) };
  const start = performance.now();
  const result = await fetchWithRetry(url, {
    method: "GET", timeout, maxRedirects, maxBodyBytes, dnsCache, coordinator, headers,
  }, true);
  if (result.ok) return { ...result, durationMs: Math.round(performance.now() - start) };
  return result;
}
