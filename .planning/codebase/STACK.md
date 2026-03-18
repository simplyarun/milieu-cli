# Technology Stack

**Analysis Date:** 2026-03-17

## Languages

**Primary:**
- TypeScript 5.9 - All source code in `src/`
- JavaScript ES2022 - Transpilation target

## Runtime

**Environment:**
- Node.js 18+ (specified in `package.json` engines)

**Package Manager:**
- npm - Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- None - Pure Node.js CLI application with custom HTTP handling

**Build/Dev:**
- tsup 8 - Build tool for bundling TypeScript to ESM
- tsx 4 - TypeScript executor for development (`dev` script)
- TypeScript 5.9 - Language compiler and type checking

## Key Dependencies

**No Production Dependencies**
- This is a zero-dependency CLI tool
- Uses only Node.js built-in modules

**Development Dependencies:**
- `@types/node` 25.5.0 - Type definitions for Node.js APIs
- `tsup` 8 - Fast TypeScript bundler (ESM output)
- `tsx` 4 - TypeScript runtime for development
- `typescript` 5.9 - TypeScript compiler

## Built-in Modules Used

**HTTP/Network:**
- `fetch` API (native in Node.js 18+) - HTTP requests with retry logic, SSRF protection, bot detection

**Compression:**
- `node:zlib` - Gzip decompression for `.xml.gz` sitemaps

**Utilities:**
- `node:path` - URL/path manipulation (implicitly via `URL` API)
- No other built-in modules required

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2022
- Module: ESNext
- Strict mode: enabled
- Declaration generation: enabled
- Source maps: enabled

**Build Output:**
- Format: ESM (ES modules)
- Target: Node 18+
- Output directory: `dist/`
- Includes `.d.ts` type declarations

**CLI Configuration:**
- Entry point: `src/index.ts` (#!/usr/bin/env node shebang)
- Bin entry: `milieu-content-score` → `./dist/index.js`

## Platform Requirements

**Development:**
- Node.js 18 or higher
- npm for package management
- TypeScript knowledge (build requires tsc compilation)

**Production:**
- Node.js 18 or higher
- Read access to publish to npm registry
- Must support ESM module resolution

**Deployment:**
- Standalone CLI executable
- Published to npm as `milieu-content-score`
- No external services required at runtime

## Build Pipeline

**Development:**
```bash
npm run dev                # Run with tsx (TypeScript executor)
npm run build              # Bundle to dist/ with tsup (ESM + .d.ts)
npm run typecheck          # Type check without emit (tsc --noEmit)
```

**Output:**
- `dist/index.js` - Bundled ESM executable
- `dist/index.d.ts` - Type definitions
- `dist/index.js.map` - Source map for debugging

---

*Stack analysis: 2026-03-17*
