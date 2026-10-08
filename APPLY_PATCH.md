# FiberContinuity follow-up hardening patch (changed/new files only)

This ZIP is an **overlay patch** for the exact `FiberContinuity-main(3).zip` supplied on October 8, 2026. It is **not** a complete standalone repository.

## Apply

1. Extract your original repository.
2. Extract this ZIP over the same parent folder, allowing replacement of files with matching paths inside `FiberContinuity-main/`.
3. Retain all unchanged original project files.
4. From the merged project on Node 24.x run `npm install`, `npm run check`, then `npm run build`.

## Changes

- `src/core/verify.ts`: reject post-restore runtime version or adapter drift, in addition to record/network mismatches.
- `src/core/continuity.ts`: reject cross-adapter preflight and invalid/missing native live leases.
- `src/core/operation.ts`: production browser restores/checkpoints fail closed if a cross-tab Web Lock cannot be obtained.
- `src/adapters/FiberJsAdapter.ts`: optional exhaustive host-provided payment/invoice inspection, deadlines and strict validation. No unsupported Fiber RPC endpoints are invented.
- `src/components/StateComparison.tsx`, `src/components/StatusPill.tsx`, `src/styles.css`: distinguish PASS, FAIL, EXPECTED, INFO and UNKNOWN, including mobile layouts.
- `src/components/ArchiveStatusCard.tsx`, `src/App.tsx`: clearly label unverified download requests, clear retained passwords and stale results, explain demo status.
- `tests/production-hardening.test.ts`: regression tests covering mismatches, native visibility and browser locks.
- `README.md`, `CHANGELOG.md`: corrected release/safety documentation.

## Validation performed

- TypeScript typecheck succeeded on the core and adapter code without dependency-only browser bootstrap files.
- TypeScript transpiler syntax checks succeeded for changed TSX and test files.
- Executable JavaScript smoke tests passed for adapter/runtime drift detection, native history coverage, demo backup-loss-restore, and missing Web Locks.
- The complete Vitest/Vite build could **not** be executed in the editing environment because project dependencies were not installed. Run the commands above after merging.

## Safety limits

The UI still uses `DemoFiberAdapter`. Native production checkpoint, channel settlement/peer reconciliation, safe rollback, real-world crash/worker fault injection, upstream payment/invoice enumeration, and independent chain safety verification must be supplied and validated for your pinned Fiber version before using real funds. A `HEALTHY` demo result is not a security certification. Do not clear a quarantined native recovery journal just to bypass a blocked restore.
