import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkLlmsTxt, checkLlmsFullTxt, analyzeLlmsContent } from "../llms-txt.js";
import { httpGet } from "../../../utils/http-client.js";
import type { HttpResponse } from "../../../core/types.js";

vi.mock("../../../utils/http-client.js", () => ({
  httpGet: vi.fn(),
}));

const mockHttpGet = vi.mocked(httpGet);

function makeSuccess(body: string): HttpResponse {
  return {
    ok: true,
    url: "https://example.com/llms.txt",
    status: 200,
    headers: {},
    body,
    redirects: [],
    durationMs: 50,
  };
}

function make404(): HttpResponse {
  return {
    ok: false,
    error: { kind: "http_error", message: "HTTP 404 Not Found", statusCode: 404, url: "https://example.com/llms.txt" },
  };
}

describe("checkLlmsTxt", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'llms_txt' and label 'llms.txt'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.id).toBe("llms_txt");
    expect(check.label).toBe("llms.txt");
  });

  it("returns pass with quality data when body has H1, sections, and links", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# My Site\n\n## Overview\nSee https://example.com/docs for details"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("pass");
    expect(check.detail).toBe("llms.txt found (63 bytes, 1 sections, 1 links)");
    expect(check.data).toMatchObject({
      sizeBytes: 63,
      firstLine: "# My Site",
      sectionCount: 1,
      linkCount: 1,
    });
  });

  it("returns partial when H1 present but no sections or links", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("# My Site\n\nSome content here"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("partial");
    expect(check.detail).toBe("llms.txt found but lacks sections or links");
    expect(check.data).toMatchObject({
      sizeBytes: 28,
      sectionCount: 0,
      linkCount: 0,
    });
  });

  it("returns partial when body does NOT start with H1", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("No heading here\nJust text"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("partial");
    expect(check.detail).toBe("llms.txt found but missing H1 header");
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("returns fail on whitespace-only body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("   \n  \n  "));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("fail");
    expect(check.detail).toBe("No llms.txt found");
  });

  it("calculates byte size correctly for multi-byte chars", async () => {
    // "# Cafe" has 0 sections/links so it's partial, but we can still check sizeBytes
    mockHttpGet.mockResolvedValue(makeSuccess("# Cafe"));
    const { check } = await checkLlmsTxt("https://example.com");
    expect(check.status).toBe("partial");
    expect((check.data as { sizeBytes: number }).sizeBytes).toBe(6);
  });

  it("passes timeout to httpGet", async () => {
    mockHttpGet.mockResolvedValue(make404());
    await checkLlmsTxt("https://example.com", 5000);
    expect(mockHttpGet).toHaveBeenCalledWith("https://example.com/llms.txt", { timeout: 5000 });
  });

  it("returns body content on success", async () => {
    const content = "# My Site\n\nSome content here";
    mockHttpGet.mockResolvedValue(makeSuccess(content));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBe(content);
  });

  it("returns null body on 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
  });

  it("returns null body on empty response", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
  });

  it("returns null body on whitespace-only response", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("   \n  \n  "));
    const { body } = await checkLlmsTxt("https://example.com");
    expect(body).toBeNull();
  });
});

describe("checkLlmsFullTxt", () => {
  beforeEach(() => {
    mockHttpGet.mockReset();
  });

  it("returns Check with id 'llms_full_txt' and label 'llms-full.txt'", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.id).toBe("llms_full_txt");
    expect(result.label).toBe("llms-full.txt");
  });

  it("returns pass with size and quality data for non-empty HTTP 200 above 500 bytes", async () => {
    const body = "A".repeat(1024);
    mockHttpGet.mockResolvedValue(makeSuccess(body));
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("llms-full.txt found (1024 bytes)");
    expect(result.data).toMatchObject({ sizeBytes: 1024, sectionCount: 0, linkCount: 0 });
  });

  it("returns partial when under 500 bytes", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess("Short content here"));
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("partial");
    expect(result.detail).toBe("llms-full.txt found but minimal (18 bytes)");
    expect(result.data).toMatchObject({ sizeBytes: 18 });
  });

  it("returns fail on HTTP 404", async () => {
    mockHttpGet.mockResolvedValue(make404());
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms-full.txt found");
  });

  it("returns fail on empty body", async () => {
    mockHttpGet.mockResolvedValue(makeSuccess(""));
    const result = await checkLlmsFullTxt("https://example.com");
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("No llms-full.txt found");
  });
});

describe("analyzeLlmsContent", () => {
  it("counts sections, links, lines, and detects API references", () => {
    const body = "# Title\n\n## Overview\nSome text\n\n## API\nUse https://api.example.com/v1 and https://docs.example.com\n";
    const result = analyzeLlmsContent(body);
    expect(result.sectionCount).toBe(2);
    expect(result.linkCount).toBe(2);
    expect(result.hasApiReferences).toBe(true);
    expect(result.lineCount).toBe(5);
  });

  it("returns zeros for plain text with no structure", () => {
    const result = analyzeLlmsContent("Just some plain text here");
    expect(result.sectionCount).toBe(0);
    expect(result.linkCount).toBe(0);
    expect(result.hasApiReferences).toBe(false);
    expect(result.lineCount).toBe(1);
  });

  it("does not count H1 as a section", () => {
    const result = analyzeLlmsContent("# Title\n\nContent");
    expect(result.sectionCount).toBe(0);
  });
});
