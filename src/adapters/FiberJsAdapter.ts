import type { FiberAdapter, RecoveryStabilityOptions } from "./FiberAdapter";
import type { FiberSnapshot, InvoiceSnapshot, NetworkName, PaymentSnapshot, RecordCoverage, RestoreTargetAssessment } from "../core/types";
import { UnsupportedCapabilityError } from "../core/errors";
import { comparableSnapshot } from "../core/verify";

export interface FiberLike {
  invokeCommand(method: string, params: unknown[]): Promise<unknown>;
}

export interface NativeRecoveryHooks {
  exportBackup(): Promise<Uint8Array>;
  /** Same-point-in-time snapshot + bytes, provided by native integration. */
  createCheckpoint?(): Promise<{ snapshot: FiberSnapshot; nativeBackup: Uint8Array }>;
  restoreBackup(data: Uint8Array): Promise<void>;
  restartAfterRestore?(): Promise<void>;
  /** Must protect the complete native restoration workflow against external workers/processes. */
  acquireExclusiveRecoveryLease?(): Promise<() => void | Promise<void>>;
  /** Only set when the upstream runtime guarantees safe rollback of restored channel state. */
  supportsSafeRollback?: boolean;
}

/** Host-verified exhaustive history. Never infer an empty history from a failed/absent RPC. */
export interface InspectedRecords<T> {
  coverage: Exclude<RecordCoverage, "unavailable">;
  records: T[];
}

export interface FiberJsAdapterOptions {
  fiber: FiberLike;
  /** Must describe the actual running Fiber build. FiberContinuity never assumes a version. */
  version: string;
  network: NetworkName;
  /** Stable network/genesis identity supplied by the host integration. */
  networkIdentity: string;
  /** Persistent IndexedDB/storage profile name. Must be stable and unique per target. */
  recoveryResourceId?: string;
  /** Upper bound for each node_info/list_channels RPC inspection call, in milliseconds. */
  inspectionTimeoutMs?: number;
  recovery?: NativeRecoveryHooks;
  /** Optional supported host-specific exhaustive payment inspection, not guessed Fiber RPC methods. */
  inspectPayments?: () => Promise<InspectedRecords<PaymentSnapshot>>;
  /** Optional supported host-specific exhaustive invoice inspection, not guessed Fiber RPC methods. */
  inspectInvoices?: () => Promise<InspectedRecords<InvoiceSnapshot>>;
  /** Strongly recommended for live restores; otherwise ambiguous targets fail closed. */
  assessRestoreTarget?: (expected: FiberSnapshot, current: FiberSnapshot) => Promise<RestoreTargetAssessment>;
  /** Optional Fiber-aware reconnect/reconciliation readiness hook. */
  waitForRecoveryStable?: (expected: FiberSnapshot, options: RecoveryStabilityOptions) => Promise<FiberSnapshot>;
}

type JsonObject = Record<string, unknown>;
const obj = (value: unknown): JsonObject => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {});
function parseChannelList(value: unknown): unknown[] {
  // A changed/failed RPC must never be interpreted as "zero channels".
  const response = Array.isArray(value) ? value : obj(value).channels;
  if (!Array.isArray(response)) throw new Error("Fiber inspection failed: list_channels response shape is invalid; channel coverage cannot be established.");
  const wrapper = obj(value);
  if (wrapper.error || wrapper.has_more === true || wrapper.hasMore === true ||
      wrapper.next_cursor || wrapper.nextCursor || wrapper.next_page || wrapper.nextPage) {
    throw new Error("Fiber inspection failed: list_channels is incomplete, paginated or contains an RPC error.");
  }
  const total = wrapper.total_count ?? wrapper.totalCount;
  if (total !== undefined && (!Number.isSafeInteger(total) || (total as number) < response.length || (total as number) > response.length)) {
    throw new Error("Fiber inspection failed: reported channel total does not equal enumerated records.");
  }
  if (response.length > 100_000) throw new Error("Fiber inspection failed: channel list exceeds safe inspection limits.");
  return response;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  const found = optionalString(value);
  if (!found) throw new Error(`Fiber inspection failed: ${label} is missing or invalid.`);
  return found;
}

function validateHistory<T extends PaymentSnapshot | InvoiceSnapshot>(
  result: unknown, label: string
): InspectedRecords<T> {
  const value = obj(result);
  if ((value.coverage !== "full" && value.coverage !== "metadata") || !Array.isArray(value.records) || value.records.length > 100_000) {
    throw new Error(`Fiber inspection failed: ${label} host returned incomplete or invalid history coverage.`);
  }
  const ids = new Set<string>();
  const records = (value.records as unknown[]).map((record, index) => {
    const row = obj(record);
    const id = requiredString(row.id, `${label}[${index}] id`);
    const status = requiredString(row.status, `${label}[${index}] status`);
    if (ids.has(id)) throw new Error(`Fiber inspection failed: duplicate ${label} identifier.`);
    ids.add(id);
    const amount = optionalString(row.amount);
    if (value.coverage === "full" && !amount) {
      throw new Error(`Fiber inspection failed: ${label}[${index}] has no amount despite full coverage.`);
    }
    return { id, status, ...(amount ? { amount } : {}) } as T;
  });
  return { coverage: value.coverage as "full" | "metadata", records };
}

export class FiberJsAdapter implements FiberAdapter {
  readonly name = "fiber-js";
  get recoveryResourceId(): string | undefined { return this.options.recoveryResourceId; }
  get supportsSafeRollback(): boolean { return this.options.recovery?.supportsSafeRollback === true; }
  get readinessSupported(): boolean { return typeof this.options.waitForRecoveryStable === "function"; }
  get checkpointSupported(): boolean { return typeof this.options.recovery?.createCheckpoint === "function"; }
  async createRecoveryCheckpoint() {
    if (!this.options.recovery?.createCheckpoint) {
      throw new UnsupportedCapabilityError("Live Fiber recovery requires a consistent native snapshot/checkpoint hook.");
    }
    return this.options.recovery.createCheckpoint();
  }
  async acquireRecoveryLease(): Promise<() => void | Promise<void>> {
    if (!this.options.recovery?.acquireExclusiveRecoveryLease) {
      throw new UnsupportedCapabilityError("Live Fiber recovery requires an upstream-exclusive storage lease.");
    }
    return this.options.recovery.acquireExclusiveRecoveryLease();
  }

  constructor(private readonly options: FiberJsAdapterOptions) {
    if (!options.version.trim()) throw new Error("FiberJsAdapter requires the actual running Fiber version.");
    if (!options.networkIdentity.trim()) throw new Error("FiberJsAdapter requires a stable network identity.");
    const ms = options.inspectionTimeoutMs ?? 15_000;
    if (!Number.isInteger(ms) || ms < 250 || ms > 120_000) {
      throw new Error("Fiber RPC inspection timeout must be between 250 and 120000 ms.");
    }
  }

  private async invokeBounded(method: string, params: unknown[]): Promise<unknown> {
    return this.withInspectionDeadline(() => this.options.fiber.invokeCommand(method, params), `Fiber RPC ${method}`);
  }

  private async withInspectionDeadline<T>(task: () => Promise<T>, label: string): Promise<T> {
    const timeoutMs = this.options.inspectionTimeoutMs ?? 15_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(task),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms inspection timeout.`)), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async inspect(): Promise<FiberSnapshot> {
    const [nodeRaw, channelsRaw, paymentsRaw, invoicesRaw] = await Promise.all([
      this.invokeBounded("node_info", []),
      this.invokeBounded("list_channels", [{}]),
      this.options.inspectPayments
        ? this.withInspectionDeadline(this.options.inspectPayments, "Payment inspection") : Promise.resolve(undefined),
      this.options.inspectInvoices
        ? this.withInspectionDeadline(this.options.inspectInvoices, "Invoice inspection") : Promise.resolve(undefined)
    ]);

    if (!nodeRaw || typeof nodeRaw !== "object" || Array.isArray(nodeRaw)) {
      throw new Error("Fiber inspection failed: node_info response is invalid.");
    }
    const node = obj(nodeRaw);
    const channelItems = parseChannelList(channelsRaw);
    const channels = channelItems.map((raw, i) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(`Fiber inspection failed: channel[${i}] is not a valid object.`);
      }
      const ch = obj(raw);
      const stateObject = obj(ch.state);
      const localBalance = optionalString(ch.local_balance ?? ch.localBalance);
      const remoteBalance = optionalString(ch.remote_balance ?? ch.remoteBalance);
      return {
        id: requiredString(ch.channel_id ?? ch.id, `channel[${i}] identifier`),
        peer: requiredString(ch.pubkey ?? ch.peer_id, `channel[${i}] peer identity`),
        state: requiredString(
          typeof ch.state === "string" ? ch.state : stateObject.state_name ?? ch.state_name,
          `channel[${i}] state`
        ),
        ...(localBalance ? { localBalance } : {}),
        ...(remoteBalance ? { remoteBalance } : {})
      };
    });

    const ids = channels.map((channel) => channel.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("Fiber inspection failed: list_channels returned duplicate channel identifiers.");
    }

    const channelCoverage = channels.every((channel) => channel.localBalance !== undefined && channel.remoteBalance !== undefined)
      ? "full" as const
      : "metadata" as const;

    const payments = paymentsRaw === undefined ? undefined : validateHistory<PaymentSnapshot>(paymentsRaw, "payments");
    const invoices = invoicesRaw === undefined ? undefined : validateHistory<InvoiceSnapshot>(invoicesRaw, "invoices");

    return {
      capturedAt: new Date().toISOString(),
      adapter: this.name,
      fiberVersion: this.options.version.trim(),
      network: this.options.network,
      networkIdentity: this.options.networkIdentity.trim(),
      nodeId: requiredString(node.pubkey ?? node.node_id, "node identity"),
      capabilities: {
        // Fiber 0.9.x list_channels exposes channel identity/state and normally balances.
        // Fall back to metadata if a host/runtime omits either balance field.
        channels: channelCoverage,
        // Only explicit, complete host hooks can claim records are observable.
        payments: payments?.coverage ?? "unavailable",
        invoices: invoices?.coverage ?? "unavailable"
      },
      channels,
      payments: payments?.records ?? [],
      invoices: invoices?.records ?? []
    };
  }

  async exportNativeBackup(): Promise<Uint8Array> {
    if (!this.options.recovery) {
      throw new UnsupportedCapabilityError(
        "No official native backup hook was supplied. FiberContinuity refuses to guess a Fiber storage/backup RPC."
      );
    }
    return this.options.recovery.exportBackup();
  }

  async restoreNativeBackup(data: Uint8Array): Promise<void> {
    if (!this.options.recovery) {
      throw new UnsupportedCapabilityError(
        "No official native restore hook was supplied. Provide the supported Fiber/FNN restore integration explicitly."
      );
    }
    await this.options.recovery.restoreBackup(data);
  }

  async restartAfterRestore(): Promise<void> {
    await this.options.recovery?.restartAfterRestore?.();
  }

  async assessRestoreTarget(expected: FiberSnapshot, current: FiberSnapshot): Promise<RestoreTargetAssessment> {
    if (this.options.assessRestoreTarget) return this.options.assessRestoreTarget(expected, current);
    if (expected.nodeId === current.nodeId) {
      if (comparableSnapshot(expected) === comparableSnapshot(current)) {
        return { status: "safe", reason: "Target already matches the authenticated backup snapshot." };
      }
      if (current.channels.length > 0) {
        return { status: "review", reason: "Same-identity target has different live channel state. Supply an explicit target-safety hook before overwriting it." };
      }
      return {
        status: "review",
        reason: "Same-identity target differs from the backup; local record visibility cannot establish peer/chain safety. Supply an explicit host target-safety hook."
      };
    }
    if (current.channels.length > 0) {
      return { status: "blocked", reason: "Different target identity has visible channels; destructive restore is blocked." };
    }
    return {
      status: "review",
      reason: "Different target identity cannot be proven safe for overwrite by local inspection alone. Supply assessRestoreTarget from the supported host integration."
    };
  }

  async waitForRecoveryStable(expected: FiberSnapshot, options: RecoveryStabilityOptions): Promise<FiberSnapshot> {
    if (!this.options.waitForRecoveryStable) {
      throw new UnsupportedCapabilityError("Fiber peer/channel reconciliation must be implemented by the native host before restore.");
    }
    return this.options.waitForRecoveryStable(expected, options);
  }
}
