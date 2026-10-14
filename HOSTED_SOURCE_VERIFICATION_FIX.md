# Hosted browser export: source verification and host-boundary diagnostics

The GitHub browser runner previously checked only displayed version `v1.0.1`. Multiple
patches share that version, so a Vercel deployment from a different commit could pass.

This patch embeds a deterministic SHA-256 of critical app/export files in the built
browser UI. GitHub computes the same SHA-256 from its checked-out sources and waits
up to two minutes for Vercel to serve matching code. If they never match, GitHub
reports `DEPLOYMENT_OUTDATED` without attempting recovery.

`ManagedFiberTestnetHost.withColdStore` now gives dedicated safe codes for three
previously unclassified host-boundary failures: lease acquisition, invalid DB name
and lease release. The export itself is unchanged, and failed recovery checks remain
failures. No funded-channel support is claimed.

After patch application, confirm Vercel deployed the branch and rerun GitHub Actions.
If `COLD_STORE_UNKNOWN` persists *after source verification passes*, its cause is
elsewhere; save the hosted evidence and do not claim success. No Vercel secrets or
EVIDENCE_INGEST_TOKEN are required for the hosted browser check.
