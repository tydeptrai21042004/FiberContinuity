import { describe, expect, it } from "vitest";
import { IndexedDbColdStore, assertColdDatabaseName } from "../src/adapters/IndexedDbColdStore";

/** Fiber WASM stores a logical IndexedDB name, not an OS filesystem path. */
describe("Fiber 0.9.1 cold-store database identity", () => {
  it.each([
    "fc-testnet-00000000/fiber/store",
    "fc-testnet-00000000:fiber/store",
    "fiber/store/fc-testnet-00000000",
    "fiber-store (fc-testnet-00000000)",
    "fc-testnet-00000000",
  ])("accepts legitimate printable storage names (%s)", name => {
    expect(() => assertColdDatabaseName(name)).not.toThrow();
    expect(() => new IndexedDbColdStore(name, async () => {})).not.toThrow();
  });

  it.each(["", "x".repeat(513), "fiber\nstore", "fiber\u0000store", "fiber\u007fstore", "db\u{1f511}"])(
    "rejects empty, overlong, control or non-ASCII names", name => {
      expect(() => new IndexedDbColdStore(name, async () => {})).toThrow(/database name/i);
    }
  );

  it("does not silently normalize a database name", () => {
    const name = "fc-testnet-00000000/fiber/store";
    expect(new IndexedDbColdStore(name, async () => {}).databaseName).toBe(name);
    expect(new IndexedDbColdStore("fc-testnet-00000000\\fiber\\store", async () => {}).databaseName)
      .toBe("fc-testnet-00000000\\fiber\\store");
  });
});
