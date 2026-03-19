# Phase 7: CLI Integration and JSON Output - Research

**Researched:** 2026-03-19
**Domain:** CLI framework integration, JSON output contract, process exit codes
**Confidence:** HIGH

## Summary

Phase 7 wires the existing scan orchestrator (Phase 6) into a proper CLI using commander.js, adds JSON output mode, and implements all remaining CLI flags (--timeout, --threshold, --quiet, --verbose, --version, --help). The project already has a complete scan pipeline (`scan()` in `src/core/scan.ts`), terminal rendering (`src/render/`), and a stub CLI entry point (`src/cli/index.ts`). This phase fills the CLI gap.

The primary challenge is restructuring the scan function to conditionally suppress the ora spinner when in JSON or quiet mode. Currently, `scan()` hard-codes `ora().start()` internally. The clean solution is to add a `silent` option to `ScanOptions` that controls whether ora renders, then have the CLI layer set this based on --json and --quiet flags.

**Primary recommendation:** Use commander 14.x with a single `scan` command (not a subcommand), read version from package.json via `createRequire`, and use ora's `isSilent` option to suppress spinner in JSON/quiet modes. JSON output goes to stdout; all other output (errors, spinner) to stderr via ora's default stream.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| JSON-01 | --json flag outputs complete ScanResult object | Commander option parsing + JSON.stringify(result) to stdout |
| JSON-02 | --json --pretty outputs formatted JSON | JSON.stringify(result, null, 2) when both flags present |
| JSON-03 | JSON schema includes version field for API stability | Already in ScanResult.version (set in scan.ts) -- read from package.json |
| JSON-04 | JSON output is public contract -- schema treated as versioned API surface | Version field already exists; document the contract in code comments |
| CLI-01 | `milieu scan <url>` as primary command via commander | Commander program with scan command, `<url>` required argument |
| CLI-02 | --timeout flag configures per-request timeout (default 10000ms) | Passes through to ScanOptions.timeout (already wired to all bridges) |
| CLI-03 | --threshold N flag exits non-zero if overall score < N | Post-scan check: if result.overallScore < threshold then process.exitCode = 1 |
| CLI-04 | --quiet flag suppresses terminal output (only JSON/exit code) | Set ora isSilent=true, skip formatScanOutput call |
| CLI-05 | --version prints version, --help prints help (free via commander) | commander .version() and automatic --help |
| CLI-06 | Invalid URL produces helpful error message and exit code 1 | normalizeUrl already returns discriminated error; CLI catches and formats |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | 14.0.3 | CLI framework -- argument parsing, --help, --version | De facto Node CLI standard; 3 allowed runtime deps include it |
| chalk | 5.6.2 | Terminal colors (already installed) | Already in project |
| ora | 9.3.0 | Spinner (already installed) | Already in project; has isSilent for JSON mode |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.0 | Test framework (already installed as devDependency) | Testing CLI commands |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs | yargs is heavier; commander is already in the 3-dep allowance |
| commander | clipanion | Less ecosystem adoption; unnecessary for simple CLI |

**Installation:**
```bash
npm install commander@^14.0.3
```

**Version verification:**
- commander: 14.0.3 (verified via `npm view commander version` on 2026-03-19)
- chalk: 5.6.2 (already installed)
- ora: 9.3.0 (already installed)

## Architecture Patterns

### Current Project Structure (relevant files)
```
src/
  cli/
    index.ts          # Phase 7: CLI entry point (currently stub)
  core/
    types.ts          # ScanResult, ScanOptions, etc.
    scan.ts           # scan() orchestrator (needs spinner refactor)
    index.ts          # Re-exports
  render/
    format-scan.ts    # formatScanOutput(result, verbose)
    colors.ts         # Centralized chalk wrappers
    index.ts          # Re-exports
  index.ts            # Package entry (re-exports core)
```

### Phase 7 Target Structure
```
src/
  cli/
    index.ts          # Shebang + commander setup + scan command handler
  core/
    scan.ts           # Refactored: spinner controlled by ScanOptions.silent
    types.ts          # ScanOptions gains `silent?: boolean`
    version.ts        # NEW: reads version from package.json via createRequire
```

### Pattern 1: Commander Single-Command CLI
**What:** Use commander with `scan` as the primary command, `<url>` as required argument
**When to use:** The tool has one main action (scanning a URL)
**Example:**
```typescript
// Source: commander.js README (https://github.com/tj/commander.js)
import { Command } from "commander";
import { getVersion } from "../core/version.js";

const program = new Command();

program
  .name("milieu")
  .description("Measure how legible your product is to AI agents")
  .version(getVersion());

program
  .command("scan")
  .description("Scan a URL for AI agent legibility")
  .argument("<url>", "URL to scan")
  .option("--json", "Output complete ScanResult as JSON")
  .option("--pretty", "Pretty-print JSON output (use with --json)")
  .option("--timeout <ms>", "Per-request timeout in milliseconds", "10000")
  .option("--threshold <score>", "Exit non-zero if overall score is below N")
  .option("--verbose", "Show individual check details")
  .option("--quiet", "Suppress terminal output (only JSON/exit code)")
  .action(async (url, options) => {
    // handler logic
  });

await program.parseAsync(process.argv);
```

### Pattern 2: Conditional Spinner (ora isSilent)
**What:** Suppress ora spinner when in JSON or quiet mode
**When to use:** Any mode where stdout must be clean JSON or empty
**Example:**
```typescript
// Source: ora README (https://github.com/sindresorhus/ora)
// In scan.ts, the spinner creation becomes:
const spinner = ora({
  text: "Scanning...",
  color: "cyan",
  isSilent: options.silent ?? false,
}).start();
```

### Pattern 3: Version from package.json in ESM
**What:** Read version string from package.json without import assertions
**When to use:** ESM projects using NodeNext module resolution
**Example:**
```typescript
// src/core/version.ts
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };
export function getVersion(): string {
  return pkg.version;
}
```

### Pattern 4: Exit Code for Threshold
**What:** Set process.exitCode instead of calling process.exit() to allow cleanup
**When to use:** --threshold N flag, where non-zero exit means score below threshold
**Example:**
```typescript
// In CLI action handler, after scan completes:
if (threshold !== undefined && result.overallScore < Number(threshold)) {
  process.exitCode = 1;
}
```

### Pattern 5: Shebang for npx Execution
**What:** Add Node shebang to CLI entry point for direct execution
**When to use:** The bin entry in package.json
**Example:**
```typescript
#!/usr/bin/env node
// src/cli/index.ts
import { Command } from "commander";
// ...
```

### Anti-Patterns to Avoid
- **Calling process.exit() directly:** Use process.exitCode instead; process.exit() can cut off stdout buffering for JSON output
- **Spinner on stdout in JSON mode:** JSON consumers parse stdout; any spinner ANSI codes corrupt the output. Use isSilent.
- **Hardcoded version strings:** The VERSION constant in scan.ts should read from package.json; two sources of truth will drift
- **Testing with real process.argv:** Use commander's exitOverride() and pass custom args in tests
- **--pretty without --json:** The --pretty flag is meaningless without --json. Either error or silently ignore (silently ignore is standard)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Argument parsing | Custom argv parsing | commander | Handles --help, --version, error messages, type coercion |
| Option validation | Manual flag checking | commander validators | Built-in required/optional, default values |
| JSON serialization | Custom serializer | JSON.stringify | ScanResult is already a plain object; no circular refs |
| Version reading | Hardcoded string | createRequire + package.json | Single source of truth |
| Spinner suppression | Custom console wrapper | ora isSilent option | Tested behavior; handles edge cases with ANSI codes |

**Key insight:** commander provides --help and --version for free. The CLI entry point should be thin -- all logic lives in scan() and formatScanOutput(). The CLI is just argument parsing, calling scan(), then choosing output mode.

## Common Pitfalls

### Pitfall 1: Spinner Corrupts JSON stdout
**What goes wrong:** ora writes ANSI escape codes and spinner frames to stdout. When --json is active, the JSON output on stdout gets mixed with spinner artifacts.
**Why it happens:** ora defaults to writing to process.stdout, and the spinner uses cursor movement codes.
**How to avoid:** Pass `isSilent: true` to ora when JSON or quiet mode is active. The scan function needs a `silent` option in ScanOptions.
**Warning signs:** JSON.parse fails on piped output; ANSI codes appear in JSON string.

### Pitfall 2: process.exit() Truncates JSON Output
**What goes wrong:** Calling process.exit(1) for threshold failures can truncate buffered stdout writes (JSON.stringify output).
**Why it happens:** process.exit() does not wait for stdout to flush.
**How to avoid:** Set process.exitCode = 1 instead of calling process.exit(). Node will exit with that code when the event loop drains.
**Warning signs:** Piped JSON output is truncated; downstream tools get parse errors.

### Pitfall 3: --timeout String vs Number
**What goes wrong:** commander passes option values as strings. Passing "10000" as timeout to scan() which expects number causes type errors or NaN comparisons.
**Why it happens:** Commander option values are strings by default unless you provide a processing function.
**How to avoid:** Use parseInt() or Number() when reading --timeout and --threshold values. Validate they are positive integers before calling scan().
**Warning signs:** TypeScript catches this if types are correct; runtime NaN if not.

### Pitfall 4: Duplicate Version Sources
**What goes wrong:** The hardcoded `const VERSION = "0.1.0"` in scan.ts drifts from package.json version after a release.
**Why it happens:** Manual synchronization is fragile.
**How to avoid:** Create a `version.ts` that reads from package.json. Import it in both scan.ts and cli/index.ts.
**Warning signs:** `milieu --version` shows different version than `result.version` in JSON output.

### Pitfall 5: Error Output on stdout in JSON Mode
**What goes wrong:** Error messages written to stdout corrupt JSON output for consumers piping to jq.
**Why it happens:** console.error goes to stderr (correct), but some error paths may use console.log.
**How to avoid:** In JSON mode, ONLY the JSON object goes to stdout. All errors go to stderr. On error in JSON mode, output a JSON error object rather than a text message.
**Warning signs:** `milieu scan bad-url --json | jq .` fails with parse error.

### Pitfall 6: --quiet + --verbose Conflict
**What goes wrong:** User passes both --quiet and --verbose, creating contradictory intent.
**Why it happens:** No mutual exclusion enforced.
**How to avoid:** --quiet takes precedence. If both are set, suppress terminal output. Document this in --help text.
**Warning signs:** Unexpected output behavior.

## Code Examples

Verified patterns from official sources and codebase analysis:

### CLI Entry Point (src/cli/index.ts)
```typescript
#!/usr/bin/env node
// Source: commander.js README + project conventions
import { Command } from "commander";
import { scan } from "../core/scan.js";
import { getVersion } from "../core/version.js";
import { formatScanOutput } from "../render/format-scan.js";

const program = new Command();

program
  .name("milieu")
  .description("Measure how legible your product is to AI agents")
  .version(getVersion());

program
  .command("scan")
  .description("Scan a URL for AI agent legibility")
  .argument("<url>", "URL to scan")
  .option("--json", "Output result as JSON")
  .option("--pretty", "Pretty-print JSON (use with --json)")
  .option("--timeout <ms>", "Per-request timeout in milliseconds", "10000")
  .option("--threshold <score>", "Exit non-zero if overall score below N")
  .option("--verbose", "Show individual check details")
  .option("--quiet", "Suppress terminal output")
  .action(async (url: string, opts: Record<string, string | boolean | undefined>) => {
    const jsonMode = Boolean(opts.json);
    const quiet = Boolean(opts.quiet);
    const verbose = Boolean(opts.verbose);
    const timeout = Number(opts.timeout) || 10_000;
    const threshold = opts.threshold !== undefined ? Number(opts.threshold) : undefined;

    try {
      const result = await scan(url, {
        timeout,
        verbose,
        silent: jsonMode || quiet,
      });

      if (jsonMode) {
        const output = opts.pretty
          ? JSON.stringify(result, null, 2)
          : JSON.stringify(result);
        process.stdout.write(output + "\n");
      } else if (!quiet) {
        console.log(formatScanOutput(result, verbose));
      }

      if (threshold !== undefined && result.overallScore < threshold) {
        process.exitCode = 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (jsonMode) {
        const errorObj = { error: message, version: getVersion() };
        process.stdout.write(JSON.stringify(errorObj) + "\n");
      } else {
        process.stderr.write(`Error: ${message}\n`);
      }
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);
```

### Version Module (src/core/version.ts)
```typescript
// Source: Node.js ESM docs (https://nodejs.org/api/esm.html)
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

export function getVersion(): string {
  return pkg.version;
}
```

### Refactored scan() Spinner Handling
```typescript
// In src/core/scan.ts -- add silent to ScanOptions, pass to ora
const spinner = ora({
  text: "Scanning...",
  color: "cyan",
  isSilent: options.silent ?? false,
}).start();
```

### Threshold Exit Code
```typescript
// After scan completes, before output:
if (threshold !== undefined && result.overallScore < threshold) {
  process.exitCode = 1;
}
// Do NOT call process.exit() -- let event loop drain for stdout flush
```

### URL Validation Error Handling
```typescript
// normalizeUrl already returns { ok: false, error: string }
// The scan() function already throws: throw new Error(`Invalid URL: ${url}`)
// CLI catches this in the try/catch and outputs appropriate error
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded version in source | Read from package.json at runtime | Standard practice | Single source of truth for version |
| process.exit() for errors | process.exitCode assignment | Node.js best practice | Allows stdout to flush before exit |
| Spinner always enabled | ora isSilent for non-interactive modes | ora 6.x+ | Clean JSON output for pipe consumers |
| Commander 12 subcommands | Commander 14 async parseAsync | commander 12+ | Native async action handler support |

**Deprecated/outdated:**
- Commander's `.command()` with exec mode (spawning separate executables) -- use action handlers instead
- `import pkg from "../package.json" assert { type: "json" }` -- import assertions are being replaced by import attributes; use createRequire instead for maximum compatibility

## Open Questions

1. **Error JSON schema**
   - What we know: On error in --json mode, we should output JSON to stdout (not text to stderr) so pipe consumers still get parseable output
   - What's unclear: Exact shape of error JSON -- `{ error: string, version: string }` seems minimal
   - Recommendation: Use `{ error: string, version: string }` as error JSON shape. Keep it simple. The version field allows consumers to know what schema version they're dealing with even in error cases.

2. **--pretty without --json**
   - What we know: --pretty is only meaningful with --json
   - What's unclear: Should we error, warn, or silently ignore?
   - Recommendation: Silently ignore -- this is standard CLI behavior (unnecessary flags are not errors). Commander does not enforce flag dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run src/cli/__tests__/ --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JSON-01 | --json outputs complete ScanResult | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "json output" -x` | Wave 0 |
| JSON-02 | --json --pretty outputs formatted JSON | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "pretty json" -x` | Wave 0 |
| JSON-03 | JSON schema includes version field | unit | `npx vitest run src/core/__tests__/version.test.ts -x` | Wave 0 |
| JSON-04 | JSON output as versioned public API | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "version field" -x` | Wave 0 |
| CLI-01 | milieu scan url works via commander | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "scan command" -x` | Wave 0 |
| CLI-02 | --timeout configures per-request timeout | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "timeout" -x` | Wave 0 |
| CLI-03 | --threshold N exits non-zero | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "threshold" -x` | Wave 0 |
| CLI-04 | --quiet suppresses terminal output | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "quiet" -x` | Wave 0 |
| CLI-05 | --version and --help work | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "version|help" -x` | Wave 0 |
| CLI-06 | Invalid URL produces error + exit 1 | unit | `npx vitest run src/cli/__tests__/cli.test.ts -t "invalid url" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/cli/__tests__/ --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/cli/__tests__/cli.test.ts` -- covers CLI-01 through CLI-06, JSON-01 through JSON-04
- [ ] `src/core/__tests__/version.test.ts` -- covers JSON-03 (version from package.json)
- [ ] `npm install commander` -- runtime dependency not yet installed

### Testing Strategy Notes

**CLI testing approach:** Use commander's `exitOverride()` to prevent process.exit() calls during tests. Mock the scan function to return controlled ScanResult objects. Capture stdout/stderr writes via vi.spyOn(process.stdout, "write") and vi.spyOn(process.stderr, "write").

**Key test pattern:**
```typescript
import { Command } from "commander";

// Build program with exitOverride for testing
function buildProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Throws CommanderError instead of process.exit
  // ... configure commands ...
  return program;
}

// In test:
const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
try {
  await buildProgram().parseAsync(["node", "milieu", "scan", "https://example.com", "--json"]);
} catch (e) {
  // CommanderError for --help/--version
}
const output = stdoutSpy.mock.calls.map(c => c[0]).join("");
const result = JSON.parse(output);
```

## Sources

### Primary (HIGH confidence)
- commander.js README (https://github.com/tj/commander.js) -- CLI framework API, subcommands, options, exitOverride
- ora README (https://github.com/sindresorhus/ora) -- isSilent option for suppressing all output
- Node.js ESM docs (https://nodejs.org/api/esm.html) -- createRequire for reading package.json
- Codebase analysis -- src/core/scan.ts, src/core/types.ts, src/cli/index.ts, src/render/format-scan.ts

### Secondary (MEDIUM confidence)
- npm registry -- commander 14.0.3 (verified current), chalk 5.6.2, ora 9.3.0
- Heroku CLI Style Guide (https://devcenter.heroku.com/articles/cli-style-guide) -- stderr for progress, stdout for output

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- commander is the documented 3rd runtime dep; versions verified against npm registry
- Architecture: HIGH -- codebase fully inspected; scan(), types, render pipeline all understood; refactor path is clear
- Pitfalls: HIGH -- common CLI patterns well-documented; ora isSilent behavior verified in official docs

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain; commander/ora/chalk APIs stable)
