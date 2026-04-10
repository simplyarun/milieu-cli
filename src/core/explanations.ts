import type { CheckStatus } from "./types.js";

/** An explanation can be a plain string or status-dependent */
export type ExplanationEntry =
  | string
  | Partial<Record<CheckStatus | "default", string>>;

/** Static explanations for why each check matters for AI agent readiness */
export const CHECK_EXPLANATIONS: Record<string, ExplanationEntry> = {
  // Bridge 1: Reachability
  https_available:
    "HTTPS is required for secure communication. AI agents refuse to interact with insecure endpoints.",
  http_status: {
    pass: "Your product surface returns a clean 200 response — agents can reach your content without issues.",
    fail: "Agents can't reach your content. Non-200 responses block automated workflows entirely.",
    partial: "Redirects add latency and may break automated agent workflows.",
    default: "A non-200 status means agents can't reliably reach your content.",
  },
  robots_txt: {
    pass: "Your robots.txt gives AI agents clear crawling guidance.",
    fail: "Without robots.txt, AI agents have no guidance on what they can access — most default to cautious behavior and skip your product surface. Note: robots.txt is per-origin (RFC 9309), so a parent domain's robots.txt does not apply to subdomains.",
    partial: "Your robots.txt exists but may not provide clear guidance to AI agents. Note: robots.txt is per-origin (RFC 9309) — only the scanned domain's robots.txt is evaluated.",
    default: "robots.txt tells AI agents what they're allowed to crawl on your product surface.",
  },
  crawler_policy_gptbot: {
    pass: "GPTBot can access your content — it will be available to ChatGPT and OpenAI's APIs.",
    fail: "Blocking GPTBot prevents your content from being used by ChatGPT and OpenAI's APIs.",
    partial: "GPTBot has restricted access — some of your content may not reach ChatGPT and OpenAI's APIs.",
    default: "GPTBot is OpenAI's crawler. Its policy determines your visibility in the OpenAI ecosystem.",
  },
  crawler_policy_claudebot: {
    pass: "ClaudeBot can access your content — it will be available to Claude.",
    fail: "Blocking ClaudeBot prevents your content from being accessible to Claude.",
    partial: "ClaudeBot has restricted access — some of your content may not be accessible to Claude.",
    default: "ClaudeBot is Anthropic's crawler. Its policy determines your visibility to Claude.",
  },
  crawler_policy_ccbot: {
    pass: "CCBot can access your content — it will be included in the Common Crawl open dataset used to train AI models.",
    fail: "Blocking CCBot removes your content from the largest open web dataset used to train AI models.",
    partial: "CCBot has restricted access — some of your content may be excluded from AI training datasets.",
    default: "CCBot is Common Crawl's bot. Its policy affects whether your content appears in AI training data.",
  },
  crawler_policy_googlebot: {
    pass: "Googlebot can access your content — it will appear in Google Search and Gemini.",
    fail: "Blocking Googlebot removes your content from Google Search results and Gemini.",
    partial: "Googlebot has restricted access — some of your content may not appear in Google Search or Gemini.",
    default: "Googlebot powers Google Search and AI features. Its policy determines your Google visibility.",
  },
  crawler_policy_bingbot: {
    pass: "Bingbot can access your content — it will appear in Bing Search and Microsoft Copilot.",
    fail: "Blocking Bingbot removes your content from Bing Search and Microsoft Copilot.",
    partial: "Bingbot has restricted access — some of your content may not appear in Bing or Copilot.",
    default: "Bingbot powers Bing Search and Microsoft Copilot. Its policy determines your Microsoft AI visibility.",
  },
  crawler_policy_perplexitybot: {
    pass: "PerplexityBot can access your content — it will appear in Perplexity AI search answers.",
    fail: "Blocking PerplexityBot prevents your content from appearing in AI-powered search answers.",
    partial: "PerplexityBot has restricted access — some of your content may not appear in Perplexity answers.",
    default: "PerplexityBot powers Perplexity AI search. Its policy affects your visibility in AI search.",
  },
  meta_robots:
    "Meta robots tags can override robots.txt — preventing AI agents from indexing or following links even when crawling is allowed.",
  x_robots_tag:
    "X-Robots-Tag headers apply indexing restrictions at the server level, affecting all AI agents regardless of page content.",

  // Bridge 2: Standards
  markdown_negotiation: {
    pass: "Your server returns markdown via content negotiation — AI agents get clean, token-efficient content instead of parsing HTML.",
    fail: "Your server doesn't support markdown content negotiation — AI agents must parse raw HTML, using ~5x more tokens.",
    partial: "Your server signals AI content permissions but doesn't return markdown — agents know they're welcome but still get HTML.",
    default: "Markdown content negotiation (Accept: text/markdown) lets AI agents request clean, token-efficient content instead of HTML.",
  },
  sitemap: {
    pass: "Your XML sitemap helps AI agents discover all your pages and API resources efficiently without crawling.",
    fail: "Without a sitemap, AI agents must crawl your product surface blindly — they may miss important pages and API resources.",
    partial: "Your sitemap exists but contains no URLs — AI agents can't use it to discover your content.",
    default: "An XML sitemap gives AI agents a complete map of your pages and resources.",
  },
  graphql_endpoint: {
    pass: "Your GraphQL endpoint with introspection lets AI agents discover your entire API schema and build queries automatically.",
    fail: "No GraphQL endpoint found — if you offer a GraphQL API, AI agents can't discover it.",
    partial: "A GraphQL endpoint was detected but introspection is disabled or requires authentication — AI agents know it exists but can't discover the schema.",
    default: "A GraphQL endpoint with introspection enabled lets AI agents explore your API schema and construct queries without documentation.",
  },
  openapi_spec: {
    pass: "Your OpenAPI spec lets AI agents discover and correctly call your API endpoints automatically.",
    fail: "Without an OpenAPI spec, AI agents can't discover or correctly call your endpoints — they're locked out of programmatic access.",
    partial: "Your OpenAPI spec was detected but may not be fully parseable by AI agents.",
    default: "An OpenAPI spec is the machine-readable contract that lets AI agents use your API.",
  },
  llms_txt: {
    pass: "Your llms.txt helps AI agents understand what your product surface offers without crawling every page.",
    fail: "Without llms.txt, AI agents must crawl your entire product surface to understand what you offer — most won't bother.",
    partial: "Your llms.txt exists but may lack structured sections or links — AI agents get limited navigational value without these.",
    default: "llms.txt provides a structured overview of your product surface purpose-built for large language models.",
  },
  llms_full_txt: {
    pass: "Your llms-full.txt gives AI agents comprehensive content for deep understanding.",
    fail: "Without llms-full.txt, AI agents only have the summary from llms.txt — they lack the depth needed for detailed answers about your product.",
    partial: "Your llms-full.txt exists but is very short — AI agents need more comprehensive content for deep understanding.",
    default: "llms-full.txt provides comprehensive product content that gives AI agents deep context beyond the llms.txt summary.",
  },
  mcp_endpoint: {
    pass: "Your MCP endpoint lets AI agents connect to your service as a tool — the emerging standard for AI-to-service integration.",
    fail: "Without an MCP endpoint, AI agents can't integrate with your service as a tool provider.",
    default: "MCP (Model Context Protocol) is the emerging standard for AI agents to connect with services as tools.",
  },
  json_ld: {
    pass: "Your JSON-LD lets AI agents extract structured entities, relationships, and attributes from your pages.",
    fail: "Without JSON-LD, AI agents can only read your text — they can't extract structured meaning from your content.",
    default: "JSON-LD structured data helps AI agents understand what your content means, not just what it says.",
  },
  schema_org: {
    pass: "Your Schema.org markup gives AI agents a shared vocabulary to extract structured data from your pages.",
    fail: "Without Schema.org markup, AI agents lack a standard vocabulary for understanding your content's structure.",
    default: "Schema.org provides the shared vocabulary AI agents use to interpret structured data on your pages.",
  },
  security_txt:
    "security.txt tells AI agents and automated systems how to report security issues. Its presence signals operational maturity.",
  standards_webmcp: {
    pass: "Your WebMCP endpoint lets AI agents discover available tools and capabilities at a well-known URL.",
    fail: "No WebMCP endpoint found — AI agents can't discover your MCP tools via the standard /.well-known/mcp.json path.",
    default: "WebMCP (/.well-known/mcp.json) is the emerging standard for AI agents to discover MCP tool providers.",
  },
  standards_a2a_agent_card: {
    pass: "Your A2A Agent Card lets other AI agents discover your agent's capabilities and communication protocols.",
    fail: "No A2A Agent Card found — other AI agents can't discover your agent at /.well-known/agent.json.",
    default: "The A2A Agent Card (/.well-known/agent.json) is Google's standard for agent-to-agent capability discovery.",
  },

  // Bridge 3: Separation
  api_presence: {
    pass: "AI agents can see that your product has a programmatic interface — they'll attempt to integrate with it.",
    fail: "Without API presence signals, AI agents treat your product surface as content-only — they won't attempt programmatic integration.",
    default: "API presence signals tell AI agents your product has a programmatic interface, not just web pages.",
  },
  developer_docs: {
    pass: "Your developer documentation gives AI agents the information they need to build integrations with your product.",
    fail: "Without developer documentation, AI agents can't learn how to integrate with your product.",
    default: "Developer documentation is where AI agents learn how to build integrations with your product.",
  },
  sdk_references: {
    pass: "AI agents can see which languages your API supports and how to install the client libraries.",
    fail: "Without SDK references, AI agents can't determine which languages you support or how to install your client libraries.",
    default: "SDK and package references tell AI agents which languages your API supports and how to get started.",
  },
  webhook_support: {
    pass: "AI agents can see your webhook support — they'll build reactive workflows that respond to your events in real-time.",
    fail: "No webhook signals found in your OpenAPI spec, standards headers, or documentation — AI agents must poll your API for changes.",
    default: "Webhooks enable AI agents to receive real-time events instead of polling your API.",
  },

  // Bridge 4: Schema
  schema_operation_ids: {
    pass: "All operations have operationId — agents can map every API capability to a callable function.",
    fail: "Operations lack operationId — agents cannot reliably reference or call your API endpoints by name.",
    default: "operationId is the machine-readable function name that AI agents use to call your API endpoints.",
  },
  schema_types_defined: {
    pass: "All request/response schemas have type or $ref — agents can construct valid payloads.",
    fail: "Schemas lack type definitions — agents cannot determine the shape of data to send or expect.",
    default: "Typed schemas tell AI agents exactly what data structures your API accepts and returns.",
  },
  schema_error_responses: {
    pass: "Error responses have structured schemas — agents can programmatically handle failures.",
    fail: "Error responses lack schemas — agents cannot distinguish or handle different failure modes.",
    default: "Structured error schemas let AI agents understand and recover from API failures automatically.",
  },
  schema_required_fields: {
    pass: "Request schemas declare required fields — agents know exactly which parameters are mandatory.",
    fail: "Request schemas don't declare required fields — agents must guess which parameters are mandatory.",
    default: "The required field array tells AI agents which parameters they must provide vs. which are optional.",
  },
  schema_descriptions: {
    pass: "Fields and parameters have descriptions — agents understand what each value means.",
    fail: "Fields lack descriptions — agents must infer parameter meaning from names alone.",
    partial: "Some fields have descriptions but coverage is incomplete — agents have partial context.",
    default: "Field descriptions are the documentation AI agents read to understand how to use each parameter.",
  },

  // Bridge 5: Context
  context_rate_limit_headers: {
    pass: "Rate-limit headers present — agents can pace requests and avoid throttling.",
    fail: "No rate-limit headers found — agents must guess at request limits and risk being throttled.",
    default: "Rate-limit headers (X-RateLimit-Limit, Retry-After) tell AI agents how fast they can call your API.",
  },
  context_auth_clarity: {
    pass: "Security schemes are clearly documented and applied — agents know exactly how to authenticate.",
    fail: "No security schemes documented — agents cannot determine how to authenticate with your API.",
    partial: "Security schemes exist but lack descriptions or aren't applied to operations.",
    default: "securitySchemes in the OpenAPI spec tell AI agents which authentication method to use and how.",
  },
  context_auth_legibility: {
    pass: "Auth rejection responses guide agents toward successful authentication with structured errors and documentation links.",
    fail: "Auth rejection returns no guidance — agents cannot determine how to authenticate from the error response.",
    partial: "Auth rejection provides some guidance but is missing key signals (WWW-Authenticate, JSON body, or docs URL).",
    default: "When an AI agent's first unauthenticated request is rejected, the quality of that rejection determines whether the agent can self-onboard.",
  },
  context_tos_url: {
    pass: "Terms of Service URL found — agents can check usage policies before integration.",
    fail: "No Terms of Service URL found — agents cannot verify whether automated access is permitted.",
    default: "A Terms of Service URL lets AI agents (and their operators) verify that API usage is authorized.",
  },
  context_versioning_signal: {
    pass: "API versioning detected — agents can target a stable API version.",
    fail: "No versioning signal found — agents cannot determine which API version they're using.",
    partial: "Version found in spec metadata but not in URL paths or response headers.",
    default: "Versioning signals help AI agents target a stable API version and detect breaking changes.",
  },
  context_contact_info: {
    pass: "Contact info found in spec — agents (or their operators) have a way to report issues.",
    fail: "No contact info in spec — there's no programmatic way for agents to discover support channels.",
    default: "Contact info in the spec gives AI agent operators a way to report integration issues.",
  },
  context_agents_json: {
    pass: "agents.json found — agents can discover your agent interaction policies.",
    fail: "No agents.json found at /.well-known/agents.json.",
    default: "agents.json at /.well-known/ defines policies for how AI agents should interact with your service.",
  },
};

/**
 * Resolve the explanation for a check given its ID and status.
 * Falls back: status-specific → "default" key → plain string → undefined.
 */
export function resolveExplanation(
  checkId: string,
  status: CheckStatus,
): string | undefined {
  const entry = CHECK_EXPLANATIONS[checkId];
  if (entry === undefined) return undefined;
  if (typeof entry === "string") return entry;
  return entry[status] ?? entry.default;
}
