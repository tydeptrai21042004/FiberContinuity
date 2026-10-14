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
