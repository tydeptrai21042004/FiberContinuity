# FiberContinuity v0.9 — testnet configuration and acceptance run

## What is automated, and what you must provide

The app is a **real browser-hosted Fiber JS v0.9.1 testnet lab**, with a deterministic separate demo. No server or Vercel secrets are necessary. The code automatically does strict schema checks, local archive encryption, two stopped IndexedDB reads, testnet RPC network checks, lock-based exclusive cold restore, complete readback, crash-journal resumption, and restricted zero-channel restart.

**You must** deploy the frontend (or run it locally), use a browser that supports cross-origin isolation, provide a reachable trusted HTTPS CKB testnet JSON-RPC endpoint, retain the original two testnet keys and unique profile ID offline, and personally execute the testnet flow. A public RPC such as `https://testnet.ckbapp.dev/` is an *example*, not a promised service: its availability/CORS compatibility must be checked from your actual browser. No funding or testnet CKB is needed for the zero-channel milestone.

**Never enter funded/mainnet keys** and **never test restoring funded live channels** with this version. Do not send the project operator your credentials or backups.

## Run and deploy

1. Install Node 22 or 24 LTS and npm, then `npm install --no-audit --no-fund`, `npm run check` and `npm run build`. The project pins `@nervosnetwork/fiber-js@0.9.1`.
2. Run `npm run dev` and open the local HTTPS/localhost dev site; or deploy the static frontend to Vercel with Framework **Vite**, Build Command **npm run build**, Output Directory **dist**. Keep `vercel.json` so COOP/COEP and worker/WASM settings are delivered. On a new deployment, verify headers are returned on the HTML route and workers.
3. Open **Real Fiber testnet**. Click **Check browser and testnet RPC**. It must show: cross-origin isolation, Web Locks, IndexedDB enumeration, Web Crypto, and an actual CKB JSON-RPC response with `chain=ckb_testnet`. Mainnet (`ckb`), HTTP, auth-bearing URLs, RPC errors and CORS failures are rejected. A successful CLI RPC check alone does NOT prove browser CORS.
4. Optionally click **Request persistent browser storage** (may not be granted). Save encrypted backups outside browser storage regardless. For larger databases review `navigator.storage.estimate()` free space.
5. Generate and securely save **both** testnet-only secrets and the exact `fc-testnet-*` profile ID. The archive intentionally does not contain these keys. Do not share them in screenshots, PRs or GitHub issues.
6. Start an **empty** real WASM Fiber node. Its configuration removes bootnodes and announces no listening address. It will still use CKB testnet RPC. Confirm node identity and zero channels; optionally connect explicitly to a **known WSS testnet peer**, then inspect again.
7. **Stop Fiber explicitly**. Create encrypted whole-database backup with a 12+ character passphrase, **download** the archive, then **re-import the downloaded copy**. The project only recognizes known v0.9.1 IndexedDB schema; it does not invent a checkpoint RPC.
8. After confirmation, simulate deletion of the *new dedicated lab profile only*. The project checks the entire saved archive against the current complete database under **the same exclusive lock as deletion**. Stale backup or nonempty channels will block.
9. Restore the whole database into an absent/empty target. Check complete post-write readback hash; restart deliberately (no bootnodes), then inspect original identity and confirm channels remain zero. Export redacted JSON evidence.
10. Independently run `node scripts/verify-evidence.mjs path/to/fiber-real-testnet-redacted-evidence.json` to check the exported SHA-256 event chain. This detects event edits after export but is **not a digital signature, remote attestation or funded-channel safety proof**.

If you close or refresh before restore: re-enter the same profile ID, keys, original RPC configuration and password; re-import the archive, select **Prepare offline recovery after browser refresh** (does not start Fiber). Complete the allowed restoration/readback/restart flow. A persistent journal in `mutating` may be retried only if the *whole DB is absent* and the source checksum/profile match; if records or schema exist, use read-only verification. Never clear a quarantine marker just to make a test pass.

## Release acceptance matrix (reviewer evidence)

| Case | Expected result | Test category |
|---|---|---|
| Correct real CKB Pudge testnet endpoint | `ckb_testnet` verified before Fiber startup | Browser + unit |
| Mainnet RPC masquerading as testnet | Block before Fiber worker starts | Unit + browser |
| Missing isolation / Web Locks / IDB.databases | Block, show concrete reason | Browser |
| Stable two-read whole IndexedDB dump | Encrypt and export authenticated archive | Browser |
| Downloaded archive wrong password/tamper | Reject before database changes | Browser + existing tests |
| Stale backup, unrelated or occupied target | Block without deleting/replacing records | Browser |
| Concurrent cooperating tabs | Exclusive Web Lock denies parallel use | Multi-tab browser |
| Crash before DB creation, matching journal | Explicit absent-target-only retry and readback | Browser + interrupted journal tests |
| Crash after a committed DB write | Read-only full archive match; no second write | Browser |
| Browser page closes during active node | Do NOT claim worker flush or checkpoint durability | Upstream limitation |
| Full restore of zero-channel profile | DB readback + node identity/zero-channel restart | Real testnet |
| Unreachable peers or funded channels | Status remains unknown/unsupported | Manual risk review |
| Unsupported store schema or version | Block; no silent migration | Unit + browser |

## What upstream support would still be required

- A documented, atomic Fiber JS quiesce/flush barrier before checkpointing. `fiber.stop()` worker termination is not sufficient to claim durable state.
- A supported whole-node checkpoint/restoration primitive covering any non-IndexedDB state and a reviewed migration path for runtime/storage revisions.
- Authoritative channel-state safety checks, peer and chain reconciliation, pending payments and invoice history coverage, and stale-commitment protection before funded-channel restoration.
- A recovery-mode node isolated from payments and signing until independent safety checks pass, plus stronger fencing of noncooperating external processes.

**For review, attach:** the evidence JSON (redacted), a screenshot of the real RPC chain check, run logs for the GitHub Actions CI, the profile/DB name (public-only) and reproduction steps. Never attach keys, passwords, raw databases or actual funded-channel backups.
