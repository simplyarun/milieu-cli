import { fetchPath } from "./fetch-utils.js";
import type { RobotsCheckResult } from "../types.js";

/** Patterns in robots.txt paths that suggest API/MCP endpoints exist */
const API_RELEVANT_PATH_PATTERNS = [/\/api\b/i, /\/v[0-9]+\b/, /\/mcp\b/i, /\/graphql\b/i, /\/jsonrpc\b/i, /\/openapi\b/i, /\/swagger\b/i, /\/docs\b/i];
const MAX_DISCOVERED_PATHS = 20;

function extractApiRelevantPaths(blocks: DirectiveBlock[]): string[] {
  const paths = new Set<string>();
  for (const block of blocks) {
    for (const path of block.paths) {
      if (API_RELEVANT_PATH_PATTERNS.some((p) => p.test(path))) {
        paths.add(path.replace(/\*$/, "")); // strip trailing wildcard
      }
    }
  }
  return [...paths].slice(0, MAX_DISCOVERED_PATHS);
}

const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "Anthropic",
  "Google-Extended",
  "PerplexityBot",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "FacebookBot",
  "Applebot-Extended",
] as const;

interface DirectiveBlock {
  agents: string[];
  disallowAll: boolean;
  /** Individual paths from Allow/Disallow directives */
  paths: string[];
}

function parseRobotsTxt(body: string): DirectiveBlock[] {
  const lines = body.split("\n").map((l) => l.trim());
  const blocks: DirectiveBlock[] = [];
  let current: DirectiveBlock | null = null;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith("#") || line === "") {
      continue;
    }

    const lower = line.toLowerCase();

    if (lower.startsWith("user-agent:")) {
      const agent = line.slice("user-agent:".length).trim();
      if (current && current.agents.length > 0 && !current.disallowAll) {
        // We were already building a block with agents but no disallow yet;
        // this could be a multi-agent block
      }
      if (
        current === null ||
        current.disallowAll !== false ||
        blocks.includes(current)
      ) {
        current = { agents: [], disallowAll: false, paths: [] };
      }
      current.agents.push(agent);
    } else if (lower.startsWith("disallow:") && current) {
      const value = line.slice("disallow:".length).trim();
      if (value === "/") {
        current.disallowAll = true;
      }
      if (value && value !== "/") {
        current.paths.push(value);
      }
      // Finalize block on first directive if not already added
      if (!blocks.includes(current)) {
        blocks.push(current);
      }
    } else if (lower.startsWith("allow:") && current) {
      const value = line.slice("allow:".length).trim();
      if (value && value !== "/") {
        current.paths.push(value);
      }
      // Any allow directive means this block doesn't purely disallow all
      if (!blocks.includes(current)) {
        blocks.push(current);
      }
    }
  }

  // Push trailing block if it has agents but wasn't added
  if (current && current.agents.length > 0 && !blocks.includes(current)) {
    blocks.push(current);
  }

  return blocks;
}

export async function checkRobots(
  domain: string,
): Promise<RobotsCheckResult> {
  try {
    const result = await fetchPath(domain, "/robots.txt");

    if (!result || result.status !== 200 || !result.body) {
      return {
        pass: false,
        hasRobotsTxt: false,
        aiCrawlerDirectives: [],
        allowsAllCrawlers: false,
        blocksAllCrawlers: false,
        blockedByBotProtection: result?.blockedByBotProtection,
      };
    }

    if (result.blockedByBotProtection) {
      return {
        pass: false,
        hasRobotsTxt: false,
        aiCrawlerDirectives: [],
        allowsAllCrawlers: false,
        blocksAllCrawlers: false,
        blockedByBotProtection: true,
      };
    }

    const blocks = parseRobotsTxt(result.body);
    const discoveredPaths = extractApiRelevantPaths(blocks);

    // Find the wildcard block
    const wildcardBlock = blocks.find((b) =>
      b.agents.some((a) => a === "*")
    );
    const wildcardDisallowsAll = wildcardBlock?.disallowAll ?? false;

    // For each AI crawler, determine if it's allowed
    const aiCrawlerDirectives = AI_CRAWLERS.map((crawler) => {
      // Check if there's a specific block for this crawler
      const specificBlock = blocks.find((b) =>
        b.agents.some((a) => a.toLowerCase() === crawler.toLowerCase())
      );

      if (specificBlock) {
        return { agent: crawler, allowed: !specificBlock.disallowAll };
      }

      // Fall back to wildcard
      return { agent: crawler, allowed: !wildcardDisallowsAll };
    });

    const blockedCount = aiCrawlerDirectives.filter((d) => !d.allowed).length;
    const allowsAllCrawlers = blockedCount === 0;
    const blocksAllCrawlers = blockedCount === AI_CRAWLERS.length;

    return {
      pass: !blocksAllCrawlers,
      hasRobotsTxt: true,
      aiCrawlerDirectives,
      allowsAllCrawlers,
      blocksAllCrawlers,
      discoveredPaths: discoveredPaths.length > 0 ? discoveredPaths : undefined,
    };
  } catch (err) {
    return {
      pass: false,
      hasRobotsTxt: false,
      aiCrawlerDirectives: [],
      allowsAllCrawlers: false,
      blocksAllCrawlers: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default checkRobots;
