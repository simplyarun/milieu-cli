import { describe, it, expect } from "vitest";
import { checkTosUrl, checkContactInfo } from "../tos-contact.js";
import { checkVersioningSignal } from "../versioning.js";
import { checkAuthClarity } from "../auth-clarity.js";
import { checkAiPolicy } from "../ai-policy.js";
import type { ParsedOpenApiSpec } from "../../schema/oas-types.js";

// ---------------------------------------------------------------------------
// checkTosUrl
// ---------------------------------------------------------------------------

describe("checkTosUrl", () => {
  it("returns pass when spec has termsOfService", () => {
    const spec: ParsedOpenApiSpec = {
      info: { termsOfService: "https://example.com/terms" },
    };
    const result = checkTosUrl(spec, null);
    expect(result.status).toBe("pass");
    expect(result.data?.source).toBe("spec");
  });

  it("returns partial when found in llms.txt", () => {
    const result = checkTosUrl(undefined, "See our terms at https://example.com/terms-of-service");
    expect(result.status).toBe("partial");
    expect(result.data?.source).toBe("llms.txt");
  });

  it("returns fail when not found anywhere", () => {
    const result = checkTosUrl(undefined, null);
    expect(result.status).toBe("fail");
  });

  it("returns fail when llms.txt has no ToS URL", () => {
    const result = checkTosUrl(undefined, "# My API\n\nThis is a great API");
    expect(result.status).toBe("fail");
  });

  it("prefers spec over llms.txt", () => {
    const spec: ParsedOpenApiSpec = {
      info: { termsOfService: "https://example.com/terms" },
    };
    const result = checkTosUrl(spec, "See https://example.com/legal");
    expect(result.status).toBe("pass");
    expect(result.data?.source).toBe("spec");
  });
});

// ---------------------------------------------------------------------------
// checkContactInfo
// ---------------------------------------------------------------------------

describe("checkContactInfo", () => {
  it("returns pass with email", () => {
    const spec: ParsedOpenApiSpec = {
      info: { contact: { email: "api@example.com" } },
    };
    const result = checkContactInfo(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.email).toBe("api@example.com");
  });

  it("returns pass with url", () => {
    const spec: ParsedOpenApiSpec = {
      info: { contact: { url: "https://example.com/support" } },
    };
    const result = checkContactInfo(spec);
    expect(result.status).toBe("pass");
    expect(result.data?.url).toBe("https://example.com/support");
  });

  it("returns fail when no contact info", () => {
    const result = checkContactInfo(undefined);
    expect(result.status).toBe("fail");
  });

  it("returns fail when contact exists but empty", () => {
    const spec: ParsedOpenApiSpec = {
      info: { contact: { name: "Support" } },
    };
    const result = checkContactInfo(spec);
    expect(result.status).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// checkVersioningSignal
// ---------------------------------------------------------------------------

describe("checkVersioningSignal", () => {
  it("returns pass for path-based versioning", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/v1/users": { get: {} }, "/v1/posts": { get: {} } },
    };
    const result = checkVersioningSignal(spec, {});
    expect(result.status).toBe("pass");
    expect(result.data?.signal).toBe("path");
  });

  it("returns pass for header-based versioning", () => {
    const result = checkVersioningSignal(undefined, {
      "x-api-version": "2.1",
    });
    expect(result.status).toBe("pass");
    expect(result.data?.signal).toBe("header");
  });

  it("returns partial for spec info version only", () => {
    const spec: ParsedOpenApiSpec = {
      info: { version: "1.0.0" },
      paths: { "/users": { get: {} } },
    };
    const result = checkVersioningSignal(spec, {});
    expect(result.status).toBe("partial");
    expect(result.data?.signal).toBe("spec_info");
  });

  it("returns fail when no versioning signal", () => {
    const result = checkVersioningSignal(undefined, {});
    expect(result.status).toBe("fail");
  });

  it("prefers path versioning over header", () => {
    const spec: ParsedOpenApiSpec = {
      paths: { "/v2/users": { get: {} } },
    };
    const result = checkVersioningSignal(spec, {
      "x-api-version": "2",
    });
    expect(result.status).toBe("pass");
    expect(result.data?.signal).toBe("path");
  });
});

// ---------------------------------------------------------------------------
// checkAuthClarity
// ---------------------------------------------------------------------------

describe("checkAuthClarity", () => {
  it("returns fail when no spec", () => {
    const result = checkAuthClarity(undefined);
    expect(result.status).toBe("fail");
  });

  it("returns fail when no security schemes", () => {
    const spec: ParsedOpenApiSpec = { components: {} };
    const result = checkAuthClarity(spec);
    expect(result.status).toBe("fail");
  });

  it("returns pass when schemes are described and applied globally", () => {
    const spec: ParsedOpenApiSpec = {
      components: {
        securitySchemes: {
          ApiKey: { type: "apiKey", description: "API key auth" },
        },
      },
      security: [{ ApiKey: [] }],
    };
    const result = checkAuthClarity(spec);
    expect(result.status).toBe("pass");
  });

  it("returns partial when schemes applied but missing descriptions", () => {
    const spec: ParsedOpenApiSpec = {
      components: {
        securitySchemes: {
          ApiKey: { type: "apiKey" },
        },
      },
      security: [{ ApiKey: [] }],
    };
    const result = checkAuthClarity(spec);
    expect(result.status).toBe("partial");
  });

  it("returns partial when schemes defined but not applied", () => {
    const spec: ParsedOpenApiSpec = {
      components: {
        securitySchemes: {
          ApiKey: { type: "apiKey", description: "Key auth" },
        },
      },
    };
    const result = checkAuthClarity(spec);
    expect(result.status).toBe("partial");
  });

  it("detects per-operation security", () => {
    const spec: ParsedOpenApiSpec = {
      components: {
        securitySchemes: {
          Bearer: { type: "http", description: "JWT token" },
        },
      },
      paths: {
        "/users": {
          get: {
            operationId: "listUsers",
            security: [{ Bearer: [] }],
          },
        },
      },
    };
    const result = checkAuthClarity(spec);
    expect(result.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// checkAiPolicy
// ---------------------------------------------------------------------------

describe("checkAiPolicy", () => {
  it("returns pass when 2+ keywords found", () => {
    const result = checkAiPolicy(
      "This API allows automated access and agent-based workflows for training purposes.",
      false,
    );
    expect(result.status).toBe("pass");
    expect(result.data?.keywordsFound).toContain("automated");
    expect(result.data?.keywordsFound).toContain("training");
  });

  it("returns partial when 1 keyword found", () => {
    const result = checkAiPolicy("This API supports automated workflows.", false);
    expect(result.status).toBe("partial");
  });

  it("returns partial when no llms.txt but ToS URL present", () => {
    const result = checkAiPolicy(null, true);
    expect(result.status).toBe("partial");
    expect(result.data?.source).toBe("tos_url");
  });

  it("returns fail when nothing found", () => {
    const result = checkAiPolicy(null, false);
    expect(result.status).toBe("fail");
  });

  it("returns fail when llms.txt has no keywords", () => {
    const result = checkAiPolicy("# My API\nGreat for developers.", false);
    expect(result.status).toBe("fail");
  });
});
