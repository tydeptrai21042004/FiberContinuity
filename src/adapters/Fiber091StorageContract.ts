import type { ColdDatabaseDump } from "./IndexedDbColdStore";

/**
 * Pin to the actual v0.9.1 worker schema, not to an assumed arbitrary IDB.
 * Source: nervosnetwork/fiber v0.9.1 crates/fiber-wasm-db-worker/src/db.rs
 *   database version=1, store=main-store, explicit primary keys,
 *   unique index "key" with keyPath "key".
 * Treat ANY deviation as an unsupported storage release and stop cold restore.
 */
export function assertFiber091StorageContract(dump: ColdDatabaseDump): void {
  if (dump.databaseVersion !== 1 || dump.stores.length !== 1) {
    throw new Error("Unsupported Fiber 0.9.1 IndexedDB version or object-store count.");
  }
  const store = dump.stores[0];
  if (store.name !== "main-store" || store.keyPath !== null || store.autoIncrement !== false ||
      store.indexes.length !== 1 || store.indexes[0].name !== "key" ||
      store.indexes[0].keyPath !== "key" || !store.indexes[0].unique || store.indexes[0].multiEntry) {
    throw new Error("IndexedDB schema does not match the pinned Fiber WASM DB worker v0.9.1 schema.");
  }
}
