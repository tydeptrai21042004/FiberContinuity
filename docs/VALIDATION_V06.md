# Validation results — v0.6 source package

## Completed in this environment

- Strict standalone TypeScript compile of `IndexedDbColdStore.ts`, `createIndexedDbColdHooks.ts`, `FiberJsAdapter.ts` and the modified recovery engine: **PASS** (`tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM`, with dependencies restricted to source modules).
- Actual Node 22 execution against emitted JavaScript for the recovery core: **PASS** for authenticated demo backup/restore, wrong password, stale-target block, wrong-network block, invalid cold-profile/name guards, live cold restore degraded/quarantined, and interrupted cold restore quarantine.
- Source archived without `node_modules`, build outputs, secrets or synthetic result data.

## Not verified here

- Project-level `npm run build` / `npm test`: dependencies were absent, original ZIP did not contain a lockfile, and npm install timed out in this execution environment. No claim of passing full Vitest/React/Vite checks.
- Real browser IndexedDB round-trip: Chromium navigation was blocked by the execution environment (`ERR_BLOCKED_BY_ADMINISTRATOR`), preventing Playwright integration execution. The lab is provided to run this in a normal browser.
- Real Fiber JS 0.9.1 stopped-worker flush semantics, database name/schema/record types, exclusive fencing and testnet channel restoration: no reviewed same-origin host adapter was provided. These must be verified against the pinned upstream implementation and real testnet nodes.

## Safety conclusions

No published `FiberContinuity` browser checkpoint API was assumed. The code does **not** claim mainnet safety, complete channel reconciliation, native SDK checkpoint support, or production readiness. Full real-node restoration remains gated on reviewed host lifecycle hooks.
