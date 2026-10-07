# FiberContinuity — reviewer guide

FiberContinuity is a continuity/recovery layer around **official/native Fiber backup and restore hooks**. It does not implement a second channel-recovery protocol and the public demo does not use real funds.

## Five-minute evaluation

1. Open the Vercel demo and choose **Run guided recovery demo**.
2. Confirm the workflow reaches `HEALTHY` after backup → simulated browser-state loss → authenticated preflight → restore → stabilization → verification.
3. Create a new archive and use **Safety scenario lab**:
   - `Browser state loss` should permit restore.
   - `Same identity, newer state` should fail closed for review.
   - `Foreign live node` should block destructive restore.
   - `Network mismatch` should block restore.
4. Export **Evidence bundle** and inspect the JSON. It contains the public archive manifest, current observable snapshot, preflight/report results and declared demo guarantees. It does **not** contain the recovery password or decrypted native backup bytes.
5. Run `npm test` and `npm run build` from a clean checkout under Node 24.

## Security properties demonstrated by the reference implementation

- AES-256-GCM authenticated encryption for the private recovery envelope.
- PBKDF2-SHA256 password derivation with bounded iteration validation.
- Source snapshot metadata encrypted together with the native backup.
- Fail-closed network, compatibility and restore-target checks.
- Target state is revalidated immediately before mutation to reduce check-then-use races.
- Fail-closed rollback checkpoint capture: operational backup failures abort before mutation; explicitly unsupported rollback may proceed without automatic rollback.
- Automatic rollback attempt across native restore, restart, and stabilization exceptions.
- Post-restore stabilization followed by explicit observable-state comparison.
- Unknown/unavailable record visibility is reported as incomplete rather than a false PASS.
- Full-visibility payment/invoice mismatches are hard failures rather than soft warnings.
- The Fiber JS adapter refuses synthetic safety-critical node/channel identifiers and parses the Fiber 0.9.x nested channel state shape.

## Boundary for production integration

The reference demo uses `DemoFiberAdapter`. Real deployment requires a reviewed `FiberAdapter` whose backup/restore hooks are backed by supported upstream Fiber/FNN primitives. The adapter must accurately report version, network identity, observable record coverage, restore-target safety and readiness/reconciliation semantics.

A production milestone should therefore be evaluated on **real testnet recovery evidence**, not only this deterministic demo.
