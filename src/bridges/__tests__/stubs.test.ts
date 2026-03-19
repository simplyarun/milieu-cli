import { describe, it, expect } from "vitest";
import { createBridge4Stub, createBridge5Stub } from "../stubs.js";

describe("createBridge4Stub", () => {
  it("returns BridgeResult with id=4 and name='Schema'", () => {
    const result = createBridge4Stub();
    expect(result.id).toBe(4);
    expect(result.name).toBe("Schema");
  });

  it("returns status 'not_evaluated' with null score and scoreLabel", () => {
    const result = createBridge4Stub();
    expect(result.status).toBe("not_evaluated");
    expect(result.score).toBeNull();
    expect(result.scoreLabel).toBeNull();
  });

  it("returns empty checks array and durationMs=0", () => {
    const result = createBridge4Stub();
    expect(result.checks).toEqual([]);
    expect(result.durationMs).toBe(0);
  });

  it("message equals exact spec text", () => {
    const result = createBridge4Stub();
    expect(result.message).toBe(
      "Schema quality assessment requires deeper analysis beyond automated checks.",
    );
  });
});

describe("createBridge5Stub", () => {
  it("returns BridgeResult with id=5 and name='Context'", () => {
    const result = createBridge5Stub();
    expect(result.id).toBe(5);
    expect(result.name).toBe("Context");
  });

  it("returns status 'not_evaluated' with null score and scoreLabel", () => {
    const result = createBridge5Stub();
    expect(result.status).toBe("not_evaluated");
    expect(result.score).toBeNull();
    expect(result.scoreLabel).toBeNull();
  });

  it("returns empty checks array and durationMs=0", () => {
    const result = createBridge5Stub();
    expect(result.checks).toEqual([]);
    expect(result.durationMs).toBe(0);
  });

  it("message equals exact spec text", () => {
    const result = createBridge5Stub();
    expect(result.message).toBe(
      "Context evaluation requires deeper analysis beyond automated checks.",
    );
  });
});

describe("STUB-03: no forbidden language", () => {
  const forbidden = /coming soon|upgrade|future|planned|premium|later/i;

  it("Bridge 4 stub message contains no forbidden language", () => {
    const result = createBridge4Stub();
    expect(result.message).not.toMatch(forbidden);
  });

  it("Bridge 5 stub message contains no forbidden language", () => {
    const result = createBridge5Stub();
    expect(result.message).not.toMatch(forbidden);
  });
});
