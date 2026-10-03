import type { FiberAdapter } from "./FiberAdapter";
import type { FiberSnapshot, NetworkName } from "../core/types";
import { UnsupportedCapabilityError } from "../core/errors";

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
  version?: string;
  network: NetworkName;
  networkIdentity: string;
  recovery?: NativeRecoveryHooks;
}

type JsonObject = Record<string, unknown>;
const obj = (value: unknown): JsonObject => (value && typeof value === "object" ? value as JsonObject : {});
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown, fallback = "unknown") => typeof value === "string" ? value : fallback;

export class FiberJsAdapter implements FiberAdapter {
  readonly name = "fiber-js";

  constructor(private readonly options: FiberJsAdapterOptions) {}

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
      fiberVersion: this.options.version ?? "0.9.1",
      network: this.options.network,
      networkIdentity: this.options.networkIdentity,
      nodeId: str(node.pubkey ?? node.node_id),
      channels: channelItems.map((raw, i) => {
        const ch = obj(raw);
        return {
          id: str(ch.channel_id ?? ch.id, `channel-${i}`),
          peer: str(ch.pubkey ?? ch.peer_id, "unknown"),
          state: str(ch.state, "unknown")
        };
      }),
      // Fiber RPC payment/invoice history shapes are intentionally not guessed here.
      // Integrators can extend the adapter once their supported upstream RPC surface is fixed.
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
}
