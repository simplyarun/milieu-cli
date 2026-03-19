---
phase: 4
slug: bridge-2-standards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured) |
| **Config file** | package.json scripts section |
| **Quick run command** | `npx vitest run src/bridges/standards --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/bridges/standards --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | STND-01, STND-02 | unit | `npx vitest run src/bridges/standards/__tests__/openapi.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | STND-03, STND-04 | unit | `npx vitest run src/bridges/standards/__tests__/llms-txt.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | STND-05 | unit | `npx vitest run src/bridges/standards/__tests__/mcp.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | STND-06 | unit | `npx vitest run src/bridges/standards/__tests__/json-ld.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | STND-07 | unit | `npx vitest run src/bridges/standards/__tests__/schema-org.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-06 | 01 | 1 | STND-08 | unit | `npx vitest run src/bridges/standards/__tests__/well-known.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-07 | 01 | 1 | STND-09 | unit | `npx vitest run src/bridges/standards/__tests__/index.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/bridges/standards/__tests__/openapi.test.ts` — stubs for STND-01, STND-02
- [ ] `src/bridges/standards/__tests__/llms-txt.test.ts` — stubs for STND-03, STND-04
- [ ] `src/bridges/standards/__tests__/mcp.test.ts` — stubs for STND-05
- [ ] `src/bridges/standards/__tests__/json-ld.test.ts` — stubs for STND-06
- [ ] `src/bridges/standards/__tests__/schema-org.test.ts` — stubs for STND-07
- [ ] `src/bridges/standards/__tests__/well-known.test.ts` — stubs for STND-08
- [ ] `src/bridges/standards/__tests__/index.test.ts` — stubs for STND-09 (bridge scoring integration)

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
