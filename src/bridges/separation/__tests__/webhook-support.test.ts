import { describe, it, expect } from "vitest";
import { checkWebhookSupport } from "../webhook-support.js";

describe("checkWebhookSupport", () => {
  it("returns id 'webhook_support' and label 'Webhook Support'", () => {
    const result = checkWebhookSupport("<p>No webhooks</p>");
    expect(result.id).toBe("webhook_support");
    expect(result.label).toBe("Webhook Support");
  });

  it("returns pass when webhook found in link href", () => {
    const html = '<a href="/docs/webhooks">Webhooks</a>';
    const result = checkWebhookSupport(html);
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook link");
  });

  it("returns pass when webhook found in link text", () => {
    const html = '<a href="/settings">Set up your webhook</a>';
    const result = checkWebhookSupport(html);
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook link text");
  });

  it("returns pass when webhook found in heading", () => {
    const html = "<h2>Webhook Configuration</h2>";
    const result = checkWebhookSupport(html);
    expect(result.status).toBe("pass");
    expect(result.data?.signals).toContain("webhook heading");
  });

  it("returns fail when no webhook mentions found", () => {
    const html = "<p>Contact us for more info</p>";
    const result = checkWebhookSupport(html);
    expect(result.status).toBe("fail");
  });

  it("returns multiple signals when multiple patterns match", () => {
    const html =
      '<a href="/docs/webhooks">Webhook Guide</a>' +
      "<h3>Webhook Setup</h3>";
    const result = checkWebhookSupport(html);
    expect(result.status).toBe("pass");
    const signals = result.data?.signals as string[];
    expect(signals).toContain("webhook link");
    expect(signals).toContain("webhook link text");
    expect(signals).toContain("webhook heading");
  });
});
