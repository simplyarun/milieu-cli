# milieu-cli

The API is the new product UI. Your customers are no longer just humans. They're AI agents, LLM pipelines, and automated workflows. These customers don't browse your marketing site or read your docs the way people do. They parse your machine-readable signals, probe your endpoints, and decide in milliseconds whether your product is usable.

As an industry, we've spent decades perfecting UI & UX design for humans. Now we need the same rigor for the interface AI agents actually see: your product's **milieu**.

## Table of contents

- [What is milieu?](#what-is-milieu)
- [Quick start](#quick-start)
- [The 5 Bridges](#the-5-bridges)
- [Install](#install)
- [CI/CD integration](#cicd-integration)
- [Compare two releases](#compare-two-releases)
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

Scans are **origin-scoped**: whatever URL you pass, milieu scans the site's origin (`https://domain`). Paths and query strings do not narrow the scan — `milieu scan stripe.com/docs` scans `https://stripe.com`, and the report's `scannedOrigin` field records exactly what was scanned.

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
| 2 | **Standards** | **Can agents read you?** | OpenAPI spec, GraphQL introspection, XML sitemap, markdown content negotiation, llms.txt, llms-full.txt, MCP discovery, JSON-LD, Schema.org, security.txt, A2A Agent Card | 0–100 |
| 3 | **Separation** | **Can agents integrate with you?** | API endpoints, developer docs, SDK/package references, webhook support | Detection only* |
| 4 | **Schema** | **Can agents use your APIs correctly?** | Operation IDs, schema types, error response schemas, required fields, field descriptions | 0–100 |
| 5 | **Context** | **Can agents trust and operate your APIs?** | Rate-limit headers, auth clarity, auth legibility, Terms of Service, API versioning, contact info, agents.json | 0–100 |

*Bridge 3 is unscored. Its evidence summary identifies inspected contracts, published links, successful fetches, and inferred signals.

The bridges are progressive: there's no point checking your OpenAPI spec (Bridge 2) if agents can't even reach your product surface (Bridge 1). There's no point evaluating schema quality (Bridge 4) if no spec was found (Bridge 2). Each bridge builds on the last.

**Bridge 1 — Reachability** is the front door. Can AI agents get to your content at all? Are you blocking specific crawlers without realizing it? This is the most actionable bridge for most products — many are unknowingly blocking GPTBot or ClaudeBot in their robots.txt.

**Bridge 2 — Standards** is the shared language. Do you speak the protocols AI agents understand? OpenAPI specs, GraphQL endpoints, XML sitemaps, markdown content negotiation, llms.txt, structured data — these are the machine-readable standards that let agents go beyond scraping your HTML. milieu also checks for [MCP](https://modelcontextprotocol.io/) discovery at `/.well-known/mcp.json` and [A2A Agent Cards](https://a2a-protocol.org/latest/specification/#82-discovery-mechanisms) at `/.well-known/agent-card.json`, with a fallback to the legacy `/.well-known/agent.json` path.

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

An API that returns `{"error": "unauthorized", "docs_url": "https://docs.example.com/auth"}` with a `WWW-Authenticate: Bearer` header scores full marks. A direct 401 or 403 with an HTML body and none of the three guidance signals earns zero for this check. A successful response without a challenge and an unreadable probe have different outcomes.

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

Both `milieu` and `milieu-cli` work as commands after global install. To review an unpublished candidate from its source checkout, run `npm ci`, `npm run build`, then `node dist/cli/index.js --version`. Use that same entry point for `scan` and `diff`. The unversioned npm commands above install the current public release.

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

Add `--require-complete` to fail the job if a scan exhausts its request budget, skips a bridge, or returns a check with status `error`. A `partial` check alone does not trigger this flag. A scan exits with code 1 on an input or scan error, an unmet score threshold, or an unmet completeness requirement. JSON output still contains the report when a requirement fails. Individual link observations can have incomplete coverage even when this flag passes. For decisions about published routes, inspect the Separation findings and their coverage in the diff.

## Compare two releases

Save a scan from each revision using the same Milieu version. The comparison reads the saved reports locally and makes no network requests. Terminal and JSON output can include original URLs, private endpoint paths and site-supplied text. Use `--markdown` for a shareable summary with known check names and structured observations. Review any origins and resource names shown before sharing. Large Markdown summaries report the number of omitted findings.

```bash
milieu diff base.json candidate.json
milieu diff base.json candidate.json --json
```

Findings are grouped by bridge. Where the scanner observed the same protected operation on both runs, Context compares individual authentication signals, including changes that leave the grade at `partial`. Separation reports changes in documentation links and successful fetches as inventory. Its URL evidence keeps the origin and case-sensitive path and omits user information, queries, and fragments. A linked URL may be on a different host and may never have been fetched.

Bridge 3 currently verifies one capability: discovering the API contract. It looks for a link on the homepage or on a developer docs page linked from the homepage. Milieu must have fetched and parsed the contract. A published API catalog also counts as a route when its link led Milieu to the document. Guessing a conventional spec URL verifies the document but supplies no evidence of a published link. If both scans inspect the same contract and cover those entry pages, losing the last observed route is a Separation regression. Losing an SDK reference or one of several routes changes the inventory. An unread linked page or change of contract identity makes the route comparison inconclusive. This check describes discovery of the contract. It does not exercise its business operations.

Use the same origin by default. To compare equivalent public previews with different hostnames, explicitly supply both origins in base-to-candidate order. The mapping applies only to the two origins you name. External docs hosts keep their own identity. Configure preview auth and indexing consistently.

For a GitHub Actions job with `milieu-cli` pinned in the project's lockfile, run this step after `npm ci`. Set `BASE_ORIGIN` and `CANDIDATE_ORIGIN` to the public origins of the two deployments.

```yaml
- name: Compare Milieu observations
  shell: bash
  run: |
    ./node_modules/.bin/milieu scan "$BASE_ORIGIN" --json > "$RUNNER_TEMP/milieu-base.json"
    ./node_modules/.bin/milieu scan "$CANDIDATE_ORIGIN" --json > "$RUNNER_TEMP/milieu-candidate.json"
    ./node_modules/.bin/milieu diff "$RUNNER_TEMP/milieu-base.json" "$RUNNER_TEMP/milieu-candidate.json" \
      --map-origin "$BASE_ORIGIN=$CANDIDATE_ORIGIN" --markdown >> "$GITHUB_STEP_SUMMARY"
```

A valid comparison is advisory and exits with code 0, including when it reports regressions. Invalid files, version mismatches and undeclared origin changes exit with code 1. Each input must be a regular JSON file of up to 32 MiB. Compare older reports in same-version pairs. Missing evidence, skipped bridges and changed probe targets can make a finding inconclusive. A score or a timestamp changing on its own produces no finding.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output raw JSON to stdout | off |
| `--pretty` | Pretty-print JSON (use with --json) | off |
| `--verbose` | Show individual check details with explanations | off |
| `--explain-all` | Show explanations on all checks, not just failures (use with --verbose) | off |
| `--timeout <ms>` | Per-request timeout in whole milliseconds, from 1 to 2147483647 | 10000 |
| `--require-complete` | Exit non-zero for request-budget exhaustion, a skipped bridge or an errored check | off |
| `--threshold <n>` | Exit non-zero if the score falls below n. Accepts values from 0 to 100 | off |
| `--quiet` | Suppress terminal output | off |
| `--max-concurrency <n>` | Maximum simultaneous outbound requests | 8 |
| `--max-requests <n>` | Maximum request attempts for the whole scan, counting every redirect hop and retry. If the budget runs out, affected checks report `error` (skipped, not failed) and the result is marked `incomplete` | 150 |

### Check explanations

In `--verbose` mode, non-passing checks include a "why this matters" explanation, a plain-language sentence describing what the result means for AI agents. These explanations are status-aware: a failing robots.txt check tells you agents have no crawling guidance, while a passing one confirms your guidance is clear.

These explanations also appear in `--json` output as a `why` field on every check, designed for both human readers and LLMs generating recommendations.

## How scoring works

The **overall score** is the rounded mean of the available numeric scores for Reachability, Standards, Schema, and Context. The terminal reports how many of those four contributed. JSON consumers can read each bridge's `score` and `status`. Separation always has `score: null`.

Schema distinguishes three cases.

| What the scan observed | Schema result | Contribution to overall |
|---|---|---|
| A parsed OpenAPI or Swagger document | Score based on the checks Milieu could evaluate | Included |
| Completed discovery found no valid contract | Five failed checks, score 0 | Included |
| A registry listing, protected spec path, or incomplete discovery with no inspected contract | `not_evaluated`, score and label both `null` | Excluded |

A score based on three bridges can rise when a fourth becomes unmeasurable. Check coverage when comparing runs. Use `--require-complete` alongside `--threshold` when CI also requires every bridge to run, every check to return a measured status, and the scan to stay within budget.

**Bridges 1 and 4** use equal-weight scoring: each check contributes **pass = 1**, **partial = 0.5**, **fail = 0**. Bridge score = `(points / total_checks) * 100`. Thresholds: ≥80 = pass, ≥40 = partial, <40 = fail.

**Bridges 2 and 5** use weighted scoring to reflect real-world importance to agents. In Bridge 2, core standards carry weight 2 (`openapi_spec`, `sitemap`, `llms_txt`, `security_txt`, `json_ld`, `schema_org`) and emerging standards weight 1 (GraphQL, markdown negotiation, llms-full.txt, MCP, A2A). In Bridge 5, rate-limit headers and auth checks carry more weight than contact info. Thresholds for both: ≥60 = pass, ≥30 = partial — lower because these signals are nascent.

An `error` means the scanner could not measure a check. For example, it cannot read crawler directives from an unavailable page. The scored bridges exclude these checks from their scoring denominators. The result also sets `incomplete` when the request budget denies a probe.

A "partial" means the signal exists but is incomplete: a 401 response with a JSON body but no `WWW-Authenticate` header, or a robots.txt with valid structure but no explicit allow/disallow rules.

When a contract is indicated but cannot be read, Context still credits evidence from other sources, such as an API version header. It marks unresolved contract-dependent checks as unmeasured. When completed discovery finds no contract, the existing missing-contract checks still apply.

Bridge 2 parses JSON and YAML OpenAPI documents and uses the same Schema and Context checks for both. Its discovery fallbacks include the JSON Linkset form of `/.well-known/api-catalog`. Milieu fetches up to three same-origin `service-desc` targets within the scan budget. Catalog and catalog-target requests accept direct responses only. Catalog presence adds no score of its own.

Schema reads Swagger 2.0 and OpenAPI 3 request and response schemas, including supported document-local references. A reference to another document can leave a check unmeasured. Milieu reads field evidence locally without fetching external references. JSON and YAML use the same scoring rules.

Context selects an input-free GET on the scan origin, taking the declared server into account. Rate-limit comparisons require the same declared operation, final resource and HTTP status. When a suitable operation is unavailable, the report identifies the conventional `/api` probe as a fallback.

## Programmatic API

```typescript
import { scan } from "milieu-cli";
import type { ScanResult, ScanOutcome, ScanOptions, BridgeResult, Check, CheckStatus } from "milieu-cli";

const options: ScanOptions = {
  timeout: 15000,  // per-request timeout in ms (default: 10000)
  silent: true,    // suppress spinner output (recommended for library use)
};

// scan() never throws. It returns a discriminated union — narrow on `.ok`,
// exactly like the HTTP client's HttpResponse.
const outcome: ScanOutcome = await scan("https://petstore.swagger.io", options);

if (!outcome.ok) {
  console.error(outcome.error.kind, outcome.error.message); // "invalid_url" | "scan_failed"
} else {
  console.log(outcome.overallScore);      // number (rounded mean of available bridge scores)
  console.log(outcome.overallScoreLabel); // "pass" | "partial" | "fail"
  console.log(outcome.bridges);           // 5-element tuple of BridgeResult
}
```

> A completed scan returns all five bridges. Filter for numeric scores to reproduce the overall denominator. Separation and unmeasured bridges have a null score.
>
> ```typescript
> const scoredBridges = result.bridges.filter(b => b.score !== null);
> ```

The library includes check explanations on the scan result. Import `compareReports` to compare two successful `ScanResult` values in memory. It returns the origins, scanner version, budget flags and findings. Incompatible versions or origins raise an error. For paired previews, pass `{ originMap: { base: baseOrigin, head: candidateOrigin } }` as the third argument.

Check explanations are also available as a separate export:

```typescript
import { resolveExplanation } from "milieu-cli";

// Get the status-aware explanation for a check
const why = resolveExplanation("robots_txt", "fail");
// → "Without robots.txt, AI agents have no guidance on what they can access..."
```

## Requirements

- Node.js 22.19.0 or newer. Use the latest patch release of a [supported LTS line](https://nodejs.org/en/about/previous-releases).

## License

Apache-2.0
