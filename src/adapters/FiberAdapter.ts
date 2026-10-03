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
  inspect(): Promise<FiberSnapshot>;
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
