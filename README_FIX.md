# FiberContinuity v1.0.3 — targeted CI fix

This patch targets GitHub commit `7a640105b203a856b526414aa05fc4350ebf75a0` (v1.0.2) based on the error logs and the supplied v1.0.2 archive. The live commit could not be fetched in this session.

- `src/adapters/createIndexedDbColdHooks.ts`: `prepareColdRestore` now throws on malformed snapshots rather than returning a `RestoreTargetAssessment`; leaves the separate `assess()` function unchanged. This preserves fail-closed behavior.
- `.github/workflows/ci.yml`: no dependency-cache setting (no package-lock.json in prior shipped ZIP), `fail-fast: false`, Ubuntu 24.04.
- `.github/workflows/hosted-testnet.yml`: Ubuntu 24.04 and no cache-dependency-path. This does not fix `actualWasmNodeStarted`; that needs hosted browser evidence.

## Apply

Upload the changed TypeScript file to `src/adapters/` with GitHub's web UI. The workflows can be edited directly in GitHub under `.github/workflows/` (even for a public repo); uploading a ZIP alone does not apply them. If the current workflow names differ, keep their names and replace their contents with the relevant YAML.

The v1.0.3 patch does not change channel safety policy. Rerun Vercel build and GitHub Actions. The TS2322 failure is resolved at the source level, but full npm tests and build have not been executed here.

GitHub Actions action-version deprecation messages are warnings, not this build failure. When confirmed available, consider migrating checkout/setup-node to major v5 for Node 24 action runtime.
