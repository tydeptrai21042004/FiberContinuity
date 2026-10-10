# v0.7.0 reviewer-driven patch

- Adds experimental **Real Fiber testnet** application panel. Creates a real Fiber JS 0.9.1 browser WASM node using an operator-supplied, persistent original node identity and a uniquely namespaced test profile; permits observation and WSS peer connections.
- Discovers real on-origin IndexedDB storage and strictly verifies the known v0.9.1 Rust worker schema; generic IndexedDB support no longer gets presented as proven Fiber schema compatibility.
- Provides encrypted real profile archive, controlled zero-channel profile-loss simulation, absent/empty target restore, checksum readback, restart with original key and JSON observation evidence.
- Implements offline import/recovery bootstrap after reload without starting a new Fiber worker on an empty target.
- Repairs preflight in `createIndexedDbColdHooks`: no implicit stop, fail closed if node is active; export cleanup uses `finally`.
- Adds storage-contract and preflight regression tests.
- Limits experimental real restore to **zero channels only** because upstream Fiber JS v0.9.1 `stop()` is not a guaranteed persistence barrier. No funded-channel recovery or mainnet support is claimed.

## External verification still required

The complete npm/Vercel build and the browser WASM/peer integration must be run in a connected environment. This package contains no invented testnet outcomes or claim that real-peer recovery was already demonstrated. See `docs/REAL_FIBER_TESTNET_V07.md`.
