# milieu-cli

API is the new product UI. Find out if AI agents can discover, use, and integrate your product.

A Lighthouse for the agentic web. No API keys required.

```bash
npx milieu-cli scan stripe.com
```

```bash
# Gate your pipeline on agent-readiness
milieu scan api.mycompany.com --threshold 70
```

## What it checks

milieu scans your site from an AI agent's perspective, answering five questions:

| | Agent question | What milieu checks | Score |
|---|---|---|---|
| **Bridge 1** | **Can agents find my API?** | HTTPS, HTTP status, robots.txt (RFC 9309), per-bot crawler policies (GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot), meta robots, X-Robots-Tag | 0-100 |
| **Bridge 2** | **Can agents understand what my API does?** | OpenAPI spec (9-path probe), llms.txt, llms-full.txt, MCP endpoint, JSON-LD, Schema.org, security.txt, ai-plugin.json | 0-100 |
| **Bridge 3** | **Can agents connect to my API?** | API endpoints, developer docs, SDK/package references, webhook support | Detection only |
| **Bridge 4** | **Can agents use my API correctly?** | Not yet evaluated | — |
| **Bridge 5** | **Can agents trust the context?** | Not yet evaluated | — |

### Crawler policies

The single most actionable finding for most sites: are you blocking AI agents? milieu checks your robots.txt for policies on six specific bots:

- **GPTBot** (OpenAI) · **ClaudeBot** (Anthropic) · **CCBot** (Common Crawl)
- **Googlebot** (Google) · **Bingbot** (Microsoft) · **PerplexityBot** (Perplexity)

Each policy is checked individually — you might be allowing Googlebot but blocking GPTBot without realizing it. Use `--verbose` to see per-bot results.

## Install

```bash
npx milieu-cli scan stripe.com        # one-off, no install
npm install -g milieu-cli              # global install
milieu scan stripe.com                 # short alias after install
```

> Both `milieu` and `milieu-cli` work as commands after global install.

## CI/CD integration

Track agent-readiness over time and prevent regressions:

```bash
# Fail the build if score drops below 70
milieu scan api.mycompany.com --threshold 70 --quiet

# Capture structured results for dashboards
milieu scan api.mycompany.com --json > milieu-report.json

# Pretty-print for debugging
milieu scan api.mycompany.com --json --pretty
```

Exit codes: `0` = score meets threshold (or no threshold set), `1` = score below threshold or scan error.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output raw JSON to stdout | off |
| `--pretty` | Pretty-print JSON (use with --json) | off |
| `--verbose` | Show individual check details | off |
| `--timeout <ms>` | Per-request timeout in milliseconds | 10000 |
| `--threshold <n>` | Exit non-zero if overall score < n | off |
| `--quiet` | Suppress terminal output | off |

## How scoring works

The **overall score** is the average of scored bridges (currently Bridges 1 and 2). Bridge 3 reports detection status only and is excluded from the average.

Each check within a scored bridge contributes: **pass = 1**, **partial = 0.5**, **fail = 0**. Bridge score = `(points / total_checks) * 100`.

A "partial" means the signal exists but is incomplete — an OpenAPI spec served as YAML (detected but not fully parseable), or a robots.txt with valid structure but no explicit allow/disallow rules.

All checks are reproducible: same site state produces the same score every time.

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

> **Note:** `result.bridges` always returns 5 elements. Bridges 1-2 have numeric scores. Bridge 3 has `score: null` (detection inventory). Bridges 4-5 have `score: null` (not yet evaluated). Handle nulls when mapping:
>
> ```typescript
> const scoredBridges = result.bridges.filter(b => b.score !== null);
> ```

## Requirements

- Node.js 18+

## License

MIT
