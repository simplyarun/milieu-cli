---
phase: 7
slug: cli-integration-and-json-output
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/cli/__tests__/ --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/cli/__tests__/ --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | JSON-03 | unit | `npx vitest run src/core/__tests__/version.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | CLI-01, CLI-05, CLI-06 | unit | `npx vitest run src/cli/__tests__/cli.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | JSON-01, JSON-02, JSON-04, CLI-02, CLI-03, CLI-04 | unit | `npx vitest run src/cli/__tests__/cli.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/cli/__tests__/cli.test.ts` — stubs for CLI-01 through CLI-06, JSON-01 through JSON-04
- [ ] `src/core/__tests__/version.test.ts` — stubs for JSON-03
- [ ] `npm install commander` — runtime dependency

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end scan against live URL | CLI-01 | Requires network | Run `npx tsx src/cli/index.ts scan example.com` |
| Terminal colors render correctly | CLI-01 | Requires TTY | Visual inspection of output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
