import type { FiberSnapshot, RestoreTargetAssessment } from "../core/types";

export interface RecoveryCheckpoint {
  snapshot: FiberSnapshot;
  nativeBackup: Uint8Array;
}

export interface RecoveryStabilityOptions {
  timeoutMs: number;
  pollIntervalMs: number;
  stableSamples: number;
}

export interface FiberAdapter {
  readonly name: string;
  /** Unique stable storage identity, used for cross-tab locking and a durable interruption journal. */
  readonly recoveryResourceId?: string;
  /** Native adapter must make explicit guarantees about rollback safety before automatic rollback. */
  readonly supportsSafeRollback?: boolean;
  /** True only if post-restore peer/channel reconciliation is implemented by the host. */
  readonly readinessSupported?: boolean;
  /** True when createRecoveryCheckpoint is implemented by the actual native host. */
  readonly checkpointSupported?: boolean;
  /** Upstream-defined exclusive lease spanning native checkpoint, mutation and reconciliation. */
  acquireRecoveryLease?(): Promise<() => void | Promise<void>>;
  inspect(): Promise<FiberSnapshot>;
  /** Cold profiles may have no startable node: inspect trusted offline identity/config instead. */
  inspectRestoreTarget?(source: FiberSnapshot): Promise<FiberSnapshot>;
  /** Revalidate a stopped, empty storage target before the first destructive operation. */
  prepareColdRestore?(source: FiberSnapshot, target: FiberSnapshot): Promise<void>;
  exportNativeBackup(): Promise<Uint8Array>;
  restoreNativeBackup(data: Uint8Array): Promise<void>;
  restartAfterRestore?(): Promise<void>;

  /** Preferred: snapshot and native bytes come from one adapter-defined checkpoint. */
  createRecoveryCheckpoint?(): Promise<RecoveryCheckpoint>;

  /** Required for live integrations when FiberContinuity cannot prove the target is safe itself. */
  assessRestoreTarget?(expected: FiberSnapshot, current: FiberSnapshot): Promise<RestoreTargetAssessment>;

  /** Optional upstream-aware readiness/reconciliation wait. */
  waitForRecoveryStable?(expected: FiberSnapshot, options: RecoveryStabilityOptions): Promise<FiberSnapshot>;
}
