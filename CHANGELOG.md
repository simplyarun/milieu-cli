# Changelog

All notable changes to milieu-cli are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Pre-1.0, breaking changes bump the
minor version.

## [0.3.1] — unreleased

### Fixed

- **Auth-legibility and rate-limit checks can now actually pass.** `httpGet`
  collapsed every 4xx/5xx into a headerless failure, so the auth-legibility
  check (which grades a 401/403's `WWW-Authenticate` header, JSON error body,
  and docs URL) and the rate-limit check (which reads rate-limit headers) could
  never reach their pass paths against a real server — both were effectively
  dead. `HttpFailure` now carries the response (`{ status, headers, body }`)
  for reachable 4xx/5xx and bot-protected responses, and both checks grade it.
  A 401/403 is now reported as a gradeable rejection rather than "could not
  reach"; genuine network failures (dns, timeout, ssrf, …) still are.

## [0.3.0] — 2026-07-19

### Breaking

- **`scan()` no longer throws.** It now returns a discriminated `ScanOutcome`
  union (`ScanResult` with `ok: true`, or `ScanFailure` with `ok: false` and an
  `error: { kind, message }`), mirroring the HTTP client's `HttpResponse`.
  Narrow on `.ok` before reading a result. Invalid URLs and unexpected scan
  failures are now returned, not thrown.
- **`ScanResult` gained a required `ok: true` field** (the union discriminant)
  plus the `scannedOrigin: string` and `incomplete: boolean` fields added
  during hardening. Consumers constructing or asserting `ScanResult` literals
  must include them.
- **`HttpErrorKind` gained `request_budget_exhausted`.** Exhaustive switches
  over the union must handle it.
- **WebMCP check removed.** The `standards_webmcp` check double-scored the same
  `/.well-known/mcp.json` artifact as the MCP discovery check (and WebMCP, as a
  W3C browser-side JS API, has no well-known URL). MCP discovery
  (`mcp_endpoint`) is now the single scored signal for that file. Bridge 2 has
  11 checks instead of 12.

### Changed

- **Scoring is now monotone** — adding a machine-readable signal can only raise
  your score, never lower it. Bridge 4 (Schema) scores `0` over a fixed 5-check
  denominator when no OpenAPI spec is found (previously `null`/excluded), and
  Bridge 5 (Context) uses a fixed denominator so spec-gated checks fail rather
  than being excused. Overall score is the average of Bridges 1, 2, 4, and 5;
  only Bridge 3 (detection-only) is excluded.
- **Budget-exhausted checks report `error` and are excluded from scoring** — a
  probe skipped because the scan request budget ran out no longer counts as a
  failure in the numerator or denominator, and the result is flagged
  `incomplete`.
- **User-Agent now derives from the package version** (`milieu-cli/<version>`)
  instead of a hardcoded, stale string.

### Added

- **Scan-wide request budget.** New `--max-concurrency` (default 8) and
  `--max-requests` (default 150) flags and `ScanOptions` fields cap outbound
  requests per scan, counting every redirect hop and retry. Invalid values are
  rejected. See `ScanResult.incomplete` and `scannedOrigin`.
- **Gzipped sitemaps** are downloaded through the SSRF-guarded HTTP client with
  a 10 MiB decompression cap (previously raw `fetch` with no cap).
- **APIs.guru registry fallback** for OpenAPI discovery — catches specs
  published to a public registry rather than self-hosted.

### Security

- **DNS-rebinding TOCTOU closed.** Every request now pins its socket to the IP
  that SSRF validation approved (undici dispatcher with a fixed
  `connect.lookup`), so a hostname can no longer resolve to a public IP for the
  validator and a private one for the actual connection. Adds `undici` as a
  runtime dependency.
- Gzip sitemap downloads now go through the same SSRF, redirect, timeout, and
  budget controls as every other request, and decompression is bounded to
  prevent gzip-bomb memory exhaustion.
