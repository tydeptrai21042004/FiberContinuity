import { describe, it, expect, vi } from "vitest";
import { IndexedDbColdStore, type ColdDatabaseDump } from "../src/adapters/IndexedDbColdStore";

function fixture() {
  const store = new IndexedDbColdStore("fc-testnet-test-stability", async () => {});
  const read = vi.spyOn(store, "exportBytes");
  const validate = vi.spyOn(store, "validateBytes").mockImplementation(async bytes => ({
    checksum: String(bytes[0]),
  } as ColdDatabaseDump));
  return {store, read, validate};
}

describe("bounded fail-closed cold snapshot stabilization", () => {
  it("accepts two complete consecutive matching exports without delay", async () => {
    const {store, read, validate} = fixture();
    read.mockResolvedValue(new Uint8Array([7]));
    const outcome = await store.exportStableBytes();
    expect(outcome.dump.checksum).toBe("7");
    expect(read).toHaveBeenCalledTimes(2);
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it("permits a short residual write to settle but still needs two equal snapshots", async () => {
    const {store, read} = fixture();
    for (const n of [1, 2, 2]) read.mockResolvedValueOnce(new Uint8Array([n]));
    const result = await store.exportStableBytes();
    expect(result.dump.checksum).toBe("2");
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("rejects five differing snapshots, never creating an archive", async () => {
    const {store, read} = fixture();
    for (const n of [1, 2, 3, 4, 5]) read.mockResolvedValueOnce(new Uint8Array([n]));
    await expect(store.exportStableBytes()).rejects.toMatchObject({code:"UNSTABLE_COLD_STORE", recoveryUnsafe:true});
    expect(read).toHaveBeenCalledTimes(5);
  });
  it("does not retry export failures or suppress storage exceptions", async () => {
    const {store, read} = fixture();
    read.mockRejectedValueOnce(new Error("Cannot back up a missing IndexedDB database."));
    await expect(store.exportStableBytes()).rejects.toThrow(/missing IndexedDB/);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
