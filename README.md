# milieu-cli

The API is the new product UI. Your customers are no longer just humans. They're AI agents, LLM pipelines, and automated workflows. These customers don't browse your marketing site or read your docs the way people do. They parse your machine-readable signals, probe your endpoints, and decide in milliseconds whether your product is usable.

As an industry, we've spent decades perfecting UI & UX design for humans. Now we need the same rigor for the interface AI agents actually see: your product's **milieu**.

## Table of contents

- [What is milieu?](#what-is-milieu)
- [Quick start](#quick-start)
- [The 5 Bridges](#the-5-bridges)
- [Install](#install)
- [CI/CD integration](#cicd-integration)
- [Options](#options)
- [How scoring works](#how-scoring-works)
- [Programmatic API](#programmatic-api)
- [Requirements](#requirements)
- [License](#license)

## What is milieu?

*Milieu* is the totality of machine-readable signals that surround your product — the environment an AI agent encounters when it tries to discover, understand, and integrate with what you've built. It's not any single file or endpoint. It's robots.txt and OpenAPI specs and llms.txt and JSON-LD and developer docs and SDK references, all working together. It's the difference between a product that AI agents can use and one they walk past.

Good design made products usable for humans. Good milieu design makes products usable for agents.

milieu-cli measures this. It scans your product surface and tells you what AI agents can actually see.

```bash
npx milieu-cli scan petstore.swagger.io
```

```bash
# Gate your pipeline on agent-readiness
milieu scan api.example.com --threshold 70
```

## Quick start

Run your first scan in under a minute:

```bash
npx milieu-cli scan petstore.swagger.io
```

No config, no API keys. You'll get a scored report showing what AI agents can see when they visit that product surface.

### Example products to try

Each of these exercises different parts of the scanner:

```bash
# The classic OpenAPI demo — Swagger spec at a well-known path
npx milieu-cli scan petstore.swagger.io

# Rich structured data — JSON-LD and Schema.org markup
npx milieu-cli scan schema.org

# Minimal API service — clean reachability, few standards signals
npx milieu-cli scan httpbin.org
```

Add `--verbose` to any scan to see individual check results and explanations:

```bash
npx milieu-cli scan petstore.swagger.io --verbose
```

Once you've seen how these score, scan your own product surface and compare.

## The 5 Bridges

Milieu evaluates your product through five progressive bridges. Each one represents a layer of machine legibility that AI agents need, from "can I reach you?" to "can I trust you?"

| | Bridge | Question | What milieu checks | Score |
|---|---|---|---|---|
| 1 | **Reachability** | **Can agents reach you?** | HTTPS, HTTP status, robots.txt (RFC 9309), per-bot crawler policies (GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot), meta robots, X-Robots-Tag | 0–100 |
| 2 | **Standards** | **Can agents read you?** | OpenAPI spec, GraphQL introspection, XML sitemap, markdown content negotiation, llms.txt, llms-full.txt, MCP endpoint, JSON-LD, Schema.org, security.txt, WebMCP, A2A Agent Card | 0–100 |
| 3 | **Separation** | **Can agents integrate with you?** | API endpoints, developer docs, SDK/package references, webhook support | Detection only* |
| 4 | **Schema** | **Can agents use your APIs correctly?** | Operation IDs, schema types, error response schemas, required fields, field descriptions | 0–100 |
| 5 | **Context** | **Can agents trust and operate your APIs?** | Rate-limit headers, auth clarity, auth legibility, Terms of Service, API versioning, contact info, agents.json | 0–100 |

*Bridge 3 reports what's present rather than scoring quality.

The bridges are progressive: there's no point checking your OpenAPI spec (Bridge 2) if agents can't even reach your product surface (Bridge 1). There's no point evaluating schema quality (Bridge 4) if no spec was found (Bridge 2). Each bridge builds on the last.

**Bridge 1 — Reachability** is the front door. Can AI agents get to your content at all? Are you blocking specific crawlers without realizing it? This is the most actionable bridge for most products — many are unknowingly blocking GPTBot or ClaudeBot in their robots.txt.

**Bridge 2 — Standards** is the shared language. Do you speak the protocols AI agents understand? OpenAPI specs, GraphQL endpoints, XML sitemaps, markdown content negotiation, llms.txt, MCP endpoints, structured data — these are the machine-readable standards that let agents go beyond scraping your HTML. milieu also checks for [WebMCP](https://spec.modelcontextprotocol.io/) discovery at `/.well-known/mcp.json` and [A2A Agent Cards](https://google.github.io/A2A/) at `/.well-known/agent.json`.

**Bridge 3 — Separation** is the developer surface. Do you have a clear API boundary? Developer docs? SDKs? Webhooks? This is where agents look to determine if your product is something they can build with, not just read from.

**Bridge 4 — Schema** evaluates the quality of your OpenAPI spec from an agent's perspective. Having a spec is necessary (Bridge 2), but having a *good* spec is what lets agents actually call your API correctly. milieu checks whether your operations have `operationId` (the function name agents use), whether request/response schemas define types, whether error responses have structured schemas, whether required fields are declared, and whether fields have descriptions. When no spec is found, each check explains what the agent loses — for example, "without operation IDs, agents cannot map API capabilities to callable functions."

**Bridge 5 — Context** assesses the operational signals an agent needs to use your API reliably. This includes rate-limit headers (so agents can pace requests), API versioning (so agents can target a stable version), Terms of Service (so agents can verify permitted use), contact info, and `agents.json` at `/.well-known/`.

### Auth legibility

Bridge 5 introduces two checks that together answer: **how well does your API guide an unauthenticated agent toward successful authentication?**

An agent's first encounter with any API is unauthenticated. The agent discovers the spec, reads the auth requirements, obtains credentials, then makes authenticated calls. Milieu tests both sides of this:

- **Auth clarity** (spec-level): Are `securitySchemes` defined? Do they have descriptions? Are they applied to operations? This tells agents *how* to authenticate before they try.

- **Auth legibility** (runtime): When an agent hits a protected endpoint without credentials, how helpful is the 401/403 response? milieu checks for three signals:
  - `WWW-Authenticate` header — tells the agent which auth scheme to use
  - Structured JSON error body — the agent can parse the rejection
  - Documentation URL in the error body — the agent can self-onboard

An API that returns `{"error": "unauthorized", "docs_url": "https://docs.example.com/auth"}` with a `WWW-Authenticate: Bearer` header scores full marks. An API that returns an HTML login page scores zero — the agent has no idea what to do next.

### Crawler policies

The single most actionable finding for most products: are you blocking AI agents? milieu checks your robots.txt for policies on six specific bots:

- **GPTBot** (OpenAI) · **ClaudeBot** (Anthropic) · **CCBot** (Common Crawl)
- **Googlebot** (Google) · **Bingbot** (Microsoft) · **PerplexityBot** (Perplexity)

Each policy is checked individually — you might be allowing Googlebot but blocking GPTBot without realizing it. Use `--verbose` to see per-bot results.

## Install

```bash
npx milieu-cli scan petstore.swagger.io   # one-off, no install
npm install -g milieu-cli                 # global install
milieu scan petstore.swagger.io           # short alias after install
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

The **overall score** is the average of scored bridges (Bridges 1, 2, 4, and 5). Bridge 3 reports detection status only and is excluded from the average.

**Bridges 1, 2, and 4** use equal-weight scoring: each check contributes **pass = 1**, **partial = 0.5**, **fail = 0**. Bridge score = `(points / total_checks) * 100`. Thresholds: ≥80 = pass, ≥40 = partial, <40 = fail.

**Bridge 5** uses weighted scoring to reflect real-world importance to agents. Rate-limit headers and auth checks carry more weight than contact info. Thresholds are lower (≥60 = pass, ≥30 = partial) because governance signals are nascent — few sites implement all of them today.

A "partial" means the signal exists but is incomplete: an OpenAPI spec served as YAML (detected but not fully parseable), a 401 response with a JSON body but no `WWW-Authenticate` header, or a robots.txt with valid structure but no explicit allow/disallow rules.

Bridge 4 returns all-fail when no OpenAPI spec is detected, with a specific message per check explaining what the agent loses. Bridge 5 still runs most of its checks (rate limits, auth legibility, agents.json, versioning via headers) even without a spec — governance signals exist independently.

All checks are reproducible: same product surface state produces the same score every time.

## Programmatic API

```typescript
import { scan } from "milieu-cli";
import type { ScanResult, ScanOptions, BridgeResult, Check, CheckStatus } from "milieu-cli";

const options: ScanOptions = {
  timeout: 15000,  // per-request timeout in ms (default: 10000)
  verbose: true,   // include check details in result
  silent: true,    // suppress spinner output (recommended for library use)
};

const result = await scan("https://petstore.swagger.io", options);

console.log(result.overallScore);      // number (average of Bridges 1, 2, 4, 5)
console.log(result.overallScoreLabel); // "pass" | "partial" | "fail"
console.log(result.bridges);           // 5-element tuple of BridgeResult
```

> **Note:** `result.bridges` always returns 5 elements. Bridges 1, 2, 4, and 5 have numeric scores. Bridge 3 has `score: null` (detection inventory). Handle nulls when mapping:
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
