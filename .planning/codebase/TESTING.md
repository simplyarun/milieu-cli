# Testing Patterns

**Analysis Date:** 2026-03-17

## Test Framework

**Status:** Not detected

**No testing framework is configured or present in this codebase:**
- No `jest.config.*`, `vitest.config.*`, or similar test runner configuration
- No test scripts in `package.json` (only `dev`, `build`, `typecheck`)
- No test dependencies in package.json (`@testing-library`, `vitest`, `jest`, etc.)
- No `*.test.ts`, `*.spec.ts`, or test directory structure

**Current Quality Verification:**
- TypeScript strict mode via `npm run typecheck`
- Manual testing via `npm run dev` with real URLs

## Codebase Testing Approach

**Development Verification:**
```bash
npm run typecheck    # Type checking with strict mode
npm run dev <url>    # Manual CLI testing with real URLs
npm run build        # Build verification
```

**Type Safety Over Runtime Tests:**
- All functions have explicit type signatures
- TypeScript strict mode enforces null/undefined checking
- Interface contracts prevent misuse
- Return types are precise (e.g., `Promise<RobotsCheckResult | null>`)

## Code Organization for Testability

**Module Structure:**
- Each check is isolated in its own module: `src/checks/robots.ts`, `src/checks/llms-txt.ts`, `src/checks/http-health.ts`
- Utilities separated for reuse: `src/checks/fetch-utils.ts` contains all HTTP logic
- Scoring logic isolated: `src/scoring.ts` contains pure calculation functions
- Type definitions centralized: `src/types.ts` defines all interfaces

**Pure Functions:**
- Scoring functions have no side effects: `calculateContentScore()`, `scoreSchemaMarkup()`, `scoreRobots()`
- Parsing functions are pure: `parseRobotsTxt()`, `analyzeStructure()`, `extractTypes()`
- These could be tested with simple input/output assertions

**Example pure function from `src/scoring.ts`:**
```typescript
function scoreSchemaMarkup(results: ContentCheckResults): CheckScore {
  const r = results.schemaMarkup;
  const signals: Record<string, boolean> = {
    hasSchemaMarkup: false,
    hasActionTypes: false,
    ogTagsComplete: false,
    // ...
  };

  let earned = 0;

  if (r?.hasSchemaMarkup) {
    signals.hasSchemaMarkup = true;
    earned += 3;

    if (r.hasActionTypes) {
      signals.hasActionTypes = true;
      earned += 3;
    }
    // ... scoring logic
  }

  return { earned, max: 10, signals };
}
```

## Where Tests Should Be Added

**High Priority (Pure Logic):**
- `src/scoring.ts` - All scoring functions are pure and deterministic
  - Test: Given ContentCheckResults with specific flags, verify exact score and signals returned
  - No mocking needed; direct input/output testing

**Medium Priority (Parsing):**
- `src/checks/robots.ts` - `parseRobotsTxt()` is pure and complex
  - Test: Parse various robots.txt formats, verify agent detection and path extraction
  - Test: Multi-agent blocks, wildcard handling, Disallow/Allow directive parsing

- `src/checks/llms-txt.ts` - `parseDiscoveredResources()` and `analyzeStructure()` are pure
  - Test: Markdown link extraction, AI-relevant URL filtering
  - Test: Well-structured content detection (H1, H2, blockquotes)

- `src/checks/http-health.ts` - `extractVisibleText()`, `detectSpaFramework()` are pure
  - Test: HTML parsing and text extraction, SPA framework detection

**Medium Priority (Utilities):**
- `src/checks/fetch-utils.ts` - Helper functions are pure
  - Test: `normalizeUrl()` - handles various URL formats
  - Test: `isUrl()` - validates URL-like strings
  - Test: `isSafeHost()` - SSRF protection (critical for security)
  - Test: `detectBotProtection()` - WAF/bot protection detection
  - Test: `parseRetryAfter()` - HTTP header parsing

**Lower Priority (Integration):**
- Check functions themselves are difficult to unit test without mocking fetch
  - Would require mocking `fetchPath()` or `fetchUrl()`
  - Could be tested with integration tests against real or mock servers

## Test Data Suggestions

**For `parseRobotsTxt()`:**
```typescript
const testCases = [
  {
    name: "Simple wildcard disallow all",
    input: `User-Agent: *\nDisallow: /`,
    expected: { agents: ["*"], disallowAll: true }
  },
  {
    name: "Specific crawler allowed",
    input: `User-Agent: ClaudeBot\nAllow: /\n\nUser-Agent: *\nDisallow: /`,
    expected: [
      { agents: ["ClaudeBot"], disallowAll: false },
      { agents: ["*"], disallowAll: true }
    ]
  }
];
```

**For `calculateContentScore()`:**
```typescript
const testInput: ContentCheckResults = {
  schemaMarkup: {
    pass: true,
    hasSchemaMarkup: true,
    types: ["WebSite"],
    hasActionTypes: true,
    // ... minimal fields for test
  },
  // ... other checks
};
const result = calculateContentScore(testInput);
assert(result.rawScore > 0);
assert(result.contentScore >= 0 && result.contentScore <= 100);
```

**For `normalizeUrl()`:**
```typescript
const cases = [
  ["example.com", "example.com"],
  ["https://example.com", "example.com"],
  ["https://www.example.com/", "example.com"],
  ["EXAMPLE.COM", "example.com"],
];
```

## Security Testing Considerations

**SSRF Protection in `src/checks/fetch-utils.ts`:**
- `isSafeHost()` blocks internal addresses (localhost, 127.0.0.1, RFC-1918 ranges)
- `fetchUrl()` validates protocols (http/https only)
- Redirect following validates each hop against SSRF blocklist
- This logic is critical and should be heavily tested with edge cases:
  - IPv6 addresses (with brackets)
  - Numeric IPs in various formats (dotted-quad, octal, hex)
  - Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Cloud metadata endpoints (169.254.0.0/16 for AWS IMDS)

**Bot Protection Detection in `src/checks/fetch-utils.ts`:**
- `detectBotProtection()` identifies WAF/bot protection pages
- Tests should cover:
  - Cloudflare challenge pages
  - Imperva/Datadome signatures
  - Content-type based exclusions (JSON, XML, plain text are never challenge pages)

## Manual Testing Workflow

**Current approach for verification:**

```bash
# Type checking
npm run typecheck

# Manual CLI test with sample URL
npm run dev https://example.com
npm run dev example.com --json

# Build artifact test
npm run build
node dist/index.js https://example.com
```

**Suggested integration test scenarios:**
- Test with site that has robots.txt
- Test with site that has llms.txt
- Test with site protected by Cloudflare/WAF
- Test with private/internal URLs (should be blocked)
- Test with invalid URLs

## Gap Analysis

**What's Missing:**
1. Unit test runner (Jest/Vitest) - No configuration present
2. Test files - Zero test coverage currently
3. Integration tests - No test HTTP server or mock fixtures
4. E2E tests - CLI is only tested manually

**Effort to Add Testing:**
- **Low effort:** Add Jest/Vitest config, ~3-4 test files for pure functions (scoring, parsing, utilities)
- **Medium effort:** Add mocking setup for `fetchUrl()`, test all check functions with fixtures
- **High effort:** Add integration tests against real/mock servers, E2E tests with CLI tool

**Recommendation:**
Start with unit tests for pure functions in `src/scoring.ts` and `src/checks/fetch-utils.ts`, then add mocked tests for each check function. Integration/E2E tests can follow.

---

*Testing analysis: 2026-03-17*
