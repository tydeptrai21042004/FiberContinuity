# Upgrading FiberContinuity 0.8.0 to 0.9.0

The full-project ZIP is preferable for new deployments. For existing v0.8.0 installations, extract **`FiberContinuity_v0.9_changed_files_only.zip` at your repository root**, preserving its `src/`, `tests/`, `docs/`, `.github/` and `scripts/` paths. Do not copy into an extra nested subfolder.

Optional cleanup: delete older one-off release patch files (`APPLY_PATCH.md`, `PATCH_MANIFEST.json`, `PATCH_NOTES.md`, `CHANGED_FILES.txt`, `FILELIST.md`, `UPDATE_FROM_V07.md`, `_VALIDATION.txt`) that do not describe this version.

Run on Node 22 or 24: `npm install --no-audit --no-fund`, `npm run check`, `npm run build`. Then follow `docs/TESTNET_SETUP_V09.md`. The new code checks the **actual CKB testnet RPC network**. A reachable endpoint and browser CORS support must be confirmed on your deployment. Never insert real funds or mainnet credentials.

A new `.github/workflows/ci.yml` runs the regular checks in GitHub Actions. The complete tests and build could not be executed in the authoring container because npm registry DNS failed. See `docs/VALIDATION_V09.md`.
