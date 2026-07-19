// === Check Status ===

/** Status of an individual check within a bridge */
export type CheckStatus = "pass" | "partial" | "fail" | "error";

/** A single check result */
export interface Check {
  /** Machine-readable check identifier, e.g. "https_available", "robots_txt_present" */
  id: string;
  /** Human-readable label for display */
  label: string;
  /** Check outcome */
  status: CheckStatus;
  /** Optional detail string shown in verbose mode */
  detail?: string;
  /** Optional structured data for JSON output (e.g., crawler directives, schema types) */
  data?: Record<string, unknown>;
  /** Why this check result matters for AI agent readiness */
  why?: string;
}

// === Content Source ===

/** A text content blob with its source label, used for multi-source signal scanning */
export interface ContentSource {
  /** The text content to scan */
  content: string;
  /** Human-readable source label (e.g., "homepage", "llms.txt", "/docs") */
  source: string;
}

// === Bridge Types ===

/** Bridge identifiers (1-5) */
export type BridgeId = 1 | 2 | 3 | 4 | 5;

/** Human-readable bridge names */
export type BridgeName =
  | "Reachability"
  | "Standards"
  | "Separation"
  | "Schema"
  | "Context";

/** Bridge evaluation status */
export type BridgeStatus = "evaluated" | "not_evaluated";

/** Result of a single bridge assessment */
export interface BridgeResult {
  /** Bridge number (1-5) */
  id: BridgeId;
  /** Bridge name */
  name: BridgeName;
  /** Whether this bridge was evaluated or is a stub */
  status: BridgeStatus;
  /** Score 0-100 for scored bridges (1, 2, 4, 5), null for detection-only (3) */
  score: number | null;
  /** Score category for scored bridges, null for unscored */
  scoreLabel: "pass" | "partial" | "fail" | null;
  /** Individual checks within this bridge, empty array for stubs */
  checks: Check[];
  /** Time in milliseconds to evaluate this bridge */
  durationMs: number;
  /** Human-readable message for stubs (bridges 4-5) */
  message?: string;
  /** If true, scan should abort -- no further bridges attempted */
  abort?: boolean;
  /** Reason for abort (dns, connection_refused, ssl_error) */
  abortReason?: string;
}

// === Scan Types ===

/** Options passed to the scan function */
export interface ScanOptions {
  /** Per-request HTTP timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Show verbose output with individual check details */
  verbose?: boolean;
  /** Suppress spinner and terminal output (for JSON/quiet modes) */
  silent?: boolean;
  /** Maximum simultaneous outbound HTTP requests (default: 8) */
  maxConcurrency?: number;
  /** Maximum outbound HTTP request attempts for the whole scan, counting every redirect hop and retry (default: 150) */
  maxRequests?: number;
}

/** Context shared across bridge checks during a single scan */
export interface ScanContext {
  /** The original URL provided by the user */
  url: string;
  /** Normalized domain extracted from URL (e.g., "example.com") */
  domain: string;
  /** Base URL with protocol (e.g., "https://example.com") */
  baseUrl: string;
  /** Scan options */
  options: ScanOptions;
  /** Shared data between bridges (e.g., Bridge 2 OpenAPI result reused by Bridge 3) */
  shared: Record<string, unknown>;
}

/** A completed scan -- this is the JSON output public API contract */
export interface ScanResult {
  /** Discriminant: a completed scan. Mirrors HttpResponse's `ok` field. */
  ok: true;
  /** Schema version for JSON output stability (semver) */
  version: string;
  /** The URL that was scanned */
  url: string;
  /** Normalized origin actually scanned; paths and query strings are not scoped */
  scannedOrigin: string;
  /** True when the scan request budget ran out and at least one probe was skipped — treat affected checks as unmeasured, not failing */
  incomplete: boolean;
  /** ISO 8601 timestamp when scan started */
  timestamp: string;
  /** Total scan duration in milliseconds */
  durationMs: number;
  /** Overall score (0-100) averaged from scored bridges (1, 2, 4, 5) */
  overallScore: number;
  /** Overall score category */
  overallScoreLabel: "pass" | "partial" | "fail";
  /** Results for each bridge (always 5 entries, in order) */
  bridges: [BridgeResult, BridgeResult, BridgeResult, BridgeResult, BridgeResult];
}

/** Why a scan could not produce a result. */
export type ScanErrorKind = "invalid_url" | "scan_failed";

/** A scan that never produced a result. Mirrors HttpFailure. */
export interface ScanFailure {
  ok: false;
  error: { kind: ScanErrorKind; message: string };
}

/**
 * The outcome of `scan()`: either a completed `ScanResult` (`ok: true`) or a
 * `ScanFailure` (`ok: false`). Like the HTTP client, `scan()` never throws —
 * narrow on `.ok` before using the result.
 */
export type ScanOutcome = ScanResult | ScanFailure;

// === HTTP Error Types ===

/** Discriminated union for HTTP client errors (FOUND-03) */
export type HttpErrorKind =
  | "dns"
  | "timeout"
  | "ssrf_blocked"
  | "http_error"
  | "bot_protected"
  | "connection_refused"
  | "ssl_error"
  | "body_too_large"
  | "request_budget_exhausted"
  | "unknown";

/** HTTP error with discriminated kind field */
export interface HttpError {
  kind: HttpErrorKind;
  message: string;
  statusCode?: number;
  url: string;
}

/** HTTP success response */
export interface HttpSuccess {
  ok: true;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  redirects: string[];
  durationMs: number;
}

/** HTTP failure response */
export interface HttpFailure {
  ok: false;
  error: HttpError;
  /**
   * The HTTP response, present only when the failure IS one — a 4xx/5xx
   * (`http_error`) or bot-protection (`bot_protected`). Absent for
   * network-level failures (dns, timeout, ssrf_blocked, connection_refused,
   * ssl_error, body_too_large, request_budget_exhausted).
   *
   * Checks that grade a *rejection* rather than an absence — auth legibility
   * (401/403 quality) and rate limits (headers on any response) — read this
   * instead of treating every non-2xx as "unreachable".
   */
  response?: { status: number; headers: Record<string, string>; body: string };
}

/** Discriminated union for HTTP responses */
export type HttpResponse = HttpSuccess | HttpFailure;
