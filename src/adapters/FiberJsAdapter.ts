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
  /** Strongly recommended for live restores; otherwise different-identity targets fail closed. */
  assessRestoreTarget?: (expected: FiberSnapshot, current: FiberSnapshot) => Promise<RestoreTargetAssessment>;
  /** Optional Fiber-aware reconnect/reconciliation readiness hook. */
  waitForRecoveryStable?: (expected: FiberSnapshot, options: RecoveryStabilityOptions) => Promise<FiberSnapshot>;
}

type JsonObject = Record<string, unknown>;
const obj = (value: unknown): JsonObject => (value && typeof value === "object" ? value as JsonObject : {});
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown, fallback = "unknown") => typeof value === "string" ? value : fallback;

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

    return {
      capturedAt: new Date().toISOString(),
      adapter: this.name,
      fiberVersion: this.options.version,
      network: this.options.network,
      networkIdentity: this.options.networkIdentity,
      nodeId: str(node.pubkey ?? node.node_id),
      capabilities: {
        // list_channels exposes identity/peer/state here. Balance field names are deliberately not guessed.
        channels: "metadata",
        // Payment/invoice history RPC schemas are deliberately not invented by this adapter.
        payments: "unavailable",
        invoices: "unavailable"
      },
      channels: channelItems.map((raw, i) => {
        const ch = obj(raw);
        return {
          id: str(ch.channel_id ?? ch.id, `channel-${i}`),
          peer: str(ch.pubkey ?? ch.peer_id, "unknown"),
          state: str(ch.state, "unknown")
        };
      }),
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
    // Returning inspect() here would pretend reconnect/reconciliation readiness is known.
    // Let FiberContinuity's generic stability polling run by not exposing this method? Since the
    // interface is implemented on the class, perform conservative polling of observable channel metadata.
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
