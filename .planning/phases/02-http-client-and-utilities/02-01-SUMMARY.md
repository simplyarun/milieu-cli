---
phase: 02-http-client-and-utilities
plan: 01
subsystem: utils
tags: [vitest, url-normalization, ssrf, dns, ipv4, ipv6, tdd]

requires:
  - phase: 01-project-setup
    provides: "TypeScript project structure, core types (HttpErrorKind)"
provides:
  - "URL normalization with discriminated union returns (normalizeUrl, extractDomain, resolveRedirectUrl)"
  - "SSRF protection with IP range checking and DNS pre-flight (isPrivateIp, validateDns)"
  - "Vitest test infrastructure configured"
affects: [02-http-client-and-utilities, 03-bridge-1-reachability]

tech-stack:
  added: [vitest]
  patterns: [discriminated-union-returns, tdd-red-green, pure-function-testing]

key-files:
  created:
    - src/utils/url.ts
    - src/utils/ssrf.ts
    - src/utils/__tests__/url.test.ts
    - src/utils/__tests__/ssrf.test.ts
    - vitest.config.ts
  modified:
    - package.json

key-decisions:
  - "DNS timeout via Promise.race instead of AbortSignal.timeout (dns.lookup signal option not in @types/node)"
  - "Vitest chosen as test framework over Node test runner for richer assertions and mocking"

patterns-established:
  - "Discriminated union returns: functions return { ok: true, ... } | { ok: false, error } instead of throwing"
  - "TDD for pure functions: write failing tests first, implement to pass, commit separately"
  - "Test co-location: tests in src/utils/__tests__/ alongside source"

requirements-completed: [FOUND-04, FOUND-05]

duration: 3min
completed: 2026-03-18
---

# Phase 2 Plan 1: URL Normalization and SSRF Protection Summary

**URL normalization with discriminated unions and SSRF IP range checking covering all RFC 1918, IPv6, and IPv4-mapped IPv6 ranges with 56 unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T19:17:20Z
- **Completed:** 2026-03-18T19:20:27Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Vitest test infrastructure configured with `src/**/__tests__/**/*.test.ts` pattern
- URL normalization utilities with never-throw discriminated union returns (normalizeUrl, extractDomain, resolveRedirectUrl)
- SSRF protection checking all 7 IPv4 private ranges + IPv6 loopback/ULA/link-local + IPv4-mapped IPv6
- DNS pre-flight validation with scan-scoped cache, 3-second timeout, all-address resolution
- 56 unit tests passing (18 URL + 38 SSRF) with full build clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest and create config + URL normalization with tests** - `bc47563` (feat)
2. **Task 2: SSRF protection -- TDD RED** - `c3bf170` (test)
3. **Task 2: SSRF protection -- TDD GREEN** - `c1d1655` (feat)

## Files Created/Modified
- `vitest.config.ts` - Test framework configuration with __tests__ glob pattern
- `src/utils/url.ts` - normalizeUrl, extractDomain, resolveRedirectUrl with discriminated union returns
- `src/utils/ssrf.ts` - isPrivateIp (IPv4/IPv6/mapped), validateDns with cache and timeout
- `src/utils/__tests__/url.test.ts` - 18 test cases covering protocols, ports, queries, edge cases
- `src/utils/__tests__/ssrf.test.ts` - 30 isPrivateIp + 8 validateDns test cases with mocked DNS
- `package.json` - Added vitest devDependency and test script

## Decisions Made
- Used `Promise.race` for DNS timeout instead of `AbortSignal.timeout` passed to `dns.lookup` -- the `signal` option is not present in `@types/node` type definitions, causing TypeScript compilation errors
- Vitest used as test framework (plan left choice to Claude's discretion) -- provides `vi.mock` for DNS mocking without external libraries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DNS lookup signal option incompatible with @types/node**
- **Found during:** Task 2 (SSRF implementation, build verification)
- **Issue:** `dns.lookup(hostname, { all: true, signal: AbortSignal.timeout(3000) })` caused TS2769 -- `signal` property not in LookupOptions type
- **Fix:** Replaced with `Promise.race([lookupPromise, timeoutPromise])` pattern using a 3-second setTimeout reject
- **Files modified:** src/utils/ssrf.ts
- **Verification:** `npm run build` exits 0, all 56 tests pass
- **Committed in:** c1d1655 (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Timeout mechanism functionally equivalent. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- URL normalization and SSRF protection ready for HTTP client (Plan 02-02)
- `normalizeUrl` provides the `domain` and `baseUrl` fields needed by `ScanContext`
- `validateDns` ready to be called at each redirect hop in the HTTP client
- Vitest infrastructure in place for all future test files

---
*Phase: 02-http-client-and-utilities*
*Completed: 2026-03-18*
