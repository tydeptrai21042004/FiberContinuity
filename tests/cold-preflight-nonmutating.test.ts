import { describe, it, expect, vi } from "vitest";
import { createIndexedDbColdHooks, type ColdFiberHost } from "../src/adapters/createIndexedDbColdHooks";
import { IndexedDbColdStore } from "../src/adapters/IndexedDbColdStore";
import type { FiberSnapshot } from "../src/core/types";

const host = (): ColdFiberHost => ({
  databaseName: "fc-testnet-fixture", nodeId: "02fixture", fiberVersion: "0.9.1", network: "testnet",
  networkIdentity: "testnet-fixture", acquireExclusiveRecoveryLease: async()=>()=>{},
  quiesceAndInspect: async()=>{throw new Error("not used");},
  stopAndFence: async()=>{throw new Error("preflight must not stop node");},
  assertOfflineAndExclusive: async()=>{}, resumeAfterBackup: async()=>{},
  startRestoredForIsolatedInspection: async()=>{}
});
describe("cold preflight never stops running nodes", () => {
  it("only checks offline fencing and creates an unobserved target without stopping", async () => {
    const h=host();
    const stop=vi.spyOn(h,"stopAndFence");
    const assert=vi.spyOn(h,"assertOfflineAndExclusive");
    const {recovery}=createIndexedDbColdHooks(h);
    const source: FiberSnapshot={ network:"testnet",nodeId:h.nodeId,networkIdentity:h.networkIdentity,
      fiberVersion:h.fiberVersion,adapter:"fiber-js",capturedAt:new Date().toISOString(),
      capabilities:{channels:"unavailable",payments:"unavailable",invoices:"unavailable"},channels:[],payments:[],invoices:[] };
    await recovery.inspectRestoreTarget!(source);
    expect(assert).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });
  it("fails closed while node is active; still never stops it implicitly", async () => {
    const h=host();
    h.assertOfflineAndExclusive=async()=>{throw new Error("stop explicitly first");};
    const stop=vi.spyOn(h,"stopAndFence");
    const {recovery}=createIndexedDbColdHooks(h);
    await expect(recovery.inspectRestoreTarget!({} as never)).rejects.toThrow(/stop explicitly/);
    expect(stop).not.toHaveBeenCalled();
  });
  it("still blocks occupied database profiles", async () => {
    const h=host();
    const spy=vi.spyOn(IndexedDbColdStore.prototype,"presence").mockResolvedValue("occupied");
    try {
      const hooks=createIndexedDbColdHooks(h);
      const source={nodeId:h.nodeId, network:"testnet",networkIdentity:h.networkIdentity,fiberVersion:h.fiberVersion} as never;
      expect((await hooks.assessRestoreTarget(source, source)).status).toBe("blocked");
    } finally {spy.mockRestore();}
  });
});
