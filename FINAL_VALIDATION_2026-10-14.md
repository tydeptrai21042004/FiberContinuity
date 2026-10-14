# FiberContinuity issue #41 — final targeted fix and verification

## Diagnosis from GitHub evidence

The uploaded testnet evidence reported `encryptedColdBackup=false`,
`browserPhase=cold-store-export`, and `storageFailureReason=COLD_STORE_HOST_NAME`.
That code comes from constructing `IndexedDbColdStore` with the actual
Fiber-generated IndexedDB database name. The constructor previously restricted
names to `[A-Za-z0-9_.:-]` and 150 characters. A database name used by the
upstream Fiber storage path may include `/`; IndexedDB treats names as opaque
strings and does not interpret them as filesystem paths.

## Targeted patch

`src/adapters/IndexedDbColdStore.ts` now accepts bounded printable ASCII
names up to 512 code units, including path separators and spaces. It still
refuses empty/oversized names, controls and non-ASCII. This is a compatibility
fix to accept Fiber-generated names, **not permission to restore arbitrary
profiles**. Dedicated-prefix discovery, same-database archive identity,
zero-channel safety, stop/lease guard, two matching cold reads, full-schema
validation, and empty/absent target restrictions remain in place.

`tests/fiber-database-name.test.ts` checks valid Fiber-shaped names, invalid
names and preservation of exact names without normalization.

## Executed checks

- `node --test tests/hosted-api.test.mjs tests/hosted-source-fingerprint.test.mjs`:
  **15 tests passed**, zero failed.
- `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler
  --strict --skipLibCheck --lib ES2022,DOM src/adapters/IndexedDbColdStore.ts`:
  **passed**.
- `node --check scripts/run-hosted-browser.mjs`: **passed**.
- Node.js runtime validation of transpiled `IndexedDbColdStore`:
  **passed** for four path-like names, six rejected names, checksum-validated
  Fiber-shaped cold database dump, and rejection of a different database identity.
- `npm install` attempted: **blocked by `EAI_AGAIN` while resolving
  `registry.npmjs.org`**. Therefore `npm run check`, `npm run build` and
  `npm run test:hosted-browser` were **not verified in this environment**.

## Required hosted acceptance gates

1. CI checks, build and hosted API tests pass on Node 22 and Node 24.
2. Vercel deploys the current commit; browser source fingerprint matches checkout.
3. Hosted browser reaches `encryptedColdBackup=true` and
   `archiveRoundtrip=true`, without a storage failure.
4. The fresh zero-channel profile passes complete deletion, cold restore,
   readback and same-identity restart with `zeroChannelRestartVerified=true`.
5. Preserve `fundedChannelRecoveryVerified=false` permanently unless a
   separately audited upstream recovery protocol is implemented.

Do **not** describe Fiber worker termination or two agreeing IndexedDB reads
as a proven durable flush barrier. The upstream review cautions that peer state
may have advanced; funded-channel restoration is not supported.

## GitHub application

Extract the patch ZIP at the repository root, commit, push, wait for matching
Vercel deployment, and rerun the full hosted browser workflow. The patch does
not require a Vercel environment variable. `EVIDENCE_INGEST_TOKEN` is optional
for evidence forwarding only.

Copy `REVIEWER_UPDATE_ISSUE_41.md` into the CKBuilder issue as the public reply
(the top section only, before the horizontal rule).
