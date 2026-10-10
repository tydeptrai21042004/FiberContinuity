# FiberContinuity v0.7 — real Fiber JS testnet experiments

## Status and non-goals

This release adds an **opt-in, browser-first real Fiber WASM testnet lab**, while the normal dashboard remains a deterministic simulator. It is a genuine integration with `@nervosnetwork/fiber-js@0.9.1`, not a claim that a v0.9.1 whole-node checkpoint is atomic, channel-safe, or ready for mainnet funds.

**No funded channel restoration is supported or permitted.** `fiber.stop()` calls `terminate()` on Fiber and IndexedDB Web Workers; upstream does not document a clean flush/commit barrier. JavaScript cannot prove arbitrary tabs, browser crashes, noncooperating same-origin workers, or remote peer commitment safety. This prevents a truthful claim that the core review is *fully* satisfied.

## Upstream contracts verified by source inspection

- `fiber-js/src/index.ts` at tag `v0.9.1`: `start(config, fiberKeyPair, ckbSecretKey?, chainSpec?, logLevel?, databasePrefix?)`; `stop()` terminates workers; `nodeInfo`, `listPeers`, `connectPeer` supported.
- `crates/fiber-wasm-db-worker/src/db.rs` at `v0.9.1`: IndexedDB version **1**, object store **`main-store`** with **no key path** and **no auto increment**, unique index **`key`** with key path `key`. The store holds binary key/value sequences via JS structured-clone-compatible arrays.
- The real testnet lab asserts the above schema **before export and before restore**. Any drift is blocked. It does not attempt unsupported database schema migrations.
- Reference: https://github.com/nervosnetwork/fiber/tree/v0.9.1 ; https://www.fiber.world/docs/build/sdk/wasm-node

## Reviewer walkthrough (zero-channel profile)

1. Deploy to HTTPS with COOP/COEP isolation, and open **Real Fiber testnet** in the left navigation. Make sure `crossOriginIsolated` is true in your browser; use a Chromium profile where Web Locks and `indexedDB.databases()` work.
2. Enter your trusted CKB testnet HTTPS RPC URL, generate **two independent testnet-only Fiber identity and CKB signing keys** and save BOTH securely **offline**. The recovery archive does **not** carry either key. Keep the auto-generated unique `fc-testnet-*` profile name.
3. Start the real Fiber 0.9.1 node. It deliberately has **no bootnodes** so it cannot automatically reconnect during isolated recovery. The lab discovers the new on-origin IndexedDB name rather than assuming the prefix is the actual database name.
4. Optionally enter a WSS multiaddr and its compressed peer pubkey, connect and inspect the real node. `nodeInfo` and `list_channels` must report a zero-channel profile. Peer count and the last observed node identity are recorded in exportable redacted evidence.
5. Select **Stop node**. The action is explicit; `preflight` never stops the node. It is **NOT a documented persistence barrier**.
6. Enter a long archive password and choose **Create authenticated Fiber IndexedDB archive**. Download the `.fcr.json` file before simulating loss. The source snapshot and v0.9.1 IndexedDB data are encrypted together with AES-GCM, using the existing archive workflow.
7. Check the destructive confirmation **only when there are no funded channels**. Simulate loss of **only the dedicated owned profile DB**. The lab never erases a foreign/occupied wallet profile.
8. Click **Restore whole profile**. It validates network/config/version/node identity and exact DB schema before starting a write, requires an absent/empty target, persists an interruption marker, commits all object stores transactionally, then hashes a complete fresh readback.
9. Click **Explicitly restart and inspect** (not an automatic payment-enabled startup). Confirm the original node public key and zero-channel status. You may then connect a WSS testnet peer and capture the new peer count. Export evidence.
10. The evidence file contains **no private key, password, unencrypted database, or channel/payment secrets**. It reports local storage integrity separately from upstream flush and peer/channel safety.

### Cold restore after page refresh

Re-enter the **same** saved profile name, original pair of secret keys, exact RPC/configuration and archive password; import `.fcr.json`; choose **Prepare offline recovery after refresh**. This checks the authenticated source and pinned storage schema *without starting a new Fiber worker*. It requires a database name containing the known reserved prefix. Then proceed with the empty-target check, restore and explicit restart. This is deliberately narrower than arbitrary-origin wallet migration.

## Safety / failure behavior

- Active node: storage access blocked and preflight does not stop the node. Browser lock refusal blocks concurrent cooperative tabs.
- Known occupied target: restoration blocked.
- Wrong password, bad digest, foreign node, different config or Fiber version: blocked before mutation.
- Unexpected DB schema, additional stores, auto increment or DB-version migration: blocked.
- Missing profile key, failed IDB transaction/readback, quota error, post-restart identity mismatch: remains failed/quarantined.
- Funded/unobservable channels: blocked; no payment or channel-funding UI is present in the real lab.
- Remote peer offline or mismatched commitment: **unknown**, not HEALTHY; this lab does not provide authoritative proof of safe reestablishment.
- Interrupted restore: persistent local quarantine marker remains. This demo intentionally provides no one-click production quarantine bypass.

## Limitations for an honest issue #41 update

The above yields actual node/IndexedDB/peer evidence **only once someone executes the lab on a real browser/testnet**. It is not valid to submit synthetic/fabricated network evidence. Future upstream support is needed for a verified quiescence barrier, atomic checkpoint API, multisession exclusivity, and peer/chain channel-safety attestation. The maintained `ColdFiberHost` integration boundary is designed to accept those reviewed primitives when upstream provides them.

For deterministic tests, run `npm run check && npm run build`. For the browser integration, run the walkthrough using real testnet RPC/WSS endpoints and export the JSON evidence. No remote testnet RPC/WSS results are prepackaged.
