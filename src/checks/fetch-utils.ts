const USER_AGENT = "milieu-content-score/0.1 (+https://github.com/simplyarun/milieu-content-score)";
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const DEFAULT_BACKOFF_MS = 500;
const RATE_LIMIT_BACKOFF_MS = 1500; // Longer backoff for 429 rate limiting
const MAX_RETRY_AFTER_MS = 5000; // Max Retry-After we'll honor

function isRetryable(status: number | null, error?: unknown): boolean {
  if (error) {
    const msg = error instanceof Error ? error.name : "";
    // Retry on timeout (AbortError) and network errors
    if (msg === "AbortError" || msg === "TypeError") return true;
  }
  if (status === 429 || status === 502 || status === 503) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Retry-After header value to milliseconds. Returns null if missing or too large. */
function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  // Retry-After can be seconds (integer) or an HTTP-date
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds >= 0) {
    const ms = seconds * 1000;
    return ms <= MAX_RETRY_AFTER_MS ? ms : null;
  }

  // Try parsing as HTTP date
  const date = Date.parse(header);
  if (!isNaN(date)) {
    const ms = date - Date.now();
    return ms > 0 && ms <= MAX_RETRY_AFTER_MS ? ms : null;
  }

  return null;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

const MAX_REDIRECTS = 5;

function isSafeHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, ""); // Strip IPv6 brackets

  if (BLOCKED_HOSTS.has(h)) return false;

  // Block any IPv6 address (contains colons)
  if (h.includes(":")) return false;

  // Block pure numeric hostnames (decimal IP: 2130706433, octal: 017700000001)
  if (/^[0-9]+$/.test(h)) return false;

  // Block hex IP addresses (0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(h)) return false;

  // Block hostnames ending with internal/local suffixes
  if (h.endsWith(".internal") || h.endsWith(".local") || h.endsWith(".localhost")) return false;

  const parts = h.split(".");

  // A valid domain has a non-numeric TLD — numeric TLD means it's an IP (e.g. 127.1, 192.168.1.1)
  const tld = parts[parts.length - 1];
  if (/^\d+$/.test(tld)) return false;

  // Block RFC-1918 and link-local ranges (dotted-quad)
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 0) return false;
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // 127.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 (AWS IMDS)
  }

  return true;
}

const BOT_PROTECTION_SIGNATURES = [
  "perimeterx",
  "datadome",
  "imperva",
  "incapsula",
  "akamai",
  "just a moment",
  "checking your browser",
  "access denied",
  "enable javascript and cookies",
];

// Specific Cloudflare challenge page indicators — avoids false positives
// on normal pages that reference cdnjs.cloudflare.com or similar CDN assets.
const CLOUDFLARE_CHALLENGE_SIGNATURES = [
  "cf-browser-verification",
  "cf_chl_opt",
  "cf-challenge-running",
  "attention required! | cloudflare",
  "managed by cloudflare</title>",
];

export interface FetchResult {
  body: string;
  status: number;
  blockedByBotProtection: boolean;
  contentType: string;
  linkHeader?: string;
  /** Subset of response headers for downstream analysis. */
  extraHeaders?: Record<string, string>;
}

function detectBotProtection(
  status: number,
  body: string,
  contentType: string,
): boolean {
  const ct = contentType.toLowerCase();
  // Structured data and plain text files are real content, not challenge pages
  if (
    ct.includes("xml") ||
    ct.includes("json") ||
    ct.includes("text/plain") ||
    ct.includes("text/markdown")
  )
    return false;

  // 403 is a strong WAF/bot protection signal for HTML responses
  if (status === 403) return true;

  const lower = body.toLowerCase();
  // Challenge pages are typically small (<10 KB) — large pages with real content
  // that happen to reference Cloudflare CDN assets are not challenges.
  if (body.length > 10_000) return false;
  if (CLOUDFLARE_CHALLENGE_SIGNATURES.some((sig) => lower.includes(sig)))
    return true;
  return BOT_PROTECTION_SIGNATURES.some((sig) => lower.includes(sig));
}

export async function fetchUrl(
  url: string,
  options: {
    timeout?: number;
    method?: "GET" | "HEAD" | "POST";
    body?: string;
    contentType?: string;
    maxAttempts?: number;
    _redirectsLeft?: number;
    /** When true, return the response body even for non-2xx status codes. */
    preserveErrorBody?: boolean;
  } = {}
): Promise<FetchResult | null> {
  const {
    timeout = DEFAULT_TIMEOUT,
    method = "GET",
    body: reqBody,
    contentType: reqContentType,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    _redirectsLeft = MAX_REDIRECTS,
    preserveErrorBody = false,
  } = options;

  // SSRF protection: block internal/private hosts
  try {
    const parsed = new URL(url);
    if (!isSafeHost(parsed.hostname)) return null;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT };
      if (reqContentType) headers["Content-Type"] = reqContentType;

      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers,
        redirect: "manual",
        ...(reqBody !== undefined ? { body: reqBody } : {}),
      });

      // Handle redirects safely — validate each hop against SSRF blocklist
      if (response.status >= 300 && response.status < 400) {
        if (_redirectsLeft <= 0) return null;
        const location = response.headers.get("location");
        if (!location) return null;

        let redirectUrl: URL;
        try {
          redirectUrl = new URL(location, url);
        } catch {
          return null;
        }

        if (redirectUrl.protocol !== "https:" && redirectUrl.protocol !== "http:") return null;
        if (!isSafeHost(redirectUrl.hostname)) return null;

        // 301/302/303: follow as GET without body
        if (response.status === 301 || response.status === 302 || response.status === 303) {
          return fetchUrl(redirectUrl.href, { timeout, method: "GET", maxAttempts, _redirectsLeft: _redirectsLeft - 1 });
        }
        // 307/308: preserve method and body
        if (response.status === 307 || response.status === 308) {
          return fetchUrl(redirectUrl.href, { ...options, maxAttempts, _redirectsLeft: _redirectsLeft - 1 });
        }
        return null;
      }

      // Check if response status is retryable (429, 502, 503)
      if (isRetryable(response.status, undefined) && attempt < maxAttempts) {
        clearTimeout(timer);
        // Use longer backoff for 429 (rate limiting) — respect Retry-After header
        const backoff = response.status === 429
          ? (parseRetryAfter(response) ?? RATE_LIMIT_BACKOFF_MS * attempt)
          : DEFAULT_BACKOFF_MS * attempt;
        await sleep(backoff);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      const linkHeader = response.headers.get("link") || undefined;

      // Capture extra headers for downstream analysis (rate-limit, CORS)
      const extraHeaders: Record<string, string> = {};
      const interestingHeaders = [
        "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset",
        "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset",
        "retry-after", "access-control-allow-origin", "access-control-allow-methods",
      ];
      for (const name of interestingHeaders) {
        const val = response.headers.get(name);
        if (val) extraHeaders[name] = val;
      }

      if (method === "HEAD") {
        return {
          body: "",
          status: response.status,
          blockedByBotProtection: response.status === 403,
          contentType,
          linkHeader,
          extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
        };
      }

      const body = await response.text();
      const blocked = detectBotProtection(response.status, body, contentType);

      return {
        body: (response.ok || preserveErrorBody) ? body : "",
        status: response.status,
        blockedByBotProtection: blocked,
        contentType,
        linkHeader,
        extraHeaders: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
      };
    } catch (err) {
      clearTimeout(timer);
      // Retry on transient errors (timeout, network failure)
      if (isRetryable(null, err) && attempt < maxAttempts) {
        await sleep(DEFAULT_BACKOFF_MS * attempt);
        continue;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

export async function fetchPath(
  domain: string,
  path: string,
  options: {
    timeout?: number;
    method?: "GET" | "HEAD" | "POST";
    body?: string;
    contentType?: string;
    preserveErrorBody?: boolean;
  } = {}
): Promise<FetchResult | null> {
  const url = `https://${domain}${path.startsWith("/") ? path : `/${path}`}`;
  return fetchUrl(url, options);
}

export function normalizeUrl(input: string): string {
  let url = input.trim().toLowerCase();
  url = url.replace(/[\x00-\x1f\x7f]/g, ""); // Strip control chars (CRLF injection prevention)
  url = url.replace(/^https?:\/\//, "");
  url = url.replace(/^www\./, "");
  url = url.replace(/\/+$/, "");
  return url;
}

export function isUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.includes(".") &&
    !trimmed.includes(" ") &&
    /^[a-zA-Z0-9]/.test(trimmed)
  );
}
