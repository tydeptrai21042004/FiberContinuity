import { describe, expect, it } from "vitest";
import { createEphemeralFiberJsBrowserNode } from "../src/adapters/createFiberJsBrowserNode";

describe("browser bootstrap policy", () => {
  it("rejects missing browser bootnodes before starting Fiber WASM", async () => {
    await expect(createEphemeralFiberJsBrowserNode({ ckbRpcUrl: "https://example.invalid", bootnodes: [] }))
      .rejects.toThrow(/secure-WebSocket bootnode/i);
  });

  it("rejects non-WSS bootnodes before starting Fiber WASM", async () => {
    await expect(createEphemeralFiberJsBrowserNode({
      ckbRpcUrl: "https://example.invalid",
      bootnodes: ["/dns4/example.invalid/tcp/8228/p2p/QmExample"]
    })).rejects.toThrow(/\/wss/i);
  });
});
