import type { FiberSnapshot, RestoreTargetAssessment } from "../core/types";
import type { NativeRecoveryHooks } from "./FiberJsAdapter";
import { IndexedDbColdStore } from "./IndexedDbColdStore";

/**
 * Host integration for a version-pinned Fiber JS testnet node.
 * Implementations MUST be supplied by the SAME ORIGIN as the real Fiber database.
 * No default hook claims that fiber-js.stop() flushes or fences its workers.
 */
export interface ColdFiberHost {
  databaseName: string;
  /** A stable identity derived from the wallet's persisted original secret key. */
  nodeId: string;
  fiberVersion: string;
  network: "testnet"; // deliberately testnet-only for this experimental adapter
  networkIdentity: string;
  /** Fences all participating tabs, workers, and database writers, not only this UI. */
  acquireExclusiveRecoveryLease(): Promise<() => void | Promise<void>>;
  /** Stop new writes and inspect a stable node state, BEFORE stopping the node. */
  quiesceAndInspect(): Promise<FiberSnapshot>;
  /** Stop Fiber and all writers; await definitive worker/db closure. */
  stopAndFence(): Promise<void>;
  /** Fail unless ALL writer processes and connections are conclusively stopped. */
  assertOfflineAndExclusive(): Promise<void>;
  /** Resume the previously quiesced node after creating a backup. */
  resumeAfterBackup(): Promise<void>;
  /**
   * Start restored state in a GUARANTEED ISOLATED, non-paying/non-signing mode.
   * If isolation cannot be guaranteed by the host, throw and leave it stopped.
   */
  startRestoredForIsolatedInspection(): Promise<void>;
}

/**
 * These are operational primitives, NOT a claim that stock fiber-js exposes a
 * guaranteed quiesce/flush API. Connect a reviewed host lifecycle implementation.
 */
export function createIndexedDbColdHooks(host: ColdFiberHost): {
  recovery: NativeRecoveryHooks;
  assessRestoreTarget: (source: FiberSnapshot, current: FiberSnapshot) => Promise<RestoreTargetAssessment>;
} {
  if (!host.databaseName || !host.nodeId || !host.networkIdentity || host.network !== "testnet") {
    throw new Error("Cold Fiber integration requires a named testnet database and persistent identity/configuration.");
  }
  const store = new IndexedDbColdStore(host.databaseName, () => host.assertOfflineAndExclusive());
  function targetSnapshot(): FiberSnapshot {
    return {
      capturedAt: new Date().toISOString(), adapter: "fiber-js", fiberVersion: host.fiberVersion,
      network: host.network, networkIdentity: host.networkIdentity, nodeId: host.nodeId,
      capabilities: { channels: "unavailable", payments: "unavailable", invoices: "unavailable" },
      channels: [], payments: [], invoices: []
    };
  }
  async function assess(source: FiberSnapshot): Promise<RestoreTargetAssessment> {
    if (source.network !== "testnet" || source.networkIdentity !== host.networkIdentity || source.nodeId !== host.nodeId || source.fiberVersion !== host.fiberVersion) {
      return { status: "blocked", reason: "Backup network, persisted node identity or pinned runtime is different from this recovery profile." };
    }
    const state = await store.presence();
    if (state === "occupied") return { status: "blocked", reason: "Existing node database contains records. This adapter never overwrites occupied channel state." };
    return { status: "safe", reason: `The host confirms a stopped, writer-fenced ${state} IndexedDB testnet profile, matching persisted node keys/configuration.` };
  }
  const recovery: NativeRecoveryHooks = {
    supportsSafeRollback: false,
    acquireExclusiveRecoveryLease: () => host.acquireExclusiveRecoveryLease(),
    async createCheckpoint() {
      const snapshot = await host.quiesceAndInspect();
      if (snapshot.nodeId !== host.nodeId || snapshot.networkIdentity !== host.networkIdentity ||
          snapshot.network !== "testnet" || snapshot.fiberVersion !== host.fiberVersion) {
        throw new Error("Frozen node snapshot does not match the pinned host identity/configuration.");
      }
      await host.stopAndFence();
      const nativeBackup = await store.exportBytes();
      await host.resumeAfterBackup();
      return { snapshot, nativeBackup };
    },
    async exportBackup() { return store.exportBytes(); },
    async inspectRestoreTarget(source) {
      await host.stopAndFence();
      // Never claim the records in an absent profile were actually inspected.
      const target = targetSnapshot();
      if (source.nodeId !== target.nodeId) return target;
      return target;
    },
    async prepareColdRestore(source, target) {
      await host.stopAndFence();
      if (target.nodeId !== host.nodeId || target.networkIdentity !== host.networkIdentity ||
          target.fiberVersion !== host.fiberVersion) throw new Error("Recovery target identity/configuration changed after preflight.");
      const decision = await assess(source);
      if (decision.status !== "safe") throw new Error(`Cold restore blocked: ${decision.reason}`);
    },
    async restoreBackup(bytes) {
      await host.assertOfflineAndExclusive();
      await store.restoreBytes(bytes);
    },
    restartAfterRestore: () => host.startRestoredForIsolatedInspection()
  };
  return { recovery, assessRestoreTarget: (source) => assess(source) };
}
