import { describe, expect, it, vi } from "vitest";
import { IndexedDbColdStore } from "../src/adapters/IndexedDbColdStore";

/**
 * Issue #41: an IndexedDB `blocked` event is NOT cancellation. Releasing the
 * cold-operation lease immediately would allow a still-queued request to later
 * open/upgrade a database outside the lock. Tests the public presence() API.
 */
describe("blocked IndexedDB request safety", () => {
  it("keeps a pending open under its caller instead of rejecting on onblocked", async () => {
    let closed = false;
    const request: Record<string, unknown> = {
      result: { objectStoreNames: [], close: () => { closed = true; } }
    };
    vi.stubGlobal("indexedDB", {
      databases: async () => [{ name: "fc-testnet-reviewer-profile" }],
      open: () => request
    });
    try {
      const store = new IndexedDbColdStore("fc-testnet-reviewer-profile", async () => {});
      let settled = false;
      const result = store.presence().finally(() => { settled = true; });
      await vi.waitFor(() => expect(request.onblocked).toBeTypeOf("function"));
      (request.onblocked as () => void)();
      await Promise.resolve();
      expect(settled).toBe(false);
      (request.onsuccess as () => void)();
      expect(await result).toBe("occupied");
      expect(closed).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
