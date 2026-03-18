# External Integrations

**Analysis Date:** 2026-03-17

## APIs & External Services

**No Third-Party APIs**
- This tool uses no external APIs or SaaS integrations
- All content analysis performed locally on fetched web pages
- No API keys, authentication tokens, or service credentials required

## Data Storage

**Databases:**
- Not applicable - CLI tool with no data persistence

**File Storage:**
- Local filesystem only - Output to stdout (terminal or JSON)
- No remote file storage or CDN dependencies

**Caching:**
- None - No caching layer (each run fetches fresh content)

## Authentication & Identity

**Auth Provider:**
- None - No authentication required

## Monitoring & Observability

**Error Tracking:**
- None - Errors logged to stderr only

**Logs:**
- Console-based - stdout for normal output, stderr for errors
- No centralized logging service

## CI/CD & Deployment

**Hosting:**
- npm registry (published package)
- GitHub repository

**CI Pipeline:**
- None detected - No GitHub Actions or CI configuration found

## Environment Configuration

**Required env vars:**
- None - Tool requires no environment variables

**Secrets location:**
- Not applicable - No secrets or credentials needed

## Web Requests & Content Analysis

**HTTP Requests:**
The tool makes HTTP(S) requests to analyze target websites. Implementation: `src/checks/fetch-utils.ts`

**Request Characteristics:**
- User-Agent: `milieu-content-score/0.1 (+https://github.com/simplyarun/milieu-content-score)`
- Protocol: HTTPS by default, HTTP for HTTPS enforcement checks
- Timeout: 5 seconds per request
- Retry strategy: Up to 3 attempts with exponential backoff
- Rate limiting: 1500ms backoff for 429 status codes, honors Retry-After header

**Targets by Check:**

**Robots.txt Check** (`src/checks/robots.ts`):
- Endpoint: `https://{domain}/robots.txt`
- Parses directives for AI crawler agents: GPTBot, ChatGPT-User, ClaudeBot, Claude-Web, Anthropic, Google-Extended, PerplexityBot, CCBot, Bytespider, Amazonbot, FacebookBot, Applebot-Extended

**Sitemap Check** (`src/checks/sitemap.ts`):
- Endpoints:
  - `https://{domain}/sitemap.xml`
  - `https://{domain}/sitemap.xml.gz` (auto-decompressed)
  - Falls back to www subdomain and robots.txt Sitemap directive
- Handles sitemap index files and child sitemaps
- Identifies AI-relevant URLs (docs, API, MCP, GraphQL, OpenAPI, etc.)

**llms.txt Check** (`src/checks/llms-txt.ts`):
- Paths checked:
  - `/llms.txt`
  - `/llms-full.txt`
  - `/.well-known/llms.txt`
- Probed across main domain + common subdomains: www, docs, developer, developers, api
- Parses markdown links for AI-relevant resource discovery

**Schema Markup Check** (`src/checks/schema-markup.ts`):
- Endpoint: `https://{domain}/` (homepage)
- Analyzes HTML for:
  - JSON-LD structured data (schema.org types)
  - Open Graph meta tags
  - Twitter Card meta tags
  - Canonical URLs
  - Heading hierarchy and ARIA landmarks
  - Image alt text coverage
  - RSS/Atom/JSON feeds
  - Content freshness signals (timestamps, authorship)

**HTTP Health Check** (`src/checks/http-health.ts`):
- Endpoint: `https://{domain}/` (homepage)
- HTTP version: Plain HTTP request to check HTTPS enforcement
- Analyzes:
  - HTTPS enforcement (HTTP → HTTPS redirects)
  - JavaScript-free content (text extraction)
  - SPA framework detection (Next.js, React, Vue, Angular markers)
  - Viewport meta tag
  - Robots meta noindex directives
  - Time to First Byte (TTFB)
  - Page size and text-to-HTML ratio

## Subdomains Checked

**Common Documentation/API Subdomains** (`src/checks/subdomains.ts`):
- `docs.{domain}`
- `developer.{domain}`
- `developers.{domain}`
- `api.{domain}`
- `www.{domain}` (fallback)

## Security & SSRF Protection

**SSRF Protections** (`src/checks/fetch-utils.ts`):
- Blocklist: localhost, 127.0.0.1, 0.0.0.0, ::1, metadata.google.internal
- Blocks all RFC-1918 private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Blocks link-local ranges (169.254.0.0/16 - AWS IMDS)
- Blocks .internal, .local, .localhost TLDs
- Blocks numeric IPs and non-standard IP formats
- Redirect validation: Each redirect hop validated against blocklist

**Bot Protection Detection:**
- Detects WAF/bot protection blocking (403 status, challenge pages)
- Signatures: PerimeterX, DataDome, Imperva, Incapsula, Akamai, Cloudflare challenges
- Returns `blockedByBotProtection` flag in results for partial credit scoring

## No External Service Dependencies

The following are NOT integrated:
- ✓ No database connections
- ✓ No cache services (Redis, Memcached)
- ✓ No search engines
- ✓ No email services
- ✓ No payment processors
- ✓ No analytics platforms
- ✓ No CDN services
- ✓ No SaaS monitoring tools

---

*Integration audit: 2026-03-17*
