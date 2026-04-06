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
    fail: "Without robots.txt, AI agents have no guidance on what they can access — most default to cautious behavior and skip your product surface.",
    partial: "Your robots.txt exists but may not provide clear guidance to AI agents.",
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
    partial: "Your llms.txt exists but may not follow the expected format for optimal AI consumption.",
    default: "llms.txt provides a structured overview of your product surface purpose-built for large language models.",
  },
  llms_full_txt: {
    pass: "Your llms-full.txt gives AI agents comprehensive content for deep understanding.",
    fail: "Without llms-full.txt, AI agents only have the summary from llms.txt — they lack the depth needed for detailed answers about your product.",
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
    pass: "Your WebMCP discovery endpoint lets browser-based AI agents find and connect to your MCP server automatically.",
    fail: "Without a WebMCP discovery endpoint, browser-based AI agents can't auto-discover your MCP server.",
    default: "WebMCP (/.well-known/mcp.json) is the emerging standard for browser-based MCP server discovery.",
  },
  standards_a2a_agent_card: {
    pass: "Your A2A Agent Card lets other AI agents discover your agent's capabilities and connect via Google's A2A protocol.",
    fail: "Without an A2A Agent Card, other AI agents can't discover or connect to your service via the A2A protocol.",
    default: "A2A Agent Cards (/.well-known/agent.json) enable agent-to-agent discovery using Google's A2A protocol.",
  },
  standards_content_negotiation: {
    pass: "Your server returns markdown when requested — AI agents get clean, structured content instead of parsing HTML.",
    partial: "Your server returns a different content type for markdown Accept headers, but not markdown itself.",
    fail: "Your server returns the same HTML regardless of Accept headers — AI agents must parse raw HTML.",
    default: "Content negotiation lets AI agents request clean formats like markdown instead of HTML.",
  },

  // Bridge 4: Schema
  schema_operation_ids: {
    pass: "Every API operation has an operationId — agents can call each endpoint by name like a function.",
    partial: "Most operations have operationIds, but some are missing — agents may not discover all callable endpoints.",
    fail: "Operations are missing operationIds — agents can't reliably map spec endpoints to callable functions.",
    default: "operationId is the field agents use as the function name when calling your API endpoints.",
  },
  schema_types_defined: {
    pass: "All request and response schemas have types defined — agents know exactly what to send and expect back.",
    partial: "Most schemas have types, but some are missing — agents may guess payload structure for untyped endpoints.",
    fail: "Schemas lack type definitions — agents can't construct valid requests or validate responses.",
    default: "Schema types (type or $ref) tell agents the exact structure of request and response payloads.",
  },
  schema_error_responses: {
    pass: "All 4xx error responses have structured body schemas — agents can programmatically handle errors.",
    partial: "Some error responses have schemas, but not all — agents may struggle with unstructured errors.",
    fail: "No 4xx error responses define body schemas — agents get HTML error pages instead of structured data.",
    default: "Structured error response schemas let agents detect, classify, and recover from API errors automatically.",
  },
  schema_required_fields: {
    pass: "Request schemas declare which fields are required — agents know exactly what's mandatory.",
    partial: "Some request schemas declare required fields, but others leave agents guessing.",
    fail: "Request schemas don't declare required fields — agents must guess which fields are mandatory.",
    default: "The required array in request schemas tells agents which fields must be included in API calls.",
  },
  schema_descriptions: {
    pass: "Parameters and properties have descriptions — agents understand what each field means.",
    partial: "Some fields have descriptions but many are missing — agents may misinterpret field purposes.",
    fail: "Fields lack descriptions — agents have no context for what parameters and properties mean.",
    default: "Field descriptions are the primary way agents understand what each parameter and property does.",
  },
  schema_consistent_error_format: {
    pass: "Your live API returns structured JSON errors with standard keys — agents can parse and handle failures.",
    partial: "Your API returns JSON errors but without standard error/message/code keys — agents may struggle to classify failures.",
    fail: "Your API returns non-JSON errors (HTML or plain text) — agents can't programmatically handle failures.",
    default: "Consistent JSON error responses let agents detect, classify, and recover from API errors automatically.",
  },

  // Bridge 5: Context
  context_rate_limit_headers: {
    pass: "Rate-limit headers tell agents their usage budget — they can throttle requests automatically to avoid being blocked.",
    partial: "Retry-after header found but no rate ceiling — agents know when to retry but not their total budget.",
    fail: "No rate-limit headers — agents can't self-throttle and risk being blocked for excessive requests.",
    default: "Rate-limit headers (ratelimit-limit, x-ratelimit-limit) let agents manage their API usage budget.",
  },
  context_auth_clarity: {
    pass: "Auth schemes are fully documented and applied — agents know exactly how to authenticate.",
    partial: "Auth schemes exist but are incompletely documented or not applied to operations.",
    fail: "No auth schemes defined — agents can't determine how to authenticate with your API.",
    default: "Clear auth documentation with descriptions and applied security lets agents authenticate correctly.",
  },
  context_tos_url: {
    pass: "Terms of Service URL is in your spec — agents and their operators can review usage terms programmatically.",
    partial: "Terms of Service URL found in llms.txt but not in the spec itself.",
    fail: "No Terms of Service URL found — agents and operators can't programmatically verify usage terms.",
    default: "A Terms of Service URL lets agents and their operators verify they're allowed to use your API.",
  },
  context_versioning_signal: {
    pass: "Clear API versioning detected — agents can target a stable version and avoid breaking changes.",
    partial: "Spec declares a version but no path or header versioning — agents may not be able to pin to a version.",
    fail: "No versioning signal found — agents can't determine which API version they're using.",
    default: "API versioning (path, header, or spec version) lets agents target stable endpoints and avoid breaking changes.",
  },
  context_ai_policy: {
    pass: "AI usage policy signals found — agents and operators can determine permitted use cases.",
    partial: "Limited AI policy information available — agents may not have full clarity on permitted use.",
    fail: "No AI usage policy found — agents and operators can't determine whether automated use is permitted.",
    default: "An AI usage policy tells agents and operators what's allowed: training, commercial use, automated access.",
  },
  context_contact_info: {
    pass: "Contact information in the spec lets agents' operators reach you for support or issue reporting.",
    fail: "No contact info in the spec — agents' operators have no way to reach you programmatically.",
    default: "Contact information (email or URL) lets agents' operators reach you for API support.",
  },
  context_agents_json: {
    pass: "agents.json found — agents can discover your service's agent-specific capabilities and policies.",
    partial: "agents.json endpoint exists but returns invalid JSON.",
    fail: "No agents.json found — agents have no standard way to discover your agent-specific policies.",
    default: "agents.json (/.well-known/agents.json) provides agent-specific discovery and capability information.",
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
