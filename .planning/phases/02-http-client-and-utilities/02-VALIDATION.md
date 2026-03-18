---
phase: 02
slug: http-client-and-utilities
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) |
| **Config file** | none — Wave 0 installs |
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
| 02-01-01 | 01 | 1 | FOUND-04 | unit | `npx vitest run src/utils/__tests__/url.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | FOUND-05 | unit | `npx vitest run src/utils/__tests__/ssrf.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | FOUND-03 | unit | `npx vitest run src/utils/__tests__/http-client.test.ts -t "error classification"` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | FOUND-06 | unit | `npx vitest run src/utils/__tests__/http-client.test.ts -t "retry\|redirect\|timeout"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` and `@vitest/coverage-v8` as devDependencies
- [ ] `vitest.config.ts` — configuration with ESM support
- [ ] `src/utils/__tests__/url.test.ts` — stubs for FOUND-04
- [ ] `src/utils/__tests__/ssrf.test.ts` — stubs for FOUND-05
- [ ] `src/utils/__tests__/http-client.test.ts` — stubs for FOUND-03, FOUND-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bot protection detection accuracy | FOUND-03 (bot_protected variant) | Heuristic-based, needs real WAF responses | Test against known Cloudflare-protected sites |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
