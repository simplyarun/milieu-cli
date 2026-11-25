import { linkedRegistry } from "../bridges/separation/sdk-references.js";
import type { DiffFinding, ReportDiff } from "../core/diff.js";
import { CHECK_EXPLANATIONS } from "../core/explanations.js";
import { terminalText } from "./terminal-text.js";

// Leave room for other output in a 1 MiB GitHub step summary.
const MARKDOWN_BYTES = 256 * 1024;
const BRIDGES = ["Reachability", "Standards", "Separation", "Schema", "Context"];
const PRIORITY = ["regression", "inconclusive", "improvement", "inventory"] as const;

function publicHttpUrl(url: URL | null): url is URL {
  return url !== null && (url.protocol === "https:" || url.protocol === "http:") &&
    /^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/i.test(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
}

function publicOrigin(raw: string): string {
  if (raw.length > 320) return "withheld";
  const url = URL.parse(raw);
  return publicHttpUrl(url) && raw === url.origin ? url.origin : "withheld";
}

/** Publish only canonical HTTP resources with an ordinary literal path. Omit ambiguous identities in full. */
function publicTarget(raw: string | undefined, packageLink = false): string | undefined {
  if (!raw || raw.length > 512) return;
  const local = raw.startsWith("/") && !raw.startsWith("//");
  const url = URL.parse(raw, local ? "https://example.invalid" : undefined);
  if (!publicHttpUrl(url) || !/^\/[A-Za-z0-9._~@/-]*$/.test(url.pathname)) return;
  if (packageLink && (local || !linkedRegistry(url))) return;
  if (raw === (local ? url.pathname : url.origin + url.pathname)) return raw;
}

function findingRow(f: DiffFinding): string {
  // Only the scanner's known check IDs identify a check in a shared summary.
  const known = f.checkId !== null && Object.hasOwn(CHECK_EXPLANATIONS, f.checkId);
  const label = known ? f.checkId : f.checkId === null ? "Bridge coverage" : "Unrecognized check";
  const lines = ["Bridge " + f.bridgeId + " · " + BRIDGES[f.bridgeId - 1] + " · " + f.kind, String(label)];
  const evidence = f.evidence;
  if (!evidence || (!known && f.checkId !== null)) return [...lines, "Verify     Inspect this bridge in both local scan reports."].join("\n");
  let target: string | undefined;
  let verify = "Repeat both scans with the same settings and compare this check in the local reports.";
  if (evidence.kind === "status") {
    lines.push((evidence.before ?? "unreported") + " → " + (evidence.after ?? "unreported"));
    if (f.checkId === "context_rate_limit_headers") {
      if (f.kind === "inconclusive") lines.push("Comparable rate-limit evidence was not established.");
      verify = "Compare the declared GET operation, final responder, HTTP status and rate-limit headers.";
      if (f.target?.startsWith("GET ")) target = publicTarget(f.target.slice(4));
    } else if (f.checkId === "standards_a2a_agent_card" || f.checkId === "context_agents_json") {
      target = publicTarget(f.target);
    }
  } else if (evidence.kind === "coverage") {
    const subject = { bridge: "Bridge", docs: "Documentation", linked: "Homepage link", fetched: "Documentation fetch",
      package: "Package link" }[evidence.source];
    const describe = (state: string, rawTarget?: string) => {
      const resource = publicTarget(rawTarget);
      return resource ? state + " (" + resource + ")" : state;
    };
    lines.push(subject + " coverage: " + describe(evidence.before, evidence.beforeTarget) + " → " + describe(evidence.after, evidence.afterTarget));
    verify = f.bridgeId === 4 ? "Confirm both scans parsed the same OpenAPI document." :
      "Compare source availability in the local reports before interpreting the change.";
  } else if (evidence.kind === "auth") {
    verify = "Compare the unauthenticated responses for the same GET operation.";
    const describe = (state: typeof evidence.before) => {
      const parts = [state.httpStatus === undefined ? "HTTP status unknown" : "HTTP " + state.httpStatus];
      if (state.challenged) parts.push(state.guidance === undefined ? "guidance unverified" : state.guidance.join(", ") || "no guidance signals");
      return parts.join(" · ");
    };
    lines.push(describe(evidence.before) + " → " + describe(evidence.after));
    if (f.target?.startsWith("GET ")) target = publicTarget(f.target.slice(4));
  } else if (evidence.kind === "routes") {
    verify = "Look for a link to the contract in the homepage, linked developer docs and observed API catalog.";
    const describe = (state: typeof evidence.before) => state === null ? "unverified" :
      String(state.count) + (state.complete ? "" : " (coverage incomplete)");
    lines.push("Published routes to the OpenAPI contract: " + describe(evidence.before) + " → " + describe(evidence.after));
    target = publicTarget(evidence.contract);
  } else {
    const subject = { linked: "Homepage documentation link", fetched: "Documentation fetch", package: "Package registry link" }[evidence.channel];
    const absent = f.kind === "inconclusive" ? "unverified" : "not observed";
    lines.push(subject + ": " + (evidence.before ? "observed" : absent) + " → " + (evidence.after ? "observed" : absent));
    target = publicTarget(f.target, evidence.channel === "package");
    verify = {
      linked: "Compare the homepage links to developer documentation.",
      fetched: "Compare the final responses from the developer documentation URLs.",
      package: "Compare the package links in both homepages and fetched developer docs.",
    }[evidence.channel];
  }
  if (target) lines.push("Target     " + target);
  lines.push("Verify     " + verify);
  return lines.join("\n");
}

function markdownSummary(diff: ReportDiff): string {
  const fence = String.fromCharCode(96).repeat(3);
  const version = /^\d{1,8}\.\d{1,8}\.\d{1,8}(?:-(?:rc|alpha|beta|next)\.\d{1,8})?$/.test(diff.version) ? diff.version : "unverified";
  const lines = ["## Milieu release comparison", "", fence + "text", "Base       " + publicOrigin(diff.baseOrigin),
    "Candidate  " + publicOrigin(diff.headOrigin), "Scanner    " + version];
  if (diff.baseIncomplete || diff.headIncomplete) {
    const which = [diff.baseIncomplete && "base", diff.headIncomplete && "candidate"].filter(Boolean).join(" and ");
    lines.push("Request budget exhausted in " + which + ". Coverage is incomplete.");
  }
  if (!diff.findings.length) lines.push("No differences in comparable observations.");
  // Reserve the omission notice, closing fence and CLI newline. Select regressions before inventory
  // and preserve the five-bridge order in the displayed rows.
  let remaining = MARKDOWN_BYTES - Buffer.byteLength(lines.join("\n")) - 128;
  const selected = new Map<number, string>();
  for (const kind of PRIORITY) {
    for (let index = 0; index < diff.findings.length; index++) {
      const finding = diff.findings[index];
      if (finding.kind !== kind) continue;
      const row = findingRow(finding);
      const cost = Buffer.byteLength(row) + 2;
      if (cost > remaining) break;
      selected.set(index, row);
      remaining -= cost;
    }
  }
  for (const index of [...selected.keys()].sort((a, b) => a - b)) lines.push("", selected.get(index)!);
  const omitted = diff.findings.length - selected.size;
  if (omitted) lines.push("", omitted + " additional findings omitted. Use the local diff for the full comparison.");
  lines.push(fence);
  return lines.join("\n");
}

export function formatReportDiff(diff: ReportDiff, markdown = false): string {
  if (markdown) return markdownSummary(diff);
  const lines = [
    "Base       " + terminalText(diff.baseOrigin),
    "Candidate  " + terminalText(diff.headOrigin),
    "Scanner    " + terminalText(diff.version),
  ];
  if (diff.baseIncomplete || diff.headIncomplete) {
    const reports = [diff.baseIncomplete && "base", diff.headIncomplete && "candidate"].filter(Boolean);
    lines.push("Request budget exhausted in " + reports.join(" and ") + ". Coverage is incomplete.");
  }
  for (const finding of diff.findings) {
    lines.push("", "Bridge " + finding.bridgeId + " · " + finding.bridgeName + " · " + finding.kind,
      terminalText(finding.label) + (finding.target ? " (" + terminalText(finding.target) + ")" : ""),
      "Base       " + terminalText(finding.before),
      "Candidate  " + terminalText(finding.after),
      "Verify     " + terminalText(finding.verification));
  }
  if (!diff.findings.length) lines.push("", "No differences in comparable observations.");
  return lines.join("\n");
}
