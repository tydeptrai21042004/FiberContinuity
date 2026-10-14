import { ContinuityError } from "./errors";
/** Short, fixed browser-failure labels. Never export raw upstream exceptions:
 * they can contain RPC endpoints, profile identifiers or application state.
 */
export const HOSTED_FAILURE_CATEGORIES = [
  "BROWSER_ISOLATION", "CKB_RPC_CONNECTIVITY", "FIBER_CONFIG_INVALID",
  "FIBER_WASM_ASSET_OR_WORKER", "FIBER_WASM_STARTUP", "BROWSER_STORAGE",
  "RECOVERY_SAFETY_GATE", "UNKNOWN_BROWSER_FAILURE"
] as const;
export type HostedFailureCategory = typeof HOSTED_FAILURE_CATEGORIES[number];

export function classifyHostedFailure(error: unknown): HostedFailureCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/cross.origin.isolat|SharedArrayBuffer|COOP|COEP|secure.context/i.test(message)) return "BROWSER_ISOLATION";
  if (/yaml|config|hash.{0,20}(invalid|format)|deserialize|parse.*(fiber|script)/i.test(message)) return "FIBER_CONFIG_INVALID";
  if (/wasm.*(fetch|mime|load|module)|worker|dynamically imported module|WebAssembly|importScripts/i.test(message)) return "FIBER_WASM_ASSET_OR_WORKER";
  if (/indexeddb|database|quota|storage|transaction.*inactive/i.test(message)) return "BROWSER_STORAGE";
  if (/channel state|existing.*profile|safety|refusing|BLOCKED/i.test(message)) return "RECOVERY_SAFETY_GATE";
  if (/CKB RPC|cors|network|fetch|synchron/i.test(message)) return "CKB_RPC_CONNECTIVITY";
  if (/fiber|node|start/i.test(message)) return "FIBER_WASM_STARTUP";
  return "UNKNOWN_BROWSER_FAILURE";
}

/** Redacted diagnostic for the cold export stage. Never serialize exception text,
 * database names, profile IDs, keys, paths or RPC URLs to GitHub/Vercel.
 */
export const COLD_EXPORT_FAILURE_REASONS = [
  "COLD_STORE_UNSTABLE", "COLD_STORE_MISSING", "COLD_STORE_LOCKED",
  "COLD_STORE_SCHEMA", "COLD_STORE_UNSUPPORTED_VALUE", "COLD_STORE_LIMIT",
  "COLD_STORE_TRANSACTION", "COLD_STORE_PRECONDITION", "COLD_STORE_DISCOVERY",
  "COLD_STORE_OPEN", "COLD_STORE_CURSOR", "COLD_STORE_SERIALIZATION",
  "COLD_STORE_CHECKSUM", "COLD_STORE_VALIDATION", "COLD_STORE_HOST_FENCE",
  "COLD_STORE_HOST_NAME", "COLD_STORE_HOST_RELEASE", "COLD_STORE_UNKNOWN"
] as const;
export type ColdExportFailureReason = typeof COLD_EXPORT_FAILURE_REASONS[number];
export function classifyColdExportFailure(error: unknown): ColdExportFailureReason {
  // Only codes from our ContinuityError class are trusted. A malicious external
  // exception with a spoofed `code` property cannot set the evidence category.
  if (error instanceof ContinuityError) {
    if (error.code === "UNSTABLE_COLD_STORE") return "COLD_STORE_UNSTABLE";
    if (COLD_EXPORT_FAILURE_REASONS.includes(error.code as ColdExportFailureReason)) {
      return error.code as ColdExportFailureReason;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/no object stores|missing IndexedDB|missing.*database|cannot back up a missing|IndexedDB\.databases\(\)/i.test(message)) return "COLD_STORE_MISSING";
  if (/locked|profile is in use|exclusive.*lease|blocked|holds this IndexedDB open/i.test(message)) return "COLD_STORE_LOCKED";
  if (/key-generator|autoIncrement|object.store.*schema|schema mismatch|unsupported.*index|database.*version/i.test(message)) return "COLD_STORE_SCHEMA";
  if (/unsupported.*(type|class|view|binary)|cyclic.*value|non-finite|nesting limit|unsupported IndexedDB|Invalid.*value/i.test(message)) return "COLD_STORE_UNSUPPORTED_VALUE";
  if (/size limit|record limit|exceeds.*limit|too large|quota/i.test(message)) return "COLD_STORE_LIMIT";
  if (/transaction|cursor|failed to open|cannot open|aborted|read.*failed/i.test(message)) return "COLD_STORE_TRANSACTION";
  return "COLD_STORE_UNKNOWN";
}
