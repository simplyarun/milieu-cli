import { describe, it, expect } from "vitest";
import { checkMetaRobots, checkXRobotsTag } from "../meta-robots.js";

describe("checkMetaRobots", () => {
  it("returns pass when no meta robots tag in head", () => {
    const html = "<html><head><title>Test</title></head><body></body></html>";
    const result = checkMetaRobots(html);
    expect(result.id).toBe("meta_robots");
    expect(result.label).toBe("Meta Robots Tags");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("No restrictive meta robots tags found");
    expect(result.data).toEqual({ directives: [] });
  });

  it("returns fail when noindex is present", () => {
    const html = `<html><head><meta name="robots" content="noindex"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("noindex");
  });

  it("returns partial when nofollow is present", () => {
    const html = `<html><head><meta name="robots" content="nofollow"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("partial");
    expect(result.detail).toContain("nofollow");
  });

  it("returns fail when both noindex and nofollow (noindex takes priority)", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("noindex");
  });

  it("handles reversed attribute order (content before name)", () => {
    const html = `<html><head><meta content="noindex" name="robots"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("detects googlebot noindex", () => {
    const html = `<html><head><meta name="googlebot" content="noindex"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("detects bingbot noindex", () => {
    const html = `<html><head><meta name="bingbot" content="noindex"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("handles single quotes", () => {
    const html = `<html><head><meta name='robots' content='noindex'></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("returns pass for index, follow (no restrictive directives)", () => {
    const html = `<html><head><meta name="robots" content="index, follow"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("pass");
  });

  it("ignores meta tag only in body (not in head)", () => {
    const html = `<html><head><title>Test</title></head><body><meta name="robots" content="noindex"></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("pass");
  });

  it("returns pass when HTML has no head tag", () => {
    const html = `<html><body><p>Hello</p></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("pass");
  });

  it("handles self-closing meta tag", () => {
    const html = `<html><head><meta name="robots" content="noindex" /></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("is case insensitive", () => {
    const html = `<html><head><META NAME="ROBOTS" CONTENT="NOINDEX"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.status).toBe("fail");
  });

  it("stores found directives in data", () => {
    const html = `<html><head><meta name="robots" content="noindex, nofollow"></head><body></body></html>`;
    const result = checkMetaRobots(html);
    expect(result.data).toBeDefined();
    expect((result.data as { directives: string[] }).directives).toContain("noindex");
    expect((result.data as { directives: string[] }).directives).toContain("nofollow");
  });
});

describe("checkXRobotsTag", () => {
  it("returns pass when no x-robots-tag header", () => {
    const result = checkXRobotsTag({});
    expect(result.id).toBe("x_robots_tag");
    expect(result.label).toBe("X-Robots-Tag Header");
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("No X-Robots-Tag header");
  });

  it("returns fail for noindex", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "noindex" });
    expect(result.status).toBe("fail");
  });

  it("returns partial for nofollow", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "nofollow" });
    expect(result.status).toBe("partial");
  });

  it("returns partial for noarchive", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "noarchive" });
    expect(result.status).toBe("partial");
  });

  it("returns partial for none", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "none" });
    expect(result.status).toBe("partial");
  });

  it("returns fail when noindex combined with nofollow (noindex wins)", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "noindex, nofollow" });
    expect(result.status).toBe("fail");
  });

  it("returns pass for 'all' directive", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "all" });
    expect(result.status).toBe("pass");
  });

  it("stores raw header value and directives in data", () => {
    const result = checkXRobotsTag({ "x-robots-tag": "noindex, nofollow" });
    expect(result.data).toBeDefined();
    const data = result.data as { directives: string[]; raw: string };
    expect(data.raw).toBe("noindex, nofollow");
    expect(data.directives).toContain("noindex");
    expect(data.directives).toContain("nofollow");
  });
});
