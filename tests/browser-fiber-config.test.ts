import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { browserFiberTestnetConfig } from "../src/adapters/browserFiberConfig";

const hash = "0x6c67887fe201ee0c7853f1682c0b77c0e6214044c156c7558269390a8afa6d7c";
const typeId = "0x00000000000000000000000000000000000000000000000000545950455f4944";
const source = `fiber:
  chain: testnet
  listening_addr: /ip4/0.0.0.0/tcp/8228
  bootnode_addrs:
    - /ip4/54.179.226.154/tcp/8228/p2p/xyz
  announce_listening_addr: true
  scripts:
    - name: FundingLock
      script:
        code_hash: ${hash}
        hash_type: type
        args: 0x
      cell_deps:
        - type_id:
            code_hash: ${typeId}
            hash_type: type
            args: 0xabc123
        - cell_dep:
            out_point:
              tx_hash: ${hash}
              index: 0x0
            dep_type: code
ckb:
  rpc_url: https://testnet.ckbapp.dev/
`;

describe("Fiber v0.9.1 browser bootstrap configuration", () => {
  it("preserves all 256-bit hex strings and 0x0 instead of coercing them to JS numbers", () => {
    const rendered = browserFiberTestnetConfig(source);
    const read = parseDocument(rendered, { schema: "failsafe" });
    expect(read.getIn(["fiber", "scripts", 0, "script", "code_hash"])).toBe(hash);
    expect(read.getIn(["fiber", "scripts", 0, "cell_deps", 0, "type_id", "code_hash"])).toBe(typeId);
    expect(read.getIn(["fiber", "scripts", 0, "cell_deps", 1, "cell_dep", "out_point", "index"])).toBe("0x0");
    expect(read.getIn(["fiber", "scripts", 0, "script", "args"])).toBe("0x");
  });
  it("does not inherit native bootnodes or announce a browser listener", () => {
    const config = browserFiberTestnetConfig(source);
    const node = parseDocument(config).toJS() as { fiber: {
      bootnode_addrs: string[];
      announce_listening_addr: boolean;
      listening_addr: string;
    } };
    expect(node.fiber.bootnode_addrs).toEqual([]);
    expect(node.fiber.announce_listening_addr).toBe(false);
    expect(node.fiber.listening_addr).toBe("/ip4/127.0.0.1/tcp/8228");
    expect(config).not.toContain("54.179.226.154");
  });
  it("rejects a malformed or non-testnet template before starting WASM", () => {
    expect(() => browserFiberTestnetConfig("fiber: [unclosed")).toThrow(/Invalid upstream/);
    expect(() => browserFiberTestnetConfig(source.replace("chain: testnet", "chain: mainnet"))).toThrow(/Unexpected upstream/);
  });
});
