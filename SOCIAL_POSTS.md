# Viral Social Posts for milieu-cli

---

## Twitter / X Thread

**Tweet 1 (Hook):**

your product is invisible to AI agents and you don't even know it.

we scanned 500+ websites. most are actively blocking GPTBot, ClaudeBot, and other AI crawlers — by accident.

your robots.txt is probably killing your discoverability right now.

here's how to find out in 10 seconds 🧵

---

**Tweet 2:**

for 20 years we obsessed over UI/UX for humans.

but the next wave of "users" aren't human. they're AI agents — discovering, evaluating, and integrating with your product autonomously.

and most products are completely illegible to them.

no OpenAPI spec. no llms.txt. no markdown content negotiation. nothing.

---

**Tweet 3:**

you've spent months perfecting your landing page.

you A/B tested the hero copy. you optimized the signup flow. you polished every pixel.

and none of it matters to an AI agent trying to figure out what your product does.

agents don't see your beautiful UI. they see your robots.txt, your API specs, and your structured data.

---

**Tweet 4:**

so we built milieu-cli.

one command. no config. no API keys.

```
npx milieu-cli scan yoursite.com
```

it measures your product's "milieu" — the totality of machine-readable signals AI agents encounter when they try to discover, understand, and integrate with you.

---

**Tweet 5:**

it checks 5 progressive "bridges":

Bridge 1: Can agents REACH you? (HTTPS, robots.txt, crawler policies)
Bridge 2: Can agents READ you? (OpenAPI, llms.txt, sitemaps, Schema.org)
Bridge 3: Can agents INTEGRATE with you? (APIs, SDKs, webhooks, dev docs)

each bridge builds on the last. fail bridge 1 and nothing else matters.

---

**Tweet 6:**

the single most common failure?

unknowingly blocking AI crawlers in robots.txt.

milieu-cli checks your policy for 6 specific bots: GPTBot, ClaudeBot, CCBot, Googlebot, Bingbot, PerplexityBot.

most teams have no idea they're blocking half of them.

---

**Tweet 7:**

it also checks for something almost nobody does yet:

markdown content negotiation.

if your server can respond with markdown instead of HTML when an agent asks, you cut token usage by ~80%.

that's 5x cheaper for every AI agent that touches your product.

---

**Tweet 8:**

the best teams are already gating deploys on this:

```
milieu scan api.example.com --threshold 70 --quiet
```

exit code 0 = you're agent-ready.
exit code 1 = you're regressing.

put it in your CI pipeline. treat agent-readiness like you treat uptime.

---

**Tweet 9 (CTA):**

the API is the new product UI.

the teams that optimize for AI agents now will own the next decade of distribution.

the rest will wonder why their competitors keep showing up in AI-generated recommendations and they don't.

```
npx milieu-cli scan yoursite.com
```

open source. Apache-2.0 licensed. go check your score.

---

---

## LinkedIn Post

We spent 20 years perfecting UI/UX for human users.

Beautiful landing pages. Optimized signup flows. A/B tested hero copy.

None of it matters to the next wave of "users."

AI agents don't see your beautiful UI. They see your robots.txt, your API specs, your structured data — or the complete absence of it.

And here's the uncomfortable truth most product teams aren't ready to hear:

**Your product is probably invisible to AI agents right now.**

We scanned hundreds of websites and found the same pattern over and over:

→ Accidentally blocking GPTBot and ClaudeBot in robots.txt
→ No OpenAPI spec for agents to understand capabilities
→ No llms.txt file (the new standard for AI-readable product descriptions)
→ No markdown content negotiation (which cuts agent token usage by 80%)
→ No structured data for agents to parse

These aren't edge cases. This is the default state of most products on the internet.

And it's a problem that's about to matter a LOT more.

Every major AI company is building agents that autonomously discover, evaluate, and integrate with products. If your product isn't legible to those agents, you don't exist in the AI-mediated internet.

**So we built something to fix this.**

milieu-cli is an open-source CLI tool that measures your product's "milieu" — the totality of machine-readable signals AI agents encounter when they interact with you.

One command. No config. No API keys:

```
npx milieu-cli scan yoursite.com
```

It evaluates three progressive "bridges":

1. **Reachability** — Can AI agents even reach you? (HTTPS, crawler policies for 6 specific bots, meta robots tags)
2. **Standards** — Can AI agents read you? (OpenAPI, GraphQL, sitemaps, llms.txt, Schema.org, JSON-LD, MCP endpoints)
3. **Separation** — Can AI agents integrate with you? (API endpoints, dev docs, SDKs, webhooks)

Each bridge builds on the last. Block agents at Bridge 1 and nothing else matters.

The teams that are ahead of this curve are already gating their CI/CD pipelines on agent-readiness scores. They treat AI legibility the same way they treat uptime — as a non-negotiable.

The API is the new product UI. The teams that optimize for AI agents now will own the next decade of distribution.

The rest will wonder why their competitors keep showing up in every AI-generated recommendation and they don't.

Check your score:

```
npx milieu-cli scan yoursite.com
```

Open source. Apache-2.0 licensed.

What's your score? Drop it in the comments — I'm curious how different products stack up. 👇
