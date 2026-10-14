import { describe, expect, it } from "vitest";
import { assertSafeRpcUrl, verifyCkbTestnetRpc } from "../src/core/testnetReadiness";

const rpcReply = (chain: string, syncing = false) => ({
  jsonrpc: "2.0", id: 1, result: { chain, is_initial_block_download: syncing }
});
function fetchStub(response: unknown): typeof fetch {
  return (async (_url: string, options: RequestInit) => {
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("omit");
    expect(options.redirect).toBe("error");
    expect(JSON.parse(String(options.body))).toEqual({ jsonrpc: "2.0", id: 1, method: "get_blockchain_info", params: [] });
    return { ok: true, json: async () => response } as Response;
  }) as typeof fetch;
}
describe("real testnet admission", () => {
  it("admits only a validated Pudge testnet response", async () => {
    const result = await verifyCkbTestnetRpc("https://testnet.ckbapp.dev/", fetchStub(rpcReply("ckb_testnet")));
    expect(result.chain).toBe("ckb_testnet");
    expect(result.rpcReachable).toBe(true);
  });
  it("blocks mainnet even if endpoint URL says testnet", async () => {
    await expect(verifyCkbTestnetRpc("https://testnet.ckbapp.dev/", fetchStub(rpcReply("ckb")))).rejects.toThrow(/Wrong CKB network/);
  });
  it("blocks malformed RPC, missing data and misleading response IDs", async () => {
    await expect(verifyCkbTestnetRpc("https://testnet.ckbapp.dev/", fetchStub({ ...rpcReply("ckb_testnet"), id: 2 }))).rejects.toThrow(/malformed/);
    await expect(verifyCkbTestnetRpc("https://testnet.ckbapp.dev/", fetchStub({ ...rpcReply("ckb_testnet"), result: { chain: "ckb_testnet" } }))).rejects.toThrow(/synchronization/);
  });
  it("rejects mainnet URL credentials, query strings, HTTP and local proxies", () => {
    for (const url of ["http://testnet.ckbapp.dev/", "https://user:secret@testnet.ckbapp.dev/", "https://testnet.ckbapp.dev/?token=abc", "https://127.0.0.1/rpc", "https://testnet.ckbapp.dev/other"]) {
      expect(() => assertSafeRpcUrl(url)).toThrow();
    }
  });
});
