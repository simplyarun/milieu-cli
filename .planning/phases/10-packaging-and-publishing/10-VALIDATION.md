---
phase: 10
slug: packaging-and-publishing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Full suite + `npm pack --dry-run` file count check
- **Before `/gsd:verify-work`:** Full suite green + `npm pack --dry-run` shows zero `__tests__` files
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PKG-02, PKG-04, PKG-05 | unit | `npm run build && npm pack --dry-run` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | PKG-03, FOUND-01 | unit | `npx vitest run src/core/__tests__/packaging.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tsconfig.build.json` — exclude test files from build
- [ ] `src/core/__tests__/packaging.test.ts` — covers PKG-02, PKG-03, PKG-04, PKG-05
- [ ] Build script update in package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| npx milieu-cli scan works for first-time users | FOUND-01 | Requires npm publish | `npm pack && npx ./milieu-cli-*.tgz scan example.com` |
| Published to npm | PKG-01 | Requires npm credentials | `npm publish` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
