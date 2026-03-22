import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HttpSuccess, HttpFailure } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

import { checkGraphql } from "../graphql.js";
import { httpGet } from "../../../utils/http-client.js";

const mockHttpGet = vi.mocked(httpGet);

// --- Helpers ---

function makeSuccess(body: string, overrides: Partial<HttpSuccess> = {}): HttpSuccess {
  return {
    ok: true,
    url: "https://example.com/graphql",
    status: 200,
    headers: { "content-type": "application/json" },
    body,
    redirects: [],
    durationMs: 50,
    ...overrides,
  };
}

function make404(): HttpFailure {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: "https://example.com/graphql" },
  };
}

function make401(): HttpFailure {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 401 Unauthorized", statusCode: 401, url: "https://example.com/graphql" },
  };
}

function make403(): HttpFailure {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 403 Forbidden", statusCode: 403, url: "https://example.com/graphql" },
  };
}

function makeIntrospectionResponse(opts: {
  query?: boolean;
  mutation?: boolean;
  subscription?: boolean;
} = {}): string {
  const schema: Record<string, unknown> = {};
  if (opts.query !== false) schema.queryType = { name: "Query" };
  if (opts.mutation) schema.mutationType = { name: "Mutation" };
  if (opts.subscription) schema.subscriptionType = { name: "Subscription" };
  return JSON.stringify({ data: { __schema: schema } });
}

function makeIntrospectionDisabledResponse(): string {
  return JSON.stringify({
    errors: [{ message: "GraphQL introspection is not allowed" }],
  });
}

// --- Tests ---

describe("checkGraphql", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'graphql_endpoint' and label 'GraphQL Endpoint'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkGraphql("https://example.com");
    expect(result.check.id).toBe("graphql_endpoint");
    expect(result.check.label).toBe("GraphQL Endpoint");
  });

  it("probes exactly 5 paths", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkGraphql("https://example.com");
    expect(mockHttpGet).toHaveBeenCalledTimes(5);
  });

  it("sends POST requests with introspection query body", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkGraphql("https://example.com");

    const firstCall = mockHttpGet.mock.calls[0];
    const opts = firstCall[1]!;
    expect(opts.method).toBe("POST");
    expect(opts.body).toContain("__schema");
    expect(opts.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });

  it("returns pass with metadata when introspection succeeds", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionResponse({ query: true, mutation: true })),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.detected).toBe(true);
    expect(result.check.data?.path).toBe("/graphql");
    expect(result.check.data?.introspectionEnabled).toBe(true);
    expect(result.check.data?.hasQueries).toBe(true);
    expect(result.check.data?.hasMutations).toBe(true);
    expect(result.check.detail).toContain("query, mutation");
  });

  it("detects subscription support", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionResponse({ query: true, subscription: true })),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data?.hasSubscriptions).toBe(true);
    expect(result.check.detail).toContain("subscription");
  });

  it("returns partial when introspection is disabled", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionDisabledResponse()),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
    expect(result.check.data?.introspectionEnabled).toBe(false);
    expect(result.check.detail).toContain("introspection disabled");
  });

  it("returns partial when endpoint returns 401", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(make401());

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
    expect(result.check.data?.protected).toBe(true);
    expect(result.check.detail).toContain("authentication required");
  });

  it("returns partial when endpoint returns 403", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(make403());

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.detected).toBe(true);
  });

  it("returns fail when all paths return 404", async () => {
    mockHttpGet.mockResolvedValue(make404());

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("fail");
    expect(result.detected).toBe(false);
    expect(result.check.detail).toBe("No GraphQL endpoint found");
  });

  it("prefers introspection pass over introspection-disabled partial", async () => {
    // First path: introspection disabled. Second path: introspection works.
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionDisabledResponse()),
    );
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionResponse({ query: true })),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data?.path).toBe("/api/graphql");
  });

  it("prefers introspection-disabled partial over auth-protected partial", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(make401());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(makeIntrospectionDisabledResponse()),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("partial");
    expect(result.check.detail).toContain("introspection disabled");
    expect(result.check.data?.path).toBe("/api/graphql");
  });

  it("ignores non-JSON 200 responses", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess("<html>Not GraphQL</html>"));

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("fail");
  });

  it("ignores invalid JSON responses", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(makeSuccess("{not valid json"));

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("fail");
  });

  it("ignores JSON responses without __schema", async () => {
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockResolvedValueOnce(
      makeSuccess(JSON.stringify({ data: { users: [] } })),
    );

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("fail");
  });

  it("passes timeout option to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkGraphql("https://example.com", 5000);

    for (const call of mockHttpGet.mock.calls) {
      expect(call[1]?.timeout).toBe(5000);
    }
  });

  it("detects endpoint at non-first path", async () => {
    // All 404 except /api/v1/graphql (4th path)
    mockHttpGet.mockResolvedValue(make404());
    mockHttpGet.mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/graphql")) {
        return makeSuccess(makeIntrospectionResponse({ query: true }));
      }
      return make404();
    });

    const result = await checkGraphql("https://example.com");
    expect(result.check.status).toBe("pass");
    expect(result.check.data?.path).toBe("/api/v1/graphql");
  });
});
