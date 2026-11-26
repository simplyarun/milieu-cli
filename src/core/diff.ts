import type { BridgeId, BridgeName, BridgeResult, Check, CheckStatus, ScanResult } from "./types.js";

export interface DiffOptions {
  /** Map only these two scan origins. External resources retain their absolute identity. */
  originMap?: { base: string; head: string };
}

type AuthSummary = { httpStatus?: number; guidance?: string[]; challenged: boolean };
type RouteSummary = { count: number; complete: boolean } | null;
type Coverage = "complete" | "incomplete" | "unavailable" | "evaluated" | "not evaluated" | "schema verified" | "schema unverified";

/** Structured observations for the shareable summary. Local descriptions can contain site-provided text. */
type FindingEvidence =
  | { kind: "status"; before: CheckStatus | null; after: CheckStatus | null }
  | { kind: "coverage"; source: "bridge" | "docs" | "linked" | "fetched" | "package"; before: Coverage; after: Coverage;
      beforeTarget?: string; afterTarget?: string }
  | { kind: "auth"; before: AuthSummary; after: AuthSummary }
  | { kind: "routes"; before: RouteSummary; after: RouteSummary; contract?: string }
  | { kind: "link"; channel: "linked" | "fetched" | "package"; before: boolean; after: boolean };

interface Change {
  kind: "regression" | "improvement" | "inventory" | "inconclusive";
  before: string;
  after: string;
  verification: string;
  target?: string;
  evidence?: FindingEvidence;
  /** Stable capability identifier for a change in its published entry routes. */
  capabilityId?: string;
}

export interface DiffFinding extends Change {
  bridgeId: BridgeId;
  bridgeName: BridgeName;
  checkId: string | null;
  label: string;
}

export interface ReportDiff {
  baseOrigin: string;
  headOrigin: string;
  baseIncomplete: boolean;
  headIncomplete: boolean;
  version: string;
  findings: DiffFinding[];
}

function httpUrl(raw: unknown): URL | null {
  const url = typeof raw === "string" ? URL.parse(raw) : null;
  return url && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
}

function origin(raw: string): string {
  const url = httpUrl(raw);
  if (!url || !/^https?:\/\/[^/?#\\\s]+\/?$/i.test(raw) || url.href !== url.origin + "/") {
    throw new Error("Expected an absolute HTTP(S) origin without a path, credentials, query or fragment.");
  }
  return url.origin;
}

/** A local target always starts with /, an external target with an absolute URL. */
function targetKey(raw: unknown, scannedOrigin: string): string | undefined {
  const url = httpUrl(raw);
  if (!url || url.search || url.hash) return undefined;
  return url.origin === scannedOrigin ? url.pathname : url.href;
}

function responseTarget(raw: unknown, hasQuery: unknown, scannedOrigin: string): string | undefined {
  const url = httpUrl(raw);
  if (!url || hasQuery === true || url.search || url.hash) return undefined;
  return targetKey(url.href, scannedOrigin);
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === "string")) return undefined;
  return [...new Set(value)].sort();
}

function describe(check?: Check): string {
  if (!check) return "Check not reported";
  return check.detail ? `${check.status} (${check.detail})` : check.status;
}

const authSignals = new Map([
  ["www-authenticate", "WWW-Authenticate"], ["json_error_body", "JSON error body"], ["docs_url", "documentation link"],
]);

function authObservation(check: Check, scannedOrigin: string) {
  const data = check.data;
  const target = targetKey(data?.probeUrl, scannedOrigin);
  const responder = responseTarget(data?.responseUrl, data?.responseHasQuery, scannedOrigin);
  const signals = strings(data?.signals);
  const status = typeof data?.httpStatus === "number" ? data.httpStatus : undefined;
  const source = data?.probeSource;
  const known = target !== undefined && data?.method === "GET" && (source === "protected_operation" || source === "fallback");
  const comparable = known && source === "protected_operation" && responder === target && check.status !== "error" && data?.measurement === "challenged" &&
    (status === 401 || status === 403) && signals !== undefined && signals.every(s => authSignals.has(s));
  const method = known ? (source === "protected_operation" ? "protected GET" : "fallback GET") : "unverified probe";
  const parts = [status !== undefined ? `HTTP ${status}` : "HTTP status unavailable", [method, target].filter(Boolean).join(" ")];
  if (responder && responder !== target) parts.push(`response from ${responder}`);
  if (!responder && status !== undefined) parts.push("final response URL unverified");
  if (data?.measurement === "challenged") {
    const hints = [...authSignals].filter(([key]) => signals?.includes(key)).map(([, name]) => name);
    parts.push(signals ? hints.join(", ") || "no guidance signals" : "guidance signals unavailable");
  } else if (data?.measurement === "no_challenge") parts.push("no authentication challenge");
  else if (data?.measurement === "unmeasured") parts.push("authentication guidance unmeasured");
  else {
    const hints = signals?.map(s => authSignals.get(s) ?? s).join(", ");
    parts.push(`measurement unavailable (reported ${check.status}${hints ? ", " + hints : ""})`);
  }
  const summary: AuthSummary = {
    httpStatus: status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined,
    guidance: signals?.every(signal => authSignals.has(signal)) ? signals.map(signal => authSignals.get(signal)!) : undefined,
    challenged: data?.measurement === "challenged",
  };
  return { target, responder, source, status, signals: signals ?? [], comparable, description: parts.join(" · "), summary };
}

function authChanges(base: Check, head: Check, baseOrigin: string, headOrigin: string): Change[] {
  const a = authObservation(base, baseOrigin);
  const b = authObservation(head, headOrigin);
  if (a.description === b.description) return [];
  const target = a.target === b.target && b.target !== undefined ? `GET ${b.target}` : undefined;
  let kind: Change["kind"] = "inconclusive";
  if (target && a.source === b.source && a.responder === b.responder && a.status === b.status && a.comparable && b.comparable) {
    const lost = a.signals.some(s => !b.signals.includes(s));
    const gained = b.signals.some(s => !a.signals.includes(s));
    if (lost && !gained) kind = "regression";
    if (gained && !lost) kind = "improvement";
  }
  return [{ kind, target, before: a.description, after: b.description,
    evidence: { kind: "auth", before: a.summary, after: b.summary },
    verification: "Repeat the unauthenticated GET against the same operation on both deployments. Compare the challenge header, JSON error and documentation link." }];
}

function rateLimitObservation(check: Check, scannedOrigin: string) {
  const data = check.data;
  const requested = responseTarget(data?.probeUrl, false, scannedOrigin);
  const final = responseTarget(data?.responseUrl, data?.responseHasQuery, scannedOrigin);
  const httpStatus = typeof data?.httpStatus === "number" ? data.httpStatus : undefined;
  const source = data?.probeSource;
  const declared = source === "operation" && data?.method === "GET";
  const attributableStatus = httpStatus !== undefined && ((httpStatus >= 200 && httpStatus < 300) ||
    httpStatus === 401 || httpStatus === 403 || httpStatus === 429);
  const comparable = declared && data?.measurement === "measured" && check.status !== "error" &&
    requested?.startsWith("/") && requested === final && attributableStatus;
  const parts: string[] = [check.status];
  if (source === "fallback") parts.push("fallback probe");
  else if (declared) parts.push("declared operation");
  else parts.push("probe source unknown");
  if (requested) parts.push("GET " + requested);
  if (httpStatus !== undefined) parts.push("HTTP " + httpStatus);
  if (final && final !== requested) parts.push("response from " + final);
  if (!final) parts.push("final responder unverified");
  if (data?.measurement === "unmeasured") parts.push("rate limits unmeasured");
  return { requested, final, httpStatus, comparable, description: parts.join(" · ") };
}

function rateLimitChanges(a: Check, b: Check, baseOrigin: string, headOrigin: string): Change[] {
  const left = rateLimitObservation(a, baseOrigin);
  const right = rateLimitObservation(b, headOrigin);
  if (left.description === right.description) return [];
  const sameOperation = left.requested !== undefined && left.requested === right.requested;
  const matched = sameOperation && left.final === right.final && left.httpStatus === right.httpStatus &&
    left.comparable && right.comparable;
  const rank = { fail: 0, partial: 1, pass: 2, error: 0 };
  const kind = matched && a.status !== b.status ? (rank[a.status] > rank[b.status] ? "regression" : "improvement") : "inconclusive";
  return [{ kind, before: left.description, after: right.description,
    target: sameOperation ? "GET " + left.requested : undefined,
    verification: "Compare rate-limit headers on the same declared GET operation, final resource and HTTP status in both deployments." }];
}

interface DocsChannel {
  targets?: Set<string>;
  complete: boolean;
}

function docsChannel(check: Check, scannedOrigin: string, kind: "linked" | "fetched"): DocsChannel {
  const data = check.data;
  const urls = strings(kind === "linked" ? data?.linkedUrls : data?.fetchedUrls);
  const targets = urls?.map(url => targetKey(url, scannedOrigin));
  const complete = (kind === "linked" ? data?.linksMeasured : data?.fetchesComplete) === true;
  if (!targets || targets.some(key => key === undefined)) return { complete: false };
  return { targets: new Set(targets as string[]), complete };
}

function docsChanges(base: Check, head: Check, baseOrigin: string, headOrigin: string): Change[] {
  // Older reports retained coarse path labels and did not distinguish links from fetches.
  const evidenceSummary = (check: Check) => {
    const linked = strings(check.data?.linkedUrls);
    const fetched = strings(check.data?.fetchedUrls);
    if (linked && fetched) return `${linked.length} linked, ${fetched.length} fetched URLs recorded`;
    return `${check.status} (exact documentation evidence unavailable, path labels ${strings(check.data?.paths)?.join(", ") || "not recorded"})`;
  };
  if (!Array.isArray(base.data?.linkedUrls) && !Array.isArray(base.data?.fetchedUrls) ||
      !Array.isArray(head.data?.linkedUrls) && !Array.isArray(head.data?.fetchedUrls)) {
    const before = evidenceSummary(base);
    const after = evidenceSummary(head);
    const availability = (check: Check): Coverage => Array.isArray(check.data?.linkedUrls) && Array.isArray(check.data?.fetchedUrls)
      ? "evaluated" : "unavailable";
    return before === after ? [] : [{ kind: "inconclusive", before, after,
      evidence: { kind: "coverage", source: "docs", before: availability(base), after: availability(head) },
      verification: "Rescan both deployments with a version that records exact homepage links and fetched documentation URLs." }];
  }
  const changes: Change[] = [];
  for (const channel of ["linked", "fetched"] as const) {
    const a = docsChannel(base, baseOrigin, channel);
    const b = docsChannel(head, headOrigin, channel);
    const coverage = (c: DocsChannel): Coverage => !c.targets ? "unavailable" : c.complete ? "complete" : "incomplete";
    const evidence: FindingEvidence = { kind: "coverage", source: channel, before: coverage(a), after: coverage(b) };
    const verification = channel === "linked"
      ? "Inspect the homepage anchors on both deployments for this documentation URL."
      : "Repeat the documentation path probes on both deployments and check their final 2xx URLs.";
    if (!a.targets || !b.targets) {
      const summary = (c: DocsChannel, check: Check) => c.targets
        ? `${c.targets.size} ${channel} URL(s) recorded` : `${check.status} (exact ${channel} URLs unavailable)`;
      const before = summary(a, base);
      const after = summary(b, head);
      if (before !== after) changes.push({ kind: "inconclusive", before, after, verification, evidence });
      continue;
    }
    for (const target of [...new Set([...a.targets, ...b.targets])].sort()) {
      const had = a.targets.has(target);
      const has = b.targets.has(target);
      if (had === has) continue;
      const missing = (complete: boolean) => complete ? `not ${channel}` : `${channel} evidence incomplete`;
      changes.push({ kind: (had ? b.complete : a.complete) ? "inventory" : "inconclusive", target,
        evidence: { kind: "link", channel, before: had, after: has },
        before: had ? channel : missing(a.complete), after: has ? channel : missing(b.complete), verification });
    }
    if (a.complete !== b.complete && a.targets.size === b.targets.size && [...a.targets].every(key => b.targets!.has(key))) {
      const coverage = (c: DocsChannel) => `${channel} evidence ${c.complete ? "complete" : "incomplete"}`;
      changes.push({ kind: "inconclusive", before: coverage(a), after: coverage(b), verification, evidence });
    }
  }
  return changes;
}

function getCheck(report: ScanResult, bridgeId: BridgeId, id: string): Check | undefined {
  return report.bridges.find(b => b.id === bridgeId)?.checks.find(c => c.id === id);
}

function sdkLinkObservation(check: Check, scannedOrigin: string) {
  const rawLinks = strings(check.data?.packageLinks);
  const pages = strings(check.data?.packageLinkPages)?.map(url => responseTarget(url, false, scannedOrigin));
  if (!rawLinks) return;
  const links = new Set<string>();
  for (const raw of rawLinks) {
    const link = httpUrl(raw);
    if (!link || link.search || link.hash) return;
    // Registry URLs identify public package links. Keep their own scheme and host across deployments.
    links.add(link.href);
  }
  return { links, pages: new Set(pages), complete: check.status !== "error" && check.data?.packageLinksComplete === true &&
    pages !== undefined && pages.length > 0 && !pages.includes(undefined) };
}

function sdkLinkChanges(base: Check, head: Check, baseOrigin: string, headOrigin: string): Change[] {
  const a = sdkLinkObservation(base, baseOrigin);
  const b = sdkLinkObservation(head, headOrigin);
  const verification = "Inspect the HTML anchors in both homepages and fetched developer docs for this package registry URL.";
  if (!a || !b) {
    if (!a && !b) return [];
    const description = (size?: number) => size === undefined ? "Exact package links unavailable" : `${size} package links observed`;
    const coverage = (o: typeof a): Coverage => !o ? "unavailable" : o.complete ? "complete" : "incomplete";
    return [{ kind: "inconclusive", before: description(a?.links.size), after: description(b?.links.size), verification,
      evidence: { kind: "coverage", source: "package", before: coverage(a), after: coverage(b) } }];
  }
  const matched = a.complete && b.complete && a.pages.size === b.pages.size && [...a.pages].every(page => b.pages.has(page));
  const changes: Change[] = [];
  for (const target of [...new Set([...a.links, ...b.links])].sort()) {
    const had = a.links.has(target);
    if (had === b.links.has(target)) continue;
    const missing = matched ? "No link observed in the same HTML pages" : "No link observed with comparable page coverage";
    changes.push({ target, kind: matched ? "inventory" : "inconclusive",
      evidence: { kind: "link", channel: "package", before: had, after: !had },
      before: had ? "Package link observed" : missing, after: had ? missing : "Package link observed", verification });
  }
  return changes;
}

function schemaSource(report: ScanResult): string | undefined {
  const spec = getCheck(report, 2, "openapi_spec");
  if (spec?.status !== "pass") return undefined;
  return responseTarget(spec.data?.documentUrl, spec.data?.documentHasQuery, origin(report.scannedOrigin));
}

const openApiCapability = "openapi-description";
type PublishedRoutes = { contract: string; complete: boolean; catalogVerified: boolean; routes: Set<string> } | { unavailable: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publishedRoutes(check: Check, report: ScanResult, scannedOrigin: string): PublishedRoutes {
  const evidence = check.data?.routeEvidence;
  const unknown = { unavailable: "Published route evidence unavailable" };
  if (!isObject(evidence) || !Array.isArray(evidence.capabilities) || typeof evidence.complete !== "boolean") return unknown;
  const matches = evidence.capabilities.filter(cap => isObject(cap) && cap.id === openApiCapability);
  if (matches.length === 0) return { unavailable: "No independently verified OpenAPI capability recorded" };
  if (matches.length !== 1 || !Array.isArray(matches[0].routes)) return unknown;

  // The inventory lists routes to a product capability. Independently confirm it against the Standards result.
  const contract = schemaSource(report);
  if (!contract || check.status !== "pass" || contract !== responseTarget(check.data?.descriptionSource, false, scannedOrigin)) {
    return { unavailable: "Final OpenAPI document identity unverified" };
  }
  const routes = new Set<string>();
  for (const route of matches[0].routes) {
    if (!isObject(route)) return unknown;
    const source = responseTarget(route.source, false, scannedOrigin);
    const target = responseTarget(route.target, false, scannedOrigin);
    if (!source || !target) return unknown;
    routes.add(`${source} → ${target}`);
  }
  return { contract, routes, complete: evidence.complete, catalogVerified: evidence.catalogVerified === true };
}

function routeDescription(observation: PublishedRoutes, other: PublishedRoutes): string {
  if ("unavailable" in observation) return observation.unavailable;
  const count = observation.routes.size;
  const parts = [`Verified OpenAPI document ${observation.contract}`];
  if (count) {
    // Show changed routes first so a long list of surviving links cannot hide the actual change.
    const routes = [...observation.routes].sort();
    const changed = routes.filter(route => !("routes" in other) || !other.routes.has(route));
    const common = routes.filter(route => "routes" in other && other.routes.has(route));
    const sample = [...changed, ...common].slice(0, 3);
    parts.push(`${count} observed route${count === 1 ? "" : "s"}`, ...sample);
    if (sample.length < count) parts.push(`${count - sample.length} more`);
  } else {
    parts.push("No route observed in the checked entry pages");
  }
  if (!observation.complete) parts.push("route coverage incomplete");
  return parts.join(" · ");
}

function routeChanges(a: Check, b: Check, base: ScanResult, head: ScanResult, baseOrigin: string, headOrigin: string): Change[] {
  const left = publishedRoutes(a, base, baseOrigin);
  const right = publishedRoutes(b, head, headOrigin);
  let kind: Change["kind"] = "inconclusive";
  let catalogNote = "";
  if ("routes" in left && "routes" in right) {
    const sameRoutes = left.routes.size === right.routes.size && [...left.routes].every(route => right.routes.has(route));
    if (left.contract === right.contract && left.complete === right.complete && sameRoutes) return [];
    // A direct spec hit can bypass catalog discovery. Its missing result cannot disprove a previously observed catalog link.
    const catalogUnverified = left.catalogVerified && !right.catalogVerified && !right.routes.size ||
      right.catalogVerified && !left.catalogVerified && !left.routes.size;
    if (catalogUnverified) catalogNote = " One scan recorded a catalog route that the other did not reverify.";
    if (left.contract === right.contract && left.complete && right.complete && !catalogUnverified) {
      if (left.routes.size > 0 && right.routes.size === 0) kind = "regression";
      else if (left.routes.size === 0 && right.routes.size > 0) kind = "improvement";
      else kind = "inventory";
    }
  } else if ("unavailable" in left && "unavailable" in right && left.unavailable === right.unavailable) return [];
  const summary = (o: PublishedRoutes): RouteSummary => "routes" in o ? { count: o.routes.size, complete: o.complete } : null;
  return [{ kind, capabilityId: openApiCapability, target: "Discover the OpenAPI contract",
    evidence: { kind: "routes", before: summary(left), after: summary(right),
      contract: "contract" in left && "contract" in right && left.contract === right.contract ? left.contract : undefined },
    before: routeDescription(left, right), after: routeDescription(right, left),
    verification: "Look for a published link to the verified OpenAPI document on each deployment's homepage, linked developer docs and any observed API catalog." + catalogNote }];
}

const specContextChecks = new Set(["context_auth_clarity", "context_contact_info", "context_tos_url", "context_versioning_signal"]);
// These checks report their own denied request or inspect a successfully parsed document.
const independentChecks = new Set(["http_status", "https_available", "robots_txt", "llms_txt", "llms_full_txt",
  "markdown_negotiation", "security_txt", "context_agents_json", "context_auth_clarity", "context_rate_limit_headers"]);

/** Several older probes used the same fail result for a missing signal and a transport failure. */
function measuredFailure(bridge: BridgeId, check: Check, report: ScanResult): boolean {
  if (check.status !== "fail") return true;
  if (bridge === 3) {
    const docs = getCheck(report, 3, "developer_docs")?.data;
    const llms = getCheck(report, 2, "llms_txt");
    // SDK, API and webhook checks all search the homepage, docs and llms.txt.
    // Their own fail status does not record which of those sources was unreadable.
    return getCheck(report, 1, "http_status")?.status === "pass" && docs?.fetchesComplete === true &&
      llms !== undefined && llms.status !== "error" && measuredFailure(2, llms, report);
  }
  if (bridge === 4 || check.data?.policy === "fail") return true;
  if (["json_ld", "schema_org", "meta_robots", "x_robots_tag"].includes(check.id)) {
    return getCheck(report, 1, "http_status")?.status === "pass";
  }
  if (check.id === "context_auth_clarity") return schemaSource(report) !== undefined;
  const code = check.data?.statusCode;
  if (check.id === "http_status") {
    return typeof code === "number" ? code >= 400 && code <= 599 : /^HTTP [45]\d\d$/.test(check.detail ?? "");
  }
  if (check.id === "context_rate_limit_headers") return check.detail === "No rate-limit headers found in response";
  if (check.id === "markdown_negotiation") return check.detail === "No markdown content negotiation support detected";
  return (typeof code === "number" && (code === 404 || code === 410 || (code >= 200 && code < 300))) ||
    check.detail?.endsWith("(HTML response)") === true;
}

function statusChanges(bridge: BridgeResult, a: Check | undefined, b: Check | undefined, base: ScanResult, head: ScanResult): Change[] {
  if (a?.status === b?.status) return [];
  const id = (b ?? a)!.id;
  const verification = `Repeat both scans with the same settings and inspect ${id} in Bridge ${bridge.id} using --verbose.`;
  const change: Change = { kind: "inconclusive", before: describe(a), after: describe(b), verification };
  if (!a || !b || a.status === "error" || b.status === "error" || a.data?.policy === "skip" || b.data?.policy === "skip") return [change];
  // Comparing scores produced from different or incomplete inputs cannot establish what the site lost.
  if ((base.incomplete || head.incomplete) && bridge.id !== 4 && !independentChecks.has(id)) return [change];
  if (!measuredFailure(bridge.id, a, base) || !measuredFailure(bridge.id, b, head)) return [change];
  if (bridge.id === 5 && specContextChecks.has(id)) {
    const source = schemaSource(base);
    if (!source || source !== schemaSource(head)) return [change];
  }
  if (id === "standards_a2a_agent_card" || id === "context_agents_json") {
    const left = targetKey(a.data?.url, origin(base.scannedOrigin));
    const right = targetKey(b.data?.url, origin(head.scannedOrigin));
    if (!left || left !== right) return [change];
    change.target = left;
  }
  if (a.data?.probeUrl !== undefined || b.data?.probeUrl !== undefined) {
    const left = targetKey(a.data?.probeUrl, origin(base.scannedOrigin));
    const right = targetKey(b.data?.probeUrl, origin(head.scannedOrigin));
    if (!left || left !== right) return [change];
    change.target = `GET ${left}`;
  }
  const rank = { fail: 0, partial: 1, pass: 2 };
  change.kind = bridge.id === 3 ? "inventory" : rank[a.status] > rank[b.status] ? "regression" : "improvement";
  return [change];
}

function bridgeCoverage(bridge: BridgeResult, report: ScanResult): { state: Coverage; detail: string; target?: string } {
  if (bridge.status === "not_evaluated") return { state: "not evaluated", detail: "Bridge not evaluated" };
  if (bridge.id === 4) {
    const path = schemaSource(report);
    return path ? { state: "schema verified", detail: "OpenAPI schema evaluated at " + path, target: path } :
      { state: "schema unverified", detail: "No verified parsed OpenAPI source" };
  }
  return { state: "evaluated", detail: "Bridge evaluated" };
}

/** Compare observations offline. Scores, timings, prose-only changes and result ordering are ignored. */
export function compareReports(base: ScanResult, head: ScanResult, options: DiffOptions = {}): ReportDiff {
  if (base.version !== head.version) throw new Error("Reports have different scanner versions. Rescan both with the same Milieu version.");
  const baseOrigin = origin(base.scannedOrigin);
  const headOrigin = origin(head.scannedOrigin);
  if (options.originMap) {
    if (origin(options.originMap.base) !== baseOrigin || origin(options.originMap.head) !== headOrigin)
      throw new Error("Origin mapping must match the exact base and head report origins, in that order.");
  } else if (baseOrigin !== headOrigin) {
    throw new Error("Reports have different scan origins. Provide an explicit origin mapping for equivalent deployments.");
  }
  const findings: DiffFinding[] = [];
  for (const left of [...base.bridges].sort((a, b) => a.id - b.id)) {
    const right = head.bridges.find(b => b.id === left.id)!;
    const leftCoverage = bridgeCoverage(left, base);
    const rightCoverage = bridgeCoverage(right, head);
    const before = leftCoverage.detail;
    const after = rightCoverage.detail;
    const coverage: FindingEvidence = { kind: "coverage", source: "bridge", before: leftCoverage.state, after: rightCoverage.state,
      beforeTarget: leftCoverage.target, afterTarget: rightCoverage.target };
    const bridge = { bridgeId: left.id, bridgeName: left.name };
    if (before !== after) {
      findings.push({ ...bridge, kind: "inconclusive", checkId: null, label: left.name, before, after,
        evidence: coverage,
        verification: left.id === 4 ? "Confirm both scans parsed the same OpenAPI document, then compare its schema checks."
          : "Rerun both scans with reachable deployments and sufficient request budgets." });
      continue;
    }
    if (left.status !== "evaluated") continue;
    const a = new Map(left.checks.map(c => [c.id, c]));
    const b = new Map(right.checks.map(c => [c.id, c]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const baseCheck = a.get(id);
      const headCheck = b.get(id);
      if (left.id === 4 && !schemaSource(base)) {
        if (baseCheck?.status !== headCheck?.status) {
          findings.push({ ...bridge, checkId: null, label: left.name, kind: "inconclusive",
            evidence: coverage,
            before: `${before} (${id} reported ${baseCheck?.status ?? "unknown"})`,
            after: `${after} (${id} reported ${headCheck?.status ?? "unknown"})`,
            verification: "Rescan both deployments with a scanner that records the final URL of the parsed OpenAPI document." });
          break;
        }
        continue;
      }
      let changes: Change[];
      if (baseCheck && headCheck && left.id === 5 && id === "context_rate_limit_headers") {
        changes = rateLimitChanges(baseCheck, headCheck, baseOrigin, headOrigin);
      } else if (baseCheck && headCheck && left.id === 5 && id === "context_auth_legibility") {
        changes = authChanges(baseCheck, headCheck, baseOrigin, headOrigin);
      } else if (baseCheck && headCheck && left.id === 3 && id === "developer_docs") {
        changes = docsChanges(baseCheck, headCheck, baseOrigin, headOrigin);
      } else if (baseCheck && headCheck && left.id === 3 && id === "sdk_references") {
        changes = sdkLinkChanges(baseCheck, headCheck, baseOrigin, headOrigin);
        if (changes.length === 0) changes = statusChanges(left, baseCheck, headCheck, base, head);
      } else {
        changes = statusChanges(left, baseCheck, headCheck, base, head);
        if (baseCheck && headCheck && left.id === 3 && id === "api_presence") {
          changes.push(...routeChanges(baseCheck, headCheck, base, head, baseOrigin, headOrigin));
        }
      }
      for (const change of changes) findings.push({ ...bridge, checkId: id, label: (headCheck ?? baseCheck)!.label,
        evidence: { kind: "status", before: baseCheck?.status ?? null, after: headCheck?.status ?? null }, ...change });
    }
  }
  return { version: base.version, baseOrigin, headOrigin, baseIncomplete: base.incomplete, headIncomplete: head.incomplete, findings };
}
