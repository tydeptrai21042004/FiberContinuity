import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { verifyRecovery } from "../src/core/verify";

describe("post-restore verification", () => {
  it("detects same IDs with wrong channel/payment state", async () => {
    const adapter = new DemoFiberAdapter();
    const before = await adapter.inspect();
    const after = structuredClone(before);
    after.channels[0].state = "BROKEN";
    after.channels[0].localBalance = "0 CKB";
    after.payments[0].status = "FAILED";

    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("unsafe");
    expect(report.checks.find((check) => check.key === "channels")?.status).toBe("fail");
    expect(report.checks.find((check) => check.key === "payments")?.status).toBe("warn");
  });

  it("reports unavailable adapter coverage as unknown instead of a false PASS", async () => {
    const adapter = new DemoFiberAdapter();
    const before = await adapter.inspect();
    const after = structuredClone(before);
    before.capabilities.payments = "unavailable";
    after.capabilities.payments = "unavailable";
    before.payments = [];
    after.payments = [];

    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("degraded");
    expect(report.checks.find((check) => check.key === "payments")?.status).toBe("unknown");
  });
});
