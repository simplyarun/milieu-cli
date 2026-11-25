import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

const CARD_PATHS = ["/.well-known/agent-card.json", "/.well-known/agent.json"];

function hasEndpoint(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const url = URL.parse(value);
  return url?.protocol === "https:" || url?.protocol === "http:";
}

function isAgentCard(body: string): boolean {
  try {
    const card = JSON.parse(body);
    if (typeof card?.name !== "string" || !card.name.trim()) return false;
    // v1 cards list interfaces. Older cards advertise a single service URL.
    return hasEndpoint(card.url) || (Array.isArray(card.supportedInterfaces) &&
      card.supportedInterfaces.some((entry: { url?: unknown } | null) => hasEndpoint(entry?.url)));
  } catch {
    return false;
  }
}

export async function checkA2aAgentCard(baseUrl: string, timeout?: number): Promise<Check> {
  const id = "standards_a2a_agent_card";
  const label = "A2A Agent Card";
  const canonicalUrl = baseUrl + CARD_PATHS[0];
  let canonicalStatus: number | null = null;
  for (const path of CARD_PATHS) {
    const url = baseUrl + path;
    const result = await httpGet(url, { timeout, headers: { Accept: "application/json" } });
    if (url === canonicalUrl) canonicalStatus = result.ok ? result.status : result.error.statusCode ?? null;
    if (result.ok && isAgentCard(result.body)) {
      return { id, label, status: "pass", detail: `A2A Agent Card found at ${path}`, data: { url, statusCode: result.status } };
    }
    if (!result.ok && result.error.kind === "request_budget_exhausted") {
      return { id, label, status: "error", detail: "A2A Agent Card discovery incomplete: scan request budget exhausted", data: { url } };
    }
  }
  return { id, label, status: "fail", detail: "No A2A Agent Card with a name and service endpoint found", data: { url: canonicalUrl, statusCode: canonicalStatus } };
}
