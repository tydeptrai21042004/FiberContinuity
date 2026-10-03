# Evidence directory

Do not commit secrets.

For real recovery runs, retain redacted machine-readable reports containing the pinned Fiber/FNN version, public network identity, scenario name, capability coverage, preflight decisions, before/after public state that the integration is allowed to disclose, archive corruption digest, timestamps, recovery/reconciliation duration, and final health result.

Generated local run files belong in `evidence/runs/`. `.gitignore` excludes everything there except `.gitkeep` by default.
