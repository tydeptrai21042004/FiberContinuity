# v0.7 validation record — 2026-10-10

Source baseline: `FiberContinuity_v0.6.0_vercel_TS2345_fix_full.zip`.

## Checks executed in this environment

- PASS: TypeScript syntax/transpilation of every modified TS/TSX file, including the App, both adapters, panel and tests.
- PASS: strict TypeScript semantic check of the new runtime adapter, pinned schema validator, cold-hook changes and React panel using local typed declaration shims matching the referenced APIs. This is **not** a full dependency-installed project build.
- PASS: isolated runtime check for the pinned v0.9.1 schema with four negative cases (wrong DB version, unknown store, changed index uniqueness, auto increment).
- PASS: ZIP integrity, path and manifest checks during packaging.

## Checks NOT completed

- Full `npm run check` / `npm run build`: dependencies not available in the offline container; no claim of clean Vercel production build.
- Actual Chromium IndexedDB round-trip: headless browser unavailable for end-to-end navigation in this runtime.
- Actual Fiber JS 0.9.1 WASM startup, testnet RPC/WSS peer connection, and on-chain/channel reconciliation: need execution from a compatible cross-origin-isolated browser with real endpoints and explicit test credentials.
- Fiber data-flush atomicity: upstream `fiber.stop()` does not document a flush barrier.
- Funded channel state recovery: intentionally prohibited.

## Test commands after extracting the full project or patching a repository

```
npm install --no-audit --no-fund
npm run typecheck
npm run test
npm run build
npm run dev
```

Open **Real Fiber testnet** and follow `docs/REAL_FIBER_TESTNET_V07.md` to generate real evidence. An absence of actual peer/evidence artifacts means no live demonstration has yet passed.
