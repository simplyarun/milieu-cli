# milieu-cli

Measure how legible your product is to AI agents. A Lighthouse for the agentic web.

Runs deterministic checks across 5 bridges of machine legibility against any public URL. No AI, no API keys, no config. Same site, same score, every time.

## Quick start

```bash
npx milieu-cli scan stripe.com
```

After install:

```bash
milieu scan stripe.com
```

## What it checks

| Bridge | What it measures | Score |
|--------|------------------|-------|
| **Bridge 1: Reachability** | HTTPS, HTTP status, robots.txt, AI crawler policies, meta/header robots | 0-100 |
| **Bridge 2: Standards** | OpenAPI, llms.txt, MCP endpoint, JSON-LD, Schema.org, security.txt, ai-plugin.json | 0-100 |
| **Bridge 3: Separation** | API presence, developer docs, SDK references, webhook support | Detection inventory |
| **Bridge 4: Schema** | Not yet evaluated | -- |
| **Bridge 5: Context** | Not yet evaluated | -- |

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

## Programmatic API

```typescript
import { scan } from "milieu-cli";

const result = await scan("https://stripe.com", { timeout: 15000 });
console.log(result.score);       // number
console.log(result.bridges);     // [BridgeResult, BridgeResult, BridgeResult, BridgeResult, BridgeResult]
```

All types are exported:

```typescript
import type { ScanResult, BridgeResult, Check, CheckStatus } from "milieu-cli";
```

## Requirements

- Node.js 18+

## License

Apache-2.0
