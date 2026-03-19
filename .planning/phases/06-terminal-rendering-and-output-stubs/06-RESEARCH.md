# Phase 6: Terminal Rendering and Output Stubs - Research

**Researched:** 2026-03-18
**Domain:** Terminal rendering, CLI output formatting, spinner/progress UX
**Confidence:** HIGH

## Summary

Phase 6 builds the user-facing terminal output layer for the milieu-cli scan command. It must render all 5 bridges in a polished, color-coded format: scored progress bars for Bridges 1-2, a detection inventory line for Bridge 3, and dim "not evaluated" labels for Bridges 4-5. The phase also introduces the first runtime dependencies (chalk and ora) and creates the Bridge 4-5 stub functions.

The project already has all bridge orchestrators (Bridges 1-3) returning typed `BridgeResult` objects, and the `src/render/` directory exists as an empty placeholder. The types system (`ScanResult`, `BridgeResult`, `Check`) is complete and well-defined. This phase fills the rendering layer and connects it to bridge output.

**Primary recommendation:** Build a pure-function rendering module in `src/render/` that takes `ScanResult` and returns formatted strings. Keep chalk usage centralized behind a color utility that checks `NO_COLOR` before delegating to chalk. Use ora only in the top-level scan orchestrator, not inside render functions. Bridges 4-5 are factory functions returning static `BridgeResult` objects with no logic.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STUB-01 | Bridge 4 (Schema) appears with status "not_evaluated" and specific message | Factory function returning static BridgeResult; message text specified in requirements |
| STUB-02 | Bridge 5 (Context) appears with status "not_evaluated" and specific message | Same pattern as STUB-01 with different message |
| STUB-03 | No hints about future features in Bridges 4-5 | Hard-coded messages reviewed against requirement; no "coming soon" or "upgrade" language |
| TERM-01 | Default output shows all 5 bridges with appropriate formatting per bridge type | Render module with bridge-type-aware formatting: progress bar, detection line, dim label |
| TERM-02 | Color scheme: pass green, partial yellow, fail red, detected cyan, not_evaluated dim | chalk color mapping function; verified chalk.dim for gray styling |
| TERM-03 | Verbose mode shows individual check details with status indicators | Conditional rendering based on ScanOptions.verbose; status-to-symbol mapping |
| TERM-04 | Spinner (ora) shows progress during scan | ora wraps scan execution; non-TTY graceful degradation built-in |
| TERM-05 | Supports NO_COLOR environment variable | Manual NO_COLOR check required -- chalk does NOT natively support it |
| TERM-06 | Scan timestamp shown in output | Extract from ScanResult.timestamp; format as human-readable |
| TERM-07 | Scan timing shown per bridge in output | Each BridgeResult.durationMs already populated; render alongside bridge name |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chalk | 5.6.2 | Terminal string styling (colors, bold, dim) | ESM-only, zero deps, built-in TypeScript types, standard for Node CLI tools |
| ora | 9.3.0 | Terminal spinner during scan progress | ESM-only, depends on chalk 5, auto-detects TTY/CI, standard spinner library |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | Progress bar rendering is hand-rolled | 12-char progress bar is trivial; no library needed for static bar |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chalk 5.6.2 | chalk 4 (CJS) | Project is ESM-only, chalk 5 is the correct choice |
| ora 9.3.0 | nanospinner | ora is the project's declared dependency (PKG-03); nanospinner has no chalk integration |
| Hand-rolled progress bar | cli-progress | 12 fixed characters is too simple to justify a dependency |

**Installation:**
```bash
npm install chalk@5.6.2 ora@9.3.0
```

**Version verification:**
- chalk: 5.6.2 (verified via `npm view chalk version` on 2026-03-18)
- ora: 9.3.0 (verified via `npm view ora version` on 2026-03-18)
- ora already depends on chalk ^5.6.2, so only one chalk copy is installed

**Important note on dependency count:** PKG-03 mandates exactly 3 runtime dependencies: commander, chalk, ora. This phase installs chalk and ora. Commander is deferred to Phase 7 (CLI). After Phase 7, the project should have exactly 3 direct runtime deps.

## Architecture Patterns

### Recommended Project Structure

```
src/
  render/
    index.ts            # Re-exports public API
    colors.ts           # Centralized chalk wrapper with NO_COLOR support
    format-bridge.ts    # Bridge result formatting (progress bar, detection line, stub label)
    format-scan.ts      # Full ScanResult formatting (header, bridges, footer)
    format-verbose.ts   # Verbose check detail rendering
    progress-bar.ts     # 12-char progress bar generator
    symbols.ts          # Status indicator symbols (checkmark, x, warning, dash)
    __tests__/
      colors.test.ts
      format-bridge.test.ts
      format-scan.test.ts
      format-verbose.test.ts
      progress-bar.test.ts
  bridges/
    stubs.ts            # Bridge 4 and 5 stub factory functions
    stubs.test.ts       # (or __tests__/stubs.test.ts per project convention)
```

### Pattern 1: Pure-Function Rendering

**What:** All rendering functions are pure: they take typed data in, return string out. No side effects, no console.log calls inside render functions.
**When to use:** Always. This is the foundational pattern for the entire render module.
**Example:**
```typescript
// src/render/format-bridge.ts
import type { BridgeResult } from "../core/types.js";
import { colorize } from "./colors.js";
import { progressBar } from "./progress-bar.js";

export function formatBridge(bridge: BridgeResult, verbose: boolean): string {
  // Returns fully formatted string -- caller handles console output
  if (bridge.status === "not_evaluated") {
    return formatStubBridge(bridge);
  }
  if (bridge.score !== null) {
    return formatScoredBridge(bridge, verbose);
  }
  return formatDetectionBridge(bridge, verbose);
}
```

### Pattern 2: Centralized Color Control with NO_COLOR

**What:** A single `colors.ts` module wraps chalk and checks `NO_COLOR` + `FORCE_COLOR`. All other modules import color functions from here, never from chalk directly.
**When to use:** Every file that needs colored output.
**Example:**
```typescript
// src/render/colors.ts
import chalk from "chalk";

function isColorEnabled(): boolean {
  // NO_COLOR spec: present and non-empty disables color
  const noColor = process.env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") {
    return false;
  }
  // FORCE_COLOR=0 already handled by chalk via supports-color
  return true;
}

// Create a chalk instance that respects NO_COLOR
const colorEnabled = isColorEnabled();

export function green(text: string): string {
  return colorEnabled ? chalk.green(text) : text;
}
export function yellow(text: string): string {
  return colorEnabled ? chalk.yellow(text) : text;
}
export function red(text: string): string {
  return colorEnabled ? chalk.red(text) : text;
}
export function cyan(text: string): string {
  return colorEnabled ? chalk.cyan(text) : text;
}
export function dim(text: string): string {
  return colorEnabled ? chalk.dim(text) : text;
}
export function bold(text: string): string {
  return colorEnabled ? chalk.bold(text) : text;
}
```

### Pattern 3: Spinner Lifecycle (ora)

**What:** Spinner wraps the scan execution at the top level. It is NOT part of the render module -- it belongs in the scan orchestrator (or CLI layer). The render module only formats static output after the scan completes.
**When to use:** During scan execution in the scan orchestrator function.
**Example:**
```typescript
// In scan orchestrator (not in render/)
import ora from "ora";

const spinner = ora({ text: "Scanning...", color: "cyan" }).start();

try {
  // Run bridges sequentially...
  spinner.text = "Bridge 1: Reachability...";
  const b1 = await runReachabilityBridge(ctx);

  spinner.text = "Bridge 2: Standards...";
  const b2 = await runStandardsBridge(ctx);

  spinner.text = "Bridge 3: Separation...";
  const b3 = await runSeparationBridge(ctx);

  spinner.stop(); // Clear spinner before printing results
  // Print formatted output...
} catch (err) {
  spinner.fail("Scan failed");
  throw err;
}
```

### Pattern 4: Bridge Stub Factory

**What:** Static factory functions that return `BridgeResult` objects with hard-coded values. No HTTP calls, no logic, no dependencies.
**When to use:** Bridges 4 and 5 always.
**Example:**
```typescript
// src/bridges/stubs.ts
import type { BridgeResult } from "../core/types.js";

export function createBridge4Stub(): BridgeResult {
  return {
    id: 4,
    name: "Schema",
    status: "not_evaluated",
    score: null,
    scoreLabel: null,
    checks: [],
    durationMs: 0,
    message: "Schema quality assessment requires deeper analysis beyond automated checks.",
  };
}

export function createBridge5Stub(): BridgeResult {
  return {
    id: 5,
    name: "Context",
    status: "not_evaluated",
    score: null,
    scoreLabel: null,
    checks: [],
    durationMs: 0,
    message: "Context evaluation requires deeper analysis beyond automated checks.",
  };
}
```

### Anti-Patterns to Avoid

- **chalk.gray for dim/gray text:** Use `chalk.dim` instead. The `chalk.gray` alias (`chalk.blackBright`) is invisible on Solarized Dark terminals. `chalk.dim` works universally.
- **Importing chalk directly in render functions:** Always go through `colors.ts`. This ensures NO_COLOR is respected everywhere and gives a single point to disable colors in tests.
- **Spinner inside render module:** The spinner is an interactive I/O concern. The render module formats strings. Keep them separated.
- **console.log inside format functions:** Format functions return strings. The caller (CLI entry point or scan orchestrator) handles writing to stdout/stderr.
- **Unicode symbols without fallback:** The `ora` library handles this via `is-unicode-supported`. For custom symbols (checkmark, x, warning), check unicode support and provide ASCII fallbacks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal color support detection | Custom ANSI escape code handling | chalk 5.6.2 | Cross-platform terminal detection is surprisingly complex (16 color, 256, truecolor levels) |
| Spinner animation | Custom setInterval frame cycling | ora 9.3.0 | TTY detection, cursor hiding, CI mode, stream handling, cleanup on exit |
| Unicode support detection | Custom terminal capability checks | ora's is-unicode-supported (transitive dep) | Reuse from ora's dependency tree |

**Key insight:** The only thing worth hand-rolling is the 12-character progress bar (trivial math) and the overall output layout. Everything involving terminal capability detection should use chalk/ora.

## Common Pitfalls

### Pitfall 1: chalk Does NOT Support NO_COLOR Natively

**What goes wrong:** Developers assume chalk respects `NO_COLOR` because it's the industry standard color library. It does not. chalk/supports-color checks `FORCE_COLOR` and `--no-color` CLI flags, but explicitly rejected adding `NO_COLOR` support (GitHub issue #74, closed/locked 2018).
**Why it happens:** The NO_COLOR convention (no-color.org) is widely adopted, but chalk's maintainer chose `FORCE_COLOR=0` as the equivalent mechanism.
**How to avoid:** Build a `colors.ts` wrapper that checks `process.env.NO_COLOR` before delegating to chalk. When `NO_COLOR` is set and non-empty, all color functions return input unchanged.
**Warning signs:** Tests pass but `NO_COLOR=1 milieu scan` still shows colored output.

### Pitfall 2: Progress Bar Width and Unicode

**What goes wrong:** Using Unicode block characters (U+2588 etc.) for fractional fills looks great in some terminals but breaks alignment in others due to font width assumptions.
**Why it happens:** Not all terminal emulators render Unicode block elements at exactly 1 character width.
**How to avoid:** Use simple ASCII characters for the progress bar. A 12-char bar with filled (`=` or block `#`) and empty (space or `.`) characters works everywhere. Save Unicode for symbols only.
**Warning signs:** Bar looks wrong in Windows Terminal, VS Code terminal, or CI logs.

### Pitfall 3: Spinner Output Interfering with Test Assertions

**What goes wrong:** Tests that import modules using ora get spinner side effects (cursor manipulation, ANSI escape codes in captured output).
**Why it happens:** ora writes to stderr by default and manipulates the cursor.
**How to avoid:** Keep ora usage in the scan orchestrator only, not in render functions. Render functions are pure (string in, string out) and trivially testable. Mock ora in orchestrator tests via `vi.mock`.
**Warning signs:** Flaky tests, captured output contains ANSI cursor control sequences.

### Pitfall 4: Dim Text Unreadable on Light Terminal Themes

**What goes wrong:** `chalk.dim` text is invisible or barely visible on light-background terminals.
**Why it happens:** Dim reduces text brightness, which works great on dark backgrounds but becomes invisible on light ones.
**How to avoid:** This is an accepted trade-off -- dim is the spec requirement (TERM-02 says "dim/gray" for not_evaluated). Most developer terminals use dark themes. The text is still present in NO_COLOR mode as plain text.
**Warning signs:** User reports from light-theme terminals. No fix needed per spec.

### Pitfall 5: FORCE_COLOR and NO_COLOR Interaction

**What goes wrong:** Setting both `NO_COLOR=1` and `FORCE_COLOR=1` creates ambiguous behavior.
**Why it happens:** Two different conventions with conflicting intent.
**How to avoid:** Give `NO_COLOR` higher precedence. Check `NO_COLOR` first -- if set and non-empty, colors are off regardless of `FORCE_COLOR`. This matches the NO_COLOR spec which says user config should override.
**Warning signs:** CI pipelines with both variables set see inconsistent behavior.

### Pitfall 6: Timestamp Formatting Locale Sensitivity

**What goes wrong:** Using `toLocaleString()` for scan timestamp produces different output on different machines.
**Why it happens:** Locale-dependent formatting varies by OS, Node version, and system locale.
**How to avoid:** Use ISO 8601 format in JSON output (already defined in `ScanResult.timestamp`). For terminal display, format explicitly (e.g., `YYYY-MM-DD HH:mm:ss`) without locale dependence.
**Warning signs:** Snapshot tests break across CI environments.

## Code Examples

### 12-Character Progress Bar

```typescript
// src/render/progress-bar.ts
import { green, yellow, red } from "./colors.js";

/**
 * Render a 12-character progress bar for a scored bridge.
 * Score 0-100 maps to 0-12 filled characters.
 */
export function progressBar(score: number): string {
  const width = 12;
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);

  if (score >= 80) return green(bar);
  if (score >= 40) return yellow(bar);
  return red(bar);
}
```

Note: `\u2588` is full block, `\u2591` is light shade. These are widely supported in modern terminals. If unicode is a concern, fallback to `#` and `.` characters.

### Status Symbols for Verbose Mode

```typescript
// src/render/symbols.ts
import { green, red, yellow, dim } from "./colors.js";

export const STATUS_SYMBOLS = {
  pass: green("\u2714"),     // checkmark
  partial: yellow("\u26A0"), // warning
  fail: red("\u2718"),       // x mark
  error: red("\u2718"),      // x mark (same as fail)
} as const;

// ASCII fallback when unicode not supported
export const STATUS_SYMBOLS_ASCII = {
  pass: green("+"),
  partial: yellow("!"),
  fail: red("x"),
  error: red("x"),
} as const;
```

### Scan Output Layout (Default Mode)

```
Milieu Scan: example.com
Scanned: 2026-03-18 14:30:00

  Bridge 1: Reachability  ████████████  85  (230ms)
  Bridge 2: Standards     ████████░░░░  63  (1450ms)
  Bridge 3: Separation    4 signals detected  (320ms)
  Bridge 4: Schema        not evaluated
  Bridge 5: Context       not evaluated

Overall Score: 74 (partial)
Total: 2.1s
```

### Verbose Mode Check Details

```
  Bridge 1: Reachability  ████████████  85  (230ms)
    ✔ HTTPS available
    ✔ HTTP status 200
    ✔ robots.txt present (142 rules)
    ✔ GPTBot: allowed
    ✔ ClaudeBot: allowed
    ⚠ CCBot: partial
    ✔ Googlebot: allowed
    ✔ Bingbot: allowed
    ✔ PerplexityBot: allowed
    ✔ No restrictive meta robots
    ✔ No restrictive X-Robots-Tag
```

### Bridge 3 Detection Line

```typescript
function formatDetectionBridge(bridge: BridgeResult, verbose: boolean): string {
  const detected = bridge.checks.filter(c => c.status === "pass").length;
  const total = bridge.checks.length;
  const label = `${detected} of ${total} signals detected`;
  const timing = dim(`(${bridge.durationMs}ms)`);
  return `  Bridge ${bridge.id}: ${bridge.name}    ${cyan(label)}  ${timing}`;
}
```

### Bridge 4-5 Stub Line

```typescript
function formatStubBridge(bridge: BridgeResult): string {
  return dim(`  Bridge ${bridge.id}: ${bridge.name}    not evaluated`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| chalk 4 (CJS) | chalk 5 (ESM-only) | chalk 5 released | Must use ESM imports; project already ESM-only so this is fine |
| ora 6 | ora 9 | Incremental updates | API is stable; same `ora()` and `.start()/.stop()/.succeed()/.fail()` |
| FORCE_COLOR=0 for no color | NO_COLOR convention (no-color.org) | Convention grew post-2017 | chalk still uses FORCE_COLOR; we must bridge the gap manually |

**Deprecated/outdated:**
- chalk 4: Still works but is CJS; this project requires ESM
- `@types/chalk`: Not needed -- chalk 5 ships its own TypeScript types
- `@types/ora`: Not needed -- ora ships its own TypeScript types

## Open Questions

1. **Unicode Block Characters vs ASCII for Progress Bar**
   - What we know: Unicode full block (U+2588) and light shade (U+2591) work in most modern terminals. ora already pulls in `is-unicode-supported`.
   - What's unclear: Whether we should reuse ora's transitive `is-unicode-supported` to decide, or always use Unicode since Node >=18 targets modern terminals.
   - Recommendation: Default to Unicode blocks. If a user reports issues, an ASCII fallback can be added later. The requirement says "progress bars (12-char)" but does not specify character set.

2. **Scan Orchestrator Location**
   - What we know: Phase 6 needs a function that runs bridges 1-3 sequentially, creates stubs for 4-5, assembles ScanResult, and renders output. Phase 7 builds the CLI entry point with commander.
   - What's unclear: Whether the scan orchestrator belongs in `src/core/scan.ts` or is created in Phase 7. Phase 6 needs it to have something to render.
   - Recommendation: Create a minimal `src/core/scan.ts` in this phase that runs bridges, creates stubs, and returns `ScanResult`. Phase 7 wires it to commander. The render module consumes `ScanResult` from this orchestrator.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run src/render` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STUB-01 | Bridge 4 stub returns correct BridgeResult | unit | `npx vitest run src/bridges/__tests__/stubs.test.ts -x` | No -- Wave 0 |
| STUB-02 | Bridge 5 stub returns correct BridgeResult | unit | `npx vitest run src/bridges/__tests__/stubs.test.ts -x` | No -- Wave 0 |
| STUB-03 | No "coming soon"/"upgrade" language in stub messages | unit | `npx vitest run src/bridges/__tests__/stubs.test.ts -x` | No -- Wave 0 |
| TERM-01 | Default output contains all 5 bridges with correct formatting | unit | `npx vitest run src/render/__tests__/format-scan.test.ts -x` | No -- Wave 0 |
| TERM-02 | Color mapping: pass=green, partial=yellow, fail=red, detected=cyan, not_evaluated=dim | unit | `npx vitest run src/render/__tests__/colors.test.ts -x` | No -- Wave 0 |
| TERM-03 | Verbose mode shows check details with status symbols | unit | `npx vitest run src/render/__tests__/format-verbose.test.ts -x` | No -- Wave 0 |
| TERM-04 | Spinner wraps scan execution | unit | `npx vitest run src/render/__tests__/format-scan.test.ts -x` | No -- Wave 0 |
| TERM-05 | NO_COLOR=1 disables all ANSI color codes | unit | `npx vitest run src/render/__tests__/colors.test.ts -x` | No -- Wave 0 |
| TERM-06 | Scan timestamp appears in output | unit | `npx vitest run src/render/__tests__/format-scan.test.ts -x` | No -- Wave 0 |
| TERM-07 | Per-bridge timing appears in output | unit | `npx vitest run src/render/__tests__/format-bridge.test.ts -x` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/render src/bridges/__tests__/stubs.test.ts`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green (all 278 existing + new render/stub tests)

### Wave 0 Gaps

- [ ] `src/render/__tests__/colors.test.ts` -- covers TERM-02, TERM-05
- [ ] `src/render/__tests__/progress-bar.test.ts` -- covers TERM-01 (bar rendering)
- [ ] `src/render/__tests__/format-bridge.test.ts` -- covers TERM-01, TERM-07
- [ ] `src/render/__tests__/format-scan.test.ts` -- covers TERM-01, TERM-06
- [ ] `src/render/__tests__/format-verbose.test.ts` -- covers TERM-03
- [ ] `src/bridges/__tests__/stubs.test.ts` -- covers STUB-01, STUB-02, STUB-03

Note: TERM-04 (spinner) is best tested at integration level by mocking ora in the scan orchestrator test. Pure render tests should not involve ora.

## Sources

### Primary (HIGH confidence)

- npm registry: chalk 5.6.2, ora 9.3.0 -- verified current versions via `npm view`
- [chalk GitHub README](https://github.com/chalk/chalk) -- API surface, FORCE_COLOR behavior, ESM-only status
- [ora GitHub README](https://github.com/sindresorhus/ora) -- Full API, TTY detection, CI behavior, method signatures
- [supports-color source code](https://github.com/chalk/supports-color/blob/main/index.js) -- Confirmed NO_COLOR is NOT checked
- [supports-color issue #74](https://github.com/chalk/supports-color/issues/74) -- NO_COLOR rejected, closed/locked 2018
- [no-color.org](https://no-color.org) -- NO_COLOR specification: present and non-empty disables color
- Project source: `src/core/types.ts` -- BridgeResult, ScanResult, Check type definitions
- Project source: `src/bridges/*/index.ts` -- Bridge orchestrator patterns (1, 2, 3)

### Secondary (MEDIUM confidence)

- [Unicode block characters for progress bars](https://mike42.me/blog/2018-06-make-better-cli-progress-bars-with-unicode-block-characters) -- U+2588-U+258F block elements

### Tertiary (LOW confidence)

- None. All findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chalk 5.6.2 and ora 9.3.0 verified on npm registry; ESM compatibility confirmed by project's existing "type": "module" and NodeNext resolution
- Architecture: HIGH - render module pattern follows from existing bridge architecture; types already defined in core/types.ts
- Pitfalls: HIGH - NO_COLOR gap confirmed via source code inspection of supports-color; chalk.dim vs chalk.gray verified via chalk docs
- Stubs: HIGH - BridgeResult type already supports all needed fields (status, score: null, message); messages specified verbatim in requirements

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain -- chalk 5 and ora 9 are mature)
