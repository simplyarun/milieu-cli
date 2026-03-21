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
});
