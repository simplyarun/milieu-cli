import dns from "node:dns/promises";
import net from "node:net";

/** Scan-scoped DNS cache: hostname -> resolved IP */
export type DnsCache = Map<string, string>;

/** SSRF validation result -- discriminated union */
export type SsrfResult =
  | { safe: true; ip: string }
  | { safe: false; error: string; ip?: string };

// BlockList compares address bytes. Its IPv4 rules also match IPv4-mapped
// IPv6 addresses in either dotted or hexadecimal notation.
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
  // The well-known NAT64 prefix embeds an IPv4 destination in the low 32 bits.
  blocked.addSubnet(`64:ff9b::${address}`, 96 + prefix, "ipv6");
}
for (const [address, prefix] of [
  ["::", 96],           // Unspecified, loopback and IPv4-compatible addresses
  ["64:ff9b:1::", 48],  // Local-use NAT64 networks
  ["2001::", 32],       // Teredo
  ["2002::", 16],       // 6to4
  ["fc00::", 7],        // Unique local
  ["fe80::", 10],       // Link local
  ["fec0::", 10],       // Deprecated site local
  ["ff00::", 8],        // Multicast
] as const) {
  blocked.addSubnet(address, prefix, "ipv6");
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return blocked.check(ip, "ipv4");
  if (!net.isIPv6(ip)) return false;
  return blocked.check(ip, "ipv6");
}

function validateAddress(ip: string): SsrfResult {
  if (!net.isIP(ip)) return { safe: false, error: "DNS resolution failed: invalid address" };
  if (isPrivateIp(ip)) {
    return { safe: false, error: `Hostname resolves to private address ${ip}`, ip };
  }
  return { safe: true, ip };
}

/**
 * Validate that a hostname does not resolve to a private/reserved IP.
 *
 * - Reuses cached hostname lookups for the duration of a scan
 * - Skips DNS if hostname is already an IP literal
 * - Resolves ALL addresses and rejects if ANY is private
 * - Caches the first resolved IP on success
 * - Uses a 3-second DNS deadline
 */
export async function validateDns(
  hostname: string,
  cache: DnsCache,
): Promise<SsrfResult> {
  // URL.hostname encloses IPv6 literals in brackets. A literal is the
  // socket destination even when a cached DNS entry happens to exist.
  const literal = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (net.isIP(literal)) return validateAddress(literal);

  const cached = cache.get(hostname);
  if (cached !== undefined) return validateAddress(cached);

  let timer: NodeJS.Timeout | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("DNS lookup timed out")), 3000);
    });
    const records = await Promise.race([dns.lookup(hostname, { all: true }), deadline]);
    if (records.length === 0) return { safe: false, error: "DNS resolution failed: no addresses" };

    for (const record of records) {
      const result = validateAddress(record.address);
      if (!result.safe) return result;
    }
    const ip = records[0].address;
    cache.set(hostname, ip);
    return { safe: true, ip };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { safe: false, error: `DNS resolution failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
