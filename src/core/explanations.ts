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
    pass: "Your site returns a clean 200 response — agents can reach your content without issues.",
    fail: "Agents can't reach your content. Non-200 responses block automated workflows entirely.",
    partial: "Redirects add latency and may break automated agent workflows.",
    default: "A non-200 status means agents can't reliably reach your content.",
  },
  robots_txt: {
    pass: "Your robots.txt gives AI agents clear crawling guidance.",
    fail: "Without robots.txt, AI agents have no guidance on what they can access — most default to cautious behavior and skip your site.",
    partial: "Your robots.txt exists but may not provide clear guidance to AI agents.",
    default: "robots.txt tells AI agents what they're allowed to crawl on your site.",
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
  sitemap: {
    pass: "Your XML sitemap helps AI agents discover all your pages and API resources efficiently without crawling.",
    fail: "Without a sitemap, AI agents must crawl your site blindly — they may miss important pages and API resources.",
    partial: "Your sitemap exists but contains no URLs — AI agents can't use it to discover your content.",
    default: "An XML sitemap gives AI agents a complete map of your site's pages and resources.",
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
    pass: "Your llms.txt helps AI agents understand what your site offers without crawling every page.",
    fail: "Without llms.txt, AI agents must crawl your entire site to understand what you offer — most won't bother.",
    partial: "Your llms.txt exists but may not follow the expected format for optimal AI consumption.",
    default: "llms.txt provides a structured overview of your site purpose-built for large language models.",
  },
  llms_full_txt: {
    pass: "Your llms-full.txt gives AI agents comprehensive content for deep understanding.",
    fail: "Without llms-full.txt, AI agents only have the summary from llms.txt — they lack the depth needed for detailed answers about your product.",
    default: "llms-full.txt provides comprehensive site content that gives AI agents deep context beyond the llms.txt summary.",
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
  ai_plugin: {
    pass: "Your ai-plugin.json lets ChatGPT and compatible AI agents discover and use your API as a plugin.",
    fail: "Without ai-plugin.json, ChatGPT and compatible AI agents can't discover your API as a plugin.",
    default: "ai-plugin.json is the manifest that lets AI agents like ChatGPT use your API as a plugin.",
  },

  // Bridge 3: Separation
  api_presence: {
    pass: "AI agents can see that your product has a programmatic interface — they'll attempt to integrate with it.",
    fail: "Without API presence signals, AI agents treat your site as content-only — they won't attempt programmatic integration.",
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
