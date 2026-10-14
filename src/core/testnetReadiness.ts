/**
 * Testnet-only network admission and browser prerequisites.
 * A reachable HTTPS endpoint is not necessarily a *testnet* endpoint.
 * This module is deliberately read-only: it never sends keys, transactions,
 * payment data or an origin-dependent account identifier to the RPC node.
 */
export interface TestnetRpcCheck {
  chain: "ckb_testnet";
  rpcReachable: true;
  initialBlockDownload: boolean;
  checkedAt: string;
  elapsedMs: number;
}
export interface BrowserRecoveryReadiness {
  isolated: boolean;
  secureContext: boolean;
  webLocks: boolean;
  indexedDbEnumeration: boolean;
  crypto: boolean;
  persistentStorage: boolean | null;
  estimatedFreeBytes: number | null;
  warnings: string[];
  canRun: boolean;
}

export function assertSafeRpcUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid HTTPS CKB testnet RPC URL."); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.hash ||
      parsed.search || !["", "/", "/rpc"].includes(parsed.pathname)) {
    throw new Error("Use a clean HTTPS testnet RPC endpoint without credentials, query strings or fragments.");
  }
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.endsWith(".local")) {
    throw new Error("Use a public HTTPS testnet RPC endpoint; local/private RPC proxies need manual security review.");
  }
  return parsed;
}

/** The caller supplies fetch for deterministic fault and wrong-network tests. */
export async function verifyCkbTestnetRpc(
  endpoint: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000
): Promise<TestnetRpcCheck> {
  const url = assertSafeRpcUrl(endpoint);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    let response: Response;
    try {
      response = await fetcher(url.toString(), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "get_blockchain_info", params: [] }),
        cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal
      });
    } catch (error) {
      throw new Error(`CKB RPC test failed or browser CORS blocked the request: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new Error(`CKB RPC responded with HTTP ${response.status}.`);
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("CKB RPC did not return JSON-RPC data.");
    const reply = data as Record<string, unknown>;
    if (reply.id !== 1 || reply.jsonrpc !== "2.0" || reply.error) throw new Error("CKB RPC response is malformed or reports an error.");
    const result = reply.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("CKB RPC returned no chain information.");
    const info = result as Record<string, unknown>;
    if (info.chain !== "ckb_testnet") {
      throw new Error(`Wrong CKB network: ${typeof info.chain === "string" ? info.chain.slice(0, 80) : "unknown"}. Only Pudge testnet (ckb_testnet) is permitted.`);
    }
    if (typeof info.is_initial_block_download !== "boolean") throw new Error("CKB RPC response lacks synchronization information.");
    return { chain: "ckb_testnet", rpcReachable: true, initialBlockDownload: info.is_initial_block_download,
      checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started };
  } finally { clearTimeout(deadline); }
}

export async function inspectBrowserRecoveryReadiness(): Promise<BrowserRecoveryReadiness> {
  const isolated = globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === "function";
  const secureContext = globalThis.isSecureContext === true;
  const webLocks = typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
  const indexedDbEnumeration = typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function";
  const cryptography = typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
  let persistentStorage: boolean | null = null;
  let estimatedFreeBytes: number | null = null;
  try {
    if (navigator.storage?.persisted) persistentStorage = await navigator.storage.persisted();
    if (navigator.storage?.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      if (Number.isFinite(quota) && Number.isFinite(usage)) estimatedFreeBytes = Math.max(0, (quota ?? 0) - (usage ?? 0));
    }
  } catch { /* Storage API diagnostics may be denied by privacy settings. */ }
  const warnings: string[] = [];
  if (!isolated) warnings.push("Missing COOP/COEP isolation or SharedArrayBuffer. Check Vercel response headers.");
  if (!secureContext) warnings.push("A secure HTTPS context is required.");
  if (!webLocks) warnings.push("Web Locks unavailable; concurrent-tab writer exclusion cannot be established.");
  if (!indexedDbEnumeration) warnings.push("IndexedDB.databases() unavailable; exact profile identification is impossible.");
  if (!cryptography) warnings.push("Web Crypto unavailable; no authenticated archives can be created.");
  if (persistentStorage === false) warnings.push("Browser storage is not persistence-granted: eviction may erase node data. Keep independent encrypted backups.");
  if (estimatedFreeBytes !== null && estimatedFreeBytes < 150 * 1024 * 1024) warnings.push("Low estimated free storage; browser archive creation and restoration may fail.");
  return { isolated, secureContext, webLocks, indexedDbEnumeration, crypto: cryptography,
    persistentStorage, estimatedFreeBytes, warnings,
    canRun: isolated && secureContext && webLocks && indexedDbEnumeration && cryptography };
}

/** This calls the browser persistence API only after explicit user interaction. */
export async function requestDurableBrowserStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) throw new Error("This browser does not offer persistent storage requests.");
  return navigator.storage.persist();
}
