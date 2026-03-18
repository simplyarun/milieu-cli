# Phase 1: Project Scaffold and Types - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Gut the existing codebase and establish the new project structure with a complete type system. Every subsequent phase implements against these types. Directory structure: `src/bridges/`, `src/core/`, `src/render/`, `src/utils/`, `src/cli/`. Build must produce ESM output with .d.ts declarations.

</domain>

<decisions>
## Implementation Decisions

### Existing code handling
- Full removal of all files in src/ — clean slate, old code stays in git history for reference
- All non-planning project files are replaceable (README, package.json, tsconfig.json, etc.)
- Config files (tsconfig.json, package.json) rewritten from scratch, not updated incrementally
- Each new directory gets an index.ts barrel export with empty exports — gives future phases clear import paths from day one

### Package identity
- Rename from `milieu-content-score` to `milieu-cli` now in Phase 1 — every file uses the final name from the start
- Keep Apache-2.0 license (do NOT switch to MIT)
- Version resets to 0.1.0 for the rebuild

### Claude's Discretion
- Exact tsconfig.json compiler options (target, module, strict settings)
- package.json scripts configuration (build, dev, typecheck commands)
- Whether to keep tsup or use tsc directly for builds
- Internal organization within src/core/ (e.g., types.ts vs separate type files)
- .gitignore contents

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project specification
- `.planning/PROJECT.md` — Project vision, constraints (TypeScript, ESM, Node >= 18, 3 runtime deps max), key decisions
- `.planning/REQUIREMENTS.md` — FOUND-02 requirement: all type definitions (CheckStatus, Check, BridgeResult, ScanResult) defined before implementation
- `.planning/ROADMAP.md` §Phase 1 — Success criteria: new directory structure, types compile, npm run build works, smoke test

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None retained — full removal decided. Git history preserves old implementations for reference if needed.

### Established Patterns
- Existing project uses ESM (`"type": "module"`), TypeScript with `tsup` bundler, Node >= 18 — these conventions carry forward
- Current types.ts shows the v0.1 check result interfaces — useful as reference for understanding domain but will be replaced entirely

### Integration Points
- package.json `bin` field will change from `milieu-content-score` to `milieu` (CLI entry point)
- `npm run build` must produce ESM + .d.ts in `dist/` — same output dir convention

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the scaffold. The key constraint is that the type system must be complete enough for all 10 phases to build against.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-project-scaffold-and-types*
*Context gathered: 2026-03-17*
