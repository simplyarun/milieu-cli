// Core barrel: public API surface (Phase 8 -- programmatic API contract)
export * from "./types.js";
export { scan } from "./scan.js";
export { getVersion } from "./version.js";
export { resolveExplanation, CHECK_EXPLANATIONS } from "./explanations.js";
export type { ExplanationEntry } from "./explanations.js";
