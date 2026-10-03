import type { FiberAdapter, RecoveryStabilityOptions } from "../adapters/FiberAdapter";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport, RestoreTargetAssessment } from "./types";
import { assessCompatibility } from "./compatibility";
import { createArchive, decryptArchive } from "./archive";
import { comparableSnapshot, verifyRecovery } from "./verify";

export interface FiberContinuityOptions extends Partial<RecoveryStabilityOptions> {}

const DEFAULT_STABILITY: RecoveryStabilityOptions = {
  timeoutMs: 5_000,
  pollIntervalMs: 100,
  stableSamples: 2
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function genericTargetSafety(expected: FiberSnapshot, current: FiberSnapshot): RestoreTargetAssessment {
  const visibleRecords = current.channels.length + current.payments.length + current.invoices.length;

  if (expected.nodeId === current.nodeId) {
    if (comparableSnapshot(expected) === comparableSnapshot(current)) {
      return { status: "safe", reason: "Target already matches the authenticated backup snapshot." };
    }
    if (visibleRecords > 0) {
      return {
        status: "review",
        reason: "Target has the same node identity but different live records. Refusing to overwrite potentially newer state without an explicit adapter safety decision."
      };
    }
    return { status: "safe", reason: "Target keeps the source identity but has no visible recovery records." };
  }

  
  if (visibleRecords > 0) {
    return {
      status: "blocked",
      reason: `Target belongs to a different node identity and contains ${visibleRecords} visible Fiber record(s). Refusing destructive restore.`
    };
  }

  const incompleteVisibility = Object.values(current.capabilities).some((coverage) => coverage === "unavailable");
  if (incompleteVisibility) {
    return {
      status: "review",
      reason: "Target identity differs and the adapter cannot prove that all relevant target state is empty. Supply an explicit target-safety hook."
    };
  }

  return {
    status: "safe",
    reason: "Target identity differs, but the adapter reports an empty fully-observable recovery target."
  };
}

export class FiberContinuity {
  private readonly stability: RecoveryStabilityOptions;

  constructor(private readonly adapter: FiberAdapter, options: FiberContinuityOptions = {}) {
    this.stability = { ...DEFAULT_STABILITY, ...options };
  }

  inspect() {
    return this.adapter.inspect();
  }

  private async createConsistentCheckpoint() {
    if (this.adapter.createRecoveryCheckpoint) {
      return this.adapter.createRecoveryCheckpoint();
    }

    const before = await this.adapter.inspect();
    const nativeBackup = await this.adapter.exportNativeBackup();
    const after = await this.adapter.inspect();
    if (comparableSnapshot(before) !== comparableSnapshot(after)) {
      throw new Error("Backup aborted: Fiber state changed while the native backup was being exported. Retry when the node is stable.");
    }
    return { snapshot: after, nativeBackup };
  }

  async createBackup(password: string): Promise<RecoveryArchive> {
    const checkpoint = await this.createConsistentCheckpoint();
    return createArchive(checkpoint.snapshot, checkpoint.nativeBackup, password);
  }

  private async preflightDecoded(source: FiberSnapshot, target: FiberSnapshot): Promise<RecoveryPreflight> {
    const compatibility = assessCompatibility(source.fiberVersion, target.fiberVersion);
    const networkMatches = source.network === target.network && source.networkIdentity === target.networkIdentity;
    const targetSafety = this.adapter.assessRestoreTarget
      ? await this.adapter.assessRestoreTarget(source, target)
      : genericTargetSafety(source, target);

    return {
      networkMatches,
      compatibility,
      targetSafety,
      sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId,
      source,
      target
    };
  }

  async preflight(archive: RecoveryArchive, password: string): Promise<RecoveryPreflight> {
    const decoded = await decryptArchive(archive, password);
    const target = await this.adapter.inspect();
    return this.preflightDecoded(decoded.snapshot, target);
  }

  private assertPreflightSafe(preflight: RecoveryPreflight): void {
    if (!preflight.networkMatches) {
      throw new Error("Restore blocked: backup belongs to a different Fiber/CKB network identity.");
    }
    if (preflight.compatibility.status !== "supported") {
      throw new Error(`Restore blocked (${preflight.compatibility.status}): ${preflight.compatibility.reason}`);
    }
    if (preflight.targetSafety.status !== "safe") {
      throw new Error(`Restore blocked (${preflight.targetSafety.status} target): ${preflight.targetSafety.reason}`);
    }
  }

  private async waitForStableRecovery(expected: FiberSnapshot): Promise<FiberSnapshot> {
    if (this.adapter.waitForRecoveryStable) {
      return this.adapter.waitForRecoveryStable(expected, this.stability);
    }

    const deadline = Date.now() + this.stability.timeoutMs;
    let previous = "";
    let stableCount = 0;
    let latest = await this.adapter.inspect();

    while (Date.now() <= deadline) {
      const current = comparableSnapshot(latest);
      stableCount = current === previous ? stableCount + 1 : 1;
      if (stableCount >= this.stability.stableSamples) return latest;
      previous = current;
      await sleep(this.stability.pollIntervalMs);
      latest = await this.adapter.inspect();
    }
    throw new Error("Recovery did not reach a stable observable state before the verification timeout.");
  }

  async restore(archive: RecoveryArchive, password: string): Promise<RecoveryReport> {
    const decoded = await decryptArchive(archive, password);
    const target = await this.adapter.inspect();
    const preflight = await this.preflightDecoded(decoded.snapshot, target);
    this.assertPreflightSafe(preflight);

    // Keep a best-effort rollback checkpoint in memory. It is used only when native restore/restart throws.
    // A verification finding is reported to the caller and is not silently rolled back.
    let rollback: Uint8Array | undefined;
    try {
      rollback = await this.adapter.exportNativeBackup();
    } catch {
      rollback = undefined;
    }

    try {
      await this.adapter.restoreNativeBackup(decoded.nativeBackup);
      await this.adapter.restartAfterRestore?.();
    } catch (error) {
      if (rollback) {
        try {
          await this.adapter.restoreNativeBackup(rollback);
          await this.adapter.restartAfterRestore?.();
        } catch {
          throw new Error(`Native restore failed and the automatic rollback also failed. Original error: ${error instanceof Error ? error.message : String(error)}`);
        }
        throw new Error(`Native restore failed; the previous target checkpoint was restored. Original error: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    }

    const after = await this.waitForStableRecovery(decoded.snapshot);
    return verifyRecovery(decoded.snapshot, after);
  }
}
