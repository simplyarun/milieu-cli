# milieu-cli

The API is the new product UI. Your customers are no longer just humans. They're AI agents, LLM pipelines, and automated workflows. These customers don't browse your marketing site or read your docs the way people do. They parse your machine-readable signals, probe your endpoints, and decide in milliseconds whether your product is usable.

As an industry, we've spent decades perfecting UI & UX design for humans. Now we need the same rigor for the interface AI agents actually see: your product's **milieu**.

## What is milieu?

*Milieu* is the totality of machine-readable signals that surround your product — the environment an AI agent encounters when it tries to discover, understand, and integrate with what you've built. It's not any single file or endpoint. It's robots.txt and OpenAPI specs and llms.txt and JSON-LD and developer docs and SDK references, all working together. It's the difference between a product that AI agents can use and one they walk past.

Good design made products usable for humans. Good milieu design makes products usable for agents.

milieu-cli measures this. It scans your site and tells you what AI agents can actually see.

```bash
npx milieu-cli scan stripe.com
```

```bash
# Gate your pipeline on agent-readiness
milieu scan api.example.com --threshold 70
```

## The 5 Bridges

Milieu evaluates your product through five progressive bridges. Each one represents a layer of machine legibility that AI agents need, from "can I reach you?" to "can I trust you?"

| | Bridge | Question | What milieu checks | Score |
|---|---|---|---|---|
| 1 | **Reachability** | **Can agents reach you?** | HTTPS, HTTP status, robots.txt (RFC 9309), per-bot crawler policies (GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot), meta robots, X-Robots-Tag | 0–100 |
| 2 | **Standards** | **Can agents read you?** | OpenAPI spec, llms.txt, llms-full.txt, MCP endpoint, JSON-LD, Schema.org, security.txt, ai-plugin.json | 0–100 |
| 3 | **Separation** | **Can agents integrate with you?** | API endpoints, developer docs, SDK/package references, webhook support | Detection only* |
| 4 | **Schema** | **Can agents use you correctly?** | Planned | — |
| 5 | **Context** | **Can agents trust you?** | Planned | — |

*Bridge 3 reports what's present rather than scoring quality.

The bridges are progressive: there's no point checking your OpenAPI spec (Bridge 2) if agents can't even reach your site (Bridge 1). There's no point looking for SDK references (Bridge 3) if you don't publish machine-readable standards (Bridge 2). Each bridge builds on the last.

**Bridge 1 — Reachability** is the front door. Can AI agents get to your content at all? Are you blocking specific crawlers without realizing it? This is the most actionable bridge for most sites — many are unknowingly blocking GPTBot or ClaudeBot in their robots.txt.

**Bridge 2 — Standards** is the shared language. Do you speak the protocols AI agents understand? OpenAPI specs, llms.txt, MCP endpoints, structured data — these are the machine-readable standards that let agents go beyond scraping your HTML.

**Bridge 3 — Separation** is the developer surface. Do you have a clear API boundary? Developer docs? SDKs? Webhooks? This is where agents look to determine if your product is something they can build with, not just read from.

**Bridges 4-5 — Schema and Context** are deeper evaluations of whether your APIs are well-designed and whether agents can trust the data. These require analysis beyond automated checks.

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

# Capture structured results
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
| `--verbose` | Show individual check details with explanations | off |
| `--explain-all` | Show explanations on all checks, not just failures (use with --verbose) | off |
| `--timeout <ms>` | Per-request timeout in milliseconds | 10000 |
| `--threshold <n>` | Exit non-zero if overall score < n | off |
| `--quiet` | Suppress terminal output | off |

### Check explanations

In `--verbose` mode, non-passing checks include a "why this matters" explanation, a plain-language sentence describing what the result means for AI agents. These explanations are status-aware: a failing robots.txt check tells you agents have no crawling guidance, while a passing one confirms your guidance is clear.

These explanations also appear in `--json` output as a `why` field on every check, designed for both human readers and LLMs generating recommendations.

## How scoring works

The **overall score** is the average of scored bridges (currently Bridges 1 and 2). Bridge 3 reports detection status only and is excluded from the average.

Each check within a scored bridge contributes: **pass = 1**, **partial = 0.5**, **fail = 0**. Bridge score = `(points / total_checks) * 100`.

A "partial" means the signal exists but is incomplete: an OpenAPI spec served as YAML (detected but not fully parseable), or a robots.txt with valid structure but no explicit allow/disallow rules.

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

Check explanations are available as a separate export for library consumers:

```typescript
import { resolveExplanation } from "milieu-cli";

// Get the status-aware explanation for a check
const why = resolveExplanation("robots_txt", "fail");
// → "Without robots.txt, AI agents have no guidance on what they can access..."
```

## Requirements

- Node.js 18+

## License

Apache-2.0
