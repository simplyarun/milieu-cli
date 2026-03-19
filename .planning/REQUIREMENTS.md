# Requirements: Milieu CLI

**Defined:** 2026-03-17
**Core Value:** Provide the first credible, deterministic measurement layer for AI agent readiness

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Tool is published as `milieu-cli` npm package with `milieu scan <url>` as primary command
- [x] **FOUND-02**: All type definitions (CheckStatus, Check, BridgeResult, ScanResult) are defined before implementation
- [x] **FOUND-03**: HTTP client returns discriminated union errors (dns, timeout, ssrf_blocked, http_error, bot_protected) instead of null
- [x] **FOUND-04**: URL normalization handles missing protocol, trailing slashes, and domain extraction
- [x] **FOUND-05**: SSRF protection blocks RFC-1918 ranges, IPv6, and IPv4-mapped IPv6 addresses
- [x] **FOUND-06**: HTTP requests use configurable timeout (default 10s), 1 retry on 5xx/timeout, follow up to 5 redirects

### Reachability (Bridge 1)

- [ ] **REACH-01**: User can see whether HTTPS is available for the target domain (HEAD request, SSL validity)
- [ ] **REACH-02**: User can see HTTP status of target URL with redirect tracking (200/301/302/4xx/5xx)
- [ ] **REACH-03**: User can see whether robots.txt exists, is parseable, and how many rules it contains
- [x] **REACH-04**: User can see per-AI-crawler policy for GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot (allowed/partial/blocked)
- [x] **REACH-05**: robots.txt parser is RFC 9309 compliant (BOM stripping, CRLF, group boundaries, Allow/Disallow precedence, wildcard rules, empty Disallow semantics)
- [x] **REACH-06**: User can see meta robots tags from HTML head (noindex, nofollow detection)
- [x] **REACH-07**: User can see X-Robots-Tag HTTP response header directives
- [ ] **REACH-08**: Bridge 1 score calculated as (passed_checks / total_checks * 100) with pass/partial/fail status
- [ ] **REACH-09**: If target is completely unreachable (DNS failure, connection refused), scan aborts with clear error — no further bridges attempted

### Standards (Bridge 2)

- [x] **STND-01**: User can see whether an OpenAPI spec exists (9 paths probed in order), with version and endpoint count
- [x] **STND-02**: OpenAPI detection validates response contains `openapi` or `swagger` key with correct Content-Type (not HTML docs pages)
- [x] **STND-03**: User can see whether llms.txt exists at domain root (HTTP 200, non-empty, report size and first line)
- [x] **STND-04**: User can see whether llms-full.txt exists at domain root
- [x] **STND-05**: User can see whether MCP endpoint exists at /.well-known/mcp.json (valid JSON with MCP configuration)
- [x] **STND-06**: User can see JSON-LD structured data blocks with detected schema types
- [x] **STND-07**: User can see Schema.org markup (Microdata itemtype/itemprop or JSON-LD with schema.org vocabulary)
- [x] **STND-08**: User can see well-known URI presence (security.txt, ai-plugin.json)
- [x] **STND-09**: Bridge 2 score calculated as (passed_checks / total_checks * 100) with pass/partial/fail status

### Separation (Bridge 3)

- [ ] **SEP-01**: User can see whether API presence signals exist (reuses Bridge 2 OpenAPI result, HTML link scanning for /api/ /developer/ paths, API-related response headers)
- [ ] **SEP-02**: User can see whether developer documentation exists (probes /docs, /developers, /developer, /api/docs, /documentation + homepage link scanning)
- [ ] **SEP-03**: User can see whether SDK/package references exist (npm, PyPI, Maven, NuGet, Go, RubyGems mentions in page content)
- [ ] **SEP-04**: User can see whether webhook support is mentioned in docs/HTML
- [ ] **SEP-05**: Bridge 3 outputs detection inventory (no score) with status "detected" or "not_evaluated"

### Output Stubs (Bridges 4-5)

- [ ] **STUB-01**: Bridge 4 (Schema) appears in every scan output with status "not_evaluated" and message "Schema quality assessment requires deeper analysis beyond automated checks."
- [ ] **STUB-02**: Bridge 5 (Context) appears in every scan output with status "not_evaluated" and message "Context evaluation requires deeper analysis beyond automated checks."
- [ ] **STUB-03**: No hints about future evaluation methods, no "coming soon", no "upgrade" messaging in Bridges 4-5

### Terminal Output

- [ ] **TERM-01**: Default output shows all 5 bridges with progress bars (12-char) for Bridges 1-2, detection line for Bridge 3, dim labels for Bridges 4-5
- [ ] **TERM-02**: Colors: pass (>=80) green, partial (40-79) yellow, fail (<40) red, detected cyan, not evaluated dim/gray
- [ ] **TERM-03**: Verbose mode (--verbose) shows individual check details with status indicators (check-mark green, x red, warning yellow, dash dim)
- [ ] **TERM-04**: Spinner (ora) shows progress during scan
- [ ] **TERM-05**: Supports NO_COLOR environment variable convention
- [ ] **TERM-06**: Scan timestamp shown in output
- [ ] **TERM-07**: Scan timing shown per bridge in output

### JSON Output

- [ ] **JSON-01**: --json flag outputs complete ScanResult object
- [ ] **JSON-02**: --json --pretty outputs formatted JSON
- [ ] **JSON-03**: JSON schema includes version field for API stability
- [ ] **JSON-04**: JSON output is the public contract — schema treated as versioned API surface

### CLI

- [ ] **CLI-01**: `milieu scan <url>` as primary command via commander
- [ ] **CLI-02**: --timeout flag configures per-request timeout (default 10000ms)
- [ ] **CLI-03**: --threshold N flag exits non-zero if overall score < N
- [ ] **CLI-04**: --quiet flag suppresses terminal output (only JSON/exit code)
- [ ] **CLI-05**: --version prints version, --help prints help (free via commander)
- [ ] **CLI-06**: Invalid URL produces helpful error message and exit code 1

### Programmatic API

- [ ] **API-01**: `import { scan } from "milieu-cli"` returns typed ScanResult
- [ ] **API-02**: scan() accepts options object (timeout, verbose)
- [ ] **API-03**: All types exported for TypeScript consumers

### Testing

- [ ] **TEST-01**: Unit tests for robots.txt parsing (20+ edge cases per RFC 9309)
- [ ] **TEST-02**: Unit tests for OpenAPI detection and version extraction
- [ ] **TEST-03**: Unit tests for JSON-LD parsing
- [ ] **TEST-04**: Unit tests for URL normalization
- [ ] **TEST-05**: Integration tests use recorded HTTP fixtures (no live URLs in CI)

### Packaging

- [ ] **PKG-01**: Published to npm as `milieu-cli`
- [ ] **PKG-02**: ESM-only package with .d.ts type declarations
- [ ] **PKG-03**: 3 runtime dependencies only: commander, chalk, ora
- [ ] **PKG-04**: Shebang in entry point for npx execution
- [ ] **PKG-05**: package.json exports field and files whitelist correctly configured

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Output Formats

- **OUT-01**: HTML report output
- **OUT-02**: JUnit/TAP/xUnit XML output for CI systems

### Scanning

- **SCAN-01**: Multi-page crawling (beyond homepage)
- **SCAN-02**: Authentication support for scanning protected resources
- **SCAN-03**: Config file support (.milieurc)

### Extensibility

- **EXT-01**: Plugin/extension system for custom checks
- **EXT-02**: Watch mode for continuous scanning

## Out of Scope

| Feature | Reason |
|---------|--------|
| Bridges 4-5 evaluation | Proprietary IP — reserved for future product |
| AI/LLM-based checks | All checks must be deterministic; no AI in pipeline |
| Remediation advice | Tool measures, doesn't prescribe; avoids maintenance burden |
| Telemetry/analytics | Zero outbound requests except to target; developer trust |
| Score comparison between domains | Creates competitive dynamics; requires data storage |
| Browser-based rendering (puppeteer/playwright) | Checks machine-readable signals, not visual rendering |
| Mobile app or web UI | CLI-first; ecosystem can build UIs on JSON output |
| Scoring methodology details in README | Keep scoring simple and opaque; avoid gaming |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 10 | Pending |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 2 | Complete |
| FOUND-04 | Phase 2 | Complete |
| FOUND-05 | Phase 2 | Complete |
| FOUND-06 | Phase 2 | Complete |
| REACH-01 | Phase 3 | Pending |
| REACH-02 | Phase 3 | Pending |
| REACH-03 | Phase 3 | Pending |
| REACH-04 | Phase 3 | Complete |
| REACH-05 | Phase 3 | Complete |
| REACH-06 | Phase 3 | Complete |
| REACH-07 | Phase 3 | Complete |
| REACH-08 | Phase 3 | Pending |
| REACH-09 | Phase 3 | Pending |
| STND-01 | Phase 4 | Complete |
| STND-02 | Phase 4 | Complete |
| STND-03 | Phase 4 | Complete |
| STND-04 | Phase 4 | Complete |
| STND-05 | Phase 4 | Complete |
| STND-06 | Phase 4 | Complete |
| STND-07 | Phase 4 | Complete |
| STND-08 | Phase 4 | Complete |
| STND-09 | Phase 4 | Complete |
| SEP-01 | Phase 5 | Pending |
| SEP-02 | Phase 5 | Pending |
| SEP-03 | Phase 5 | Pending |
| SEP-04 | Phase 5 | Pending |
| SEP-05 | Phase 5 | Pending |
| STUB-01 | Phase 6 | Pending |
| STUB-02 | Phase 6 | Pending |
| STUB-03 | Phase 6 | Pending |
| TERM-01 | Phase 6 | Pending |
| TERM-02 | Phase 6 | Pending |
| TERM-03 | Phase 6 | Pending |
| TERM-04 | Phase 6 | Pending |
| TERM-05 | Phase 6 | Pending |
| TERM-06 | Phase 6 | Pending |
| TERM-07 | Phase 6 | Pending |
| JSON-01 | Phase 7 | Pending |
| JSON-02 | Phase 7 | Pending |
| JSON-03 | Phase 7 | Pending |
| JSON-04 | Phase 7 | Pending |
| CLI-01 | Phase 7 | Pending |
| CLI-02 | Phase 7 | Pending |
| CLI-03 | Phase 7 | Pending |
| CLI-04 | Phase 7 | Pending |
| CLI-05 | Phase 7 | Pending |
| CLI-06 | Phase 7 | Pending |
| API-01 | Phase 8 | Pending |
| API-02 | Phase 8 | Pending |
| API-03 | Phase 8 | Pending |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |
| TEST-03 | Phase 9 | Pending |
| TEST-04 | Phase 9 | Pending |
| TEST-05 | Phase 9 | Pending |
| PKG-01 | Phase 10 | Pending |
| PKG-02 | Phase 10 | Pending |
| PKG-03 | Phase 10 | Pending |
| PKG-04 | Phase 10 | Pending |
| PKG-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 62 total
- Mapped to phases: 62
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
