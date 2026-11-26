import { expect, it } from "vitest";
import type { Check } from "../../../core/types.js";
import { summarizeSeparation } from "../evidence-summary.js";

const pass = (id: string, data = {}): Check => ({ id, label: id, status: "pass", data });

it("identifies the source of API evidence and the evidence behind each surface", () => {
  const checks = [
    pass("api_presence"), pass("developer_docs", { linkedAndFetched: true }), pass("sdk_references"),
    pass("webhook_support", { signals: ["webhook heading"] }),
  ];
  expect(summarizeSeparation(checks, pass("openapi_spec", { specType: "swagger" }))).toBe(
    "API described in Swagger 2.0 · Developer docs linked and fetched · SDK/package reference found · Webhook support inferred",
  );
  expect(summarizeSeparation(checks, { ...pass("openapi_spec", { registry: "apis.guru" }), status: "partial" })).toContain("listed in APIs.guru");
  expect(summarizeSeparation(checks)).toContain("API inferred");
});

it("separates incidental docs fetches from published links", () => {
  expect(summarizeSeparation([pass("developer_docs", { linkedUrls: [], fetchedUrls: ["https://example.com/product/docs"] })])).toBe("Docs path fetched");
  expect(summarizeSeparation([pass("developer_docs", { linkedUrls: ["https://docs.example.com"], fetchedUrls: [] })])).toBe("Developer docs linked");
  expect(summarizeSeparation([{ id: "developer_docs", label: "Docs", status: "error" }])).toBe("Docs discovery incomplete");
});
