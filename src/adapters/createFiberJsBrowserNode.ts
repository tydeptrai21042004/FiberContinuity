import { parseDocument } from "yaml";

export interface BrowserNodeOptions {
  network?: "mainnet" | "testnet";
  ckbRpcUrl: string;
  /** Browser nodes must use explicitly supplied secure-WebSocket Fiber bootnodes. */
  bootnodes: string[];
  logLevel?: string;
}

function assertBrowserBootnodes(bootnodes: string[]): void {
  if (!bootnodes.length) {
    throw new Error("Browser Fiber bootstrap requires at least one explicit secure-WebSocket bootnode.");
  }
  const unsafe = bootnodes.find((address) => !/\/wss(?:\/|$)/i.test(address));
  if (unsafe) {
    throw new Error(`Browser Fiber bootnode must use a secure WebSocket (/wss) multiaddr: ${unsafe}`);
  }
}

/**
 * Development/bootstrap helper for official @nervosnetwork/fiber-js.
 *
 * IMPORTANT:
 * - It creates ephemeral keys by design and does not persist them.
 * - Browser bootnodes are explicit and must use secure WebSocket multiaddrs.
 * - Do not use this helper as a production wallet/account lifecycle.
 * - Production apps should inject their already-started Fiber/provider into FiberJsAdapter.
 */
export async function createEphemeralFiberJsBrowserNode(options: BrowserNodeOptions) {
  assertBrowserBootnodes(options.bootnodes);
  const { Fiber, randomSecretKey } = await import("@nervosnetwork/fiber-js");
  const fiber = new Fiber();
  const network = options.network ?? "testnet";
  const config = parseDocument(
    fiber.getDefaultConfig(network, options.ckbRpcUrl),
    { schema: "failsafe" }
  );

  // Do not advertise a browser-local listener and never inherit TCP bootnodes from defaults.
  config.setIn(["fiber", "announce_listening_addr"], false);
  config.setIn(["fiber", "bootnode_addrs"], options.bootnodes);

  await fiber.start(
    config.toString({ lineWidth: 0 }),
    randomSecretKey(),
    randomSecretKey(),
    undefined,
    options.logLevel ?? "info",
    "/wasm"
  );

  return fiber;
}
