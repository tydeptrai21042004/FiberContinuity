import { describe, it, expect } from "vitest";
import { assertFiber091StorageContract } from "../src/adapters/Fiber091StorageContract";
import type { ColdDatabaseDump } from "../src/adapters/IndexedDbColdStore";
const known = (): ColdDatabaseDump => ({
  format: "fiber-continuity-indexeddb-cold", version: 1,
  database: "fc-testnet-fixture", databaseVersion: 1, checksum: "fixture",
  stores: [{ name: "main-store", keyPath: null, autoIncrement: false,
    indexes: [{ name: "key", keyPath: "key", unique: true, multiEntry: false }], entries: [] }]
});
describe("pinned Fiber JS 0.9.1 DB schema", () => {
  it("accepts official v0.9.1 worker schema", () => {
    expect(() => assertFiber091StorageContract(known())).not.toThrow();
  });
  it("rejects unidentified version migrations and additional object stores", () => {
    const db = known(); db.databaseVersion = 2;
    expect(() => assertFiber091StorageContract(db)).toThrow(/Unsupported/);
    const extra = known(); extra.stores.push({ ...extra.stores[0], name: "unexpected" });
    expect(() => assertFiber091StorageContract(extra)).toThrow(/Unsupported/);
  });
  it("rejects changes to key paths, autoIncrement, and indexes", () => {
    const k = known(); k.stores[0].keyPath="id";
    expect(() => assertFiber091StorageContract(k)).toThrow(/schema/);
    const a = known(); a.stores[0].autoIncrement = true as false;
    expect(() => assertFiber091StorageContract(a)).toThrow(/schema/);
    const idx = known(); idx.stores[0].indexes[0].unique=false;
    expect(() => assertFiber091StorageContract(idx)).toThrow(/schema/);
  });
});
