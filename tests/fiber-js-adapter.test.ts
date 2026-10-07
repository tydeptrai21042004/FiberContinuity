import { describe, expect, it } from "vitest";
import { FiberJsAdapter, type FiberLike } from "../src/adapters/FiberJsAdapter";

function fakeFiber(node: unknown, channels: unknown): FiberLike {
  return {
    async invokeCommand(method: string) {
      if (method === "node_info") return node;
      if (method === "list_channels") return channels;
      throw new Error(`unexpected method ${method}`);
    }
  };
}

function makeAdapter(node: unknown, channels: unknown) {
  return new FiberJsAdapter({
    fiber: fakeFiber(node, channels),
    version: "0.9.1",
    network: "testnet",
    networkIdentity: "ckb-testnet-genesis"
  });
}

describe("FiberJsAdapter inspection safety", () => {
  it("rejects a missing real node identity instead of manufacturing 'unknown'", async () => {
    const adapter = makeAdapter({}, { channels: [] });
    await expect(adapter.inspect()).rejects.toThrow(/node identity.*missing|invalid/i);
  });

  it("rejects a missing real channel identifier instead of manufacturing channel-N", async () => {
    const adapter = makeAdapter(
      { pubkey: "03node" },
      { channels: [{ pubkey: "02peer", state: "CHANNEL_READY" }] }
    );
    await expect(adapter.inspect()).rejects.toThrow(/channel\[0\] identifier/i);
  });

  it("rejects duplicate channel identifiers", async () => {
    const adapter = makeAdapter(
      { pubkey: "03node" },
      { channels: [
        { channel_id: "0xabc", pubkey: "02a", state: "CHANNEL_READY" },
        { channel_id: "0xabc", pubkey: "02b", state: "CHANNEL_READY" }
      ] }
    );
    await expect(adapter.inspect()).rejects.toThrow(/duplicate channel identifiers/i);
  });

  it("parses Fiber 0.9.x nested channel state and balance fields as full channel coverage", async () => {
    const adapter = makeAdapter(
      { pubkey: "03node" },
      { channels: [{
        channel_id: "0xabc",
        pubkey: "02peer",
        state: { state_name: "ChannelReady" },
        local_balance: "0x10",
        remote_balance: "0x20"
      }] }
    );
    const snapshot = await adapter.inspect();
    expect(snapshot.channels[0]).toMatchObject({
      id: "0xabc", peer: "02peer", state: "ChannelReady", localBalance: "0x10", remoteBalance: "0x20"
    });
    expect(snapshot.capabilities.channels).toBe("full");
  });

  it("returns conservative visibility without inventing payment/invoice history", async () => {
    const adapter = makeAdapter(
      { pubkey: "03node" },
      { channels: [{ channel_id: "0xabc", pubkey: "02peer", state: "CHANNEL_READY" }] }
    );
    const snapshot = await adapter.inspect();
    expect(snapshot.nodeId).toBe("03node");
    expect(snapshot.channels[0].id).toBe("0xabc");
    expect(snapshot.capabilities).toEqual({ channels: "metadata", payments: "unavailable", invoices: "unavailable" });
  });
});
