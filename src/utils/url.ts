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

/**
 * Normalize a user-provided URL string into a fully-qualified URL.
 *
 * - Trims whitespace
 * - Prepends `https://` if no protocol is present
 * - Strips leading `//` before prepending protocol
 * - Returns a discriminated union -- never throws
 */
export function normalizeUrl(input: string): NormalizeUrlResult {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: false, error: "Empty URL" };
  }

  let raw = trimmed;

  // Add protocol if missing
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    // Strip leading // if present (protocol-relative)
    if (raw.startsWith("//")) {
      raw = raw.slice(2);
    }
    raw = "https://" + raw;
  }

  try {
    const url = new URL(raw);
    return {
      ok: true,
      href: url.href,
      domain: url.hostname, // URL constructor lowercases hostname
      baseUrl: url.origin,
    };
  } catch {
    return { ok: false, error: `Invalid URL: ${trimmed}` };
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
    const resolved = new URL(trimmed, currentUrl).href;
    return { ok: true, url: resolved };
  } catch {
    return { ok: false, error: `Invalid redirect URL: ${trimmed}` };
  }
}
