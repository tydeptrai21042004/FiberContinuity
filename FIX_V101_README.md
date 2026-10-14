# FiberContinuity v1.0.1 — Vercel build and hosted test repair

This release repairs the **partial-upgrade** introduced when v1.0 changed files were copied over an earlier v0.8 project. The v1.0 changed-only ZIP did not include the v0.9 additions required by `RealFiberTestnetLab.tsx`.

## Root cause of the October 14 build errors

- `src/core/testnetReadiness.ts` and `src/core/reviewEvidence.ts` were missing.
- `src/adapters/ManagedFiberTestnetHost.ts` was still an older version: its `start` method did not accept the recovery-restart flag; it lacked `lastRpcCheck` and the guarded simulated-loss input parameter.
- The missing readiness module also caused the `warning`/`i` implicit-any errors in the React component.

**Fix:** Use the included cumulative v0.8→v1.0.1 repair patch, **not** the earlier v1.0-only changed files. The patch includes both missing modules, updated matching host/storage code, UI, tests and hosted reporting scripts.

## GitHub website deployment (no local terminal required)

1. On the `main` branch of your existing repository, upload the folders and files from the **cumulative repair ZIP**, keeping the paths (e.g. `src/core/testnetReadiness.ts`, not at repository root). Choose "Commit directly to main". No repository secrets, local data or archive files belong in source control.
2. If GitHub will not let you upload a workflow in the public repository, use the `*_no_workflows.zip` cumulative patch. Your **existing** Actions workflow can remain; only editing `.github/workflows/hosted-testnet.yml` is optional for the stronger build gate.
3. Vercel should automatically deploy the new `main` commit. Wait for its **successful** build, then open the production site; the header should show **v1.0.1**.
4. Only after this should you run GitHub **Actions → Hosted Fiber testnet evidence → Run workflow**. A browser timeout against an outdated deployment says nothing about Fiber recovery.
5. To send redacted summaries to Vercel Logs, add `EVIDENCE_INGEST_TOKEN` (minimum 24 characters) in **Vercel Project → Settings → Environment Variables** and a GitHub Actions **Secret** with the *same* value. Redeploy after changing Vercel variables. Never publish it in `.env` or GitHub source. Without it, GitHub artifact export still works, but Vercel Logs ingestion is skipped.

The daily Vercel cron separately requires `CRON_SECRET` on Production (minimum 16 characters); do not use the same value as the evidence token.

## Expected checks

- Vercel: `npm run build` should no longer complain about `testnetReadiness`, `reviewEvidence`, `lastRpcCheck`, or `start(true)`.
- GitHub Actions (after successful deployment): creates `evidence/hosted-browser-evidence.json`, including `failureStage` and a fixed, redacted `failureCode` on failure.
- Full-cycle status is PASS only if the **disposable zero-channel** profile completes the tests. Missing network/unsupported WASM/browser issues correctly result in INCOMPLETE.
- A missing evidence token alone is no longer a failing test, but means nothing is written to Vercel Logs.

## What this does NOT establish

No funded-channel restore, peer/channel-safety proof, worker-flush guarantee, ability to sign for the watched CKB address, or automatic transfer of testnet coins is claimed. The watched public address is read-only. The hosted browser experiment uses disposable, independently-generated keys and a separate IndexedDB test profile.

## Validation executed in this working environment

- `node --test tests/hosted-api.test.mjs`: 12/12 passed.
- `node --check` for modified server/runner `.mjs` files: passed.
- TypeScript syntax parsing: 51 TS/TSX files, 0 syntax diagnostics.
- Full `npm run check`, `npm run build` and hosted Playwright browser test **not run successfully here**: package installation from npm registry timed out. Verify these steps in Vercel/GitHub Actions before announcing a live deployment.
