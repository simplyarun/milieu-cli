import { describe, it, expect } from "vitest";
import type { ContentSource } from "../../../core/types.js";
import { checkWebhookSupport } from "../webhook-support.js";

/** Helper to wrap a single content string into a ContentSource array */
function sources(content: string, source = "homepage"): ContentSource[] {
  return [{ content, source }];
}

describe("checkWebhookSupport", () => {
  it("returns id 'webhook_support' and label 'Webhook Support'", () => {
    const result = checkWebhookSupport(sources("<p>No webhooks</p>"));
    expect(result.id).toBe("webhook_support");
    expect(result.label).toBe("Webhook Support");
  });

  it("returns pass when webhook found in link href", () => {
    const html = '<a href="/docs/webhooks">Webhooks</a>';
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook link");
  });

  it("returns pass when webhook found in link text", () => {
    const html = '<a href="/settings">Set up your webhook</a>';
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook link text");
  });

  it("returns pass when webhook found in heading", () => {
    const html = "<h2>Webhook Configuration</h2>";
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook heading");
  });

  it("returns fail when no webhook mentions found", () => {
    const html = "<p>Contact us for more info</p>";
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("fail");
  });

  it("returns multiple signals when multiple patterns match", () => {
    const html =
      '<a href="/docs/webhooks">Webhook Guide</a>' +
      "<h3>Webhook Setup</h3>";
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
    const signals = result.data?.signals as string[];
    expect(signals).toContain("webhook link");
    expect(signals).toContain("webhook link text");
    expect(signals).toContain("webhook heading");
  });

  // --- Markdown pattern tests ---

  it("returns pass when webhook found in Markdown heading", () => {
    const md = "## Webhook Configuration\nSome details here.";
    const result = checkWebhookSupport(sources(md));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook heading (markdown)");
  });

  it("returns pass when webhook found in Markdown link", () => {
    const md = "See [webhook docs](/docs/webhooks) for details.";
    const result = checkWebhookSupport(sources(md));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook link (markdown)");
  });

  // --- Empty sources ---

  it("returns fail for empty sources array", () => {
    const result = checkWebhookSupport([]);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No webhook support signals detected");
  });

  // --- Source attribution ---

  it("includes source attribution in detail", () => {
    const result = checkWebhookSupport([
      { content: '<a href="/docs/webhooks">Webhooks</a>', source: "homepage" },
      { content: "## Webhook Setup", source: "/docs" },
    ]);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("in homepage, /docs");
    expect(result.data?.sources).toEqual(["homepage", "/docs"]);
  });

  // --- Structured data patterns (JSON state, JS config) ---

  it("returns pass when webhook path found in JSON state", () => {
    const json = '{"type":"link","text":"Webhooks","href":"/connect/webhooks"}';
    const result = checkWebhookSupport(sources(json, "/docs"));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook path");
  });

  it("returns pass when webhook path found in double-quoted JSON value", () => {
    const json = '{"href":"/billing/subscriptions/webhooks","text":"Webhooks"}';
    const result = checkWebhookSupport(sources(json));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook path");
  });

  it("returns pass when webhook path uses unicode-escaped slashes", () => {
    const json = '{"href":"\\u002Fconnect\\u002Fwebhooks","text":"Webhooks"}';
    const result = checkWebhookSupport(sources(json));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook path");
  });

  it("does not match webhook in plain prose without URL path", () => {
    const prose = "We support webhook integrations for real-time updates.";
    const result = checkWebhookSupport(sources(prose));
    expect(result.status).toBe("fail");
  });

  // --- Tier 1: OpenAPI structured signals ---

  it("returns pass with openapi webhooks signal when openApiHasWebhooks is true", () => {
    const result = checkWebhookSupport([], { openApiHasWebhooks: true });
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("openapi webhooks");
    expect(result.data?.sources).toContain("openapi spec");
  });

  it("returns pass with openapi callbacks signal when openApiHasCallbacks is true", () => {
    const result = checkWebhookSupport([], { openApiHasCallbacks: true });
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("openapi callbacks");
    expect(result.data?.sources).toContain("openapi spec");
  });

  it("returns both openapi signals when both flags are true", () => {
    const result = checkWebhookSupport([], {
      openApiHasWebhooks: true,
      openApiHasCallbacks: true,
    });
    expect(result.status).toBe("pass");
    const signals = result.data?.signals as string[];
    expect(signals).toContain("openapi webhooks");
    expect(signals).toContain("openapi callbacks");
    // Source should be deduplicated
    expect((result.data?.sources as string[]).filter(s => s === "openapi spec")).toHaveLength(1);
  });

  it("returns fail when OpenAPI flags are false and no other signals", () => {
    const result = checkWebhookSupport([], {
      openApiHasWebhooks: false,
      openApiHasCallbacks: false,
    });
    expect(result.status).toBe("fail");
  });

  // --- Tier 1: WebSub rel="hub" ---

  it("returns pass with websub hub signal from HTML link element", () => {
    const html = '<link rel="hub" href="https://hub.example.com">';
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("websub hub");
  });

  it("returns pass with websub hub signal from HTTP Link header", () => {
    const result = checkWebhookSupport([], {
      pageHeaders: { link: '<https://hub.example.com>; rel="hub"' },
    });
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("websub hub");
    expect(result.data?.sources).toContain("http headers");
  });

  it("does not duplicate websub hub when found in both HTML and headers", () => {
    const html = '<link rel="hub" href="https://hub.example.com">';
    const result = checkWebhookSupport(sources(html), {
      pageHeaders: { link: '<https://hub.example.com>; rel="hub"' },
    });
    expect(result.status).toBe("pass");
    const signals = result.data?.signals as string[];
    expect(signals.filter(s => s === "websub hub")).toHaveLength(1);
  });

  it("does not match rel=hub when not present", () => {
    const result = checkWebhookSupport([], {
      pageHeaders: { link: '<https://example.com>; rel="self"' },
    });
    expect(result.status).toBe("fail");
  });

  // --- Tier 2: Standard Webhooks headers ---

  it("returns pass when webhook-id header referenced in content", () => {
    const content = "All events include `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers.";
    const result = checkWebhookSupport(sources(content));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("standard webhooks headers");
  });

  it("returns pass when whsec_ prefix found in content", () => {
    const content = "Your webhook signing secret starts with `whsec_` and can be found in the dashboard.";
    const result = checkWebhookSupport(sources(content));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("standard webhooks secret");
  });

  // --- Tier 2: CloudEvents webhook headers ---

  it("returns pass when CloudEvents WebHook-Request-Origin found in content", () => {
    const content = "The webhook handshake uses the `WebHook-Request-Origin` header.";
    const result = checkWebhookSupport(sources(content));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("cloudevents webhook");
  });

  it("returns pass when CloudEvents WebHook-Allowed-Origin found in content", () => {
    const content = "Respond with `WebHook-Allowed-Origin: *` to accept the handshake.";
    const result = checkWebhookSupport(sources(content));
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("cloudevents webhook");
  });

  // --- Mixed tier signals ---

  it("combines signals from multiple tiers with correct sources", () => {
    const html = '<a href="/docs/webhooks">Webhooks</a>';
    const docs = "All events include `webhook-id` and `webhook-signature` headers.";
    const result = checkWebhookSupport(
      [
        { content: html, source: "homepage" },
        { content: docs, source: "/docs" },
      ],
      { openApiHasWebhooks: true },
    );
    expect(result.status).toBe("pass");
    const signals = result.data?.signals as string[];
    expect(signals).toContain("openapi webhooks");
    expect(signals).toContain("standard webhooks headers");
    expect(signals).toContain("webhook link");
    const resultSources = result.data?.sources as string[];
    expect(resultSources).toContain("openapi spec");
    expect(resultSources).toContain("homepage");
    expect(resultSources).toContain("/docs");
  });

  // --- Default options ---

  it("works with no options parameter (backward compatible)", () => {
    const html = '<a href="/docs/webhooks">Webhooks</a>';
    const result = checkWebhookSupport(sources(html));
    expect(result.status).toBe("pass");
  });
});
