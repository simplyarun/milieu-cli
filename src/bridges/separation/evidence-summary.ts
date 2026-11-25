import type { Check } from "../../core/types.js";

function apiSummary(api: Check | undefined, contract?: Check, graphql?: Check): string | undefined {
  if (contract?.status === "pass") {
    return contract.data?.specType === "swagger" ? "API described in Swagger 2.0" : "API described in OpenAPI";
  }
  if (contract?.data?.registry === "apis.guru") return "OpenAPI listed in APIs.guru";
  if (contract?.data?.protected === true) return "API inferred from a protected spec path";
  if (graphql?.status === "pass") return "GraphQL schema inspected";
  if (graphql?.data?.protected === true) return "API inferred from a protected GraphQL path";
  if (graphql?.data?.introspectionEnabled === false) return "GraphQL introspection disabled";
  if (api?.status === "pass") return "API inferred from discovery signals";
  return undefined;
}

export function summarizeSeparation(checks: Check[], contract?: Check, graphql?: Check): string {
  const byId = new Map(checks.map(check => [check.id, check]));
  const parts: string[] = [];
  const api = apiSummary(byId.get("api_presence"), contract, graphql);
  if (api) parts.push(api);

  const docs = byId.get("developer_docs");
  if (docs?.data?.linkedAndFetched === true) {
    parts.push("Developer docs linked and fetched");
  } else {
    if (Array.isArray(docs?.data?.linkedUrls) && docs.data.linkedUrls.length) parts.push("Developer docs linked");
    if (Array.isArray(docs?.data?.fetchedUrls) && docs.data.fetchedUrls.length) parts.push("Docs path fetched");
  }
  const sdk = byId.get("sdk_references");
  if (sdk?.status === "pass") {
    const links = sdk.data?.packageLinks;
    parts.push(Array.isArray(links) && links.length ? "Package registry linked" : "SDK/package reference found");
  }
  const webhook = byId.get("webhook_support");
  if (webhook?.status === "pass") {
    const signals = webhook.data?.signals;
    if (Array.isArray(signals) && signals.some(s => s === "openapi webhooks" || s === "openapi callbacks")) {
      parts.push("Webhook declared in OpenAPI");
    } else if (Array.isArray(signals) && signals.includes("websub hub")) {
      parts.push("WebSub hub advertised");
    } else {
      parts.push("Webhook support inferred");
    }
  }
  if (docs?.status === "error") parts.push("Docs discovery incomplete");
  if (contract?.status === "error" && !api) parts.push("OpenAPI discovery incomplete");
  return parts.join(" · ") || "No integration evidence found in the checked sources";
}
