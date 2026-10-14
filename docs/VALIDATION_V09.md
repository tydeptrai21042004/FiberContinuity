# v0.9 validation evidence — 14 October 2026

## Executed locally

- TypeScript syntax-transpilation inspection of all 51 `src` and `tests` `.ts`/`.tsx` files: 0 syntax diagnostics.
- TypeScript compile of offline pure modules `testnetReadiness.ts`, `reviewEvidence.ts`, `IndexedDbColdStore.ts`, `coldRecoveryJournal.ts` with ES2022+DOM libs: passed.
- Executed Node harness (not a full Vitest run): admitted `ckb_testnet`, rejected `ckb` mainnet and HTTP, detected changes to SHA-256 evidence chains, redacted secret strings, enforced recovery journal transitions and rejected mismatched IndexedDB inline primary keys.
- `npm install --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` failed with `EAI_AGAIN` resolving `registry.npmjs.org`, so no complete dependency-based typecheck, Vitest test-suite execution or production Vite build was completed in the authoring environment.

## NOT completed, do not report as PASS

- Browser COOP/COEP and SharedArrayBuffer check on deployed Vercel site.
- CORS-compatible live CKB testnet endpoint check from the user browser.
- Actual Fiber v0.9.1 WASM node startup and zero-channel IndexedDB schema discovery.
- Independent tab contention, crash-injection, restore/restart and real-peer observations.
- Browser E2E suite or end-to-end real Fiber testnet channel-safe recovery.
- Funded-channel safety, guaranteed durable worker flush, migration between Fiber revisions.

## Reproduce

With a machine that can access npm registry: `npm install --no-audit --no-fund`, `npm run check`, `npm run build`; collect CI logs. Then follow [TESTNET_SETUP_V09.md](TESTNET_SETUP_V09.md) on an actual isolated HTTPS origin; export review JSON and run `node scripts/verify-evidence.mjs <path-to-export.json>`.
