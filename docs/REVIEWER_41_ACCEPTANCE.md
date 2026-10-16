# CKBuilder Issue #41 — Engineering Acceptance Checklist

Reviewer: `jjyr` (Fiber maintainer). Scope: browser Fiber JS 0.9.1, unfunded CKB Testnet profiles only.

This is an **engineering checklist**, not a claim of research novelty.

## Review comment → implemented behavior

| Reviewer point | How FiberContinuity handles it | How to check | Limit |
|---|---|---|---|
| State a useful use case | Lost/evicted browser profile: restore complete node DB | Real Fiber testnet UI, README; manually reimport archive | Testnet, zero-channel only |
| Stop node before IndexedDB copy | Explicit stop, closed host handle, offline-only store, origin Web Lock | `ManagedFiberTestnetHost`, `IndexedDbColdStore` | Fiber JS 0.9.1 lacks acknowledged worker-write flush |
| Restore all KV pairs, not one channel | Version-pinned `main-store` snapshot and complete readback | `Fiber091StorageContract`, cold-store tests | No partial-channel restore |
| No restore on running/occupied target | Offline guard, exclusive lease, occupied target rejection, transaction count check | `createIndexedDbColdHooks`, `IndexedDbColdStore`, safety tests | Web Locks only fence cooperating tabs |
| Verify after restart | Full DB checksum, persistent journal, node identity and zero-channel RPC check | Hosted browser CI + journal tests | Peers/payment history remain unknown |
| Compatibility | Strict network identity + node keys + config + Fiber JS version + schema | `ManagedFiberTestnetHost`, `Fiber091StorageContract` | No unchecked version migration |
| Implement testnet evidence | Real WASM startup, Testnet RPC, encrypted export, disposable loss/restore, restart | `hosted-testnet.yml` evidence artifact | Not a funded-channel recovery test |
| Do not invent safety claims | Funded recovery forced false; missing peer/chain checks marked unavailable | UI/evidence API and hosted script checks | No channel safety guarantee |

## Required automated acceptance results

Run `npm run check`, `npm run test:hosted-api`, and `npm run build`, and then run hosted browser CI against the exact matching Vercel deployment. The source fingerprint covers application, API, server and scripts so older deployments do not look green.

For the isolated full-cycle artifact, required `true` values are: `browserReady`, `testnetVerified`, `actualWasmNodeStarted`, `zeroChannelsObserved`, `workersStopped`, `encryptedColdBackup`, `archiveRoundtrip`, `stoppedDatabaseReadback`, `disposableProfileDeleted`, `wholeProfileRestored`, and `zeroChannelRestartVerified`. `fundedChannelRecoveryVerified` must be `false`. Failed or incomplete smoke tests must yield a nonzero CI exit code.

**Important distinction:** `workersStopped` means the JS host's `stop()` promise resolved. It does not mean Fiber JS 0.9.1 acknowledged every IndexedDB transaction or guarantees a consistent snapshot. The upstream [PR #1699](https://github.com/nervosnetwork/fiber/pull/1699) must be released and then tested in FiberContinuity before strengthening that statement.

## Reviewer walkthrough (five minutes)

1. Visit the **Real Fiber testnet** tab. Confirm the notice: zero-channel, no funded recovery.
2. Run **Auto-run isolated zero-channel FULL recovery** on a clean browser. Wait for the result; inspect the generated hosted smoke JSON.
3. Manually create a new dedicated testnet profile, stop it, save the complete archive, re-import the saved file, then perform loss/restore/readback/restart on that profile only. Save both testnet keys separately.
4. Check that restoring into a populated database, using a mismatching identity/configuration or importing a corrupted archive fails **before destructive writes**.
5. Review the post-restart status: local integrity may be verified; funded channel safety, peer reestablishment, pending payments and invoice completeness remain **unverified**.

## Explicitly out of scope

- Funded-channel recovery, production assets, hot snapshots or partial-channel restoration.
- Forking or monkey-patching upstream Fiber 0.9.1 to pretend shutdown flush works.
- Guessing unexposed runtime RPCs or database migrations.
- Claiming peers being unavailable is evidence that funds are safe.

## Re-validation after the upstream shutdown fix is released

Pin an official Fiber JS release containing the fix; repeat the full CI cycle; add a regression where a real outstanding IndexedDB write is pending during stop, then verify that the write survives restart and all connections close before cold export. Keep funded-channel recovery disabled until independent channel-specific acceptance tests and maintainer guidance exist.

## Blocked IndexedDB requests

A pending IndexedDB `open()` or `deleteDatabase()` cannot be cancelled merely by receiving `onblocked`. Rejecting immediately could release the exclusive profile lease while a queued browser operation is still pending. The patched workflow instead waits until `onsuccess` or `onerror` so its cooperating-tab lock is not released early. **Operator action:** close the other browser tabs/processes holding IndexedDB connections. A blocked operation can remain pending until those connections close; closing the current tab may abort the experiment and requires manual state inspection before retrying. This is preferable to reporting a safe failure while a delayed deletion can still occur.
