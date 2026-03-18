import dns from "node:dns/promises";
import net from "node:net";

/** Scan-scoped DNS cache: hostname -> resolved IP */
export type DnsCache = Map<string, string>;

/** SSRF validation result -- discriminated union */
export type SsrfResult =
  | { safe: true; ip: string }
  | { safe: false; error: string; ip?: string };

// ---------------------------------------------------------------------------
// IPv4 private/reserved range checks
// ---------------------------------------------------------------------------

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 169.254.0.0/16 (link-local, includes AWS metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (CGNAT: 100.64.x.x - 100.127.x.x)
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

// ---------------------------------------------------------------------------
// IPv6 private/reserved range checks
// ---------------------------------------------------------------------------

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // IPv4-mapped IPv6 (::ffff:x.x.x.x) -- extract and check IPv4 portion
  if (lower.startsWith("::ffff:")) {
    const v4Part = lower.slice(7);
    if (net.isIPv4(v4Part)) return isPrivateIPv4(v4Part);
  }

  // ::1 loopback
  if (lower === "::1") return true;
  // :: unspecified
  if (lower === "::") return true;
  // fe80::/10 link-local
  if (lower.startsWith("fe80:")) return true;
  // fc00::/7 unique local address (fc00:: and fd00::)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether an IP address falls in a private/reserved range.
 *
 * Covers all RFC 1918 ranges, loopback, link-local, CGNAT, IPv6 ULA,
 * and IPv4-mapped IPv6 addresses.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

/**
 * Validate that a hostname does not resolve to a private/reserved IP.
 *
 * - Checks cache first (scan-scoped, avoids duplicate lookups)
 * - Skips DNS if hostname is already an IP literal
 * - Resolves ALL addresses and rejects if ANY is private
 * - Caches the first resolved IP on success
 * - Uses a 3-second DNS timeout via AbortSignal
 */
export async function validateDns(
  hostname: string,
  cache: DnsCache,
): Promise<SsrfResult> {
  // Check cache first
  const cached = cache.get(hostname);
  if (cached !== undefined) {
    if (isPrivateIp(cached)) {
      return {
        safe: false,
        error: `Hostname resolves to private address ${cached}`,
        ip: cached,
      };
    }
    return { safe: true, ip: cached };
  }

  // If hostname is already an IP literal, skip DNS lookup
  if (net.isIP(hostname) !== 0) {
    if (isPrivateIp(hostname)) {
      return {
        safe: false,
        error: `Hostname resolves to private address ${hostname}`,
        ip: hostname,
      };
    }
    return { safe: true, ip: hostname };
  }

  // DNS resolution with 3-second timeout
  try {
    const DNS_TIMEOUT_MS = 3000;
    const lookupPromise = dns.lookup(hostname, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timed out")), DNS_TIMEOUT_MS),
    );
    const records = await Promise.race([lookupPromise, timeoutPromise]);

    // Check ALL resolved addresses -- reject if ANY is private
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          safe: false,
          error: `Hostname resolves to private address ${record.address}`,
          ip: record.address,
        };
      }
    }

    // Cache the first resolved IP
    const ip = records[0].address;
    cache.set(hostname, ip);

    return { safe: true, ip };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { safe: false, error: `DNS resolution failed: ${message}` };
  }
}
