// Smoke test: verify types are importable and usable
import type {
  CheckStatus,
  Check,
  BridgeResult,
  BridgeId,
  BridgeName,
  ScanResult,
  ScanContext,
  ScanOptions,
  HttpError,
  HttpErrorKind,
  HttpSuccess,
  HttpFailure,
  HttpResponse,
  BridgeStatus,
} from "../src/core/types.js";

// Verify CheckStatus union members
const status: CheckStatus = "pass";

// Verify Check interface shape
const check: Check = {
  id: "https_available",
  label: "HTTPS Available",
  status: "pass",
  detail: "TLS 1.3",
};

// Verify BridgeResult interface shape
const bridge: BridgeResult = {
  id: 1,
  name: "Reachability",
  status: "evaluated",
  score: 85,
  scoreLabel: "pass",
  checks: [check],
  durationMs: 1200,
};

// Verify ScanResult interface shape with 5-tuple
const result: ScanResult = {
  version: "1.0.0",
  url: "https://example.com",
  timestamp: new Date().toISOString(),
  durationMs: 5000,
  overallScore: 72,
  overallScoreLabel: "partial",
  bridges: [
    bridge,
    { ...bridge, id: 2, name: "Standards" },
    { ...bridge, id: 3, name: "Separation", score: null, scoreLabel: null },
    { ...bridge, id: 4, name: "Schema", status: "not_evaluated", score: null, scoreLabel: null, checks: [], message: "Not evaluated" },
    { ...bridge, id: 5, name: "Context", status: "not_evaluated", score: null, scoreLabel: null, checks: [], message: "Not evaluated" },
  ],
};

// Verify HttpResponse discriminated union
const success: HttpSuccess = {
  ok: true,
  url: "https://example.com",
  status: 200,
  headers: { "content-type": "text/html" },
  body: "<html></html>",
  redirects: [],
  durationMs: 300,
};

const failure: HttpFailure = {
  ok: false,
  error: {
    kind: "dns",
    message: "DNS resolution failed",
    url: "https://nonexistent.example.com",
  },
};

// Verify discriminated union narrowing works
function handleResponse(res: HttpResponse): string {
  if (res.ok) {
    return res.body; // TypeScript narrows to HttpSuccess
  } else {
    return res.error.message; // TypeScript narrows to HttpFailure
  }
}

console.log("Smoke test passed: all types compile and are usable");
