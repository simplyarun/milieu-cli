import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

export async function checkWebMcp(baseUrl: string, timeout?: number): Promise<Check> {
  const id = "standards_webmcp";
  const label = "WebMCP Discovery";
  const url = `${baseUrl}/.well-known/mcp.json`;
  const result = await httpGet(url, { timeout, headers: { Accept: "application/json" } });
  if (!result.ok) {
    return { id, label, status: "fail", detail: "No WebMCP endpoint found at /.well-known/mcp.json", data: { url, statusCode: result.error.statusCode ?? null } };
  }
  try {
    JSON.parse(result.body);
    return { id, label, status: "pass", detail: "WebMCP discovery endpoint found with valid JSON", data: { url, statusCode: result.status } };
  } catch {
    return { id, label, status: "partial", detail: "WebMCP endpoint found but response is not valid JSON", data: { url, statusCode: result.status } };
  }
}
