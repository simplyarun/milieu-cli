import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPrivateIp, validateDns, type DnsCache } from "../ssrf.js";

// Mock node:dns/promises for validateDns tests
vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(),
  },
}));

describe("isPrivateIp", () => {
  // --- IPv4 RFC 1918: 10.0.0.0/8 ---
  it("returns true for 10.0.0.1 (RFC 1918)", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
  });

  it("returns true for 10.255.255.255 (10/8 boundary)", () => {
    expect(isPrivateIp("10.255.255.255")).toBe(true);
  });

  // --- IPv4 RFC 1918: 172.16.0.0/12 ---
  it("returns true for 172.16.0.1 (RFC 1918)", () => {
    expect(isPrivateIp("172.16.0.1")).toBe(true);
  });

  it("returns true for 172.31.255.255 (172.16/12 boundary)", () => {
    expect(isPrivateIp("172.31.255.255")).toBe(true);
  });

  it("returns false for 172.15.255.255 (just below range)", () => {
    expect(isPrivateIp("172.15.255.255")).toBe(false);
  });

  it("returns false for 172.32.0.0 (just above range)", () => {
    expect(isPrivateIp("172.32.0.0")).toBe(false);
  });

  // --- IPv4 RFC 1918: 192.168.0.0/16 ---
  it("returns true for 192.168.0.1 (RFC 1918)", () => {
    expect(isPrivateIp("192.168.0.1")).toBe(true);
  });

  it("returns true for 192.168.255.255 (192.168/16 boundary)", () => {
    expect(isPrivateIp("192.168.255.255")).toBe(true);
  });

  // --- IPv4 loopback: 127.0.0.0/8 ---
  it("returns true for 127.0.0.1 (loopback)", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
  });

  it("returns true for 127.255.255.255 (127/8 boundary)", () => {
    expect(isPrivateIp("127.255.255.255")).toBe(true);
  });

  // --- IPv4: 0.0.0.0/8 ---
  it("returns true for 0.0.0.0", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });

  // --- IPv4 link-local: 169.254.0.0/16 ---
  it("returns true for 169.254.169.254 (AWS metadata / link-local)", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
  });

  it("returns true for 169.254.0.1 (link-local)", () => {
    expect(isPrivateIp("169.254.0.1")).toBe(true);
  });

  // --- IPv4 CGNAT: 100.64.0.0/10 ---
  it("returns true for 100.64.0.1 (CGNAT)", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
  });

  it("returns true for 100.127.255.255 (CGNAT boundary)", () => {
    expect(isPrivateIp("100.127.255.255")).toBe(true);
  });

  it("returns false for 100.63.255.255 (just below CGNAT)", () => {
    expect(isPrivateIp("100.63.255.255")).toBe(false);
  });

  it("returns false for 100.128.0.0 (just above CGNAT)", () => {
    expect(isPrivateIp("100.128.0.0")).toBe(false);
  });

  // --- IPv4 public ---
  it("returns false for 8.8.8.8 (public)", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("returns false for 1.1.1.1 (public)", () => {
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });

  // --- IPv6 loopback ---
  it("returns true for ::1 (IPv6 loopback)", () => {
    expect(isPrivateIp("::1")).toBe(true);
  });

  // --- IPv6 unspecified ---
  it("returns true for :: (IPv6 unspecified)", () => {
    expect(isPrivateIp("::")).toBe(true);
  });

  // --- IPv6 link-local ---
  it("returns true for fe80::1 (IPv6 link-local)", () => {
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  // --- IPv6 ULA ---
  it("returns true for fc00::1 (IPv6 ULA)", () => {
    expect(isPrivateIp("fc00::1")).toBe(true);
  });

  it("returns true for fd12::1 (IPv6 ULA)", () => {
    expect(isPrivateIp("fd12::1")).toBe(true);
  });

  // --- IPv4-mapped IPv6 ---
  it("returns true for ::ffff:10.0.0.1 (IPv4-mapped IPv6 private)", () => {
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
  });

  it("returns true for ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("returns false for ::ffff:8.8.8.8 (IPv4-mapped IPv6 public)", () => {
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  // --- IPv6 documentation / public ---
  it("returns false for 2001:db8::1 (documentation, not blocked)", () => {
    expect(isPrivateIp("2001:db8::1")).toBe(false);
  });

  it("returns false for 2607:f8b0:4004:800::200e (public IPv6)", () => {
    expect(isPrivateIp("2607:f8b0:4004:800::200e")).toBe(false);
  });

  // --- Invalid input ---
  it("returns false for non-IP string", () => {
    expect(isPrivateIp("not-an-ip")).toBe(false);
  });
});

describe("validateDns", () => {
  let mockLookup: ReturnType<typeof vi.fn>;
  let cache: DnsCache;

  beforeEach(async () => {
    vi.clearAllMocks();
    cache = new Map();
    const dnsModule = await import("node:dns/promises");
    mockLookup = dnsModule.default.lookup as ReturnType<typeof vi.fn>;
  });

  it("returns safe: false when DNS resolves to private IP", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    const result = await validateDns("evil.example.com", cache);
    expect(result.safe).toBe(false);
  });

  it("returns safe: true when DNS resolves to public IP", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]);
    const result = await validateDns("example.com", cache);
    expect(result.safe).toBe(true);
    if (result.safe) {
      expect(result.ip).toBe("8.8.8.8");
    }
  });

  it("returns safe: false when ANY resolved address is private (mixed)", async () => {
    mockLookup.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    const result = await validateDns("sneaky.example.com", cache);
    expect(result.safe).toBe(false);
  });

  it("skips DNS for raw public IP address", async () => {
    const result = await validateDns("8.8.8.8", cache);
    expect(result.safe).toBe(true);
    if (result.safe) {
      expect(result.ip).toBe("8.8.8.8");
    }
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("skips DNS for raw private IP address and blocks it", async () => {
    const result = await validateDns("127.0.0.1", cache);
    expect(result.safe).toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("uses cache hit instead of calling dns.lookup", async () => {
    cache.set("cached.example.com", "8.8.8.8");
    const result = await validateDns("cached.example.com", cache);
    expect(result.safe).toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("caches resolved IP on successful lookup", async () => {
    mockLookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    await validateDns("example.com", cache);
    expect(cache.get("example.com")).toBe("93.184.216.34");
  });

  it("returns safe: false on DNS resolution failure", async () => {
    mockLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    const result = await validateDns("nonexistent.example.com", cache);
    expect(result.safe).toBe(false);
    if (!result.safe) {
      expect(result.error).toMatch(/DNS resolution failed/);
    }
  });
});
