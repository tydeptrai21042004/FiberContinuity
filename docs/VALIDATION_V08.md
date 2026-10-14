# v0.8 validation status (14 October 2026)

## Offline checks completed

- All application and test TypeScript/TSX source files parsed/transpiled successfully using the available TypeScript compiler.
- `IndexedDbColdStore.ts` and `coldRecoveryJournal.ts` were type-checked using global TypeScript 5.8.3 and DOM types.
- Journal state transitions were executed in Node.js with a synthetic in-memory storage adapter: ordinary startup blocked during mutation, only verified readback allows explicit restart, completed records permit normal startup.

## Checks requiring installed npm dependencies

Run `npm install --no-audit --no-fund`, `npm run check`, and `npm run build` in an environment with npm registry access. The work container here did **not** have React, Vitest or Fiber JS installed, and dependency installation timed out, so a full production build, Vitest run and browser E2E run have **NOT been claimed as passing**. Added tests: `tests/cold-recovery-journal.test.ts` and `tests/cold-backup-validation.test.ts`.

## Checks requiring a real testnet browser

- Start an actual WASM Fiber node with a fresh zero-channel profile and inspect IndexedDB name/schema.
- Observe, explicitly stop, archive, re-import, authenticate and compare complete storage.
- Delete a dedicated newly created profile, restore, read back, restart and inspect the original node identity.
- Reproduce interrupted journal and verify read-only resumption.
- Validate wrong-password, mismatched network/version/profile, occupied target, stale archive and multi-tab lock denial.
- Export real evidence, not synthetic PASS labels.

**Not verified:** upstream durable worker flush, external writer fencing, channel-state safety for funded channels, any supported cross-version migration, and real live network recovery.
