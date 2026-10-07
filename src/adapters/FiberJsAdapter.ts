import type { FiberAdapter, RecoveryStabilityOptions } from "./FiberAdapter";
import type { FiberSnapshot, NetworkName, RestoreTargetAssessment } from "../core/types";
import { UnsupportedCapabilityError } from "../core/errors";
import { comparableSnapshot } from "../core/verify";

export interface FiberLike {
  invokeCommand(method: string, params: unknown[]): Promise<unknown>;
}

export interface NativeRecoveryHooks {
  exportBackup(): Promise<Uint8Array>;
  restoreBackup(data: Uint8Array): Promise<void>;
  restartAfterRestore?(): Promise<void>;
}

export interface FiberJsAdapterOptions {
  fiber: FiberLike;
  /** Must describe the actual running Fiber build. FiberContinuity never assumes a version. */
  version: string;
  network: NetworkName;
  /** Stable network/genesis identity supplied by the host integration. */
  networkIdentity: string;
  recovery?: NativeRecoveryHooks;
  /** Strongly recommended for live restores; otherwise ambiguous targets fail closed. */
  assessRestoreTarget?: (expected: FiberSnapshot, current: FiberSnapshot) => Promise<RestoreTargetAssessment>;
  /** Optional Fiber-aware reconnect/reconciliation readiness hook. */
  waitForRecoveryStable?: (expected: FiberSnapshot, options: RecoveryStabilityOptions) => Promise<FiberSnapshot>;
}

type JsonObject = Record<string, unknown>;
const obj = (value: unknown): JsonObject => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {});
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredString(value: unknown, label: string): string {
  const found = optionalString(value);
  if (!found) throw new Error(`Fiber inspection failed: ${label} is missing or invalid.`);
  return found;
}

export class FiberJsAdapter implements FiberAdapter {
  readonly name = "fiber-js";

  constructor(private readonly options: FiberJsAdapterOptions) {
    if (!options.version.trim()) throw new Error("FiberJsAdapter requires the actual running Fiber version.");
    if (!options.networkIdentity.trim()) throw new Error("FiberJsAdapter requires a stable network identity.");
  }

  async inspect(): Promise<FiberSnapshot> {
    const [nodeRaw, channelsRaw] = await Promise.all([
      this.options.fiber.invokeCommand("node_info", []),
      this.options.fiber.invokeCommand("list_channels", [{}])
    ]);

    const node = obj(nodeRaw);
    const channelsObject = obj(channelsRaw);
    const channelItems = arr(channelsObject.channels ?? channelsRaw);
    const channels = channelItems.map((raw, i) => {
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
        // Payment/invoice history RPC schemas are deliberately not invented by this adapter.
        payments: "unavailable",
        invoices: "unavailable"
      },
      channels,
      payments: [],
      invoices: []
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
        reason: "Same-identity target differs from the backup and payment/invoice visibility is unavailable. Supply an explicit target-safety hook."
      };
    }
    if (current.channels.length > 0) {
      return { status: "blocked", reason: "Different target identity has visible channels; destructive restore is blocked." };
    }
    return {
      status: "review",
      reason: "Different target identity cannot be proven empty because payment/invoice history is unavailable. Supply assessRestoreTarget from the supported host integration."
    };
  }

  async waitForRecoveryStable(expected: FiberSnapshot, options: RecoveryStabilityOptions): Promise<FiberSnapshot> {
    if (this.options.waitForRecoveryStable) return this.options.waitForRecoveryStable(expected, options);

    const deadline = Date.now() + options.timeoutMs;
    let previous = "";
    let stable = 0;
    let latest = await this.inspect();
    while (Date.now() <= deadline) {
      const fingerprint = JSON.stringify({
        nodeId: latest.nodeId,
        channels: [...latest.channels].sort((a, b) => a.id.localeCompare(b.id))
      });
      stable = fingerprint === previous ? stable + 1 : 1;
      if (stable >= options.stableSamples) return latest;
      previous = fingerprint;
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
      latest = await this.inspect();
    }
    throw new Error("Fiber observable state did not stabilize before the recovery timeout.");
  }
}
