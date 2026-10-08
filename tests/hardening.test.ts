import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { FiberJsAdapter } from "../src/adapters/FiberJsAdapter";
import { FiberContinuity } from "../src/core/continuity";
import { createArchive } from "../src/core/archive";
import { UnsupportedCapabilityError } from "../src/core/errors";
import { MemoryRecoveryJournal } from "../src/core/operation";
import type { FiberSnapshot } from "../src/core/types";

const PASS = "long-recovery-password";

class SlowNativeAdapter extends DemoFiberAdapter {
  resolveRestore: (() => void) | undefined;
  readonly entered: Promise<void>;
  private onEntered!: () => void;
  constructor() {
    super();
    this.entered = new Promise<void>((resolve) => { this.onEntered = resolve; });
  }
  override async restoreNativeBackup(data: Uint8Array) {
    this.onEntered();
    await new Promise<void>((resolve) => { this.resolveRestore = resolve; });
    return super.restoreNativeBackup(data);
  }
}

class IncorrectRestoreAdapter extends DemoFiberAdapter {
  override async restoreNativeBackup(data: Uint8Array) {
    await super.restoreNativeBackup(data);
    this.applyFaultScenario("stale-state");
  }
}

class FalseRollbackAdapter extends DemoFiberAdapter {
  private count = 0;
  override async restoreNativeBackup(data: Uint8Array) {
    this.count += 1;
    if (this.count === 1) {
      await super.restoreNativeBackup(data);
      throw new Error("native restore failed after writing data");
    }
    // The native hook falsely returns success without restoring the rollback bytes.
  }
}

class UnavailableCheckpointAdapter extends DemoFiberAdapter {
  mutations = 0;
  checkpoints = 0;
  override async createRecoveryCheckpoint() {
    this.checkpoints += 1;
    if (this.checkpoints === 2) throw new UnsupportedCapabilityError("Checkpoint not available");
    return super.createRecoveryCheckpoint();
  }
  override async restoreNativeBackup(data: Uint8Array) {
    this.mutations += 1;
    await super.restoreNativeBackup(data);
  }
}

class UnapprovedRollbackAdapter extends DemoFiberAdapter {
  // Implement a runtime getter to override the demo rollback safety capability.
  override readonly supportsSafeRollback: boolean = false;
  override async restoreNativeBackup(data: Uint8Array) {
    await super.restoreNativeBackup(data);
    throw new Error("write failed after mutation");
  }
}

class UnknownNetworkAdapter extends DemoFiberAdapter {
  override async inspect(): Promise<FiberSnapshot> {
    const snapshot = await super.inspect();
    return { ...snapshot, network: "unknown", networkIdentity: "unknown" };
  }
}

describe("concurrent operations", () => {
  it("blocks a second restore from another engine instance on the same adapter", async () => {
    const adapter = new SlowNativeAdapter();
    const a = new FiberContinuity(adapter);
    const b = new FiberContinuity(adapter);
    const archive = await a.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    const first = a.restore(archive, PASS);
    await adapter.entered;
    await expect(b.restore(archive, PASS)).rejects.toThrow(/already owns/i);
    adapter.resolveRestore?.();
    expect((await first).overall).toBe("healthy");
  });
  it("does not allow callback exceptions to interrupt a native mutation", async () => {
    const adapter = new DemoFiberAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    expect((await continuity.restore(archive, PASS, () => { throw new Error("UI unmounted"); })).overall).toBe("healthy");
  });
});

describe("transaction quarantine", () => {
  it("quarantines after an incorrect successful restore and blocks further operations", async () => {
    const adapter = new IncorrectRestoreAdapter();
    const journal = new MemoryRecoveryJournal();
    const continuity = new FiberContinuity(adapter, { journal });
    const archive = await continuity.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    const report = await continuity.restore(archive, PASS);
    expect(report.overall).toBe("unsafe");
    expect(journal.read()?.stage).toBe("quarantined");
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/unresolved recovery transaction/i);
    await expect(continuity.createBackup(PASS)).rejects.toThrow(/unresolved recovery transaction/i);
  });

  it("does not trust a rollback provider that returns success without restoring state", async () => {
    const adapter = new FalseRollbackAdapter();
    const journal = new MemoryRecoveryJournal();
    const continuity = new FiberContinuity(adapter, { journal });
    const archive = await continuity.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/could not be verified|fingerprint differs/i);
    expect(journal.read()?.stage).toBe("quarantined");
  });

  it("refuses mutation when capturing the rollback checkpoint is unsupported", async () => {
    const adapter = new UnavailableCheckpointAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/checkpoint not available/i);
    expect(adapter.mutations).toBe(0);
  });

  it("does not attempt automatic rollback without the provider's safety guarantee", async () => {
    const adapter = new UnapprovedRollbackAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup(PASS);
    adapter.simulateBrowserStateLoss();
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/Automatic rollback is not approved/i);
    expect(continuity.getInterruptedRecovery()?.stage).toBe("quarantined");
  });

  it("rejects already interrupted operations before any mutation", async () => {
    const journal = new MemoryRecoveryJournal();
    journal.write({ schemaVersion: 1, operationId: "deadbeef-abcd", startedAt: new Date().toISOString(), stage: "mutating" });
    const continuity = new FiberContinuity(new DemoFiberAdapter(), { journal });
    await expect(continuity.createBackup(PASS)).rejects.toThrow(/unresolved recovery transaction/i);
  });
});

describe("strict live readiness and network identity", () => {
  it("fails closed when both sides claim the same unknown network", async () => {
    const source = new UnknownNetworkAdapter();
    const continuity = new FiberContinuity(source);
    const archive = await continuity.createBackup(PASS);
    source.simulateBrowserStateLoss();
    const preflight = await continuity.preflight(archive, PASS);
    expect(preflight.networkMatches).toBe(false);
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/unknown Fiber\/CKB network identity/i);
  });

  it("does not treat malformed Fiber RPC channel response as an empty fully observed target", async () => {
    const adapter = new FiberJsAdapter({
      fiber: { async invokeCommand(method: string) { return method === "node_info" ? { pubkey: "03node" } : { invalid: [] }; } },
      version: "0.9.1", network: "testnet", networkIdentity: "ckb-testnet-genesis"
    });
    await expect(adapter.inspect()).rejects.toThrow(/response shape is invalid/i);
  });

  it("blocks a paginated Fiber channel enumeration", async () => {
    const adapter = new FiberJsAdapter({
      fiber: { async invokeCommand(method: string) { return method === "node_info" ? { pubkey: "03node" } : { channels: [], next_cursor: "page2" }; } },
      version: "0.9.1", network: "testnet", networkIdentity: "ckb-testnet-genesis"
    });
    await expect(adapter.inspect()).rejects.toThrow(/incomplete, paginated/i);
  });

  it("requires actual live checkpoint, lease and reconciliation capability", async () => {
    const adapter = new FiberJsAdapter({
      fiber: { async invokeCommand(method: string) { return method === "node_info" ? { pubkey: "03node" } : { channels: [] }; } },
      version: "0.9.1", network: "testnet", networkIdentity: "ckb-testnet-demo-genesis", recoveryResourceId: "testnet-wallet-1"
    });
    const source = new DemoFiberAdapter();
    const archive = await createArchive(await source.inspect(), await source.exportNativeBackup(), PASS);
    const continuity = new FiberContinuity(adapter);
    const preflight = await continuity.preflight(archive, PASS);
    expect(preflight.targetSafety.status).toBe("review");
    await expect(continuity.restore(archive, PASS)).rejects.toThrow(/exclusive storage lease|review target/i);
  });
});

describe("authenticated archive semantics", () => {
  it("rejects false full channel coverage", async () => {
    const adapter = new DemoFiberAdapter();
    const snapshot = await adapter.inspect();
    delete snapshot.channels[0].remoteBalance;
    await expect(createArchive(snapshot, await adapter.exportNativeBackup(), PASS)).rejects.toThrow(/Full channel coverage/i);
  });
  it("rejects unobservable record families containing actual records", async () => {
    const adapter = new DemoFiberAdapter();
    const snapshot = await adapter.inspect();
    snapshot.capabilities.payments = "unavailable";
    await expect(createArchive(snapshot, await adapter.exportNativeBackup(), PASS)).rejects.toThrow(/Unobservable recovery record families/i);
  });
});
