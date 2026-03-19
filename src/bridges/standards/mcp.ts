import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check for MCP endpoint at /.well-known/mcp.json.
 *
 * Validates against:
 * - Server Card format (SEP-1649): serverInfo + transport
 * - Legacy format: mcp_version or mcpServers
 * - MCP primitives: tools, resources, or prompts
 *
 * Spec is still in draft (targeting June 2026), so validation is lenient.
 */
export async function checkMcpEndpoint(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "mcp_endpoint";
  const label = "MCP Endpoint";

  const result = await httpGet(`${baseUrl}/.well-known/mcp.json`, {
    timeout,
    headers: { Accept: "application/json" },
  });

  if (!result.ok) {
    return { id, label, status: "fail", detail: "No MCP endpoint found" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.body) as Record<string, unknown>;
  } catch {
    return { id, label, status: "fail", detail: "No MCP endpoint found" };
  }

  // Server Card format (SEP-1649)
  if (parsed.serverInfo && parsed.transport) {
    const name =
      (parsed.serverInfo as Record<string, unknown>).name ?? "unknown";
    const detail = `MCP Server Card: ${name}`;
    return {
      id,
      label,
      status: "pass",
      detail: `MCP endpoint found: ${detail}`,
      data: { detail },
    };
  }

  // Legacy / alternative format
  if (parsed.mcp_version || parsed.mcpServers) {
    const detail = "MCP configuration detected";
    return {
      id,
      label,
      status: "pass",
      detail: `MCP endpoint found: ${detail}`,
      data: { detail },
    };
  }

  // MCP primitives
  if (parsed.tools || parsed.resources || parsed.prompts) {
    const detail = "MCP primitives detected";
    return {
      id,
      label,
      status: "pass",
      detail: `MCP endpoint found: ${detail}`,
      data: { detail },
    };
  }

  // Valid JSON but no MCP fields
  return {
    id,
    label,
    status: "partial",
    detail: "MCP endpoint found but structure unclear",
    data: { detail: "JSON found but no MCP fields" },
  };
}
