import { parseDocument } from "yaml";

/**
 * Preserve the upstream v0.9.1 config's 0x-prefixed script hashes, type IDs,
 * out-points and index values. The default YAML core schema coerces these into
 * JavaScript numbers (including lossy 256-bit values), which makes WASM node
 * initialization fail even though the browser and CKB RPC preflight pass.
 *
 * Fiber's own getDefaultConfig() and upstream browser example use failsafe.
 * This config never inherits native TCP bootnodes or advertises a listener.
 */
export function browserFiberTestnetConfig(upstreamConfig: string): string {
  const yaml = parseDocument(upstreamConfig, { schema: "failsafe" });
  if (yaml.errors.length) throw new Error("Invalid upstream Fiber YAML configuration.");
  if (yaml.getIn(["fiber", "chain"]) !== "testnet" || !yaml.hasIn(["fiber", "scripts"])) {
    throw new Error("Unexpected upstream Fiber Testnet configuration.");
  }
  // The WASM node cannot listen over TCP; keep a syntactically valid loopback
  // address solely to satisfy config shape. No listening socket is exposed.
  yaml.setIn(["fiber", "listening_addr"], "/ip4/127.0.0.1/tcp/8228");
  yaml.setIn(["fiber", "bootnode_addrs"], []);
  yaml.setIn(["fiber", "announce_listening_addr"], false);
  return yaml.toString({ lineWidth: 0 });
}
