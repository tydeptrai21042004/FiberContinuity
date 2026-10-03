import { parseDocument } from "yaml";

export interface BrowserNodeOptions {
  network?: "mainnet" | "testnet";
  ckbRpcUrl: string;
  bootnodes?: string[];
  logLevel?: string;
}

/**
 * Development/bootstrap helper for official @nervosnetwork/fiber-js.
 *
 * IMPORTANT:
 * - It creates ephemeral keys by design and does not persist them.
 * - Do not use this helper as a production wallet/account lifecycle.
 * - Production apps should inject their already-started Fiber/provider into FiberJsAdapter.
 */
export async function createEphemeralFiberJsBrowserNode(options: BrowserNodeOptions) {
  const { Fiber, randomSecretKey } = await import("@nervosnetwork/fiber-js");
  const fiber = new Fiber();
  const network = options.network ?? "testnet";
  const config = parseDocument(
    fiber.getDefaultConfig(network, options.ckbRpcUrl),
    { schema: "failsafe" }
  );

  config.setIn(["fiber", "listening_addr"], "/ip4/127.0.0.1/tcp/8228");
  config.setIn(["fiber", "announce_listening_addr"], false);
  if (options.bootnodes?.length) {
    config.setIn(["fiber", "bootnode_addrs"], options.bootnodes);
  }

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
