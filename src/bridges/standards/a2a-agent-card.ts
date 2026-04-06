import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check for Google A2A Agent Card at /.well-known/agent.json.
 *
 * - pass: 200 + valid JSON
 * - fail: 404 or non-200
 */
export async function checkA2aAgentCard(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "standards_a2a_agent_card";
  const label = "A2A Agent Card";
  const url = `${baseUrl}/.well-known/agent.json`;

  const result = await httpGet(url, {
    timeout,
    headers: { Accept: "application/json" },
  });

  if (!result.ok) {
    return {
      id,
      label,
      status: "fail",
      detail: "No A2A Agent Card found at /.well-known/agent.json",
      data: { url, statusCode: result.error.statusCode ?? null },
    };
  }

  try {
    JSON.parse(result.body);
    return {
      id,
      label,
      status: "pass",
      detail: "A2A Agent Card found with valid JSON",
      data: { url, statusCode: result.status },
    };
  } catch {
    return {
      id,
      label,
      status: "fail",
      detail: "A2A Agent Card endpoint returned invalid JSON",
      data: { url, statusCode: result.status },
    };
  }
}
