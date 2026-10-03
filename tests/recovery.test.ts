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
