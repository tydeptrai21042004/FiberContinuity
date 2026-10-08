import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { FiberJsAdapter, type FiberJsAdapterOptions } from "../src/adapters/FiberJsAdapter";
import { FiberContinuity } from "../src/core/continuity";
import { withAdapterLock } from "../src/core/operation";
import { verifyRecovery } from "../src/core/verify";

const validFiber = {
  async invokeCommand(method: string) {
    if (method === "node_info") return { pubkey: "03node" };
    if (method === "list_channels") return { channels: [] };
    throw new Error(`Unexpected command: ${method}`);
  }
};
function adapterWith(options: Partial<FiberJsAdapterOptions> = {}) {
  return new FiberJsAdapter({
    fiber: validFiber,
    version: "0.9.1",
    network: "testnet",
    networkIdentity: "ckb-testnet-genesis",
    ...options
  });
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("post-restore invariants", () => {
  it("fails closed when the actual Fiber version changes", async () => {
    const before = await new DemoFiberAdapter().inspect();
    const after = structuredClone(before);
    after.fiberVersion = "0.9.2";
    const report = verifyRecovery(before, after);
    expect(report.overall).toBe("unsafe");
    expect(report.checks.find((c) => c.key === "fiber-version")?.status).toBe("fail");
  });

  it("fails closed when a different adapter restores the state", async () => {
    const before = await new DemoFiberAdapter().inspect();
    const after = structuredClone(before);
    after.adapter = "foreign-adapter";
    expect(verifyRecovery(before, after).checks.find((c) => c.key === "adapter")?.status).toBe("fail");
  });

  it("retains HEALTHY for an unchanged full-coverage demo snapshot", async () => {
    const source = await new DemoFiberAdapter().inspect();
    expect(verifyRecovery(source, structuredClone(source)).overall).toBe("healthy");
  });
});

describe("native history visibility", () => {
  it("accepts explicit exhaustive payment/invoice hooks", async () => {
    const adapter = adapterWith({
      inspectPayments: async () => ({ coverage: "full", records: [{ id: "p1", status: "settled", amount: "100" }] }),
      inspectInvoices: async () => ({ coverage: "full", records: [{ id: "i1", status: "paid", amount: "100" }] })
    });
    const state = await adapter.inspect();
    expect(state.capabilities.payments).toBe("full");
    expect(state.capabilities.invoices).toBe("full");
    expect(state.payments).toEqual([{ id: "p1", status: "settled", amount: "100" }]);
  });

  it("does not promote absent hooks to full coverage", async () => {
    const state = await adapterWith().inspect();
    expect(state.capabilities.payments).toBe("unavailable");
    expect(state.capabilities.invoices).toBe("unavailable");
  });

  it("rejects duplicate and incomplete host record enumeration", async () => {
    const duplicate = adapterWith({ inspectPayments: async () => ({
      coverage: "metadata", records: [{ id: "p1", status: "ok" }, { id: "p1", status: "ok" }]
    }) });
    await expect(duplicate.inspect()).rejects.toThrow(/duplicate payments identifier/i);

    const missing = adapterWith({ inspectInvoices: async () => ({
      coverage: "full", records: [{ id: "i1", status: "paid" }]
    }) });
    await expect(missing.inspect()).rejects.toThrow(/no amount despite full coverage/i);
  });

  it("does not silently substitute empty records for a failed host call", async () => {
    const adapter = adapterWith({ inspectPayments: async () => { throw new Error("History RPC failed"); } });
    await expect(adapter.inspect()).rejects.toThrow(/History RPC failed/);
  });
});

describe("cross-context recovery locks", () => {
  it("refuses live browser operations when Web Locks are unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    const mutation = vi.fn(async () => "changed");
    await expect(withAdapterLock({}, "fiber-profile", mutation, true)).rejects.toThrow(/cross-tab Web Lock/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("refuses a Web Lock collision instead of running without a lock", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      locks: { request: (_name: string, _options: unknown, cb: (lock: null) => Promise<unknown>) => cb(null) }
    });
    const mutation = vi.fn(async () => undefined);
    await expect(withAdapterLock({}, "fiber-profile", mutation, true)).rejects.toThrow(/Another browser tab/i);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("requires a real native lease for non-demo operations", async () => {
    const live = adapterWith({ recoveryResourceId: "profile-test" });
    const continuity = new FiberContinuity(live);
    await expect(continuity.createBackup("a-long-recovery-password")).rejects.toThrow(/exclusive storage lease/i);
  });
});
