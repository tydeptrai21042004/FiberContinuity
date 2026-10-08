## v0.5.0 — fail-closed recovery hardening (2026-10-08)

- Add transaction journal, resource-level operation locks, cross-tab Web Locks when available.
- Enforce rollback checkpoint; require atomic native checkpoint, storage lease and peer reconciliation for non-demo adapters.
- Quarantine incomplete or unsafe restore; verify explicitly supported automatic rollback against prior target checkpoint.
- Reject unknown network, malformed Fiber RPC responses and inconsistent snapshot coverage claims.
- Redact default evidence export, prevent reentrant UI operations, improve browser download handling.
- Add regression/fault-injection tests and Node 24 CI workflow. Demo-only UI remains intentional; production-native Fiber hooks are NOT included.

# Changelog

## 0.4.0 — Production-oriented recovery UI

- Reorganized the frontend into separate Overview, Create backup, Recover, Evidence, and isolated Demo lab workflows instead of mixing marketing, demo controls, and destructive recovery on one page.
- Added a production-style recovery wizard: archive integrity → archive authentication → target preflight → explicit destructive confirmation → restore → verification.
- Restore is now UI-locked until an authenticated archive has an explicit SAFE preflight decision.
- Added source ↔ target comparison, truthful archive status semantics, saved-backup state, local drag/drop archive import, and progressive disclosure for cryptographic metadata.
- Removed the default demo password from operational flows; it is filled only inside Demo lab.
- Added native `<dialog>` confirmation before mutation and a recovery progress timeline driven by real continuity-engine stage callbacks.
- Added typed operation banners with accessible live-region/error semantics, larger typography/targets, reduced-motion handling, and stronger small-screen layouts.
- Version display now comes directly from `package.json`, eliminating UI/package version drift.
- Added a regression test for restore-stage telemetry ordering.

## 0.3.1 — Fail-closed recovery hardening

- Fixed generic target safety so an empty same-identity target with unavailable recovery visibility requires explicit review instead of being inferred safe.
- Made rollback checkpoint capture fail closed on operational errors; only explicit unsupported capability may proceed without rollback.
- Extended automatic rollback handling through restart and stabilization failures.
- Made full-coverage payment/invoice verification mismatches hard failures.
- Removed synthetic safety-critical IDs from `FiberJsAdapter`; missing/duplicate node/channel identity data now fails inspection.
- Updated `FiberJsAdapter` to parse Fiber 0.9.x nested channel `state_name` plus local/remote balances, dynamically reporting full vs metadata channel coverage.
- Replaced prefix-based prerelease matching with semantic-version parsing so rc10/rc11 are not confused with rc1.
- Hardened archive validation for nested shapes, canonical base64, cryptographic parameter lengths, record schemas, duplicate IDs, bounded record counts, and browser memory limits.
- Added regression tests for fail-closed target visibility, rollback export failures, stabilization rollback, strict archive parsing, semantic-version edge cases, and FiberJsAdapter identity handling.
- Added Node 24 repository pins, GitHub CI, `.gitignore`, `.env.example`, and evidence-run placeholder files to match documented repository structure.
- Aligned current-version wording across README, roadmap, security, and validation documentation.

## 0.3.0 — Reviewer-ready recovery console

- Reworked the demo UI into an operational recovery dashboard with workflow state, security guarantees, richer session inspection, archive metadata, evidence export, and responsive layout.
- Added a guided one-click backup → loss → preflight → restore → verify demonstration.
- Added a deterministic safety scenario lab for browser state loss, stale same-identity state, foreign live nodes, and network mismatch.
- Added machine-readable reviewer evidence bundles without passwords or decrypted native backup bytes.
- Archive import now performs corruption validation before accepting the file and rejects oversized files before reading them into memory.
- Added a pre-mutation target race guard to close the check-then-use window after preflight.
- Added core password-policy enforcement and validation of recovery stabilization settings.
- Hardened demo native-backup parsing and expanded recovery edge-case regression tests.

## 0.2.2 — Node 24 / Vercel runtime alignment

- Moved Vercel/CI/local runtime pins to Node.js 24.
