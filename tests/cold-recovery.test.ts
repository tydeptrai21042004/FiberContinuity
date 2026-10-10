import { describe, expect, it, vi } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import type { FiberAdapter } from "../src/adapters/FiberAdapter";
import { IndexedDbColdStore } from "../src/adapters/IndexedDbColdStore";
import { createIndexedDbColdHooks, type ColdFiberHost } from "../src/adapters/createIndexedDbColdHooks";
import { FiberContinuity } from "../src/core/continuity";
import type { FiberSnapshot } from "../src/core/types";

const PASSWORD = "strong cold recovery password";
function syntheticLive(fail = false): { adapter: FiberAdapter; backing: DemoFiberAdapter; flags: { mutated: boolean } } {
  const backing = new DemoFiberAdapter();
  const flags = { mutated: false };
  const adapter: FiberAdapter = {
    name: "fiber-js", recoveryResourceId: `cold-test-${crypto.randomUUID()}`,
    checkpointSupported: true, readinessSupported: true, supportsSafeRollback: false,
    acquireRecoveryLease: async () => () => {},
    inspect: async () => ({ ...await backing.inspect(), adapter: "fiber-js" }),
    inspectRestoreTarget: async (source) => ({ ...source, capturedAt: new Date().toISOString(),
      capabilities: { channels: "unavailable", payments: "unavailable", invoices: "unavailable" },
      channels: [], payments: [], invoices: [] }),
    assessRestoreTarget: async () => ({ status: "safe", reason: "Fixture guarantees an isolated empty storage target." }),
    prepareColdRestore: async () => {},
    createRecoveryCheckpoint: async () => {
      const cp = await backing.createRecoveryCheckpoint();
      return { snapshot: { ...cp.snapshot, adapter: "fiber-js" }, nativeBackup: cp.nativeBackup };
    },
    exportNativeBackup: () => backing.exportNativeBackup(),
    restoreNativeBackup: async (bytes) => {
      flags.mutated = true;
      if (fail) throw new Error("fault after mutation was started");
      await backing.restoreNativeBackup(bytes);
    },
    restartAfterRestore: async () => {},
    waitForRecoveryStable: async (): Promise<FiberSnapshot> => ({ ...await backing.inspect(), adapter: "fiber-js" })
  };
  return { adapter, backing, flags };
}

describe("cold whole-node recovery safety", () => {
  it("refuses an invalid or implicit storage profile name", () => {
    expect(() => new IndexedDbColdStore("", async () => {})).toThrow(/stable, explicit/);
    expect(() => new IndexedDbColdStore("unsafe profile", async () => {})).toThrow(/stable, explicit/);
  });

  it("rejects mainnet cold recovery even with a declared host", () => {
    const host = { databaseName: "test", nodeId: "persistent-node", fiberVersion: "0.9.1",
      networkIdentity: "testnet-genesis", network: "mainnet" } as unknown as ColdFiberHost;
    expect(() => createIndexedDbColdHooks(host)).toThrow(/testnet/);
  });

  it("allows only an absent/empty, matching-identity cold target", async () => {
    const presence = vi.spyOn(IndexedDbColdStore.prototype, "presence").mockResolvedValue("absent");
    const host: ColdFiberHost = {
      databaseName: "testnet-profile", nodeId: "persisted-node", fiberVersion: "0.9.1", network: "testnet",
      networkIdentity: "expected-testnet-genesis", acquireExclusiveRecoveryLease: async () => () => {},
      quiesceAndInspect: async () => { throw new Error("not needed"); },
      stopAndFence: async () => {}, assertOfflineAndExclusive: async () => {},
      resumeAfterBackup: async () => {}, startRestoredForIsolatedInspection: async () => {}
    };
    const { assessRestoreTarget } = createIndexedDbColdHooks(host);
    const expected = { ...await new DemoFiberAdapter().inspect(), nodeId: host.nodeId,
      networkIdentity: host.networkIdentity, adapter: "fiber-js" };
    expect((await assessRestoreTarget(expected, expected)).status).toBe("safe");
    expect((await assessRestoreTarget({ ...expected, nodeId: "foreign" }, expected)).status).toBe("blocked");
    presence.mockResolvedValue("occupied");
    expect((await assessRestoreTarget(expected, expected)).status).toBe("blocked");
    presence.mockRestore();
  });

  it("does not promote local Fiber observations to authoritative channel safety", async () => {
    const { adapter, backing } = syntheticLive();
    const engine = new FiberContinuity(adapter);
    const archive = await engine.createBackup(PASSWORD);
    backing.simulateBrowserStateLoss();
    const report = await engine.restore(archive, PASSWORD);
    expect(report.overall).toBe("degraded");
    expect(report.checks.find((c) => c.key === "peer-channel-safety")?.status).toBe("unknown");
    expect(engine.getInterruptedRecovery()?.stage).toBe("quarantined");
    await expect(engine.restore(archive, PASSWORD)).rejects.toThrow(/unresolved recovery transaction/i);
  });

  it("quarantines a failed cold write and never attempts automatic rollback", async () => {
    const { adapter, flags } = syntheticLive(true);
    const engine = new FiberContinuity(adapter);
    const archive = await engine.createBackup(PASSWORD);
    await expect(engine.restore(archive, PASSWORD)).rejects.toThrow(/Cold IndexedDB restore was interrupted/);
    expect(flags.mutated).toBe(true);
    expect(engine.getInterruptedRecovery()?.stage).toBe("quarantined");
  });
});
