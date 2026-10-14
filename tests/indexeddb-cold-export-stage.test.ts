import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexedDbColdStore } from "../src/adapters/IndexedDbColdStore";
import { classifyColdExportFailure } from "../src/core/hostedFailureCategory";

afterEach(() => vi.unstubAllGlobals());

describe("fail-closed cold export stage identification", () => {
  it("labels a stopped-node lease failure without exposing private information", async () => {
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {
      throw new Error("private profile access denied");
    });
    await expect(exporter.exportStableBytes()).rejects.toMatchObject({ code: "COLD_STORE_PRECONDITION", recoveryUnsafe: true });
  });
  it("distinguishes IndexedDB database-listing failure", async () => {
    vi.stubGlobal("indexedDB", { databases: async () => { throw new Error("secret token"); } });
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {});
    try { await exporter.exportBytes(); throw new Error("Unexpected success"); }
    catch (error) { expect(classifyColdExportFailure(error)).toBe("COLD_STORE_DISCOVERY"); }
  });
  it("refuses to silently create a missing IndexedDB database", async () => {
    vi.stubGlobal("indexedDB", { databases: async () => [] });
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {});
    await expect(exporter.exportBytes()).rejects.toMatchObject({ code: "COLD_STORE_MISSING" });
  });
  it("labels an IndexedDB connection failure without printing its URL or details", async () => {
    vi.stubGlobal("indexedDB", { databases: async () => [{name:"fiber-testnet-db"}],
      open: () => { throw new Error("secret database failure"); } });
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {});
    await expect(exporter.exportBytes()).rejects.toMatchObject({ code: "COLD_STORE_OPEN" });
  });
  it("rejects a corrupted cold dump with a specific integrity reason", async () => {
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {});
    vi.spyOn(exporter, "exportBytes").mockResolvedValue(new TextEncoder().encode("{invalid:"));
    await expect(exporter.exportStableBytes()).rejects.toMatchObject({ code: "COLD_STORE_VALIDATION" });
  });
});

describe("pinned Fiber browser database export (disposable synthetic fixture)", () => {
  it("accepts two matching complete snapshots of a v0.9.1-shaped byte-array database", async () => {
    let transactions = 0;
    const db = {
      version: 1, objectStoreNames: ["main-store"], close: () => {},
      transaction: () => {
        transactions++;
        const tx: Record<string, unknown> = {
          oncomplete: null, onabort: null, onerror: null,
          abort: () => (tx.onabort as (() => void) | null)?.()
        };
        const store = {
          name: "main-store", keyPath: null, autoIncrement: false, indexNames: ["key"],
          transaction: tx,
          index: () => ({keyPath: "key", unique: true, multiEntry: false}),
          openCursor: () => {
            const request: {result: unknown; onsuccess: null | (() => void); onerror: null | (() => void)} = {
              result: null, onsuccess: null, onerror: null
            };
            queueMicrotask(() => {
              request.result = {primaryKey: [1, 2, 3], value: [4, 5, 6], continue: () => {
                queueMicrotask(() => {
                  request.result = null;
                  request.onsuccess?.();
                  queueMicrotask(() => (tx.oncomplete as (() => void) | null)?.());
                });
              }};
              request.onsuccess?.();
            });
            return request;
          }
        };
        tx.objectStore = () => store;
        return tx;
      }
    };
    // The actual IndexedDB browser implementation is covered by hosted-browser
    // CI; this isolated fixture verifies no transaction is accepted partially.
    vi.stubGlobal("indexedDB", {databases: async () => [{name:"fiber-testnet-db"}],
      open: () => {
        const request: {result: typeof db; onsuccess: null | (() => void); onerror: null | (() => void)} = {
          result: db, onsuccess: null, onerror: null
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }});
    const exporter = new IndexedDbColdStore("fiber-testnet-db", async () => {});
    const stable = await exporter.exportStableBytes();
    expect(transactions).toBe(2);
    expect(stable.dump.stores[0].entries).toHaveLength(1);
    expect(stable.dump.databaseVersion).toBe(1);
  });
});
