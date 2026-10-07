import type { FiberAdapter, RecoveryStabilityOptions } from "../adapters/FiberAdapter";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport, RestoreTargetAssessment } from "./types";
import { assessCompatibility } from "./compatibility";
import { createArchive, decryptArchive } from "./archive";
import { UnsupportedCapabilityError } from "./errors";
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

function assertCreatePassword(password: string): void {
  if (password.length < 12) {
    throw new Error("Recovery password must be at least 12 characters.");
  }
}

function normalizeStability(options: FiberContinuityOptions): RecoveryStabilityOptions {
  const stability = { ...DEFAULT_STABILITY, ...options };
  if (!Number.isFinite(stability.timeoutMs) || stability.timeoutMs < 250) {
    throw new Error("Recovery stability timeout must be at least 250 ms.");
  }
  if (!Number.isFinite(stability.pollIntervalMs) || stability.pollIntervalMs < 10) {
    throw new Error("Recovery stability poll interval must be at least 10 ms.");
  }
  if (!Number.isInteger(stability.stableSamples) || stability.stableSamples < 2) {
    throw new Error("Recovery stability requires at least two matching samples.");
  }
  if (stability.pollIntervalMs >= stability.timeoutMs) {
    throw new Error("Recovery stability poll interval must be shorter than the timeout.");
  }
  return stability;
}

function hasUnavailableRecoveryVisibility(snapshot: FiberSnapshot): boolean {
  return Object.values(snapshot.capabilities).some((coverage) => coverage === "unavailable");
}

function genericTargetSafety(expected: FiberSnapshot, current: FiberSnapshot): RestoreTargetAssessment {
  const visibleRecords = current.channels.length + current.payments.length + current.invoices.length;
  const incompleteVisibility = hasUnavailableRecoveryVisibility(current);

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
    if (incompleteVisibility) {
      return {
        status: "review",
        reason: "Target keeps the source identity but differs from the backup and some recovery state is unobservable. Supply an explicit target-safety hook before destructive restore."
      };
    }
    return { status: "safe", reason: "Target keeps the source identity and all observable recovery record families are empty." };
  }

  if (visibleRecords > 0) {
    return {
      status: "blocked",
      reason: `Target belongs to a different node identity and contains ${visibleRecords} visible Fiber record(s). Refusing destructive restore.`
    };
  }

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class FiberContinuity {
  private readonly stability: RecoveryStabilityOptions;

  constructor(private readonly adapter: FiberAdapter, options: FiberContinuityOptions = {}) {
    this.stability = normalizeStability(options);
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
    assertCreatePassword(password);
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

  /**
   * Captures rollback bytes while proving the target did not change between preflight and mutation.
   * Only an explicit UnsupportedCapabilityError may disable rollback. Operational export failures abort.
   */
  private async prepareRollback(expectedTarget: FiberSnapshot): Promise<Uint8Array | undefined> {
    if (this.adapter.createRecoveryCheckpoint) {
      const checkpoint = await this.adapter.createRecoveryCheckpoint();
      if (comparableSnapshot(checkpoint.snapshot) !== comparableSnapshot(expectedTarget)) {
        throw new Error("Restore aborted: target state changed after preflight. Run preflight again against the latest state.");
      }
      return checkpoint.nativeBackup;
    }

    const before = await this.adapter.inspect();
    if (comparableSnapshot(before) !== comparableSnapshot(expectedTarget)) {
      throw new Error("Restore aborted: target state changed after preflight. Run preflight again against the latest state.");
    }

    try {
      const rollback = await this.adapter.exportNativeBackup();
      const after = await this.adapter.inspect();
      if (comparableSnapshot(before) !== comparableSnapshot(after)) {
        throw new Error("Restore aborted: target state changed while the rollback checkpoint was being captured.");
      }
      return rollback;
    } catch (error) {
      if (error instanceof UnsupportedCapabilityError) return undefined;
      throw new Error(`Restore aborted: rollback checkpoint could not be captured safely. ${errorMessage(error)}`);
    }
  }

  private async rollbackAfterFailure(rollback: Uint8Array | undefined, failure: unknown): Promise<never> {
    if (!rollback) throw failure instanceof Error ? failure : new Error(String(failure));

    try {
      await this.adapter.restoreNativeBackup(rollback);
      await this.adapter.restartAfterRestore?.();
    } catch (rollbackError) {
      throw new Error(
        `Recovery failed and the automatic rollback also failed. Recovery error: ${errorMessage(failure)}. Rollback error: ${errorMessage(rollbackError)}`
      );
    }

    throw new Error(`Recovery failed; the previous target checkpoint was restored. Original error: ${errorMessage(failure)}`);
  }

  async restore(archive: RecoveryArchive, password: string): Promise<RecoveryReport> {
    const decoded = await decryptArchive(archive, password);
    const target = await this.adapter.inspect();
    const preflight = await this.preflightDecoded(decoded.snapshot, target);
    this.assertPreflightSafe(preflight);

    const rollback = await this.prepareRollback(target);

    let after: FiberSnapshot;
    try {
      await this.adapter.restoreNativeBackup(decoded.nativeBackup);
      await this.adapter.restartAfterRestore?.();
      after = await this.waitForStableRecovery(decoded.snapshot);
    } catch (error) {
      return this.rollbackAfterFailure(rollback, error);
    }

    return verifyRecovery(decoded.snapshot, after);
  }
}
