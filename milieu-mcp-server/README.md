# @milieu/mcp-server

MCP server wrapper around milieu-cli's `scan()` function.

## Status

**Not yet implemented.** This package is a placeholder for the upcoming MCP server that will expose milieu-cli scanning as an MCP tool.

## Planned Tool

### `scan_surface`

- **Input:** `{ url: string, timeout?: number, explain?: boolean }`
- **Output:** `ScanResult` — the full milieu-cli scan result

## Installation (when available)

```bash
npx -y @milieu/mcp-server
```

## Constraints

- No state, no caching — pure function wrapper around `scan()`
- Inherits all security constraints from `scan()` (SSRF guard, GET-only probes, no auth forwarding)
- Depends on `milieu-cli` as a peer dependency
