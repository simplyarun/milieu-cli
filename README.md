# Milieu Content Score CLI

Score how well your website's content is prepared for AI agents and LLMs.

Runs 5 deterministic checks against any public URL and outputs a content readiness score normalized to **0–100**. No AI, no API keys, no config, no dependencies. Just point it at a domain. Same site, same score, every time. Limitation: since the checks run on the home page, some of the results, such as schema, may not make sense because they are more apt on other pages for most sites.

## Quick start

```bash
npx milieu-content-score stripe.com
```

## Example output

```
  milieu content score · stripe.com

  Schema Markup                                 6/10
    ✓ Has structured data (schema.org)
    ✗ Has action types
    ✓ OG tags complete
    ✓ Canonical URL
    ✓ Heading hierarchy + ARIA
    ✗ Authorship or timestamps
    ✗ Question headings / AI schema types
    ✗ Content freshness
    ✗ RSS/Atom/JSON feeds
    ✗ Image alt coverage ≥80%

  llms.txt                                      5/10
    ✓ Has llms.txt
    ✓ Well-structured
    ✗ Has llms-full.txt

  robots.txt                                     6/6
    ✓ Has robots.txt
    ✓ Allows ≥3 AI crawlers

  Sitemap                                        2/2
    ✓ Has XML sitemap
    ✓ 50+ entries

  HTTP Health                                    2/2
    ✓ HTTPS enforced
    ✓ JS-free content

  ─────────────────────────────────────────────
  Content Score                               70/100
```

## JSON output

```bash
npx milieu-content-score stripe.com --json
```

Returns structured JSON with per-check scores and individual signal results — useful for CI pipelines, dashboards, or programmatic analysis.

## What it checks

| Check | Max pts | What it looks for |
|-------|---------|-------------------|
| **Schema Markup** | 10 | Structured data (JSON-LD, microdata), action types, OG tags, canonical URLs, heading hierarchy, ARIA landmarks, authorship, content freshness, RSS feeds, image alt coverage |
| **llms.txt** | 10 | Presence of `/llms.txt`, structural quality (H1 + H2s), and `/llms-full.txt` |
| **robots.txt** | 6 | Presence of robots.txt and whether key AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are allowed |
| **Sitemap** | 2 | XML sitemap exists with 50+ entries |
| **HTTP Health** | 2 | HTTPS enforcement and server-rendered (JS-free) content |

Raw points (out of 30) are normalized to a **0–100 scale**.

## Why this matters

AI agents and LLMs are increasingly crawling and consuming web content. Sites that are well-structured, machine-readable, and AI-crawler-friendly get better representation in AI-generated answers, tool integrations, and agent workflows.

This tool gives you a quick baseline of where your site stands.

## Requirements

- Node.js 18+

## License

Apache-2.0
