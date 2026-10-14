import { describe, expect, it } from "vitest";
import { IndexedDbColdStore } from "../src/adapters/IndexedDbColdStore";
import type { ColdDatabaseDump } from "../src/adapters/IndexedDbColdStore";

const name = "fc-testnet-verified";
const cold = new IndexedDbColdStore(name, async () => {});
function core(): Omit<ColdDatabaseDump, "checksum"> {
  return {
    format: "fiber-continuity-indexeddb-cold", version: 1, database: name,
    databaseVersion: 1, stores: [{
      name: "main-store", keyPath: null, autoIncrement: false,
      indexes: [{ name: "key", keyPath: "key", unique: true, multiEntry: false }],
      entries: [{ key: "record-1", value: { t: "object", v: [["key", "record-1"], ["value", "safe"]] } }]
    }]
  };
}
async function bytes(data: ReturnType<typeof core>): Promise<Uint8Array> {
  const value = JSON.stringify(data);
  const checksum = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))));
  return new TextEncoder().encode(JSON.stringify({ ...data, checksum }));
}

describe("validate complete IDB data BEFORE destructive recovery", () => {
  it("accepts a valid complete dump without touching browser storage", async () => {
    const source = core();
    expect((await cold.validateBytes(await bytes(source))).stores[0].entries).toHaveLength(1);
  });
  it("rejects duplicate primary keys, even with a valid recomputed checksum", async () => {
    const source = core(); source.stores[0].entries.push({ ...source.stores[0].entries[0] });
    await expect(cold.validateBytes(await bytes(source))).rejects.toThrow(/Duplicate primary key/);
  });
  it("rejects a non-IndexedDB key rather than aborting after database creation", async () => {
    const source = core(); source.stores[0].entries[0].key = { t: "object", v: [["not", "a primary key"]] };
    await expect(cold.validateBytes(await bytes(source))).rejects.toThrow(/primary key.*unsupported/i);
  });
  it("rejects a forged inline primary key before creating an IndexedDB target", async () => {
    const source = core();
    source.stores[0].keyPath = "key";
    source.stores[0].entries[0].key = "forged";
    await expect(cold.validateBytes(await bytes(source))).rejects.toThrow(/Inline IndexedDB key does not match/);
  });
  it("accepts correctly matched inline primary keys", async () => {
    const source = core(); source.stores[0].keyPath = "key";
    expect((await cold.validateBytes(await bytes(source))).stores[0].entries).toHaveLength(1);
  });
  it("rejects two indexes with the same name", async () => {
    const source = core(); source.stores[0].indexes.push({ ...source.stores[0].indexes[0] });
    await expect(cold.validateBytes(await bytes(source))).rejects.toThrow(/duplicate index schema/i);
  });
});
