# Apply Reviewer #41 engineering fixes

This patch is based on uploaded `FiberContinuity-main.zip` (`4a9c88d568f87d72aa4ec835878a02059823df30`), not a subsequent live GitHub revision.

1. Unzip `fibercontinuity-reviewer41-changed-files.zip` at the repository root, keeping the file paths. Or use the complete project ZIP.
2. `npm install --no-audit --no-fund` (repository has no lockfile), `npm run check`, `npm run test:hosted-api`, and `npm run build`.
3. Push the code to GitHub; wait for Vercel deployment; then run the hosted Testnet browser workflow. Source-fingerprint matching will reject stale deployed code.
4. Read `docs/REVIEWER_41_ACCEPTANCE.md` before reporting progress on issue #41.

**Limitations:** no local dependency installation/typecheck/Vitest browser integration was possible in the supplied execution environment. The 16 dependency-free Node tests passed, all 59 TS/TSX sources syntax-checked, but a real Fiber Testnet full-cycle must be rerun by GitHub Actions. Fiber JS v0.9.1 still lacks an acknowledged IndexedDB flush after `stop()`, and funded-channel recovery is not supported.
