# Upstream Fiber notes used by v0.1

These notes explain why the implementation is conservative.

## Fiber JS

The official npm package is `@nervosnetwork/fiber-js`. v0.9.1 documents:

- `Fiber` and `randomSecretKey`;
- `getDefaultConfig(network, ckbRpcUrl)`;
- browser bootnodes using secure WebSocket (`wss`) addresses; and
- disabling listening-address announcement for browser configuration.

The development helper in this repository follows that documented bootstrap shape.

## v0.9 line

Fiber v0.9 introduced a unified database migration system and native storage backup/restore. The Fiber team has also been hardening restart/reconnect and on-chain reconciliation behavior.

FiberContinuity treats native backup bytes as opaque and delegates actual restore semantics to the supported upstream path.

## v0.10.0-rc1

The v0.10.0-rc1 release note explicitly states that upgrades from older versions are not supported by that prerelease. Therefore the v0.1 compatibility policy blocks 0.9.x → 0.10.0-rc1 restoration/migration rather than attempting it.

## Why no guessed backup RPC exists here

The browser-facing `fiber-js` package documents its RPC-like command surface, but a project handling real funds should not assume that a node/operator backup command maps safely or identically onto an embedded browser storage backend.

The integration must provide the exact supported native backup/restore hook for the pinned Fiber environment.
