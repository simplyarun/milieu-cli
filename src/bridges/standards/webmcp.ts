import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check for WebMCP discovery at /.well-known/mcp.json.
 *
 * This is a simpler presence check separate from the content-scanning
 * mcp_endpoint check. It verifies whether the well-known WebMCP endpoint
 * exists and returns valid JSON.
 *
 * - pass: 200 + valid JSON
 * - partial: 200 + invalid JSON
 * - fail: 404 or non-200
 */
export async function checkWebMcp(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "standards_webmcp";
  const label = "WebMCP Discovery";
  const url = `${baseUrl}/.well-known/mcp.json`;

  const result = await httpGet(url, {
    timeout,
    headers: { Accept: "application/json" },
  });

  if (!result.ok) {
    return {
      id,
      label,
      status: "fail",
      detail: "No WebMCP endpoint found at /.well-known/mcp.json",
      data: { url, statusCode: result.error.statusCode ?? null },
    };
  }

  try {
    JSON.parse(result.body);
    return {
      id,
      label,
      status: "pass",
      detail: "WebMCP discovery endpoint found with valid JSON",
      data: { url, statusCode: result.status },
    };
  } catch {
    return {
      id,
      label,
      status: "partial",
      detail: "WebMCP endpoint found but response is not valid JSON",
      data: { url, statusCode: result.status },
    };
  }
}
