import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkA2aAgentCard } from "../a2a-agent-card.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/.well-known/agent.json",
    status: 200,
    headers: { "content-type": "application/json" },
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404", statusCode: 404, url: "https://example.com/.well-known/agent.json" },
  };
}

describe("checkA2aAgentCard", () => {
  beforeEach(() => mockHttpGet.mockReset());

  it("returns pass with valid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(JSON.stringify({ name: "Agent" })));
    const result = await checkA2aAgentCard("https://example.com");
    expect(result.id).toBe("standards_a2a_agent_card");
    expect(result.status).toBe("pass");
  });

  it("returns fail on 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkA2aAgentCard("https://example.com");
    expect(result.status).toBe("fail");
  });

  it("returns fail on invalid JSON", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("not json"));
    const result = await checkA2aAgentCard("https://example.com");
    expect(result.status).toBe("fail");
  });
});
