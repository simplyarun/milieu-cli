---
phase: 5
slug: bridge-3-separation-and-scoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 (already configured) |
| **Config file** | vitest.config.ts + package.json scripts |
| **Quick run command** | `npx vitest run src/bridges/separation --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/bridges/separation --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | SEP-01 | unit | `npx vitest run src/bridges/separation/__tests__/api-presence.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SEP-02 | unit | `npx vitest run src/bridges/separation/__tests__/developer-docs.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SEP-03 | unit | `npx vitest run src/bridges/separation/__tests__/sdk-references.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | SEP-04 | unit | `npx vitest run src/bridges/separation/__tests__/webhook-support.test.ts` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | SEP-05 | unit | `npx vitest run src/bridges/separation/__tests__/index.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/bridges/separation/__tests__/api-presence.test.ts` — stubs for SEP-01
- [ ] `src/bridges/separation/__tests__/developer-docs.test.ts` — stubs for SEP-02
- [ ] `src/bridges/separation/__tests__/sdk-references.test.ts` — stubs for SEP-03
- [ ] `src/bridges/separation/__tests__/webhook-support.test.ts` — stubs for SEP-04
- [ ] `src/bridges/separation/__tests__/index.test.ts` — stubs for SEP-05 (bridge orchestrator)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
