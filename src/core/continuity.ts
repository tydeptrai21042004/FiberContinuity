import type { FiberAdapter, RecoveryStabilityOptions } from "../adapters/FiberAdapter";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport, RestoreTargetAssessment } from "./types";
import { assessCompatibility } from "./compatibility";
import { assertSnapshot, createArchive, decryptArchive } from "./archive";
import { ContinuityError, UnsupportedCapabilityError } from "./errors";
import { comparableSnapshot, verifyRecovery } from "./verify";
import {
  BrowserRecoveryJournal, MemoryRecoveryJournal, type RecoveryJournal,
  type TransactionMarker, type TransactionStage, withAdapterLock
} from "./operation";

export interface FiberContinuityOptions extends Partial<RecoveryStabilityOptions> {
  /** For live integrations, require upstream-defined atomic checkpoints instead of optimistic double-inspection. */
  requireAtomicCheckpoint?: boolean;
  /** Optional journal implementation; defaults to durable browser journal when a stable resource ID is provided. */
  journal?: RecoveryJournal;
}

export type RecoveryStage = "decrypting" | "inspecting-target" | "preflight" | "capturing-rollback" |
  "restoring" | "restarting" | "stabilizing" | "verifying" | "rolling-back" | "complete";
export interface RecoveryProgressEvent { stage: RecoveryStage; detail: string }
export type RecoveryProgressCallback = (event: RecoveryProgressEvent) => void;

const DEFAULT_STABILITY: RecoveryStabilityOptions = { timeoutMs: 5_000, pollIntervalMs: 100, stableSamples: 2 };
const journals = new WeakMap<object, RecoveryJournal>();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function getJournal(adapter: FiberAdapter): RecoveryJournal {
  const existing = journals.get(adapter);
  if (existing) return existing;
  const journal = adapter.recoveryResourceId && typeof window !== "undefined"
    ? new BrowserRecoveryJournal(adapter.recoveryResourceId, window.localStorage)
    : new MemoryRecoveryJournal();
  journals.set(adapter, journal);
  return journal;
}
function normalizeStability(options: FiberContinuityOptions): RecoveryStabilityOptions {
  const stability = { ...DEFAULT_STABILITY, ...options };
  if (!Number.isFinite(stability.timeoutMs) || stability.timeoutMs < 250 || stability.timeoutMs > 600_000) {
    throw new Error("Recovery stability timeout must be between 250 ms and 600000 ms.");
  }
  if (!Number.isFinite(stability.pollIntervalMs) || stability.pollIntervalMs < 10) {
    throw new Error("Recovery stability poll interval must be at least 10 ms.");
  }
  if (!Number.isInteger(stability.stableSamples) || stability.stableSamples < 2 || stability.stableSamples > 1000) {
    throw new Error("Recovery stability requires at least two matching samples (maximum 1000).");
  }
  if (stability.pollIntervalMs * (stability.stableSamples - 1) >= stability.timeoutMs) {
    throw new Error("Recovery stability timeout cannot accommodate the requested stable samples.");
  }
  return stability;
}
function knownNetwork(snapshot: FiberSnapshot): boolean {
  return (snapshot.network === "testnet" || snapshot.network === "mainnet") &&
    snapshot.networkIdentity.trim().toLowerCase() !== "unknown";
}
function genericTargetSafety(expected: FiberSnapshot, current: FiberSnapshot): RestoreTargetAssessment {
  const visibleRecords = current.channels.length + current.payments.length + current.invoices.length;
  const incomplete = Object.values(current.capabilities).some((coverage) => coverage !== "full");
  if (expected.nodeId === current.nodeId) {
    if (comparableSnapshot(expected) === comparableSnapshot(current)) {
      return { status: "safe", reason: "Target already matches the authenticated backup snapshot." };
    }
    if (visibleRecords > 0 || incomplete) {
      return { status: "review", reason: "Same-identity target differs from backup or contains unobservable recovery state. Require an explicit upstream safety decision." };
    }
    return { status: "safe", reason: "Same-identity target is fully observable and has no recovery records." };
  }
  if (visibleRecords > 0) return { status: "blocked", reason: "Different node identity has existing live Fiber records; destructive restore is blocked." };
  if (incomplete) return { status: "review", reason: "A different-identity target cannot be proven empty while records are unobservable." };
  return { status: "safe", reason: "Target differs in identity but all supported recovery record families are observed as empty." };
}
function safeProgress(progress: RecoveryProgressCallback | undefined, stage: RecoveryStage, detail: string): void {
  // A rendering/telemetry callback must not cause a destructive recovery to stop mid-mutation.
  try { progress?.({ stage, detail }); } catch { /* best-effort telemetry */ }
}

export class FiberContinuity {
  private readonly stability: RecoveryStabilityOptions;
  private readonly journal: RecoveryJournal;
  private readonly requireAtomicCheckpoint: boolean;
  constructor(private readonly adapter: FiberAdapter, options: FiberContinuityOptions = {}) {
    this.stability = normalizeStability(options);
    this.journal = options.journal ?? getJournal(adapter);
    this.requireAtomicCheckpoint = options.requireAtomicCheckpoint ?? !adapter.name.startsWith("demo-");
  }

  inspect() { return this.adapter.inspect(); }
  getInterruptedRecovery(): TransactionMarker | null { return this.journal.read(); }
  /** Only for the deterministic demo environment; NOT a production unlock mechanism. */
  clearDemoRecoveryJournal(): void {
    if (!(this.adapter.name.startsWith("demo-") && this.adapter.supportsSafeRollback)) {
      throw new ContinuityError("MANUAL_REVIEW_REQUIRED", "Production recovery quarantine cannot be cleared by the UI.", true);
    }
    this.journal.clear();
  }

  private async exclusive<T>(fn: () => Promise<T>, needNativeLease = true): Promise<T> {
    if (this.requireAtomicCheckpoint && !this.adapter.recoveryResourceId) {
      throw new ContinuityError("RECOVERY_RESOURCE_UNDEFINED", "Live Fiber recovery requires a stable storage resource ID for cross-tab safety.");
    }
    return withAdapterLock(this.adapter, this.adapter.recoveryResourceId, async () => {
      if (needNativeLease && this.requireAtomicCheckpoint && !this.adapter.acquireRecoveryLease) {
        throw new ContinuityError("NATIVE_LEASE_REQUIRED", "Live Fiber operation requires a native exclusive storage lease.");
      }
      const release = needNativeLease ? await this.adapter.acquireRecoveryLease?.() : undefined;
      if (needNativeLease && this.requireAtomicCheckpoint && typeof release !== "function") {
        throw new ContinuityError("NATIVE_LEASE_INVALID", "Native recovery lease did not return its required release function.");
      }
      try { return await fn(); }
      finally { await release?.(); }
    }, this.requireAtomicCheckpoint);
  }

  private assertNoInterruptedTransaction(): void {
    const previous = this.journal.read();
    if (previous) throw new ContinuityError("RECOVERY_INTERRUPTED",
      `Restore blocked: unresolved recovery transaction ${previous.operationId} (${previous.stage}). Keep the target quarantined and follow the native recovery procedure.`, true);
  }

  private async createConsistentCheckpoint() {
    if (this.adapter.createRecoveryCheckpoint) {
      const result = await this.adapter.createRecoveryCheckpoint();
      assertSnapshot(result.snapshot);
      this.assertNativeBytes(result.nativeBackup);
      return result;
    }
    if (this.requireAtomicCheckpoint) {
      throw new ContinuityError("ATOMIC_CHECKPOINT_REQUIRED", "Production backup requires an upstream-defined atomic recovery checkpoint.");
    }
    // Best effort for simulated / test adapters only; matching observations do not prove atomicity.
    const before = await this.adapter.inspect();
    assertSnapshot(before);
    const nativeBackup = await this.adapter.exportNativeBackup();
    const after = await this.adapter.inspect();
    assertSnapshot(after);
    this.assertNativeBytes(nativeBackup);
    if (comparableSnapshot(before) !== comparableSnapshot(after)) {
      throw new Error("Backup aborted: Fiber state changed while native backup was exported.");
    }
    return { snapshot: after, nativeBackup };
  }

  private assertNativeBytes(data: Uint8Array): void {
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new ContinuityError("CHECKPOINT_INVALID", "Native checkpoint must contain non-empty binary recovery data.");
    }
  }

  async createBackup(password: string): Promise<RecoveryArchive> {
    if (password.length < 12) throw new Error("Recovery password must be at least 12 characters.");
    return this.exclusive(async () => {
      this.assertNoInterruptedTransaction();
      const checkpoint = await this.createConsistentCheckpoint();
      return createArchive(checkpoint.snapshot, checkpoint.nativeBackup, password);
    });
  }

  private async preflightDecoded(source: FiberSnapshot, target: FiberSnapshot): Promise<RecoveryPreflight> {
    assertSnapshot(source);
    assertSnapshot(target);
    const compatibility = source.adapter === target.adapter
      ? assessCompatibility(source.fiberVersion, target.fiberVersion)
      : { status: "blocked" as const, reason: "Source and target recovery adapters differ. No cross-adapter native restore is approved." };
    const networkMatches = knownNetwork(source) && knownNetwork(target) &&
      source.network === target.network && source.networkIdentity === target.networkIdentity;
    let targetSafety = this.adapter.assessRestoreTarget
      ? await this.adapter.assessRestoreTarget(source, target)
      : genericTargetSafety(source, target);
    if (this.requireAtomicCheckpoint && (!this.adapter.checkpointSupported ||
        !this.adapter.acquireRecoveryLease || !this.adapter.readinessSupported)) {
      targetSafety = { status: "review", reason: "Live recovery requires verified native checkpoint, exclusive lease and peer-reconciliation integrations." };
    }
    if (!targetSafety || !["safe", "review", "blocked"].includes(targetSafety.status) ||
      typeof targetSafety.reason !== "string" || !targetSafety.reason.trim()) {
      throw new ContinuityError("TARGET_ASSESSMENT_INVALID", "Adapter returned an invalid target-safety decision.");
    }
    return { networkMatches, compatibility, targetSafety, sourceNodeId: source.nodeId,
      targetNodeId: target.nodeId, source, target };
  }

  async preflight(archive: RecoveryArchive, password: string): Promise<RecoveryPreflight> {
    return this.exclusive(async () => {
      this.assertNoInterruptedTransaction();
      const decoded = await decryptArchive(archive, password);
      return this.preflightDecoded(decoded.snapshot, this.adapter.inspectRestoreTarget
        ? await this.adapter.inspectRestoreTarget(decoded.snapshot) : await this.adapter.inspect());
    }, this.requireAtomicCheckpoint);
  }

  private assertPreflightSafe(preflight: RecoveryPreflight): void {
    if (!preflight.networkMatches) throw new Error("Restore blocked: backup belongs to a different or unknown Fiber/CKB network identity.");
    if (preflight.compatibility.status !== "supported") {
      throw new Error(`Restore blocked (${preflight.compatibility.status}): ${preflight.compatibility.reason}`);
    }
    if (preflight.targetSafety.status !== "safe") {
      throw new Error(`Restore blocked (${preflight.targetSafety.status} target): ${preflight.targetSafety.reason}`);
    }
  }

  private async waitForStableRecovery(expected: FiberSnapshot): Promise<FiberSnapshot> {
    if (this.adapter.waitForRecoveryStable) {
      const result = await this.adapter.waitForRecoveryStable(expected, this.stability);
      assertSnapshot(result);
      return result;
    }
    const deadline = Date.now() + this.stability.timeoutMs;
    let previous = "";
    let stableCount = 0;
    while (Date.now() <= deadline) {
      const latest = await this.adapter.inspect();
      assertSnapshot(latest);
      const current = comparableSnapshot(latest);
      stableCount = current === previous ? stableCount + 1 : 1;
      if (stableCount >= this.stability.stableSamples) return latest;
      previous = current;
      await sleep(this.stability.pollIntervalMs);
    }
    throw new Error("Recovery did not reach a stable observable state before the verification timeout.");
  }

  private async prepareRollback(expectedTarget: FiberSnapshot): Promise<Uint8Array> {
    if (this.adapter.createRecoveryCheckpoint) {
      const checkpoint = await this.adapter.createRecoveryCheckpoint();
      assertSnapshot(checkpoint.snapshot);
      this.assertNativeBytes(checkpoint.nativeBackup);
      if (comparableSnapshot(checkpoint.snapshot) !== comparableSnapshot(expectedTarget)) {
        throw new Error("Restore aborted: target state changed after preflight. Run preflight again against the latest state.");
      }
      return checkpoint.nativeBackup;
    }
    if (this.requireAtomicCheckpoint) {
      throw new ContinuityError("ATOMIC_CHECKPOINT_REQUIRED", "Production restore requires an atomic rollback checkpoint before mutation.");
    }
    const before = await this.adapter.inspect();
    assertSnapshot(before);
    if (comparableSnapshot(before) !== comparableSnapshot(expectedTarget)) {
      throw new Error("Restore aborted: target state changed after preflight. Run preflight again against the latest state.");
    }
    try {
      const rollback = await this.adapter.exportNativeBackup();
      this.assertNativeBytes(rollback);
      const after = await this.adapter.inspect();
      assertSnapshot(after);
      if (comparableSnapshot(before) !== comparableSnapshot(after)) {
        throw new Error("Restore aborted: target state changed while rollback checkpoint was being captured.");
      }
      return rollback;
    } catch (error) {
      if (error instanceof UnsupportedCapabilityError) {
        throw new ContinuityError("ROLLBACK_UNAVAILABLE", "Restore aborted: a rollback checkpoint is required before mutation.");
      }
      throw new Error(`Restore aborted: rollback checkpoint could not be captured safely. ${message(error)}`);
    }
  }

  private mark(marker: TransactionMarker, stage: TransactionStage): void {
    marker.stage = stage;
    this.journal.write(marker);
  }
  private quarantine(marker: TransactionMarker): void {
    this.mark(marker, "quarantined");
  }

  private async verifyRollback(target: FiberSnapshot): Promise<void> {
    // Do not rely on a potentially failed post-restore reconciliation hook for rollback verification.
    // This confirms local snapshot equality ONLY, and is used solely for adapters explicitly
    // guaranteeing that native automatic rollback is safe (the demo adapter does).
    const first = await this.adapter.inspect();
    assertSnapshot(first);
    const second = await this.adapter.inspect();
    assertSnapshot(second);
    if (comparableSnapshot(first) !== comparableSnapshot(target) ||
        comparableSnapshot(second) !== comparableSnapshot(target)) {
      throw new Error("Rollback acknowledged by provider but checkpoint fingerprint differs.");
    }
  }

  private async rollbackAfterFailure(rollback: Uint8Array, target: FiberSnapshot, failure: unknown,
    marker: TransactionMarker, progress?: RecoveryProgressCallback): Promise<never> {
    if (!this.adapter.supportsSafeRollback) {
      this.quarantine(marker);
      throw new ContinuityError("RECOVERY_UNVERIFIED", `Recovery interrupted after mutation. Automatic rollback is not approved for this adapter. ${message(failure)}`, true);
    }
    safeProgress(progress, "rolling-back", "Recovery failed. Verifying restoration of the pre-mutation checkpoint.");
    try {
      await this.adapter.restoreNativeBackup(rollback);
      await this.adapter.restartAfterRestore?.();
      await this.verifyRollback(target);
      this.journal.clear();
    } catch (rollbackError) {
      this.quarantine(marker);
      throw new ContinuityError("ROLLBACK_UNVERIFIED",
        `Recovery failed and previous state could not be verified. Recovery error: ${message(failure)}. Rollback error: ${message(rollbackError)}`, true);
    }
    throw new ContinuityError("RECOVERY_ROLLED_BACK", `Recovery failed; the previous target checkpoint was restored and verified. Original error: ${message(failure)}`);
  }

  async restore(archive: RecoveryArchive, password: string, progress?: RecoveryProgressCallback): Promise<RecoveryReport> {
    return this.exclusive(async () => {
      this.assertNoInterruptedTransaction();
      safeProgress(progress, "decrypting", "Authenticating and decrypting recovery archive.");
      const decoded = await decryptArchive(archive, password);
      this.assertNativeBytes(decoded.nativeBackup);
      safeProgress(progress, "inspecting-target", "Inspecting current recovery target.");
      const target = this.adapter.inspectRestoreTarget
        ? await this.adapter.inspectRestoreTarget(decoded.snapshot) : await this.adapter.inspect();
      safeProgress(progress, "preflight", "Checking network, version and target safety.");
      this.assertPreflightSafe(await this.preflightDecoded(decoded.snapshot, target));
      const isCold = this.requireAtomicCheckpoint && !!this.adapter.prepareColdRestore;
      safeProgress(progress, "capturing-rollback", isCold
        ? "Revalidating stopped, empty IndexedDB profile before mutation."
        : "Capturing pre-mutation rollback checkpoint.");
      if (isCold) await this.adapter.prepareColdRestore!(decoded.snapshot, target);
      const rollback = isCold ? undefined : await this.prepareRollback(target);
      const marker: TransactionMarker = {
        schemaVersion: 1,
        operationId: crypto.randomUUID(), startedAt: new Date().toISOString(), stage: "prepared"
      };
      this.journal.write(marker); // persistence MUST succeed before the first mutation
      let after: FiberSnapshot;
      try {
        this.mark(marker, "mutating");
        safeProgress(progress, "restoring", "Restoring native Fiber state.");
        await this.adapter.restoreNativeBackup(decoded.nativeBackup);
        this.mark(marker, "reconciling");
        if (this.adapter.restartAfterRestore) {
          safeProgress(progress, "restarting", "Restarting Fiber integration.");
          await this.adapter.restartAfterRestore();
        }
        safeProgress(progress, "stabilizing", "Waiting for Fiber state to stabilize.");
        after = await this.waitForStableRecovery(decoded.snapshot);
        this.mark(marker, "verifying");
      } catch (error) {
        if (!rollback) {
          this.quarantine(marker);
          throw new ContinuityError("COLD_RESTORE_UNVERIFIED",
            `Cold IndexedDB restore was interrupted. Do not start or use this profile until a manual integrity investigation. ${message(error)}`, true);
        }
        return this.rollbackAfterFailure(rollback, target, error, marker, progress);
      }
      safeProgress(progress, "verifying", "Comparing recovered state against authenticated source.");
      let report: RecoveryReport;
      try { report = verifyRecovery(decoded.snapshot, after); }
      catch (error) {
        this.quarantine(marker);
        throw new ContinuityError("RECOVERY_VERIFICATION_FAILED", `Verification failed after mutation: ${message(error)}`, true);
      }
      if (this.requireAtomicCheckpoint) {
        // Matching *local* records and normal startup never prove peer commitment safety.
        report.checks.push({ key: "peer-channel-safety", label: "Peer/channel state safety", status: "unknown",
          detail: "An authenticated cold database and matching local records do not establish current peer commitments or on-chain safety." });
        if (report.overall === "healthy") report.overall = "degraded";
      }
      if (report.overall === "healthy") {
        this.journal.clear();
        safeProgress(progress, "complete", "Recovery verified with full observable coverage.");
      } else {
        // No automatic rollback: restoring older channel state after a completed restore may itself be unsafe.
        this.quarantine(marker);
        safeProgress(progress, "complete", "Recovery has unverified/unsafe aspects. Target remains quarantined.");
      }
      return report;
    });
  }
}
