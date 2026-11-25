/** Result of successful URL normalization */
export interface NormalizeUrlOk {
  ok: true;
  /** Full normalized URL (e.g., "https://example.com/path") */
  href: string;
  /** Hostname extracted from URL (e.g., "example.com") */
  domain: string;
  /** Origin: protocol + host (e.g., "https://example.com") */
  baseUrl: string;
}

/** Result of failed URL normalization */
export interface NormalizeUrlErr {
  ok: false;
  error: string;
}

/** Discriminated union result -- never throws */
export type NormalizeUrlResult = NormalizeUrlOk | NormalizeUrlErr;

/** Only HTTP(S) requests without URL credentials are valid scan targets. */
export function parseHttpUrl(input: string, base?: string): URL {
  const url = new URL(input, base);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Expected an HTTP or HTTPS URL");
  }
  if (url.username || url.password) {
    throw new TypeError("URL credentials are unsupported");
  }
  return url;
}

/**
 * Normalize a user-provided URL string into a fully-qualified URL.
 *
 * - Trims whitespace
 * - Prepends `https://` if no protocol is present
 * - Strips leading `//` before prepending protocol
 * - Returns a discriminated union -- never throws
 */
export function normalizeUrl(input: string): NormalizeUrlResult {
  if (typeof input !== "string") return { ok: false, error: "Expected a URL string" };
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: false, error: "Empty URL" };
  }

  let raw = trimmed;

  // Add protocol if missing
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const isHostWithPort = /^[^/?#:@]+:\d+(?:[/?#]|$)/.test(raw);
  if (!hasScheme || isHostWithPort) {
    // Strip leading // if present (protocol-relative)
    if (raw.startsWith("//")) {
      raw = raw.slice(2);
    }
    raw = "https://" + raw;
  }

  try {
    const url = parseHttpUrl(raw);
    return {
      ok: true,
      href: url.href,
      domain: url.hostname, // URL constructor lowercases hostname
      baseUrl: url.origin,
    };
  } catch {
    return { ok: false, error: "Invalid URL. Provide an HTTP or HTTPS address without credentials." };
  }
}

/**
 * Extract the hostname from a URL string.
 *
 * Assumes the URL is already normalized (has protocol).
 * Throws on invalid URL -- caller must normalize first.
 */
export function extractDomain(url: string): string {
  return new URL(url).hostname;
}

/** Result of successful redirect resolution */
export interface ResolveRedirectOk {
  ok: true;
  url: string;
}

/** Result of failed redirect resolution */
export interface ResolveRedirectErr {
  ok: false;
  error: string;
}

/** Discriminated union for redirect resolution */
export type ResolveRedirectResult = ResolveRedirectOk | ResolveRedirectErr;

/**
 * Resolve a Location header value against the current URL.
 *
 * Handles absolute, relative, and protocol-relative Location values.
 * Returns a discriminated union -- never throws.
 */
export function resolveRedirectUrl(
  locationHeader: string,
  currentUrl: string,
): ResolveRedirectResult {
  const trimmed = locationHeader.trim();

  if (trimmed === "") {
    return { ok: false, error: "Empty Location header" };
  }

  try {
    const resolved = parseHttpUrl(trimmed, currentUrl).href;
    return { ok: true, url: resolved };
  } catch {
    return { ok: false, error: "Invalid redirect URL" };
  }
}
