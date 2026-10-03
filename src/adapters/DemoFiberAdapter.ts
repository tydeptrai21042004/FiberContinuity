import type { FiberAdapter } from "./FiberAdapter";
import type { FiberSnapshot } from "../core/types";

interface DemoState {
  fiberVersion: string;
  network: "testnet";
  networkIdentity: string;
  nodeId: string;
  channels: FiberSnapshot["channels"];
  payments: FiberSnapshot["payments"];
  invoices: FiberSnapshot["invoices"];
}

const INITIAL: DemoState = {
  fiberVersion: "0.9.1",
  network: "testnet",
  networkIdentity: "ckb-testnet-demo-genesis",
  nodeId: "03fc-demo-node-7c4b9e",
  channels: [
    { id: "0xchannel-a1", peer: "02peer-alpha", state: "CHANNEL_READY", localBalance: "450 CKB", remoteBalance: "550 CKB" },
    { id: "0xchannel-b2", peer: "03peer-beta", state: "CHANNEL_READY", localBalance: "120 CKB", remoteBalance: "80 CKB" }
  ],
  payments: [
    { id: "pay-001", status: "SUCCESS", amount: "10 CKB" },
    { id: "pay-002", status: "SUCCESS", amount: "4 CKB" },
    { id: "pay-003", status: "SUCCESS", amount: "1 CKB" }
  ],
  invoices: [
    { id: "inv-001", status: "RECEIVED", amount: "12 CKB" },
    { id: "inv-002", status: "OPEN", amount: "2 CKB" }
  ]
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class DemoFiberAdapter implements FiberAdapter {
  readonly name = "demo-fiber-0.9.1";
  private state: DemoState = clone(INITIAL);

  async inspect(): Promise<FiberSnapshot> {
    return {
      capturedAt: new Date().toISOString(),
      adapter: this.name,
      ...clone(this.state)
    };
  }

  async exportNativeBackup(): Promise<Uint8Array> {
    return new TextEncoder().encode(JSON.stringify(this.state));
  }

  async restoreNativeBackup(data: Uint8Array): Promise<void> {
    const parsed = JSON.parse(new TextDecoder().decode(data)) as DemoState;
    if (!parsed.nodeId || !Array.isArray(parsed.channels)) throw new Error("Demo backup is invalid.");
    this.state = clone(parsed);
  }

  async restartAfterRestore(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  simulateBrowserStateLoss(): void {
    this.state = {
      ...clone(INITIAL),
      nodeId: "LOST",
      channels: [],
      payments: [],
      invoices: []
    };
  }

  reset(): void {
    this.state = clone(INITIAL);
  }
}
