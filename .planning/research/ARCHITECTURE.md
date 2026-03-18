# Architecture Patterns

**Domain:** URL scanning CLI tool (machine legibility assessment)
**Researched:** 2026-03-17

## Recommended Architecture

The architecture follows the proven **Gather-Audit-Report** pattern used by Lighthouse and webhint, adapted for milieu-cli's domain. The key insight from these tools: separate data collection from evaluation from presentation. Milieu-cli maps this to **Fetch-Check-Score-Render**.

```
                         milieu scan <url>
                              |
                         [cli/index.ts]
                         entry point
                              |
                    +---------+---------+
                    |                   |
               CLI (commander)    Programmatic API
                    |                   |
                    +--------+----------+
                             |
                       [scan(url, opts)]
                        core/scanner.ts
                             |
                      +------+------+
                      |             |
                 [http client]  [url utils]
                  utils/http    utils/url
                      |
              +-------+--------+--------+
              |                |        |
         Bridge 1          Bridge 2   Bridge 3
        Reachability      Standards  Separation
        bridges/reach.*   bridges/   bridges/
              |           standards.*  separation.*
              |                |        |
              |  (data flows forward -->)
              |                |        |
              +-------+--------+--------+
                      |
                [score(results)]
                 core/scorer.ts
                      |
               +------+------+
               |             |
          [terminal]     [json]
          render/         render/
          terminal.ts     json.ts
```

### Component Boundaries

| Component | Responsibility | Communicates With | Module Path |
|-----------|---------------|-------------------|-------------|
| **CLI Entry** | Parse args, wire commander, invoke scanner, select renderer | Scanner, Renderers | `src/cli/index.ts` |
| **Public API** | Export `scan()` function, typed `ScanResult` return | Scanner | `src/index.ts` (re-export) |
| **Scanner** | Orchestrate bridge execution, manage HTTP client lifecycle, abort on unreachable | Bridges, HTTP Client, Scorer | `src/core/scanner.ts` |
| **Bridge 1 (Reachability)** | HTTPS, HTTP status, robots.txt, AI crawler policies, meta robots, X-Robots-Tag | HTTP Client | `src/bridges/reachability.ts` |
| **Bridge 2 (Standards)** | OpenAPI, llms.txt, MCP endpoint, JSON-LD, Schema.org, well-known URIs | HTTP Client | `src/bridges/standards.ts` |
| **Bridge 3 (Separation)** | API presence, dev docs, SDK refs, webhook detection | HTTP Client, Bridge 2 data | `src/bridges/separation.ts` |
| **Scorer** | Apply scoring rules to bridge results, produce `ScanResult` | None (pure function) | `src/core/scorer.ts` |
| **Terminal Renderer** | Progress bars, color-coded output, spinner, verbose mode | ora, chalk | `src/render/terminal.ts` |
| **JSON Renderer** | Stable JSON schema output | None | `src/render/json.ts` |
| **HTTP Client** | fetch wrapper with SSRF protection, timeouts, retries, redirect following | Node built-in fetch | `src/utils/http.ts` |
| **URL Utils** | Normalization, validation, domain extraction | None | `src/utils/url.ts` |
| **Types** | All shared TypeScript interfaces | None | `src/types.ts` |

### Data Flow

**1. Input normalization**
```
user input ("example.com") --> url utils --> normalized URL ("https://example.com")
```

**2. Sequential bridge execution with forward data flow**

This is the critical architectural decision. Lighthouse uses a dependency graph for gatherer ordering. Milieu-cli is simpler: bridges execute 1, 2, 3 sequentially because Bridge 3 reuses Bridge 2 data. Within each bridge, checks run concurrently via `Promise.all`.

```
Scanner creates ScanContext {
  url: string
  httpClient: HttpClient
  abortSignal: AbortSignal
  bridgeResults: Map<string, BridgeResult>  // forward data flow
}

Bridge 1 executes --> results stored in context
  |
  v (abort if unreachable: DNS failure, connection refused)
Bridge 2 executes --> results stored in context
  |
  v
Bridge 3 executes --> reads Bridge 2 data from context
  |
  v
Scorer receives all BridgeResult[] --> ScanResult
```

**3. Output rendering**
```
ScanResult --> terminal renderer (CLI mode)
ScanResult --> JSON renderer (--json flag)
ScanResult --> returned directly (programmatic API)
```

## Patterns to Follow

### Pattern 1: Bridge as a Unit of Work

Each bridge is a self-contained module that receives a `ScanContext` and returns a `BridgeResult`. This is analogous to Lighthouse's "audit" concept. The bridge does NOT know about scoring -- it reports facts.

**What:** A bridge runs N checks concurrently and returns structured results.
**When:** Always -- this is the core abstraction.
**Example:**
```typescript
// bridges/reachability.ts
import type { ScanContext, BridgeResult, CheckResult } from "../types.js";

export async function runReachability(ctx: ScanContext): Promise<BridgeResult> {
  const checks = await Promise.all([
    checkHttps(ctx),
    checkHttpStatus(ctx),
    checkRobotsTxt(ctx),
    checkMetaRobots(ctx),
    checkXRobotsTag(ctx),
  ]);

  return {
    bridge: "reachability",
    bridgeNumber: 1,
    checks,
    // AI crawler policies extracted from robots.txt check
    metadata: extractCrawlerPolicies(checks),
  };
}
```

### Pattern 2: ScanContext as the Shared Bus

Instead of passing data between bridges via function parameters (which creates coupling), use a context object that accumulates results. This is how Lighthouse passes artifacts between gatherers and audits.

**What:** A mutable context object that bridges read from and write to.
**When:** When bridges need data from previous bridges.
**Example:**
```typescript
// core/scanner.ts
interface ScanContext {
  readonly url: string;
  readonly httpClient: HttpClient;
  readonly signal: AbortSignal;
  readonly options: ScanOptions;
  // Mutable: bridges write results here
  bridgeData: Map<string, BridgeResult>;
}
```

### Pattern 3: Thin CLI, Fat Library

The CLI entry point should be a thin wrapper around the programmatic API. This is the pattern Lighthouse uses -- `lighthouse()` function does all the work, the CLI just parses args and formats output.

**What:** CLI does: parse args, call `scan()`, render output. Nothing else.
**When:** Always -- this enables dual CLI/library usage.
**Example:**
```typescript
// cli/index.ts
import { scan } from "../core/scanner.js";
import { renderTerminal } from "../render/terminal.js";
import { renderJson } from "../render/json.js";

const program = new Command();
program
  .argument("<url>")
  .option("--json", "Output as JSON")
  .option("--verbose", "Show individual check details")
  .action(async (url, opts) => {
    const result = await scan(url, {
      timeout: opts.timeout,
      verbose: opts.verbose,
    });
    if (opts.json) {
      console.log(renderJson(result));
    } else {
      renderTerminal(result, { verbose: opts.verbose });
    }
  });

// index.ts (public API)
export { scan } from "./core/scanner.js";
export type { ScanResult, ScanOptions } from "./types.js";
```

### Pattern 4: Scorer as Pure Function

Scoring is separated from data collection. The scorer receives raw bridge results and applies scoring rules. This is testable in isolation and makes scoring changes trivial.

**What:** Pure function: `BridgeResult[] --> ScanResult`
**When:** After all bridges complete.
**Example:**
```typescript
// core/scorer.ts
export function score(bridges: BridgeResult[]): ScanResult {
  const bridge1 = bridges.find(b => b.bridgeNumber === 1);
  const bridge2 = bridges.find(b => b.bridgeNumber === 2);
  // Pure calculation, no side effects
  return {
    bridges: bridges.map(b => scoreBridge(b)),
    overall: calculateOverall(bridges),
  };
}
```

### Pattern 5: HTTP Fixture Testing with Recorded Responses

For HTTP-heavy code, the standard approach (used by webhint, nock-based testing) is pre-recorded HTTP fixtures. Each fixture is a directory containing request/response pairs.

**What:** Test against recorded HTTP responses, not live URLs.
**When:** All unit and integration tests for bridge logic.
**Example:**
```typescript
// test/fixtures/example.com/robots.txt.fixture.ts
export const fixture = {
  url: "https://example.com/robots.txt",
  status: 200,
  headers: { "content-type": "text/plain" },
  body: `User-agent: *\nDisallow:\n\nUser-agent: GPTBot\nDisallow: /`,
};

// test/bridges/reachability.test.ts
import { createMockHttpClient } from "../helpers/mock-http.js";
import { runReachability } from "../../src/bridges/reachability.js";

test("detects GPTBot blocked", async () => {
  const http = createMockHttpClient([robotsFixture]);
  const ctx = createTestContext("https://example.com", http);
  const result = await runReachability(ctx);
  expect(result.checks.find(c => c.id === "ai-crawler-policies")
    .details.crawlers.find(c => c.agent === "GPTBot").allowed)
    .toBe(false);
});
```

### Pattern 6: CheckResult as Uniform Interface

Every individual check returns the same shape. This is how Lighthouse audits work -- every audit returns `{score, details, ...}`. Uniform interface enables generic rendering and aggregation.

**What:** All checks return `CheckResult` with consistent fields.
**When:** Every check in every bridge.
**Example:**
```typescript
interface CheckResult {
  id: string;           // unique check identifier, e.g., "https-enforced"
  status: "pass" | "fail" | "warn" | "skip" | "error";
  label: string;        // human-readable, e.g., "HTTPS enforced"
  details?: unknown;    // check-specific structured data
  error?: string;       // error message if status === "error"
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Check Functions That Know About Scoring
**What:** Individual check functions returning scores or earned points.
**Why bad:** Couples data collection to scoring policy. When scoring changes (and it will), you have to modify every check. The current codebase already has this problem -- scoring is separate, but the boundary is blurry because `types.ts` mixes raw data with scoring-relevant booleans.
**Instead:** Checks return facts. Scorer interprets facts into scores.

### Anti-Pattern 2: Monolithic Entry Point
**What:** Single `index.ts` that handles CLI parsing, check execution, scoring, and rendering (current state).
**Why bad:** Cannot use as library. Cannot test scanner logic without CLI. Cannot swap renderers.
**Instead:** Thin CLI entry point that delegates to scanner and renderer.

### Anti-Pattern 3: Implicit Check Registration
**What:** Checks discovered at runtime via directory scanning or dynamic imports (plugin pattern).
**Why bad:** For a tool with only 3 bridges and ~20 checks, plugin architecture adds complexity with zero benefit. Lighthouse needs plugins because it has 100+ audits and external contributors. Milieu-cli does not.
**Instead:** Explicit static imports. Each bridge file explicitly imports and runs its checks. You can find every check by reading the bridge file.

### Anti-Pattern 4: Shared Mutable HTTP State
**What:** Global fetch function with module-level configuration (current pattern with `USER_AGENT` constant and global retry settings).
**Why bad:** Cannot configure per-scan (timeout, retry policy). Cannot test without mocking globals. Cannot run concurrent scans in library mode.
**Instead:** HttpClient instance created per scan, passed via ScanContext.

### Anti-Pattern 5: Domain String as Primary Identifier
**What:** Passing a bare domain string (`"example.com"`) through the system (current pattern).
**Why bad:** Loses protocol information, requires re-prefixing with `https://` everywhere, edge cases with ports and paths.
**Instead:** Normalize to full URL early (`https://example.com`), pass URL object or string URL through the system.

## Directory Structure

```
src/
  index.ts              # Public API: export { scan } and types
  types.ts              # All shared interfaces
  cli/
    index.ts            # Commander setup, arg parsing, output dispatch
  core/
    scanner.ts          # Bridge orchestration, abort logic
    scorer.ts           # Pure scoring function
  bridges/
    reachability.ts     # Bridge 1: HTTPS, robots.txt, meta robots, etc.
    standards.ts        # Bridge 2: OpenAPI, llms.txt, JSON-LD, etc.
    separation.ts       # Bridge 3: API detection, dev docs, SDKs
  render/
    terminal.ts         # chalk + ora terminal output
    json.ts             # JSON serialization
  utils/
    http.ts             # HttpClient class (SSRF, retries, timeouts)
    url.ts              # URL normalization, validation
    parse.ts            # robots.txt parser, HTML parsing helpers
test/
  fixtures/             # Recorded HTTP responses
    robots/             # robots.txt test cases
    openapi/            # OpenAPI discovery test cases
    ...
  helpers/
    mock-http.ts        # Mock HttpClient for testing
    context.ts          # Test context factory
  bridges/
    reachability.test.ts
    standards.test.ts
    separation.test.ts
  core/
    scanner.test.ts
    scorer.test.ts
  utils/
    http.test.ts
    url.test.ts
    parse.test.ts
```

## Build Order (Dependencies Between Components)

The build order matters because each layer depends on the ones below it. This directly maps to implementation phases.

```
Layer 0: types.ts (no deps - build first)
    |
Layer 1: utils/url.ts, utils/parse.ts (depend on types)
    |
Layer 2: utils/http.ts (depends on types, url utils)
    |
Layer 3: bridges/* (depend on http, types, parse)
    |     Bridge 1 has no bridge deps
    |     Bridge 2 has no bridge deps
    |     Bridge 3 depends on Bridge 2 data shape
    |
Layer 4: core/scorer.ts (depends on types only - pure function)
    |
Layer 5: core/scanner.ts (depends on bridges, scorer, http)
    |
Layer 6: render/* (depend on types/ScanResult only)
    |
Layer 7: cli/index.ts (depends on scanner, renderers)
    |
Layer 8: index.ts public API (re-exports scanner + types)
```

**Recommended implementation order:**

1. **Types + Utils** (Layer 0-2): Foundation. Types define the contract everything builds against. HTTP client is reused everywhere. Fully testable in isolation.

2. **Bridge 1 (Reachability)** (Layer 3): Start here because it includes the "abort on unreachable" gate. If Bridge 1 fails, the scan aborts. This forces you to define the abort flow early.

3. **Scorer** (Layer 4): Build scoring before more bridges so you can see end-to-end results. Scorer is a pure function -- easy to build and test.

4. **Scanner + Renderers** (Layer 5-7): Wire up the orchestration with just Bridge 1. This gives you a working CLI with one bridge. Terminal renderer with progress bars. JSON output with stable schema.

5. **Bridge 2 (Standards)** (Layer 3): Add standards checks. Scanner already handles orchestration. Most checks are independent HTTP fetches.

6. **Bridge 3 (Separation)** (Layer 3): Depends on Bridge 2 data (e.g., OpenAPI detection). Build last because it reuses earlier results and is detection-only (no scoring).

7. **Public API** (Layer 8): Export `scan()` and types from `src/index.ts`. Wire `package.json` exports. This is last because the API surface should be stable before exposing it.

## Scalability Considerations

| Concern | Current (v1) | Future Growth | Notes |
|---------|--------------|---------------|-------|
| Number of checks | ~20 checks across 3 bridges | Could grow to 50+ when Bridges 4-5 added | Explicit imports scale fine to 50. Beyond 100 consider registry pattern. |
| Concurrent scans | Single scan per invocation | Library users may run concurrent scans | HttpClient-per-scan via ScanContext handles this. No global state. |
| Output formats | Terminal + JSON | Could add SARIF, JUnit, HTML | Renderer interface pattern supports this without touching scanner. |
| Check timeout | 10s per-request | May need per-check timeouts | AbortController per bridge with configurable timeout. |
| Result size | Small (3 bridges, ~20 checks) | Grows linearly | Not a concern until 100+ checks. |

## Key Architectural Decisions

### Why NOT a plugin system

Lighthouse has a plugin system because it has 100+ audits, a Chrome extension ecosystem, and external contributors writing custom audits. Milieu-cli has 3 bridges with ~20 checks, maintained by a single team. Plugin architecture would add: dynamic imports, a registry, validation of plugin shape, documentation for plugin authors, versioning of plugin API. All cost, no benefit at this scale. If Bridges 4-5 are added later (proprietary), they would be added as new bridge modules in the same codebase, not as plugins.

### Why ScanContext over function parameters

Passing `(url, httpClient, previousResults)` through every function creates verbose signatures and requires updating every bridge signature when context grows. A context object is extensible. Lighthouse uses `LighthouseContext` / `PassContext` for the same reason.

### Why sequential bridges (not dependency graph)

Lighthouse uses a dependency graph because gatherers and audits have complex interdependencies. Milieu-cli has exactly one dependency: Bridge 3 reads Bridge 2 data. Sequential execution (1, 2, 3) is simpler, predictable, and sufficient. If dependencies become more complex in the future, refactoring to a topological sort is straightforward.

### Why HttpClient class over utility functions

The current codebase uses bare `fetchUrl`/`fetchPath` utility functions with module-level constants for configuration. An `HttpClient` class (or factory-produced object) enables: per-scan configuration (timeout, retries), testability via dependency injection (swap with mock), lifecycle management (abort all in-flight requests), and concurrent scan safety in library mode.

## Sources

- Lighthouse architecture: training data knowledge of Lighthouse's Gatherer-Audit-Report pipeline, configuration-driven audit selection, and LHR (Lighthouse Result) format. **MEDIUM confidence** -- based on established, well-documented patterns that are stable across versions, but not verified against current docs due to tool access limitations.
- webhint architecture: training data knowledge of webhint's connector/hint/formatter/parser plugin model. **MEDIUM confidence** -- same caveat.
- General CLI tool patterns: commander.js for arg parsing, ora for spinners, chalk for colors -- well-established patterns. **HIGH confidence** -- these are stable, mature libraries.
- HTTP fixture testing: nock, msw, and manual fixture patterns are standard in Node.js testing. **HIGH confidence** -- established practice.
- Current codebase analysis: **HIGH confidence** -- read directly from source.
