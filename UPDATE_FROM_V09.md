# Update v0.9 → v1.0

For the latest code, replace your repository with `FiberContinuity_v1.0_full_project.zip` contents, **or** overlay all paths inside `FiberContinuity_v1.0_changed_files_only.zip` on the root of your v0.9 repository.

No local Node/npm is required to *operate the deployed website*: CI runs checks remotely and Vercel builds the frontend. To **publish** these source changes, commit/upload the changed files through GitHub, triggering Vercel auto-deploy.

Then follow [the complete Vercel and GitHub web-dashboard setup](docs/HOSTED_AUTOMATION_V10.md). Two randomly generated server-side secret values are needed: `CRON_SECRET` (Vercel only) and `EVIDENCE_INGEST_TOKEN` (Vercel and the GitHub Actions Secret of the same name). An optional GitHub Actions Variable `FIBER_CONTINUITY_URL` points to the production site.

**No testnet coin required** for the zero-channel automated recovery test. The committed public `ckt` address is watch-only. It is never imported into the test node for signing.
