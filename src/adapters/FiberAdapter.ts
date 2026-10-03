import type { FiberSnapshot } from "../core/types";

export interface FiberAdapter {
  readonly name: string;
  inspect(): Promise<FiberSnapshot>;
  exportNativeBackup(): Promise<Uint8Array>;
  restoreNativeBackup(data: Uint8Array): Promise<void>;
  restartAfterRestore?(): Promise<void>;
}
