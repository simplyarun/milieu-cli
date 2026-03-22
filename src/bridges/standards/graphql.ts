import type { Check } from "../../core/types.js";
import { httpGet } from "../../utils/http-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphqlResult {
  check: Check;
  detected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Common GraphQL endpoint paths */
const GRAPHQL_PATHS = [
  "/graphql",
  "/api/graphql",
  "/graphql/v1",
  "/api/v1/graphql",
  "/gql",
] as const;

/** Minimal introspection query to confirm a GraphQL endpoint */
const INTROSPECTION_QUERY = JSON.stringify({
  query:
    "{ __schema { queryType { name } mutationType { name } subscriptionType { name } } }",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface IntrospectionData {
  queryType: boolean;
  mutationType: boolean;
  subscriptionType: boolean;
}

/**
 * Parse a successful introspection response body.
 * Returns metadata if the response contains valid `data.__schema`,
 * or null if the JSON doesn't match the expected shape.
 */
function parseIntrospectionResponse(body: string): IntrospectionData | null {
  try {
    const parsed = JSON.parse(body);
    const schema = parsed?.data?.__schema;
    if (!schema || typeof schema !== "object") return null;

    return {
      queryType: schema.queryType?.name != null,
      mutationType: schema.mutationType?.name != null,
      subscriptionType: schema.subscriptionType?.name != null,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a JSON response body indicates a GraphQL endpoint
 * with introspection disabled (common security practice).
 */
function isIntrospectionDisabled(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    if (!parsed?.errors || !Array.isArray(parsed.errors)) return false;

    return parsed.errors.some(
      (err: { message?: string }) =>
        typeof err.message === "string" &&
        err.message.toLowerCase().includes("introspection"),
    );
  } catch {
    return false;
  }
}

/** Returns true if response is a 401/403 HTTP error */
function isAuthRequired(statusCode: number | undefined): boolean {
  return statusCode === 401 || statusCode === 403;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe common GraphQL endpoint paths via POST introspection query.
 *
 * Detection strategy per path:
 * 1. POST introspection query with Content-Type: application/json
 * 2. Parse response:
 *    - pass: 200 + valid __schema in response
 *    - partial: 200 + errors mentioning "introspection" (disabled)
 *    - partial: 401/403 (auth required)
 *    - skip: 404, non-JSON, connection error
 *
 * Returns early on first successful detection (highest confidence first).
 */
export async function checkGraphql(
  baseUrl: string,
  timeout?: number,
): Promise<GraphqlResult> {
  const id = "graphql_endpoint";
  const label = "GraphQL Endpoint";

  // Fire all probes in parallel
  const responses = await Promise.all(
    GRAPHQL_PATHS.map((path) =>
      httpGet(new URL(path, baseUrl).href, {
        method: "POST",
        timeout,
        body: INTROSPECTION_QUERY,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }),
    ),
  );

  // Phase 1: Check for successful introspection (pass)
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response.ok) continue;

    const introspection = parseIntrospectionResponse(response.body);
    if (introspection) {
      const capabilities: string[] = [];
      if (introspection.queryType) capabilities.push("query");
      if (introspection.mutationType) capabilities.push("mutation");
      if (introspection.subscriptionType) capabilities.push("subscription");

      return {
        check: {
          id,
          label,
          status: "pass",
          detail: `GraphQL endpoint at ${GRAPHQL_PATHS[i]} with ${capabilities.join(", ")} support`,
          data: {
            path: GRAPHQL_PATHS[i],
            introspectionEnabled: true,
            hasQueries: introspection.queryType,
            hasMutations: introspection.mutationType,
            hasSubscriptions: introspection.subscriptionType,
          },
        },
        detected: true,
      };
    }
  }

  // Phase 2: Check for introspection-disabled endpoints (partial)
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response.ok) continue;

    if (isIntrospectionDisabled(response.body)) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: `GraphQL endpoint detected at ${GRAPHQL_PATHS[i]} (introspection disabled)`,
          data: {
            path: GRAPHQL_PATHS[i],
            introspectionEnabled: false,
          },
        },
        detected: true,
      };
    }
  }

  // Phase 3: Check for auth-protected endpoints (partial)
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (response.ok) continue;

    if (
      response.error.kind === "http_error" &&
      isAuthRequired(response.error.statusCode)
    ) {
      return {
        check: {
          id,
          label,
          status: "partial",
          detail: `GraphQL endpoint detected at ${GRAPHQL_PATHS[i]} (authentication required)`,
          data: {
            path: GRAPHQL_PATHS[i],
            introspectionEnabled: false,
            protected: true,
          },
        },
        detected: true,
      };
    }
  }

  // Phase 4: Nothing found
  return {
    check: {
      id,
      label,
      status: "fail",
      detail: "No GraphQL endpoint found",
    },
    detected: false,
  };
}
