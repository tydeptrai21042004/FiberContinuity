import { describe, expect, it } from "vitest";
import type { FiberAdapter } from "../src/adapters/FiberAdapter";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { FiberContinuity } from "../src/core/continuity";
import type { FiberSnapshot } from "../src/core/types";

class DifferentVersionAdapter extends DemoFiberAdapter {
  override async inspect(): Promise<FiberSnapshot> {
    const snapshot = await super.inspect();
    return { ...snapshot, fiberVersion: "0.9.0" };
  }
}

class ForeignLiveTargetAdapter implements FiberAdapter {
  readonly name = "foreign-live";
  private readonly inner = new DemoFiberAdapter();

  async inspect(): Promise<FiberSnapshot> {
    const snapshot = await this.inner.inspect();
    return { ...snapshot, nodeId: "FOREIGN-NODE" };
  }
  exportNativeBackup() { return this.inner.exportNativeBackup(); }
  restoreNativeBackup(data: Uint8Array) { return this.inner.restoreNativeBackup(data); }
}

describe("continuity flow", () => {
  it("recovers the demo session after simulated local loss", async () => {
    const adapter = new DemoFiberAdapter();
    const continuity = new FiberContinuity(adapter);
    const original = await adapter.inspect();
    const archive = await continuity.createBackup("very-good-password");

    adapter.simulateBrowserStateLoss();
    expect((await adapter.inspect()).channels).toHaveLength(0);

    const preflight = await continuity.preflight(archive, "very-good-password");
    expect(preflight.compatibility.status).toBe("supported");
    expect(preflight.targetSafety.status).toBe("safe");

    const report = await continuity.restore(archive, "very-good-password");
    expect(report.overall).toBe("healthy");
    expect((await adapter.inspect()).nodeId).toBe(original.nodeId);
  });

  it("blocks review compatibility instead of proceeding", async () => {
    const source = new DemoFiberAdapter();
    const archive = await new FiberContinuity(source).createBackup("very-good-password");
    const target = new DifferentVersionAdapter();
    const continuity = new FiberContinuity(target);

    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/Restore blocked \(review\)/i);
  });

  it("blocks destructive restore into a different live node with existing records", async () => {
    const source = new DemoFiberAdapter();
    const archive = await new FiberContinuity(source).createBackup("very-good-password");
    const target = new ForeignLiveTargetAdapter();
    const continuity = new FiberContinuity(target);

    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/destructive restore|target/i);
  });
});

class RaceAfterPreflightAdapter extends DemoFiberAdapter {
  private checkpoints = 0;

  override async createRecoveryCheckpoint() {
    this.checkpoints += 1;
    const checkpoint = await super.createRecoveryCheckpoint();
    // The first checkpoint belongs to backup creation. The second is the pre-mutation rollback capture.
    if (this.checkpoints === 2) {
      const changed = structuredClone(checkpoint.snapshot);
      changed.payments.push({ id: "race-payment", status: "SUCCESS", amount: "1 CKB" });
      return { ...checkpoint, snapshot: changed };
    }
    return checkpoint;
  }
}

describe("recovery edge-case guards", () => {
  it("enforces the password minimum in the core API, not only the UI", async () => {
    const continuity = new FiberContinuity(new DemoFiberAdapter());
    await expect(continuity.createBackup("short")).rejects.toThrow(/at least 12 characters/i);
  });

  it("rejects invalid stability settings", () => {
    expect(() => new FiberContinuity(new DemoFiberAdapter(), { stableSamples: 1 })).toThrow(/at least two matching samples/i);
    expect(() => new FiberContinuity(new DemoFiberAdapter(), { timeoutMs: 100, pollIntervalMs: 100 })).toThrow(/timeout/i);
  });

  it("aborts when the target changes between preflight and mutation", async () => {
    const source = new RaceAfterPreflightAdapter();
    const continuity = new FiberContinuity(source);
    const archive = await continuity.createBackup("very-good-password");
    source.simulateBrowserStateLoss();

    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/target state changed after preflight/i);
  });

  it("demonstrates fail-closed reviewer scenarios", async () => {
    const adapter = new DemoFiberAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup("very-good-password");

    adapter.applyFaultScenario("foreign-node");
    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/target|blocked/i);

    adapter.reset();
    adapter.applyFaultScenario("network-mismatch");
    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/network identity/i);

    adapter.reset();
    adapter.applyFaultScenario("stale-state");
    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/review target|stale|blocked/i);
  });
});

class IncompleteVisibilitySameIdentityTarget implements FiberAdapter {
  readonly name = "incomplete-visibility";
  restored = false;

  constructor(private readonly snapshot: FiberSnapshot) {}

  async inspect(): Promise<FiberSnapshot> {
    return structuredClone(this.snapshot);
  }

  async exportNativeBackup(): Promise<Uint8Array> {
    return new TextEncoder().encode("rollback");
  }

  async restoreNativeBackup(): Promise<void> {
    this.restored = true;
  }
}

class RollbackExportFailureTarget implements FiberAdapter {
  readonly name = "rollback-export-failure";
  restored = false;

  constructor(private readonly snapshot: FiberSnapshot) {}

  async inspect(): Promise<FiberSnapshot> {
    return structuredClone(this.snapshot);
  }

  async exportNativeBackup(): Promise<Uint8Array> {
    throw new Error("disk read failed");
  }

  async restoreNativeBackup(): Promise<void> {
    this.restored = true;
  }
}

class StabilizationFailureAdapter extends DemoFiberAdapter {
  override async waitForRecoveryStable(): Promise<FiberSnapshot> {
    throw new Error("peer reconciliation timed out");
  }
}

describe("additional fail-closed restore guards", () => {
  it("does not treat an empty same-identity target as safe when recovery visibility is incomplete", async () => {
    const source = new DemoFiberAdapter();
    const sourceSnapshot = await source.inspect();
    const archive = await new FiberContinuity(source).createBackup("very-good-password");
    const targetSnapshot: FiberSnapshot = {
      ...structuredClone(sourceSnapshot),
      capturedAt: new Date().toISOString(),
      capabilities: { channels: "metadata", payments: "unavailable", invoices: "unavailable" },
      channels: [],
      payments: [],
      invoices: []
    };
    const target = new IncompleteVisibilitySameIdentityTarget(targetSnapshot);
    const continuity = new FiberContinuity(target);

    const preflight = await continuity.preflight(archive, "very-good-password");
    expect(preflight.targetSafety.status).toBe("review");
    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/unobservable|target/i);
    expect(target.restored).toBe(false);
  });

  it("aborts before mutation when rollback export fails operationally", async () => {
    const source = new DemoFiberAdapter();
    const sourceSnapshot = await source.inspect();
    const archive = await new FiberContinuity(source).createBackup("very-good-password");
    const targetSnapshot: FiberSnapshot = {
      ...structuredClone(sourceSnapshot),
      capturedAt: new Date().toISOString(),
      channels: [],
      payments: [],
      invoices: []
    };
    const target = new RollbackExportFailureTarget(targetSnapshot);
    const continuity = new FiberContinuity(target);

    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/rollback checkpoint.*disk read failed/i);
    expect(target.restored).toBe(false);
  });

  it("rolls back when post-restore stabilization fails", async () => {
    const adapter = new StabilizationFailureAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup("very-good-password");
    adapter.simulateBrowserStateLoss();

    await expect(continuity.restore(archive, "very-good-password")).rejects.toThrow(/previous target checkpoint was restored/i);
    expect((await adapter.inspect()).channels).toHaveLength(0);
  });
});
