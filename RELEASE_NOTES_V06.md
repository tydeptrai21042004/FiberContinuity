# FiberContinuity v0.6.0 — upstream reviewer alignment

This package is the complete project source plus additions from issue #41 review.

1. IndexedDB cold whole-database capture/restore transport, explicit schema and clone-value handling, integrity and bounds.
2. Host integration boundary: identity/configuration pinning, writer-fencing lease, quiesce, stop, offline inspection, empty target guard, isolated restart.
3. Strict production preflight/restore flow: offline target preflight, repeat immediately before mutation, never overwrite occupied storage, quarantine uncertain outcomes, no automatic live rollback or false peer-safety success.
4. A new `IndexedDB lab` page for real browser round trips on dedicated synthetic test data.
5. New Vitest policy tests and documentation; source-only smoke tests were executed successfully.

**Not a live native Fiber recovery service:** Primary UI remains the deterministic demo. A host-supplied reviewed lifecycle implementation is required for Fiber JS 0.9.1 real testnet recovery. See docs/COLD_RECOVERY_V06.md and docs/VALIDATION_V06.md before deployment or claims of safety.

## Install

```bash
npm install
npm run check
npm run build
npm run dev
```

For Vercel, use the existing `vercel.json` and build settings. Do not enable a native adapter or import real Fiber secrets into the demo host without a verified integration.
