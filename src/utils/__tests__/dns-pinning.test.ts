import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";

// Allow loopback so the real transport can reach a local test server. Only the
// SSRF IP-range gate is stubbed; the undici fetch + pinned dispatcher are REAL.
vi.mock("../ssrf.js", () => ({
  validateDns: vi.fn(async () => ({ safe: true, ip: "127.0.0.1" })),
}));

import { httpGet, pinnedLookup } from "../http-client.js";

describe("pinnedLookup DNS contract", () => {
  // Node's net.connect (Happy Eyeballs) calls lookup(host, {all:true}, cb) and
  // expects an ARRAY of {address, family}. Returning a scalar there yields
  // "Invalid IP address: undefined" and every pinned connection fails.
  it("returns an array on the all:true (Happy Eyeballs) path", () => {
    const cb = vi.fn();
    pinnedLookup("203.0.113.7")("rebind.evil.example", { all: true }, cb);
    expect(cb).toHaveBeenCalledWith(null, [{ address: "203.0.113.7", family: 4 }]);
  });

  it("returns a scalar on the single-address path", () => {
    const cb = vi.fn();
    pinnedLookup("203.0.113.7")("rebind.evil.example", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "203.0.113.7", 4);
  });

  it("reports family 6 for IPv6 in both shapes", () => {
    const all = vi.fn();
    pinnedLookup("::1")("h", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "::1", family: 6 }]);
    const one = vi.fn();
    pinnedLookup("::1")("h", {}, one);
    expect(one).toHaveBeenCalledWith(null, "::1", 6);
  });
});

describe("httpGet transport (real undici fetch through the pinned dispatcher)", () => {
  let server: Server;
  let port: number;
  let onOversizeClose: () => void;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/over-limit") {
        res.once("close", onOversizeClose);
        res.writeHead(200, { "content-length": 1024 });
        res.write("x");
        return;
      }
      res.setHeader("x-observed-host", req.headers.host ?? "");
      res.setHeader("content-type", "text/plain");
      res.end("hello from loopback");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("closes an over-limit response without waiting for the server to finish", async () => {
    const closed = new Promise<void>((resolve) => { onOversizeClose = resolve; });
    const res = await httpGet(`http://pinned.invalid:${port}/over-limit`, { maxBodyBytes: 8 });
    expect(res).toMatchObject({ ok: false, error: { kind: "body_too_large" } });
    await closed;
  });

  // This is the regression guard for the "every scan scores 10" outage: the
  // client must be able to drive its own undici dispatcher end-to-end. A global
  // fetch + external-undici dispatcher throws UND_ERR_INVALID_ARG before it ever
  // reaches the socket, so this fails unless fetch and dispatcher share a version.
  it("connects, pins to the validated IP, and reads the body", async () => {
    const res = await httpGet(`http://pinned.invalid:${port}/`);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe(200);
      expect(res.headers["x-observed-host"]).toBe(`pinned.invalid:${port}`);
      expect(res.body).toContain("hello from loopback");
    }
  });
});
