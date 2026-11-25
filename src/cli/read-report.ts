import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { ScanResult } from "../core/types.js";

const MAX_REPORT_BYTES = 32 * 1024 * 1024;
const BRIDGES = ["Reachability", "Standards", "Separation", "Schema", "Context"];
const CHECK_STATUSES = new Set(["pass", "partial", "fail", "error"]);
const SCORE_LABELS = new Set(["pass", "partial", "fail"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isDuration(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateReport(value: unknown): asserts value is ScanResult {
  if (isRecord(value) && value.ok === false) throw new Error("the file contains a failed scan");
  if (!isRecord(value) || value.ok !== true || typeof value.version !== "string" || !value.version ||
      typeof value.scannedOrigin !== "string" || typeof value.incomplete !== "boolean" ||
      typeof value.url !== "string" || typeof value.timestamp !== "string" || !isDuration(value.durationMs) ||
      !isScore(value.overallScore) || typeof value.overallScoreLabel !== "string" || !SCORE_LABELS.has(value.overallScoreLabel) ||
      !Array.isArray(value.bridges) || value.bridges.length !== BRIDGES.length) {
    throw new Error("expected a five-bridge scan report with version, scannedOrigin and incomplete");
  }
  const bridgeIds = new Set<number>();
  for (const bridge of value.bridges) {
    if (!isRecord(bridge) || typeof bridge.id !== "number" || !Number.isInteger(bridge.id) ||
        bridge.id < 1 || bridge.id > BRIDGES.length || bridge.name !== BRIDGES[bridge.id - 1] ||
        bridgeIds.has(bridge.id) || (bridge.status !== "evaluated" && bridge.status !== "not_evaluated") ||
        !isDuration(bridge.durationMs) || !Array.isArray(bridge.checks) ||
        (bridge.score !== null && !isScore(bridge.score)) ||
        (bridge.scoreLabel !== null && (typeof bridge.scoreLabel !== "string" || !SCORE_LABELS.has(bridge.scoreLabel))) ||
        (bridge.abort !== undefined && typeof bridge.abort !== "boolean") ||
        (bridge.abortReason !== undefined && typeof bridge.abortReason !== "string") ||
        (bridge.message !== undefined && typeof bridge.message !== "string")) {
      throw new Error("invalid or duplicate bridge in scan report");
    }
    bridgeIds.add(bridge.id);
    const checkIds = new Set<string>();
    for (const check of bridge.checks) {
      if (!isRecord(check) || typeof check.id !== "string" || !check.id || checkIds.has(check.id) ||
          typeof check.label !== "string" || typeof check.status !== "string" || !CHECK_STATUSES.has(check.status) ||
          (check.detail !== undefined && typeof check.detail !== "string") ||
          (check.why !== undefined && typeof check.why !== "string") ||
          (check.data !== undefined && !isRecord(check.data))) {
        throw new Error("invalid or duplicate check in " + bridge.name);
      }
      checkIds.add(check.id);
    }
  }
}

export async function readReport(path: string): Promise<ScanResult> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile()) throw new Error("expected a regular JSON file");
      if (stat.size > MAX_REPORT_BYTES) throw new Error("report exceeds the 32 MiB limit");
      // Read at most the inspected size plus one byte, including if a writer is still appending.
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const { bytesRead } = await file.read(bytes, size, bytes.length - size, size);
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      if (size !== stat.size) throw new Error("report changed while it was being read");
      let value: unknown;
      try {
        // Windows shells and editors can write JSON with a Unicode byte-order mark.
        const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
          : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
        value = JSON.parse(new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(0, size)));
      } catch {
        throw new Error("invalid JSON or incomplete report");
      }
      validateReport(value);
      return value;
    } finally {
      await file.close();
    }
  } catch (error) {
    throw new Error(path + ": " + (error instanceof Error ? error.message : "could not read report"));
  }
}
