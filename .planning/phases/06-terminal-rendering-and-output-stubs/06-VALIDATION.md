---
phase: 6
slug: terminal-rendering-and-output-stubs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/render src/bridges/__tests__/stubs.test.ts` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/render src/bridges/__tests__/stubs.test.ts`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | STUB-01, STUB-02, STUB-03 | unit | `npx vitest run src/bridges/__tests__/stubs.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | TERM-02, TERM-05 | unit | `npx vitest run src/render/__tests__/colors.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | TERM-01, TERM-06, TERM-07 | unit | `npx vitest run src/render/__tests__/format-scan.test.ts src/render/__tests__/format-bridge.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | TERM-03 | unit | `npx vitest run src/render/__tests__/format-verbose.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | TERM-04 | unit | `npx vitest run src/render/__tests__/format-scan.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/render/__tests__/colors.test.ts` — stubs for TERM-02, TERM-05
- [ ] `src/render/__tests__/progress-bar.test.ts` — stubs for TERM-01 (bar rendering)
- [ ] `src/render/__tests__/format-bridge.test.ts` — stubs for TERM-01, TERM-07
- [ ] `src/render/__tests__/format-scan.test.ts` — stubs for TERM-01, TERM-06
- [ ] `src/render/__tests__/format-verbose.test.ts` — stubs for TERM-03
- [ ] `src/bridges/__tests__/stubs.test.ts` — stubs for STUB-01, STUB-02, STUB-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spinner animation during scan | TERM-04 | Requires TTY | Run `npx tsx src/cli.ts scan example.com` and verify spinner |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
