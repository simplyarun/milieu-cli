import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

/**
 * Check: context_agents_json (1 live HTTP call)
 *
 * Probes for /.well-known/agents.json.
 *
 * - 200 + valid JSON → pass
 * - 200 + invalid JSON → partial
 * - 404 or non-200 → fail
 * - HTTP failure → fail
 */
export async function checkAgentsJson(
  baseUrl: string,
  timeout?: number,
): Promise<Check> {
  const id = "context_agents_json";
  const label = "agents.json";
  const url = `${baseUrl}/.well-known/agents.json`;

  const result = await httpGet(url, {
    timeout: Math.min(timeout ?? 10000, 3000),
    headers: { Accept: "application/json" },
  });

  if (!result.ok) {
    return {
      id,
      label,
      status: "fail",
      detail: "No agents.json found at /.well-known/agents.json",
      data: { url, statusCode: result.error.statusCode ?? null },
    };
  }

  try {
    JSON.parse(result.body);
    return {
      id,
      label,
      status: "pass",
      detail: "agents.json found with valid JSON",
      data: { url, statusCode: result.status },
    };
  } catch {
    return {
      id,
      label,
      status: "partial",
      detail: "agents.json found but response is not valid JSON",
      data: { url, statusCode: result.status },
    };
  }
}
