import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { verifyRecovery } from "../src/core/verify";

describe("post-restore verification", () => {
  it("treats full-coverage channel/payment mismatches as unsafe", async () => {
    const adapter = new DemoFiberAdapter();
    const before = await adapter.inspect();
    const after = structuredClone(before);
    after.channels[0].state = "BROKEN";
    after.channels[0].localBalance = "0 CKB";
    after.payments[0].status = "FAILED";

    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("unsafe");
    expect(report.checks.find((check) => check.key === "channels")?.status).toBe("fail");
    expect(report.checks.find((check) => check.key === "payments")?.status).toBe("fail");
  });

  it("treats full-coverage invoice mismatches as unsafe", async () => {
    const adapter = new DemoFiberAdapter();
    const before = await adapter.inspect();
    const after = structuredClone(before);
    after.invoices[0].status = "CANCELLED";

    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("unsafe");
    expect(report.checks.find((check) => check.key === "invoices")?.status).toBe("fail");
  });

  it("keeps metadata-only payment mismatches as warnings", async () => {
    const adapter = new DemoFiberAdapter();
    const before = await adapter.inspect();
    const after = structuredClone(before);
    before.capabilities.payments = "metadata";
    after.capabilities.payments = "metadata";
    after.payments[0].status = "FAILED";

    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("degraded");
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
