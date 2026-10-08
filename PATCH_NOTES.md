# FiberContinuity reliability patch (files-only distribution)

This archive contains **only added or modified files** relative to `FiberContinuity-main(2).zip`.
Apply by copying the included `FiberContinuity-main/` directory over the matching files in your original project, preserving all other files.

## Most important safety changes

- `src/core/operation.ts`: per-adapter and per-resource operation exclusion, Web Locks API cross-tab exclusion, volatile test journal and durable browser journal. An interrupted or quarantined recovery blocks subsequent backup/restore until externally reviewed. Journal **never** stores snapshot, secrets, keys or native backup bytes.
- `src/core/continuity.ts`: non-demo adapters default to strict integration mode; live restores need stable storage resource identity, atomic checkpoints, native exclusive lease and upstream reconciliation integration. Prepared journal is persisted **before** mutation. Rollback checkpoint is mandatory. Only adapters explicitly guaranteeing safe rollback may auto-rollback, and a rollback must match the pre-mutation local checkpoint. Verification failure or incomplete visibility quarantines restored target (no unsafe automatic second restore). Progress callbacks cannot throw into an ongoing transaction.
- `src/adapters/FiberJsAdapter.ts`: rejects malformed, truncated/paginated or failed channel-list RPC data; requires supported native recovery hooks for real recovery. Lack of a peer-readiness hook must never masquerade as safe recovery.
- `src/core/archive.ts`: rejects false coverage claims, unobservable nonempty record families, empty native backups, duplicate IDs and invalid control characters.
- `src/core/verify.ts`: metadata-only observations now produce degraded reports, not healthy ones; unknown networks can never produce a passing network check.
- `src/App.tsx`: protects UI operations from reentrant clicks, shows quarantined status, redacts shareable evidence and preserves a separately labeled sensitive raw report export; demo reset clears **only demo** journal.
- `src/adapters/createFiberJsBrowserNode.ts`: sixth argument is an IndexedDB namespace, not a WASM asset path; explicit unique namespace and HTTPS RPC check.
- `src/browser/files.ts`: safer download URL lifetime and file size limits.
- `tests/hardening.test.ts`: new concurrency, fault-injection, incomplete checkpoint, rollback verification, strict network, malformed RPC and archive invariant tests.
- `.github/workflows/ci.yml`: build/typecheck/test CI on Node 24.

## CRITICAL: production Fiber integration is NOT supplied

The provided `App.tsx` still uses a simulated `DemoFiberAdapter`. This patch **does not implement or claim** a live supported Fiber native backup/restore, atomic IndexedDB checkpoint, channel peer audit, native process lock or correct handling of in-flight settlement. These guarantees must come from the pinned upstream runtime and be exercised on a testnet. Until such integration has been reviewed, **never use this as a recovery system for real assets.**

To enable a real `FiberJsAdapter` restore, the host must provide:

1. A stable unique `recoveryResourceId` bound to the actual IndexedDB/native storage profile.
2. `recovery.createCheckpoint()` returning a consistent snapshot **and** native bytes from the same point in time.
3. `recovery.acquireExclusiveRecoveryLease()` holding exclusive access across all relevant native processes until operation end.
4. `recovery.restoreBackup()` and optional restart hook using the upstream-approved lifecycle.
5. `waitForRecoveryStable()` implementing the actual peer/channel reconciliation and safety protocol; polling identical RPC values is insufficient.
6. A conservative `assessRestoreTarget()` using native storage and channel safety information.
7. `supportsSafeRollback: true` **only** if upstream approves automated rollback even with externally observed channel state changes (normally do not enable).

These operations must be tested with real network reconciliation, abrupt worker termination, second tabs, device storage exhaustion, replayed data and version mismatches.

### Quarantine contract

- The `quarantined` or interrupted journal marker is intentional. Do not delete it to make a restore button work. A real application needs a separately reviewed native reconciliation/unlock procedure, which is **not** part of this patch.
- For the deterministic demo alone, `continuity.clearDemoRecoveryJournal()` is available following `adapter.reset()`.
- A successful rollback verifies local recovered bytes/records; it is **not** proof of remote payment-channel safety. Only the explicitly demo-safe adapter allows this automatic path by default.
- `requireAtomicCheckpoint: false` exists solely to support legacy simulation/testing adapters; never set it for production Fiber.

### Run checks

Use Node 24.x:

```bash
npm install
npm run check
npm run build
```

After an online `npm install`, commit the generated `package-lock.json` and replace the workflow install step with `npm ci` for fully reproducible dependencies.

### Validation performed during patch authoring

- Standalone TypeScript strict typecheck of core, demo adapter, FiberJsAdapter, file helper: **PASS** using globally installed `tsc`.
- Executable compiled-core smoke scenarios: **9/9 PASS** (see validation summary in delivery).
- Entire Vitest + React/Vite production build: **NOT RUN**, because the provided archive contained no `node_modules` or lockfile and npm registry DNS resolution failed in the working environment.
