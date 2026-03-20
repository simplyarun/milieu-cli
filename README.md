# milieu-cli

Measure how legible your product is to AI agents. A Lighthouse for the agentic web.

Find out whether AI agents can discover, understand, and integrate with your product — from robots.txt policies to OpenAPI specs to structured data.

Runs reproducible checks across 5 bridges of machine legibility against any public URL. No AI, no API keys, no config. Same site state, same score, every time.

## Quick start

```bash
npx milieu-cli scan stripe.com
```

After install, `milieu` is available as a short alias:

```bash
npm install -g milieu-cli
milieu scan stripe.com
```

> **Note:** `npx milieu-cli` is for one-off use. After global install, both `milieu scan` and `milieu-cli scan` work.

## What it checks

| Bridge | What it measures | Checks | Score |
|--------|------------------|--------|-------|
| **Bridge 1: Reachability** | HTTPS, HTTP status, RFC 9309 robots.txt, 6 AI crawler policies (GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot), meta robots, X-Robots-Tag | 11 | 0-100 |
| **Bridge 2: Standards** | OpenAPI (9-path probe), llms.txt, llms-full.txt, MCP endpoint, JSON-LD, Schema.org, security.txt, ai-plugin.json | 8 | 0-100 |
| **Bridge 3: Separation** | API presence, developer docs, SDK references, webhook support | 4 | Unscored — detection only |
| **Bridge 4: Schema** | Not yet evaluated | — | — |
| **Bridge 5: Context** | Not yet evaluated | — | — |

Bridge 3 intentionally produces a detection inventory (detected / not detected) rather than a numeric score — presence of separation signals is meaningful without ranking them. Bridges 4-5 are visible in output but not yet evaluated.

## Scoring

The **overall score** is the average of all scored bridges (currently Bridges 1 and 2). Bridge 3 is excluded from the average because it has no numeric score.

Each check within a scored bridge contributes: **pass = 1 point**, **partial = 0.5 points**, **fail = 0 points**. The bridge score is `(points / total_checks) * 100`.

A "partial" result means the signal was detected but incomplete — for example, an OpenAPI spec served as YAML (detected but not fully parseable without a YAML library) or a robots.txt with a valid `User-agent` line but no `Allow`/`Disallow` rules.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output raw JSON | off |
| `--pretty` | Pretty-print JSON (use with --json) | off |
| `--verbose` | Show individual check details | off |
| `--timeout <ms>` | Per-request timeout in milliseconds | 10000 |
| `--threshold <n>` | Exit non-zero if overall score < n | off |
| `--quiet` | Suppress terminal output | off |

## JSON output

```bash
milieu scan stripe.com --json --pretty
```

Returns the complete `ScanResult` object. JSON output is a versioned public API surface.

## CI/CD integration

Use `--threshold` and `--json` to gate deployments on machine legibility:

```bash
# Fail the build if score drops below 70
milieu scan mysite.com --threshold 70 --quiet

# Capture JSON for dashboards or artifacts
milieu scan mysite.com --json > milieu-report.json
```

Exit codes: `0` = score meets threshold (or no threshold set), `1` = score below threshold or scan error.

## Programmatic API

```typescript
import { scan } from "milieu-cli";
import type { ScanResult, ScanOptions, BridgeResult, Check, CheckStatus } from "milieu-cli";

const options: ScanOptions = {
  timeout: 15000,  // per-request timeout in ms (default: 10000)
  verbose: true,   // include check details in result
  silent: true,    // suppress spinner output (recommended for library use)
};

const result = await scan("https://stripe.com", options);

console.log(result.overallScore);      // number (average of scored bridges)
console.log(result.overallScoreLabel); // "pass" | "partial" | "fail"
console.log(result.bridges);           // 5-element tuple of BridgeResult
```

> **Note:** `result.bridges` always returns 5 elements. Bridges 1-2 have numeric scores. Bridge 3 has `score: null` (detection inventory). Bridges 4-5 have `score: null` (not yet evaluated). Code that maps over bridge scores should handle `null`:
>
> ```typescript
> const scoredBridges = result.bridges.filter(b => b.score !== null);
> ```

## Requirements

- Node.js 18+

## License

MIT
