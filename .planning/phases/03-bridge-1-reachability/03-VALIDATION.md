---
phase: 03
slug: bridge-1-reachability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed in Phase 2) |
| **Config file** | vitest.config.ts (exists) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | REACH-05 | unit | `npx vitest run src/bridges/reachability/__tests__/robots-parser.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | REACH-04 | unit | `npx vitest run src/bridges/reachability/__tests__/crawler-policy.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | REACH-06, REACH-07 | unit | `npx vitest run src/bridges/reachability/__tests__/meta-robots.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | REACH-01, REACH-02, REACH-03 | unit | `npx vitest run src/bridges/reachability/__tests__/reachability.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | REACH-08, REACH-09 | unit | `npx vitest run src/bridges/reachability/__tests__/scoring.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/bridges/reachability/__tests__/robots-parser.test.ts` — stubs for REACH-05
- [ ] `src/bridges/reachability/__tests__/crawler-policy.test.ts` — stubs for REACH-04
- [ ] `src/bridges/reachability/__tests__/meta-robots.test.ts` — stubs for REACH-06, REACH-07
- [ ] `src/bridges/reachability/__tests__/reachability.test.ts` — stubs for REACH-01, REACH-02, REACH-03
- [ ] `src/bridges/reachability/__tests__/scoring.test.ts` — stubs for REACH-08

*Existing infrastructure (vitest) covers framework requirement.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Abort signal stops Bridge 2-3 | REACH-09 | Requires scan orchestrator (Phase 7) | Verify abort field is set on BridgeResult when DNS/connection fails |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
