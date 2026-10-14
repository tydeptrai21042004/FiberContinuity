# Hosted Fiber WASM startup — CI correction (2026-10-14)

## Why `actualWasmNodeStarted` was false

The GitHub-hosted Chromium run successfully passed browser readiness and CKB Testnet verification, but did not prove that the real `@nervosnetwork/fiber-js@0.9.1` node started. The original failure log does not identify the underlying exception, so this could be configuration, WASM asset/worker loading or runtime startup.

A concrete startup defect was found: `ManagedFiberTestnetHost.create()` reparsed the Fiber default YAML using the default YAML core schema. The Fiber Testnet config includes 0x-prefixed 256-bit script hashes, out-points and indices. Reinterpreting such values as JavaScript numbers can change their type/precision and invalidate the configuration. The replacement follows the upstream `getDefaultConfig()`/browser example's `{ schema: 'failsafe' }`, then explicitly disables automatic TCP bootnodes and announced addresses. It also supplies an inert loopback listening address for YAML compatibility; WASM does not listen on TCP.

## Changed files

- `src/adapters/browserFiberConfig.ts` (new): safe Testnet YAML builder.
- `src/adapters/ManagedFiberTestnetHost.ts`: use safe builder for real Fiber node.
- `src/core/hostedFailureCategory.ts` (new): allowlisted, secret-free failure categories.
- `src/components/RealFiberTestnetLab.tsx`: track failure phase/category without putting raw exception text into browser evidence.
- `scripts/run-hosted-browser.mjs`: validate allowlisted diagnostic fields, print them to CI and preserve in evidence.
- `tests/browser-fiber-config.test.ts` (new): 0x preservation and browser-only restrictions.
- `tests/hosted-failure-category.test.ts` (new): redacted diagnostics tests.

## Deploy and verify

1. Apply the patch to the repository root, including `src/`, `scripts/`, and `tests/`.
2. Push the commit to `main` and wait until Vercel's production deployment shows the same commit.
3. Run the GitHub workflow **FiberContinuity cloud verification** (manually if deployment was delayed).
4. Inspect the logs. On error, download the workflow artifact `fiber-testnet-evidence-<run_id>`, open `hosted-browser-evidence.json` and check `failureStage`, `browserPhase` and `browserDiagnostic`.

Expected successful check requires *all* disposable zero-channel backup/loss/restore/restart stages to be true; funded recovery must remain false. Nothing changes the fail-closed behavior.

### Local commands

```bash
npm install --no-audit --no-fund
npm run check
npm run test:hosted-api
npm run build
# Hosted actual WebAssembly/IndexedDB test is intended for Chromium against a deployed site:
npm run test:hosted-browser
```

`EVIDENCE_INGEST_TOKEN` is **optional**. An unset token only disables Vercel evidence logging, and is not the cause of `actualWasmNodeStarted` failing. Leave this unset if GitHub artifacts are sufficient.

## Verification performed here

- `node --test tests/hosted-api.test.mjs`: 12 tests passed.
- `node --check scripts/run-hosted-browser.mjs`: passed.
- ZIP integrity and changed-file comparison verified.
- Full Vitest, build, and real hosted browser test are not executable in this environment because external npm/Vercel access is unavailable; no claim of WASM startup success is made.
