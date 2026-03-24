import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpResult {
  check: Check;
  /** Whether MCP support was detected (endpoint or content signals) */
  detected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Contextually anchored patterns for MCP detection in page content.
 *
 * Only patterns that are unambiguous in an AI/protocol context are included.
 * Bare "MCP + noun" patterns (e.g., "MCP server") are excluded to avoid
 * false positives with other uses of the acronym.
 */
const MCP_CONTENT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /Model Context Protocol/i, label: "Model Context Protocol" },
  { pattern: /@modelcontextprotocol/i, label: "@modelcontextprotocol" },
  { pattern: /mcp-server-/i, label: "mcp-server-" },
  { pattern: /modelcontextprotocol\.io/i, label: "modelcontextprotocol.io" },
  { pattern: /\.well-known\/mcp\.json/i, label: ".well-known/mcp.json" },
  { pattern: /npx\s+@modelcontextprotocol\//i, label: "npx @modelcontextprotocol/" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scan a body string for MCP content signals. Returns matched pattern labels. */
function scanForMcpSignals(body: string): string[] {
  const matched: string[] = [];
  for (const { pattern, label } of MCP_CONTENT_PATTERNS) {
    if (pattern.test(body)) {
      matched.push(label);
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect MCP support via endpoint probe and content scanning.
 *
 * Detection tiers:
 * 1. **pass**: `/.well-known/mcp.json` found with valid MCP structure
 * 2. **partial**: No endpoint, but page content or llms.txt contains MCP signals
 * 3. **fail**: Nothing found
 *
 * Endpoint probe takes priority — if it returns pass, content scan is skipped.
 */
export async function checkMcpEndpoint(
  baseUrl: string,
  timeout?: number,
  pageBody?: string,
  llmsTxtBody?: string,
): Promise<McpResult> {
  const id = "mcp_endpoint";
  const label = "MCP Endpoint";

  // --- Tier 1: Endpoint probe at /.well-known/mcp.json ---

  const result = await httpGet(`${baseUrl}/.well-known/mcp.json`, {
    timeout,
    headers: { Accept: "application/json" },
  });

  if (result.ok) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.body) as Record<string, unknown>;
    } catch {
      // Fall through to content scanning
      parsed = {};
    }

    // Server Card format (SEP-1649)
    if (parsed.serverInfo && parsed.transport) {
      const name =
        (parsed.serverInfo as Record<string, unknown>).name ?? "unknown";
      const detail = `MCP Server Card: ${name}`;
      return {
        check: {
          id,
          label,
          status: "pass",
          detail: `MCP endpoint found: ${detail}`,
          data: { detail },
        },
        detected: true,
      };
    }

    // Legacy / alternative format
    if (parsed.mcp_version || parsed.mcpServers) {
      const detail = "MCP configuration detected";
      return {
        check: {
          id,
          label,
          status: "pass",
          detail: `MCP endpoint found: ${detail}`,
          data: { detail },
        },
        detected: true,
      };
    }

    // MCP primitives
    if (parsed.tools || parsed.resources || parsed.prompts) {
      const detail = "MCP primitives detected";
      return {
        check: {
          id,
          label,
          status: "pass",
          detail: `MCP endpoint found: ${detail}`,
          data: { detail },
        },
        detected: true,
      };
    }

    // Valid JSON but no MCP fields
    if (Object.keys(parsed).length > 0) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: "MCP endpoint found but structure unclear",
          data: { detail: "JSON found but no MCP fields" },
        },
        detected: false,
      };
    }
  }

  // --- Tier 2: Content scanning (pageBody + llmsTxtBody) ---

  const allSignals: string[] = [];
  let source: string | undefined;

  if (pageBody) {
    const signals = scanForMcpSignals(pageBody);
    if (signals.length > 0) {
      allSignals.push(...signals);
      source = "homepage";
    }
  }

  if (llmsTxtBody) {
    const signals = scanForMcpSignals(llmsTxtBody);
    if (signals.length > 0) {
      // Deduplicate signals across sources
      for (const s of signals) {
        if (!allSignals.includes(s)) allSignals.push(s);
      }
      source = source ? `${source}, llms.txt` : "llms.txt";
    }
  }

  if (allSignals.length > 0) {
    return {
      check: {
        id,
        label,
        status: "partial",
        detail: `MCP references detected in ${source}: ${allSignals.join(", ")}`,
        data: { signals: allSignals, source },
      },
      detected: true,
    };
  }

  // --- Nothing found ---

  return {
    check: { id, label, status: "fail", detail: "No MCP endpoint found" },
    detected: false,
  };
}
