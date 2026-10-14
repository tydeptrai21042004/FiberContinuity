# FiberContinuity v0.9.0 — reviewer-driven testnet hardening

## Changes from v0.8

- Check actual CKB RPC chain `ckb_testnet` via a read-only JSON-RPC `get_blockchain_info` POST; forbid wrong network, plain HTTP and URLs with embedded secrets. Re-check immediately before **real** Fiber worker startup.
- Avoid Web Lock leaks when RPC admission/module initialization/Fiber construction fails; retain a node handle for explicit stop if worker termination is not confirmed.
- Browser environment diagnostics for COOP/COEP, SharedArrayBuffer, Web Locks, IndexedDB enumeration, Web Crypto, storage persistence and estimated free space; explicit request for persistent storage.
- Eliminate destructive time-of-check/time-of-use gap: verify the re-imported backup with two stopped full IndexedDB reads **within the same exclusive profile lock as deletion**.
- Early validation of IndexedDB inline primary key derivation before database creation.
- Explicit restart of an interrupted restore only when the **whole target database is absent**, the quarantined journal matches the authenticated source and a full readback succeeds. Never overwrite an occupied or schema-only target.
- Redacted event logs and SHA-256-chained review evidence with independent Node verifier. **Not a signature or network attestation.**
- Added tests for wrong-network RPC, fail-closed network configuration, evidence integrity/redaction and forged inline keys.
- Added CI for Node 22/24, tester setup and complete reproducible reviewer checklist.

## Important unchanged constraints

This is a **zero-channel-only** browser Fiber testnet experiment. The code never claims that stopping `fiber-js` proves its worker flushed all writes, nor that IndexedDB equality proves a funded channel is safe. No single-channel restoration, no occupied database overwrite, no mainnet, no migration of unknown Fiber versions, no automatic peer trust. Browser storage must not be treated as the sole backup.

## Validation

Offline TypeScript type checks were executed for pure modules, and syntax transpilation for app/test files. Local executable unit harness validated RPC admission, archive/store validators, evidence chaining and interruption cases. Full `npm run check`, `npm run build` and real WASM browser/testnet acceptance require dependencies/browser networking; installation in the authoring environment failed due npm registry DNS (`EAI_AGAIN`). Do NOT mark live acceptance PASS until personally executed and evidenced.
