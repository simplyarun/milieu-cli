# Feature Landscape

**Domain:** Website scanning / audit CLI tools (AI readiness focus)
**Researched:** 2026-03-17

## Competitor Feature Inventory

Before categorizing, here is what the established tools in this space actually ship:

### Lighthouse (Google)
- Multiple output formats: JSON, HTML report, CSV
- `--output` flag accepts multiple formats simultaneously (`--output json --output html`)
- `--output-path` for file destination
- Exit code based on score thresholds (`--budget-path` for performance budgets)
- Chrome DevTools integration, CI mode (`--chrome-flags="--headless"`)
- Programmatic Node API (`lighthouse(url, options)`)
- GitHub Action available (`treosh/lighthouse-ci-action`)
- Categories: Performance, Accessibility, Best Practices, SEO, PWA
- Verbose/quiet modes
- Config file support (`.lighthouserc.js`)
- Plugin system for custom audits
- Budget assertions (fail CI if thresholds missed)

### pa11y
- Multiple reporters: CLI (default), JSON, CSV, HTML, JUnit (for CI), TSV
- Threshold flag (`--threshold N`) -- fail if more than N issues
- Exit codes: 0 = pass, 1 = errors found, 2 = tool error
- Programmatic API (`const pa11y = require('pa11y')`)
- Config file (`.pa11yci` JSON)
- pa11y-ci for multi-URL batch scanning with config
- GitHub Actions compatible via exit codes
- WCAG level selection (`--standard WCAG2AA`)
- Ignore rules by ID
- Wait-for-element/wait-for-URL options
- Actions (click, type, wait) before testing

### webhint
- Hints system (modular checks, enable/disable individually)
- Multiple formatters: summary, codeframe, JSON
- `.hintrc` config file
- Browser extension + VS Code extension
- Categories: Accessibility, Compatibility, Performance, PWA, Security
- Severity levels per hint
- Programmatic API

### unlighthouse
- Multi-page site scanning (crawls entire site)
- Interactive HTML dashboard report
- CI mode with score thresholds
- Config file (`unlighthouse.config.ts`)
- Integrations: Nuxt, Vite, webpack, CLI
- Screenshot capture per page
- CSV export

### sitespeed.io
- Extremely rich output: HTML report, JSON, JUnit XML, TAP, Graphite/InfluxDB push
- Performance budget system with assertion syntax
- Multi-run averaging
- Docker-based CI integration
- Plugin architecture
- Comparison between runs
- HAR file capture

### AI-Readiness Tools (emerging category)
- No established CLI tools exist in this exact space as of early 2026
- llms.txt specification is nascent (llmstxt.org published the spec)
- Some SEO tools have added "AI Overview" features but not as CLI tools
- Milieu would be first-mover as a dedicated AI-readiness CLI scanner

**Confidence: HIGH** for established tool features (Lighthouse, pa11y, webhint are well-documented, stable projects). **MEDIUM** for AI-readiness landscape (based on ecosystem observation; no competing CLI tools found).

---

## Table Stakes

Features users expect from any CLI scanning/audit tool. Missing = tool feels amateur or unusable in professional workflows.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| JSON output | Every CI/CD pipeline needs machine-readable output; every competitor has it | Low | Already in PROJECT.md scope. Versioned schema is the right call. |
| Non-zero exit code on failure | CI pipelines use exit codes to gate deployments; pa11y, Lighthouse all do this | Low | Exit 1 if scan fails entirely (unreachable). Consider exit code for threshold violations too. |
| Colored terminal output | Every modern CLI uses color; developers judge quality by terminal aesthetics | Low | Already scoped (chalk). Must support `NO_COLOR` env var per convention. |
| Progress indication | Scans take seconds; silence during network I/O feels broken | Low | Already scoped (ora spinner). |
| `--help` and `--version` flags | Universal CLI convention; commander provides this automatically | Low | Free with commander. |
| Programmatic API | Lighthouse, pa11y, webhint all export a Node API; needed for custom tooling | Medium | Already scoped. `import { scan } from "milieu-cli"` returning typed result. |
| URL validation and normalization | Users type domains without `https://`, paste URLs with paths | Low | Already exists in current codebase. |
| Timeout configuration | Network conditions vary; hardcoded timeouts frustrate users on slow targets | Low | Already scoped (10s default, configurable). |
| `--quiet` / `--silent` mode | CI logs get noisy; users need to suppress terminal output and just get JSON/exit code | Low | Suppress all terminal output, only output JSON if `--json` is also set. |
| Verbose mode (`-v` / `--verbose`) | Power users want to see individual check details, HTTP responses, timing | Low | Already scoped. Show per-check detail under each bridge. |

## Differentiators

Features that set milieu-cli apart. Not expected in a v1, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 5 Bridges framework structure | No other tool organizes AI readiness into a progressive framework; unique mental model | Medium | This IS the product. Bridges 1-2 scored, Bridge 3 inventory, 4-5 visible but unevaluated. The framework itself is the moat. |
| Bridge 3 inventory (detection-only) | Showing what exists without scoring is honest and useful; competitors either score everything or skip it | Low | Presence detection of APIs, dev docs, SDKs, webhooks. Avoids false precision. |
| AI crawler policy breakdown | No tool shows per-crawler robots.txt policy (GPTBot, ClaudeBot, etc.) in a structured way | Medium | Already partially built. The rebuild should show each crawler's status clearly. |
| Score threshold flag (`--threshold N`) | CI gate: "fail if score < 80". pa11y has this, Lighthouse has budgets. Critical for CI adoption. | Low | `milieu scan <url> --threshold 70` exits non-zero if overall score < 70. |
| OpenAPI / MCP endpoint discovery | No scanning tool checks for API discoverability signals; unique to machine legibility domain | Medium | Checking 9 standard OpenAPI paths, MCP endpoint -- this is novel. |
| llms.txt validation | Beyond presence detection: is it well-structured per the spec? No other tool does this. | Medium | Already partially built. Structure validation (H1, blockquote, H2 sections, links). |
| Zero-dependency philosophy (3 runtime deps) | In a world of `node_modules` bloat, a tiny dependency tree signals trust and quality | Low | Strategic constraint. Commander + chalk + ora. Everything else uses Node built-ins. |
| Deterministic, reproducible results | No AI/LLM in the checking pipeline; same input = same output every time | Low | Strategic constraint. Differentiates from tools that use LLMs to "analyze" content. |
| Well-known URI scanning | Checking `.well-known/` paths for machine-readable metadata is novel in this category | Low | Part of Bridge 2. Complements OpenAPI and llms.txt checks. |
| Scan timing in output | Show how long each bridge took; useful for understanding bottlenecks | Low | Easy to implement, adds professionalism to output. |

## Anti-Features

Features to explicitly NOT build. These are tempting but would dilute the product, violate constraints, or create maintenance burden.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| HTML report output | Adds complexity, requires templating engine, increases deps. JSON output is sufficient; users can build their own dashboards. | Ship JSON. Let the community build HTML renderers if desired. |
| Multi-page crawling | unlighthouse's territory; massively increases complexity (crawler, dedup, rate limiting, sitemap traversal). Changes the tool from "scan a URL" to "audit a site". | Scan one URL at a time. Users can script `milieu scan` in a loop for multiple URLs. |
| Remediation advice ("how to fix") | Explicitly out of scope per PROJECT.md. Creates maintenance burden, risks becoming stale, and muddies the tool's role as a measurement layer. | Report what IS, not what SHOULD BE. Link to the 5 Bridges essay for context. |
| Config file support (`.milieurc`) | Premature for v1. Adds complexity for a tool with ~5 flags. Config files make sense when there are 20+ configurable options. | CLI flags only. Revisit if the flag count grows beyond 8-10. |
| Plugin / extension system | Lighthouse has this, but it serves a different audience scale. Plugins add API stability burden and architectural complexity. | Keep checks internal. Accept PRs for new checks if the tool gains traction. |
| Browser-based rendering | Lighthouse uses Chrome; adds massive dependency (puppeteer/playwright). milieu-cli checks machine-readable signals, not visual rendering. | Use `fetch()` only. The tool checks what bots see, not what browsers render. |
| Telemetry / analytics | Explicitly out of scope. Zero outbound requests except to target URL. Trust signal for developers. | No phone-home. No usage tracking. |
| Score comparison between domains | Tempting but creates competitive dynamics that distract from the tool's purpose. Also requires data storage. | Score one domain at a time. No leaderboards, no "better than X%" messaging. |
| Authentication support for scanning | Adding auth (API keys, cookies, headers) significantly increases complexity and attack surface. | Scan public-facing URLs only. Document this as a design choice. |
| JUnit/TAP/xUnit XML output | These are CI-specific formats that add formatter complexity. JSON output + exit codes cover 95% of CI needs. | JSON + exit codes. If JUnit is needed, a `jq` one-liner can transform JSON. |
| Watch mode / continuous scanning | Development-time watching is for build tools, not audit tools. Adds process management complexity. | One-shot scan. Users re-run when ready. |

## Feature Dependencies

```
URL validation + normalization (foundation)
  -> HTTP reachability check (Bridge 1 foundation)
    -> HTTPS enforcement check
    -> robots.txt fetch + parse
      -> AI crawler policy extraction (depends on robots.txt parser)
    -> meta robots / X-Robots-Tag detection
  -> Bridge 2 checks (all depend on target being reachable)
    -> OpenAPI discovery (9 paths)
    -> llms.txt / llms-full.txt detection + validation
    -> MCP endpoint check
    -> JSON-LD / Schema.org detection
    -> well-known URI scanning
  -> Bridge 3 detection (reuses Bridge 2 data)
    -> API presence (reuses OpenAPI result from Bridge 2)
    -> Developer docs detection
    -> SDK/package references
    -> Webhook support detection

Scoring system (depends on all Bridge 1-2 checks completing)
  -> Overall score calculation
  -> Threshold comparison (depends on score + --threshold flag)
    -> Exit code determination

Output rendering (depends on scan results)
  -> Terminal output (default)
    -> Verbose mode (expanded terminal output)
  -> JSON output (--json flag)

Programmatic API (wraps the same scan pipeline, returns typed ScanResult)
```

## MVP Recommendation

Prioritize (in implementation order):

1. **Bridge 1 (Reachability)** -- Foundation that all other bridges depend on. HTTPS, HTTP status, robots.txt with AI crawler breakdown, meta robots, X-Robots-Tag.
2. **Bridge 2 (Standards)** -- The checks that make milieu-cli unique. OpenAPI, llms.txt, MCP, JSON-LD, Schema.org, well-known URIs.
3. **Scoring + terminal output** -- The visible product. Progress bars, color-coded status, bridge scores.
4. **JSON output with versioned schema** -- CI/CD integration path. Treat as public API from day one.
5. **Bridge 3 (Separation) detection** -- Reuses Bridge 2 data, relatively cheap to add.
6. **`--threshold` flag** -- CI gate feature. Low complexity, high value for adoption.
7. **Programmatic API** -- Enables ecosystem. Export `scan()` function with typed return.

Defer:
- **Bridges 4-5 stubs**: Implement last; they are output-only (no logic), just need to appear in the result structure.
- **`--quiet` mode**: Nice-to-have, not blocking for initial release.
- **Scan timing**: Polish feature, add after core is solid.

## Sources

- Lighthouse CLI documentation (developer.chrome.com/docs/lighthouse) -- HIGH confidence
- pa11y documentation (github.com/pa11y/pa11y) -- HIGH confidence
- webhint documentation (webhint.io/docs) -- HIGH confidence
- unlighthouse documentation (unlighthouse.dev) -- HIGH confidence
- sitespeed.io documentation (sitespeed.io/documentation) -- HIGH confidence
- llms.txt specification (llmstxt.org) -- MEDIUM confidence (nascent spec, still evolving)
- AI readiness CLI tool landscape -- MEDIUM confidence (based on ecosystem observation; confirmed no direct competitors as dedicated CLI tools)
- Current milieu-content-score codebase (direct inspection) -- HIGH confidence
