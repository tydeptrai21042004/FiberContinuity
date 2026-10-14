# FiberContinuity v1.0.0 — read-only wallet watch + hosted Fiber smoke

User-provided CKB Pudge testnet address is embedded as public watch-only configuration, not a private signing key.

- Added exact CKB2021 Bech32m decoding, script extraction and public indexer `get_cells` monitoring with pagination and explicit unknown results.
- Added authenticated Vercel Cron endpoint, daily schedule, and structured Vercel Logs for chain/address status.
- Added authenticated sanitized browser-evidence Vercel Function; rejects unsupported funded-recovery claims and drops all unknown fields.
- Added one-click isolated non-destructive WASM smoke and separate full-cycle loss/restore/restart testing restricted to a brand-new disposable zero-channel IndexedDB profile.
- Added GitHub-hosted Playwright Chromium smoke with scheduled/manual run, Vercel evidence post, and artifact retention.
- Added eight no-network API tests; full browser and live RPC checks must be executed after deployment.

**No** automatic transactions, channel operations, deletion of an existing wallet/profile or funded-channel restores. The disposable full-cycle test deliberately deletes and reconstructs ONLY its freshly-generated zero-channel test profile. Hosting alone does not prove end-to-end restore.

See `docs/HOSTED_AUTOMATION_V10.md` for no-local setup.
