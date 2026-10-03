import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { FiberContinuity } from "../src/core/continuity";

describe("continuity flow", () => {
  it("recovers the demo session after simulated local loss", async () => {
    const adapter = new DemoFiberAdapter();
    const continuity = new FiberContinuity(adapter);
    const archive = await continuity.createBackup("very-good-password");

    adapter.simulateBrowserStateLoss();
    expect((await adapter.inspect()).channels).toHaveLength(0);

    const report = await continuity.restore(archive, "very-good-password");
    expect(report.overall).toBe("healthy");
    expect((await adapter.inspect()).nodeId).toBe(archive.snapshot.nodeId);
  });
});
