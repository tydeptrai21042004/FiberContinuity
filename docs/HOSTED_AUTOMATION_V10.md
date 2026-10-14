# FiberContinuity v1.0 — hosted monitoring & safe browser evidence

**Scope:** CKB Pudge testnet only. Public, watch-only address:

`ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqw8vkvkyscfjke44p3rqcq38amqy8emueq5qqfnz`

The address was decoded and validated as a CKB2021 `ckt` Bech32m full-lock-script address. No signing/private key or control of this address is provided to this software. It is **not** the disposable signing account created during test automation.

## What runs without your computer

| Automation | Where | Cadence | What Vercel Logs actually prove |
|---|---|---|---|
| CKB RPC + watched-address `get_cells` | Vercel Function `/api/cron-watch` | Daily at 03:00 UTC (Hobby plan may run within that hour) | RPC returned `ckb_testnet`, not syncing, and optionally full paginated locked CKB live-cell capacity if indexer is supported |
| Real Fiber JS 0.9.1 recovery test | GitHub Actions hosted Chromium visiting production Vercel site | Every Monday 04:25 UTC; or manual **Run workflow** | Disposable zero-channel browser node: start → stop → authenticated archive serialization → delete *only fresh isolated test DB* → complete restore → independent readback → restart/inspect; posts redacted boolean summary to `/api/evidence` |
| One-click browser smoke / disposable full-cycle | Vercel-served browser on your device | When you click | Non-destructive checks or isolated new-profile deletion/restore/restart, as selected; optional authenticated report to `/api/evidence` |

**NOT automatically performed on any user wallet or funded node:** transactions, channel recovery, wallet data deletion or payments. The dedicated hosted test DOES delete and reconstruct its own newly-generated, unfunded IndexedDB profile after a strict whole-database comparison. Your existing browser profile and wallet testnet funds are neither moved nor required. A successful smoke run is not evidence for peer reestablishment or channel safety.

### Only browser-backed Fiber tests run real WASM

Vercel Cron executes a serverless Node.js function. It does **not** have your browser's IndexedDB, Web Locks, cross-origin-isolated Workers, runtime secrets, or Fiber session. Therefore it cannot run true restoration of an existing browser profile. GitHub-hosted Chromium supplies a disposable isolated browser for meaningful WASM/IDB checks but runs the **disposable full-cycle** path by default. A deliberately destructive, whole-profile test still requires the guarded workflow inside the browser, with archive saved and re-imported first.

## Setup — all in web interfaces

1. Commit the v1.0 project to [GitHub](https://github.com/tydeptrai21042004/FiberContinuity), replacing the existing sources. Do **not** commit a `.fcr.json` file, browser secrets, seed phrase, `.env` file, or passwords.
2. In [Vercel](https://vercel.com/dashboard), import/sync that repository (existing FiberContinuity project), keep Framework **Vite**, and deploy the Production branch. Ensure `api/watch-status.mjs`, `api/cron-watch.mjs`, and `api/evidence.mjs` are recognized as Functions.
3. In Vercel **Project → Settings → Environment Variables**, configure the following for **Production**:
   - `CRON_SECRET`: a randomly generated string of **at least 16 characters**. Vercel includes it in its daily cron request's Bearer authorization header automatically. Without it cron fails closed.
   - `EVIDENCE_INGEST_TOKEN`: a **different** random string of **at least 24 characters**. This authorizes sanitized browser evidence; never prefix it with `VITE_`.
4. Redeploy the project after adding/changing these server-side environment variables.
5. In GitHub **Repository → Settings → Secrets and variables → Actions**:
   - Add secret `EVIDENCE_INGEST_TOKEN` with the **same value** as the Vercel environment variable.
   - Under **Variables**, optionally add `FIBER_CONTINUITY_URL` = `https://fiber-continuity.vercel.app` (or your actual production URL).
6. In GitHub **Actions → Hosted Fiber testnet evidence → Run workflow**; or rely on the Monday automated schedule. Hosted runners install Chromium and the project's dependencies. **No local machine or terminal needed.**
7. Check **Vercel → project → Logs** and filter `/api/evidence` or `/api/cron-watch`. Match run ID to the GitHub Actions artifact `fiber-hosted-testnet-evidence`. The cron job can also be found under **Vercel → Settings → Cron Jobs → View Logs**.

### Test endpoints

- `GET https://fiber-continuity.vercel.app/api/watch-status`: Public, read-only network + address monitoring. Unknown/unavailable indexer response is **not** reported as zero balance.
- `GET /api/cron-watch`: Reserved for Vercel Cron, Bearer `CRON_SECRET` required. Do not expose the secret in a URL.
- `POST /api/evidence`: Bearer `EVIDENCE_INGEST_TOKEN` required. Accepts only an allowlisted boolean summary, **never** raw backups, keys, passwords, RPC error text, browser storage, or funds.
- UI **Real Fiber testnet → Auto-run safe Fiber testnet smoke** or **Auto-run isolated zero-channel FULL recovery**: manually initiate from hosted site. Optional on-page token input sends the same sanitized report to Vercel (the token remains in in-memory component state only).

### Interpreting outcomes

- `status: passed` with `scope: isolated-disposable-zero-channel-full-cycle` means the disposable profile completed backup → simulated loss → full restoration → restart/inspect. It does **not** prove recovery of funded channels or the separate operation of exporting a file and re-importing it after an actual device loss.
- `status: incomplete` means at least one check failed, was blocked or was not established. The browser runner exits nonzero so GitHub Actions correctly marks it as failed.
- `indexerStatus: unavailable` and `capacityCKB: null` mean capacity could not be verified. `capacityCKB: "0.00000000"` is only emitted after a complete successful indexer scan.
- Browser evidence hashes / timestamps are not external attestations. Vercel logs may be retained only for your plan's log-retention window; GitHub Actions artifacts are retained 30 days by this workflow. Export logs/artifacts to separate immutable storage for longer retention if needed.

### Limitations & security

- This cannot prove a user's public address is controlled by the automatically created Fiber node; they are **different identities**.
- No testnet coins are sent automatically. Faucet deposits, if any, must be initiated separately.
- The safe smoke button never deletes databases. The separate **full-cycle** button deliberately deletes ONLY the newly-generated disposable zero-channel profile after archive identity/byte checks; NEVER direct it at a real wallet. GitHub-hosted Chromium is discarded after its run.
- Do not place funded-channel database state in the experimental real Fiber recovery lab; v1.0 continues to block funded-channel restore.
- On Hobby plan, Vercel Cron supports once-daily schedules, invoked within the selected hour. GitHub Actions schedules can occasionally be delayed or skipped; run workflow manually if an immediate artifact is needed.
- The CKB RPC and indexer are external services. A correct network response does not prove the node is trustworthy or fully synced beyond the reported `is_initial_block_download` flag.

## What still needs real testnet evidence

A reviewer-grade **destructive recovery** must separately show: live node (zero channels) → clean explicit stop → whole-IDB export → download + re-import encrypted archive → wipe isolated test profile → restore into absent DB → independent complete readback → explicit restart → inspect identity and zero channels. The v0.9 guarded UI supports this with manual confirmation. The **weekly GitHub-hosted full-cycle job** performs those steps on a disposable zero-channel profile (with in-memory encrypted archive serialization rather than a user-downloaded/re-imported file). The **daily Vercel Cron** checks only the RPC and public address. Neither job claims safe funded-channel restoration.
