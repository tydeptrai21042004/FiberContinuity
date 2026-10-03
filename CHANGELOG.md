# Changelog

## 0.2.2 — Vercel Node 24 runtime alignment

- Updated `engines.node` from `20.x` to `24.x` because Vercel now rejects Node 20 projects before installation.
- Updated GitHub Actions to Node 24.x so CI matches production.
- Added `.nvmrc` and `.node-version` with Node 24 for local runtime consistency.
- Updated README, validation notes, and test runtime wording to remove stale Node 20 guidance.


## 0.2.1 - Vercel/TypeScript build compatibility

- Narrowed browser Fiber `logLevel` to the literal union accepted by `@nervosnetwork/fiber-js@0.9.1`.
- Normalized password bytes to an `ArrayBuffer` before `crypto.subtle.importKey`, avoiding TypeScript 5.9 `Uint8Array<ArrayBufferLike>`/`BufferSource` incompatibility.
- Pinned the Vercel/Node engine to Node 20.x instead of an open-ended `>=20.19.0` range.


## 0.2.0

### Security
- Replaced plaintext snapshot/archive metadata with an authenticated encrypted v2 envelope.
- Bound immutable public crypto/header fields with AES-GCM AAD.
- Blocked legacy v1 restore because its preflight metadata was unauthenticated.
- Changed compatibility `review` from proceed-with-warning to fail-closed restore blocking.
- Added different-target and stale same-identity overwrite protection.
- Added a best-effort rollback checkpoint for native restore/restart exceptions.
- Raised the reference password minimum to 12 characters.

### Correctness
- Added atomic-checkpoint adapter hook and fallback before/export/after consistency detection.
- Verification now checks channel peer/state/balances and payment/invoice status/amount according to declared adapter coverage.
- Unsupported history is `UNKNOWN`, not PASS.
- Added stable-state wait before final recovery verification.
- Removed the silent `0.9.1` version default from `FiberJsAdapter`.

### Deployment / repository
- Fixed `tsconfig.node.json` build configuration.
- Added CI, `.gitignore`, `.env.example`, and evidence placeholder.
- Disabled production source maps.
- Hardened Vercel security headers/CSP.
- Browser bootstrap now requires explicit `/wss` bootnodes.
- Expanded regression tests and verification documentation.
