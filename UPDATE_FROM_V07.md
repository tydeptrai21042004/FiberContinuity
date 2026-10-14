# Update FiberContinuity v0.7.0 to v0.8.0

Two archives are provided:

- **Full project** — extract the entire repository and run its normal npm commands.
- **Changes-only overlay** — extract its files **over the root of the existing v0.7.0 repository**, retaining directory structure. It includes only files added or modified in v0.8.0. Do not apply it to another version without reviewing differences.

## Development checks

```bash
npm install --no-audit --no-fund
npm run check
npm run build
npm run dev
```

If your Vercel deployment tracks GitHub, push the updated files to the repository; redeployment then uses the existing `vercel.json` build and isolation headers.

## Critical safety information

This remains an experimental zero-channel Fiber JS **testnet-only** reference. Do not use it to recover live/funded Fiber channels or mainnet assets. Backup and restore must only occur after stopping all Fiber DB writers. Upstream currently provides no independently established durable `fiber.stop()` checkpoint barrier or authoritative funded-channel safety proof to this browser lab.

An older v0.7 interrupted-recovery journal deliberately blocks v0.8 startup. Do not clear recovery markers or erase occupied IndexedDB state to bypass a quarantine. Investigate and preserve the existing database first.

See `docs/UPSTREAM_REVIEW_IMPLEMENTATION_V08.md` for the exact reviewer mapping, scenario walkthrough and open upstream dependencies, and `docs/VALIDATION_V08.md` for tested/unverified scopes.
