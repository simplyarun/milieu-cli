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
  /** Score 0-100 for scored bridges (1, 2), null for detection-only (3) and stubs (4, 5) */
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

/** Complete scan result -- this is the JSON output public API contract */
export interface ScanResult {
  /** Schema version for JSON output stability (semver) */
  version: string;
  /** The URL that was scanned */
  url: string;
  /** ISO 8601 timestamp when scan started */
  timestamp: string;
  /** Total scan duration in milliseconds */
  durationMs: number;
  /** Overall score (0-100) averaged from scored bridges only (1, 2) */
  overallScore: number;
  /** Overall score category */
  overallScoreLabel: "pass" | "partial" | "fail";
  /** Results for each bridge (always 5 entries, in order) */
  bridges: [BridgeResult, BridgeResult, BridgeResult, BridgeResult, BridgeResult];
}

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
}

/** Discriminated union for HTTP responses */
export type HttpResponse = HttpSuccess | HttpFailure;
