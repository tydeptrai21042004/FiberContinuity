# Changelog

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
