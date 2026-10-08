import { ContinuityError } from "./errors";

/** No secrets, snapshots, node identifiers, or rollback bytes may appear in this journal. */
export type TransactionStage = "prepared" | "mutating" | "reconciling" | "verifying" | "quarantined";
export interface TransactionMarker {
  schemaVersion: 1;
  operationId: string;
  startedAt: string;
  stage: TransactionStage;
}
export interface RecoveryJournal {
  read(): TransactionMarker | null;
  write(marker: TransactionMarker): void;
  clear(): void;
}

export class MemoryRecoveryJournal implements RecoveryJournal {
  private marker: TransactionMarker | null = null;
  read() { return this.marker ? { ...this.marker } : null; }
  write(marker: TransactionMarker) { this.marker = { ...marker }; }
  clear() { this.marker = null; }
}

/** Browser durable marker, stored separately from volatile UI state. Storage errors fail closed. */
export class BrowserRecoveryJournal implements RecoveryJournal {
  private readonly key: string;
  constructor(resourceId: string, private readonly storage: Storage) {
    if (!resourceId || resourceId.length > 256 || !/^[a-zA-Z0-9._:-]+$/.test(resourceId)) {
      throw new ContinuityError("INVALID_RESOURCE_ID", "Invalid recovery storage resource identifier.");
    }
    this.key = `fiber-continuity:recovery:v1:${resourceId}`;
  }
  read(): TransactionMarker | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (!isMarker(value)) throw new Error("Invalid transaction journal record.");
      return value;
    } catch {
      throw new ContinuityError("JOURNAL_UNAVAILABLE", "Recovery journal cannot be read safely. Restore is blocked.", true);
    }
  }
  write(marker: TransactionMarker): void {
    if (!isMarker(marker)) throw new ContinuityError("JOURNAL_INVALID", "Invalid recovery transaction marker.");
    try {
      this.storage.setItem(this.key, JSON.stringify(marker));
      if (this.storage.getItem(this.key) !== JSON.stringify(marker)) throw new Error("Journal persistence failed.");
    } catch {
      throw new ContinuityError("JOURNAL_UNAVAILABLE", "Recovery journal could not be durably written. Target must be treated as potentially unsafe.", true);
    }
  }
  clear(): void {
    try {
      this.storage.removeItem(this.key);
      if (this.storage.getItem(this.key) !== null) throw new Error("Journal clear failed.");
    } catch {
      throw new ContinuityError("JOURNAL_UNAVAILABLE", "Recovery journal could not be cleared. Manual review is required.", true);
    }
  }
}

function isMarker(value: unknown): value is TransactionMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<TransactionMarker>;
  return marker.schemaVersion === 1 && typeof marker.operationId === "string" &&
    /^[a-zA-Z0-9-]{8,80}$/.test(marker.operationId) && typeof marker.startedAt === "string" &&
    !Number.isNaN(Date.parse(marker.startedAt)) &&
    ["prepared", "mutating", "reconciling", "verifying", "quarantined"].includes(marker.stage ?? "");
}

/** Same-adapter instances still share exclusion even when the caller constructs multiple engines. */
const busyAdapters = new WeakSet<object>();
const busyResources = new Set<string>();

export async function withAdapterLock<T>(adapter: object, resourceId: string | undefined, run: () => Promise<T>): Promise<T> {
  if (busyAdapters.has(adapter) || (resourceId && busyResources.has(resourceId))) throw new ContinuityError("OPERATION_CONFLICT", "A backup or recovery operation already owns this Fiber adapter.");
  busyAdapters.add(adapter);
  if (resourceId) busyResources.add(resourceId);
  try {
    if (resourceId && typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(`fiber-continuity:${resourceId}`, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) throw new ContinuityError("OPERATION_CONFLICT", "Another browser tab owns this recovery target.");
        return run();
      });
    }
    return await run();
  } finally {
    busyAdapters.delete(adapter);
    if (resourceId) busyResources.delete(resourceId);
  }
}
