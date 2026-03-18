# Milieu CLI

## What This Is

An open-source CLI tool that measures how legible a product is to AI agents, based on the 5 Bridges of Machine Legibility framework. Users run `npx milieu-cli scan <url>` to get a structured assessment across Reachability, Standards, and Separation — with Bridges 4-5 (Schema, Context) visible but explicitly marked as not evaluated. Published as an npm package, usable both as a CLI and a programmatic library.

## Core Value

Provide the first credible, deterministic measurement layer for AI agent readiness — a Lighthouse for the agentic web. Every check must be reproducible, transparent, and trustworthy.

## Requirements

### Validated

- ✓ robots.txt parsing and AI crawler policy detection — existing (will be rebuilt)
- ✓ llms.txt / llms-full.txt presence detection — existing (will be rebuilt)
- ✓ JSON-LD / Schema.org structured data detection — existing (will be rebuilt)
- ✓ HTTPS and HTTP health checks — existing (will be rebuilt)
- ✓ SSRF protection and safe HTTP handling — existing (will be rebuilt)
- ✓ JSON output mode — existing (will be rebuilt)
- ✓ HTTP client with discriminated union errors, SSRF protection, URL normalization — Validated in Phase 2: HTTP Client and Utilities (2026-03-18)
- ✓ Bridge 1 (Reachability): HTTPS check, HTTP status, RFC 9309 robots.txt parser, 6 AI crawler policies, meta robots, X-Robots-Tag, scoring with partial=0.5 — Validated in Phase 3 (2026-03-18)

### Active

- [ ] Rename to `milieu-cli` with `milieu scan <url>` as primary command
- [ ] New project structure: `bridges/`, `render/`, `utils/` architecture
- [ ] Bridge 1 (Reachability): HTTPS, HTTP status, robots.txt, 6 AI crawler policies, meta robots, X-Robots-Tag
- [ ] Bridge 2 (Standards): OpenAPI discovery (9 paths), llms.txt, llms-full.txt, MCP endpoint, JSON-LD, Schema.org, well-known URIs
- [ ] Bridge 3 (Separation): Presence detection only — API presence, developer docs, SDK/package references, webhook support
- [ ] Bridges 4-5 stubs: Visible in output, marked "not evaluated", no hints about future evaluation
- [ ] Bridge 1-2 scoring: `passed_checks / total_checks * 100`, equal weight
- [ ] Bridge 3 inventory output: No score, just detected/not detected with inventory object
- [ ] Terminal output: Progress bars (12-char), color-coded status, spinner during scan
- [ ] Verbose mode: Individual check details under each bridge
- [ ] JSON output: Stable `ScanResult` schema treated as versioned public API
- [ ] Programmatic API: `import { scan } from "milieu-cli"` returns typed `ScanResult`
- [ ] CLI via `commander`, colors via `chalk`, spinner via `ora` — 3 runtime deps only
- [ ] Sequential bridge execution (1→2→3), concurrent checks within each bridge
- [ ] Bridge 3 reuses Bridge 2 data (e.g., OpenAPI detection)
- [ ] HTTP: 10s timeout (configurable), 1 retry on 5xx/timeout, follow up to 5 redirects
- [ ] Abort scan on unreachable target (DNS failure, connection refused)
- [ ] Unit tests: robots.txt parsing, OpenAPI detection, JSON-LD parsing, URL normalization
- [ ] Integration tests: Recorded HTTP fixtures, no live URLs in CI
- [ ] README: One-line description, quick start, 5 Bridges explanation, CLI flags, programmatic API, JSON schema reference

### Out of Scope

- Bridges 4-5 evaluation — proprietary, reserved for future product
- AI/LLM-based checks — all checks must be deterministic
- Remediation advice — no "how to fix" guidance in output
- Telemetry, analytics, or phone-home — zero outbound except to target URL
- Benchmark comparisons between domains
- Authentication or API keys to run the tool
- Scoring methodology details in README beyond "checks passed / total checks"
- Any mention of future features, paid products, SaaS, or commercial plans in README
- Mobile app or web UI

## Context

This tool is the open-source foundation for a future startup in the machine legibility space. The 5 Bridges framework is public (published essay), but the evaluation methodology for Bridges 4-5 is proprietary IP. The open-source tool must be genuinely useful and credible on its own — not a demo or teaser.

The current codebase (`milieu-content-score`) is a working v0.1 with 5 content checks, but architecturally doesn't match the 5 Bridges model. This is a ground-up rebuild in the same repo. Existing logic for robots.txt parsing, SSRF protection, and fetch handling can inform the rebuild but will be rewritten to match the new architecture.

Key strategic considerations:
- Bridges 4-5 must feel like a natural boundary, not a paywall
- Terminal output quality is critical — developers judge tools by CLI polish
- JSON output is a public contract — treat as versioned API from day one
- robots.txt parsing must be bulletproof — it's the check people verify manually
- Zero runtime deps beyond chalk, commander, ora — developer trust requires a tiny dependency tree

## Constraints

- **Stack**: TypeScript, ESM, Node >= 18, zero-dep philosophy (3 runtime deps max)
- **Architecture**: Fresh start in same repo — gut current code, rebuild from spec
- **IP Protection**: No hints about Bridges 4-5 evaluation methodology anywhere in code, docs, or output
- **Determinism**: Every check must produce identical results for identical inputs
- **Privacy**: No data leaves the user's machine except HTTP requests to the scan target
- **License**: MIT (open source)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ground-up rebuild vs incremental refactor | Current architecture doesn't map to 5 Bridges; cleaner to rebuild | — Pending |
| 3 runtime deps (commander, chalk, ora) | Minimal footprint builds developer trust; Node 18 built-in fetch eliminates HTTP deps | — Pending |
| Bridges 4-5 "not evaluated" with no roadmap hints | Protects proprietary IP while keeping the framework visible | — Pending |
| Bridge 3 detection-only (no scoring) | Separation quality requires deeper analysis; presence detection is deterministic | — Pending |
| Sequential bridges, concurrent checks within | Bridge 3 reuses Bridge 2 data; sequential ordering enables data sharing | — Pending |
| JSON output as public API contract | Enables ecosystem tooling (CI/CD, dashboards) without coupling to CLI | — Pending |

---
*Last updated: 2026-03-17 after initialization*
